import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import facturasService from '../services/FacturasService';
import pacientesService from '../services/PacientesService';
import obrasSocialesService from '../services/ObrasSocialesService';
import centrosSaludService from '../services/CentrosSaludService';
import turnosService from '../services/TurnosService';
import AgendaGantt from '../components/AgendaGantt.jsx';
import { FaMoneyBillWave, FaChartBar, FaCalendarAlt, FaCalendarCheck, FaAngleDoubleUp, FaAngleDoubleDown, FaHospital, FaClock, FaFileInvoiceDollar, FaUsers } from 'react-icons/fa';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const capitalize = (value) => {
  if (!value) {
    return '';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const ESTADO_LABELS = {
  pendiente: 'Pendiente',
  presentada: 'Presentada',
  observada: 'Observada',
  pagada_parcial: 'Pagada parcial',
  pagada: 'Pagada',
};

const ESTADO_COLOR_MAP = {
  pendiente: { background: 'rgba(255, 193, 7, 0.6)', border: 'rgba(255, 193, 7, 1)' },
  presentada: { background: 'rgba(23, 162, 184, 0.6)', border: 'rgba(23, 162, 184, 1)' },
  observada: { background: 'rgba(220, 53, 69, 0.6)', border: 'rgba(220, 53, 69, 1)' },
  pagada_parcial: { background: 'rgba(102, 16, 242, 0.6)', border: 'rgba(102, 16, 242, 1)' },
  pagada: { background: 'rgba(40, 167, 69, 0.6)', border: 'rgba(40, 167, 69, 1)' },
};

const WEEKLY_AVAILABLE_MINUTES = 5 * 8 * 60; // 5 días hábiles de 8 horas

function DashboardPage({ currentUser }) {
  const [allFacturas, setAllFacturas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [data, setData] = useState({
    totalFacturacion: 0,
    montoPagado: 0,
    montoPendiente: 0,
    facturasPagadas: 0,
    facturasPendientes: 0,
    totalPacientes: 0,
    totalObrasSociales: 0,
    totalCentros: 0,
    centrosActivos: 0,
    totalRetencionCentros: 0,
    netoParticulares: 0,
    netoCentros: 0,
    pacientesByTipo: { particulares: 0, centro: 0 },
    centrosResumen: [],
    pieChartData: {},
    monthlyBarChartData: {},
    obrasSocialesBarChartData: {},
    facturasEstadoChartData: { labels: [], datasets: [] },
    moraObraSocialData: { labels: [], datasets: [] },
    montoMoraTotal: 0,
    turnosProximos: [],
    ocupacionSemanal: 0,
    minutosProgramadosSemana: 0,
    minutosDisponiblesSemana: WEEKLY_AVAILABLE_MINUTES,
    growthMetrics: {
      facturacion: { currentYear: 0, previousYear: 0, percentage: 0 },
      facturas: { currentYear: 0, previousYear: 0, percentage: 0 },
    },
  });
  const [turnos, setTurnos] = useState([]);

  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  });

  const formatNumber = (number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(number);
  };

  const formatMinutes = (minutes) => {
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return '0 h';
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    if (hours === 0) {
      return `${remainingMinutes} min`;
    }
    if (remainingMinutes === 0) {
      return `${hours} h`;
    }
    return `${hours} h ${remainingMinutes} min`;
  };

  const formatDateTime = (value) => {
    if (!value) {
      return 'Sin fecha';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Sin fecha';
    }
    return date.toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  const buildAgendaMetrics = useCallback((turnosList) => {
    const now = new Date();
    const upcoming = Array.isArray(turnosList)
      ? [...turnosList]
        .filter((turno) => {
          const fecha = new Date(turno.fecha);
          return !Number.isNaN(fecha.getTime()) && fecha >= now;
        })
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
        .slice(0, 5)
        .map((turno) => ({
          _id: turno._id,
          fecha: turno.fecha,
          titulo: turno.titulo || 'Consulta',
          estado: turno.estado,
          paciente: turno.paciente ? `${turno.paciente.nombre} ${turno.paciente.apellido}` : 'Paciente',
          duracionMinutos: turno.duracionMinutos || 0,
        }))
      : [];

    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const programadosSemana = Array.isArray(turnosList)
      ? turnosList.filter((turno) => {
        const fecha = new Date(turno.fecha);
        return !Number.isNaN(fecha.getTime()) && fecha >= startOfWeek && fecha <= endOfWeek;
      })
      : [];

    const minutosProgramados = programadosSemana.reduce((sum, turno) => sum + (turno.duracionMinutos || 0), 0);
    const ocupacion = WEEKLY_AVAILABLE_MINUTES > 0
      ? Math.min((minutosProgramados / WEEKLY_AVAILABLE_MINUTES) * 100, 100)
      : 0;

    return {
      upcoming,
      minutosProgramados,
      ocupacion,
    };
  }, []);

  const userDisplayName = (() => {
    if (!currentUser) {
      return 'Profesional';
    }
    const fullName = [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ').trim();
    return fullName || currentUser.username || 'Profesional';
  })();
  
  // Función de callback para procesar los datos
  const processAndSetData = useCallback((facturasToProcess) => {
    const filteredFacturas = facturasToProcess.filter(f => {
      const fechaEmision = new Date(f.fechaEmision);
      const startDate = dateRange.startDate ? new Date(dateRange.startDate + 'T00:00:00') : null;
      const endDate = dateRange.endDate ? new Date(dateRange.endDate + 'T23:59:59') : null;
      
      const isAfterStart = startDate ? fechaEmision >= startDate : true;
      const isBeforeEnd = endDate ? fechaEmision <= endDate : true;
      
      return isAfterStart && isBeforeEnd;
    });

    const montoPagado = filteredFacturas.filter(f => f.pagado).reduce((sum, f) => sum + f.montoTotal, 0);
    const montoPendiente = filteredFacturas.filter(f => !f.pagado).reduce((sum, f) => sum + f.montoTotal, 0);
    const totalFacturacion = montoPagado + montoPendiente;
    const facturasPagadas = filteredFacturas.filter(f => f.pagado).length;
    const facturasPendientes = filteredFacturas.filter(f => !f.pagado).length;

    const pieChartData = {
      labels: ['Facturas Pagadas', 'Facturas Pendientes'],
      datasets: [{
        label: '# de Facturas',
        data: [facturasPagadas, facturasPendientes],
        backgroundColor: ['rgba(40, 167, 69, 0.7)', 'rgba(220, 53, 69, 0.7)'],
        borderColor: ['rgba(40, 167, 69, 1)', 'rgba(220, 53, 69, 1)'],
        borderWidth: 1,
      }],
    };

    const monthlyData = {};
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    filteredFacturas.forEach(f => {
      const date = new Date(f.fechaEmision);
      const month = date.getMonth();
      const year = date.getFullYear();
      const key = `${monthNames[month]} ${year}`;
      if (!monthlyData[key]) {
        monthlyData[key] = 0;
      }
      monthlyData[key] += f.montoTotal;
    });

    const sortedMonths = Object.keys(monthlyData).sort((a, b) => new Date(a.replace(/(\w{3})\s(\d{4})/, '1 $1 $2')) - new Date(b.replace(/(\w{3})\s(\d{4})/, '1 $1 $2')));
    const monthlyBarChartData = {
      labels: sortedMonths,
      datasets: [{
        label: 'Facturación Mensual',
        data: sortedMonths.map(month => monthlyData[month]),
        backgroundColor: 'rgba(23, 162, 184, 0.6)',
        borderColor: 'rgba(23, 162, 184, 1)',
        borderWidth: 1,
      }],
    };

    const totalParticulares = filteredFacturas
      .filter((factura) => !factura.centroSalud)
      .reduce((sum, factura) => sum + (factura.montoTotal || 0), 0);

    const centrosResumen = calculateCentrosResumen(filteredFacturas, centros);
    const totalRetencionCentros = centrosResumen.reduce((sum, centro) => sum + centro.totalRetencion, 0);
    const totalNetoCentros = centrosResumen.reduce((sum, centro) => sum + centro.totalNeto, 0);
    const centrosActivos = centrosResumen.filter((centro) => centro.totalFacturado > 0).length;

    const estadoCounts = filteredFacturas.reduce((acc, factura) => {
      const estadoFactura = factura.estado || (factura.pagado ? 'pagada' : 'pendiente');
      acc[estadoFactura] = (acc[estadoFactura] || 0) + 1;
      return acc;
    }, {});

    const estadoKeys = Object.keys(estadoCounts);
    const facturasEstadoChartData = estadoKeys.length > 0
      ? {
          labels: estadoKeys.map((estado) => ESTADO_LABELS[estado] || estado),
          datasets: [{
            label: '# de facturas',
            data: estadoKeys.map((estado) => estadoCounts[estado]),
            backgroundColor: estadoKeys.map((estado) => ESTADO_COLOR_MAP[estado]?.background || 'rgba(0,0,0,0.15)'),
            borderColor: estadoKeys.map((estado) => ESTADO_COLOR_MAP[estado]?.border || 'rgba(0,0,0,0.3)'),
            borderWidth: 1,
          }],
        }
      : {
          labels: ['Sin datos'],
          datasets: [{
            label: '# de facturas',
            data: [0],
            backgroundColor: ['rgba(108, 117, 125, 0.4)'],
            borderColor: ['rgba(108, 117, 125, 1)'],
            borderWidth: 1,
          }],
        };

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const moraPorObra = filteredFacturas.reduce((acc, factura) => {
      const fechaVencimiento = factura.fechaVencimiento ? new Date(factura.fechaVencimiento) : null;
      const saldoPendiente = Number.isFinite(factura.saldoPendiente)
        ? factura.saldoPendiente
        : Math.max((factura.montoTotal || 0) - (factura.montoCobrado || 0), 0);
      if (fechaVencimiento && !Number.isNaN(fechaVencimiento.getTime()) && fechaVencimiento < hoy && saldoPendiente > 0.5) {
        const nombreObra = factura.obraSocial?.nombre || 'Sin obra social';
        acc[nombreObra] = (acc[nombreObra] || 0) + saldoPendiente;
      }
      return acc;
    }, {});

    const moraEntries = Object.entries(moraPorObra).sort(([, a], [, b]) => b - a);
    const moraObraSocialData = moraEntries.length > 0
      ? {
          labels: moraEntries.map(([nombre]) => nombre),
          datasets: [{
            label: 'Saldo vencido',
            data: moraEntries.map(([, monto]) => monto),
            backgroundColor: 'rgba(220, 53, 69, 0.6)',
            borderColor: 'rgba(220, 53, 69, 1)',
            borderWidth: 1,
          }],
        }
      : {
          labels: ['Sin datos'],
          datasets: [{
            label: 'Saldo vencido',
            data: [0],
            backgroundColor: ['rgba(108, 117, 125, 0.4)'],
            borderColor: ['rgba(108, 117, 125, 1)'],
            borderWidth: 1,
          }],
        };

    const montoMoraTotal = moraEntries.reduce((sum, [, monto]) => sum + monto, 0);

    const obrasSocialesBarChartData = calculateObrasSocialesData(filteredFacturas);

    setData(prevData => ({
      ...prevData,
      totalFacturacion,
      montoPagado,
      montoPendiente,
      facturasPagadas,
      facturasPendientes,
      pieChartData,
      monthlyBarChartData,
      centrosResumen,
      totalRetencionCentros,
      centrosActivos,
      netoParticulares: totalParticulares,
      netoCentros: totalNetoCentros,
      facturasEstadoChartData,
      moraObraSocialData,
      montoMoraTotal,
      obrasSocialesBarChartData,
    }));
  }, [dateRange, centros]);

  const calculateGrowthMetrics = (facturas) => {
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    const currentYearFacturas = facturas.filter(f => new Date(f.fechaEmision).getFullYear() === currentYear);
    const previousYearFacturas = facturas.filter(f => new Date(f.fechaEmision).getFullYear() === previousYear);

    const currentYearTotal = currentYearFacturas.reduce((sum, f) => sum + f.montoTotal, 0);
    const previousYearTotal = previousYearFacturas.reduce((sum, f) => sum + f.montoTotal, 0);

    const facturacionPercentage = previousYearTotal > 0
      ? ((currentYearTotal - previousYearTotal) / previousYearTotal) * 100
      : (currentYearTotal > 0 ? 100 : 0);

    const facturasCountPercentage = previousYearFacturas.length > 0
      ? ((currentYearFacturas.length - previousYearFacturas.length) / previousYearFacturas.length) * 100
      : (currentYearFacturas.length > 0 ? 100 : 0);

    return {
      facturacion: {
        currentYear: currentYearTotal,
        previousYear: previousYearTotal,
        percentage: facturacionPercentage,
      },
      facturas: {
        currentYear: currentYearFacturas.length,
        previousYear: previousYearFacturas.length,
        percentage: facturasCountPercentage,
      },
    };
  };

  const calculateObrasSocialesData = (facturas) => {
    const obrasSocialesData = facturas.reduce((acc, f) => {
      if (f.obraSocial?.nombre) {
        acc[f.obraSocial.nombre] = (acc[f.obraSocial.nombre] || 0) + f.montoTotal;
      }
      return acc;
    }, {});

    const sortedObrasSociales = Object.entries(obrasSocialesData)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    return {
      labels: sortedObrasSociales.map(([nombre]) => nombre),
      datasets: [{
        label: 'Monto Facturado',
        data: sortedObrasSociales.map(([, monto]) => monto),
        backgroundColor: 'rgba(52, 58, 64, 0.6)',
        borderColor: 'rgba(52, 58, 64, 1)',
        borderWidth: 1,
      }],
    };
  };

  const calculateCentrosResumen = (facturas, centros) => {
    const centrosArray = Array.isArray(centros) ? centros : [];

    const centrosMap = centrosArray.reduce((acc, centro) => {
      acc[centro._id] = {
        _id: centro._id,
        nombre: centro.nombre,
        porcentajeRetencion: centro.porcentajeRetencion || 0,
        totalFacturado: 0,
        totalRetencion: 0,
        totalNeto: 0,
      };
      return acc;
    }, {});

    facturas.forEach((factura) => {
      const centroId = factura.centroSalud?._id || factura.centroSalud;
      if (!centroId) {
        return;
      }

      if (!centrosMap[centroId]) {
        centrosMap[centroId] = {
          _id: centroId,
          nombre: factura.centroSalud?.nombre || 'Centro no registrado',
          porcentajeRetencion: factura.centroSalud?.porcentajeRetencion || 0,
          totalFacturado: 0,
          totalRetencion: 0,
          totalNeto: 0,
        };
      }

      const referencia = centrosMap[centroId];
      const porcentaje = referencia.porcentajeRetencion || 0;
      const monto = factura.montoTotal || 0;
      referencia.totalFacturado += monto;
      const retencion = monto * (porcentaje / 100);
      referencia.totalRetencion += retencion;
      referencia.totalNeto += monto - retencion;
    });

    return Object.values(centrosMap).sort((a, b) => b.totalRetencion - a.totalRetencion);
  };

  // useEffect para la carga inicial de datos
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const now = new Date();
        const horizon = new Date(now);
        horizon.setDate(horizon.getDate() + 30);

        const [facturas, pacientes, obrasSociales, centros, turnosList] = await Promise.all([
          facturasService.getFacturas(),
          pacientesService.getPacientes(),
          obrasSocialesService.getObrasSociales(),
          centrosSaludService.getCentros(),
          turnosService.getTurnos({ desde: now.toISOString(), hasta: horizon.toISOString() }),
        ]);
        const pacientesByTipo = {
          particulares: pacientes.filter((p) => p.tipoAtencion !== 'centro').length,
          centro: pacientes.filter((p) => p.tipoAtencion === 'centro').length,
        };
        const centrosResumen = calculateCentrosResumen(facturas, centros);
        const totalRetencionCentros = centrosResumen.reduce((sum, centro) => sum + centro.totalRetencion, 0);
        const centrosActivos = centrosResumen.filter((centro) => centro.totalFacturado > 0).length;
        setAllFacturas(facturas);
        setCentros(centros);
        setTurnos(turnosList);
        const agendaMetrics = buildAgendaMetrics(turnosList);
        // Los datos de pacientes y obras sociales no necesitan filtrarse por fecha
        setData(prevData => ({
          ...prevData,
          totalPacientes: pacientes.length,
          totalObrasSociales: obrasSociales.length,
          totalCentros: centros.length,
          centrosActivos,
          totalRetencionCentros,
          pacientesByTipo,
          centrosResumen,
          obrasSocialesBarChartData: calculateObrasSocialesData(facturas),
          growthMetrics: calculateGrowthMetrics(facturas),
          turnosProximos: agendaMetrics.upcoming,
          ocupacionSemanal: agendaMetrics.ocupacion,
          minutosProgramadosSemana: agendaMetrics.minutosProgramados,
        }));
      } catch (error) {
        console.error('Error fetching initial dashboard data:', error);
      }
    };
    fetchInitialData();
  }, [buildAgendaMetrics]);

  // useEffect para procesar datos cuando cambian las facturas o el rango de fechas
  useEffect(() => {
    processAndSetData(allFacturas);
  }, [allFacturas, processAndSetData]);

  const handleDateChange = (e) => {
    setDateRange({
      ...dateRange,
      [e.target.name]: e.target.value,
    });
  };

  const applyDateFilter = () => {
    // Al hacer clic, se actualiza el estado de dateRange, lo que activa el useEffect
    // para procesar los datos filtrados.
    // No necesitamos llamar a fetchData() aquí de nuevo.
    processAndSetData(allFacturas);
  };
  
  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: false },
    },
    scales: {
      y: { beginAtZero: true },
    },
  };
  
  const horizontalChartOptions = {
    responsive: true,
    indexAxis: 'y',
    plugins: {
      legend: { position: 'top' },
      title: { display: false },
    },
    scales: {
      x: { beginAtZero: true },
    },
  };

  const renderGrowthIcon = (percentage) => {
    if (percentage > 0) {
      return <FaAngleDoubleUp className="text-success me-1" />;
    } else if (percentage < 0) {
      return <FaAngleDoubleDown className="text-danger me-1" />;
    }
    return null;
  };

  const cobranzaRate = data.totalFacturacion > 0
    ? Math.round((data.montoPagado / data.totalFacturacion) * 100)
    : 0;
  const facturasTotal = data.facturasPagadas + data.facturasPendientes;
  const facturasPendientesRate = facturasTotal > 0
    ? Math.round((data.facturasPendientes / facturasTotal) * 100)
    : 0;
  const averageTicket = data.totalPacientes > 0
    ? data.totalFacturacion / Math.max(data.totalPacientes, 1)
    : 0;

  const agendaHoy = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const year = hoy.getFullYear();
    const month = (hoy.getMonth() + 1).toString().padStart(2, '0');
    const day = hoy.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }),
    [],
  );

  const tomorrowInfo = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const labelFormatter = new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
    const label = capitalize(labelFormatter.format(start));

    const filtered = Array.isArray(turnos)
      ? turnos
        .filter((turno) => {
          const fecha = new Date(turno.fecha);
          return !Number.isNaN(fecha.getTime()) && fecha >= start && fecha <= end;
        })
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      : [];

    return {
      start,
      end,
      label,
      turnos: filtered,
    };
  }, [turnos]);

  const tomorrowStartTime = tomorrowInfo.start.getTime();
  const tomorrowEndTime = tomorrowInfo.end.getTime();

  const proximosTurnos = useMemo(() => {
    if (!Array.isArray(data.turnosProximos) || data.turnosProximos.length === 0) {
      return [];
    }
    return data.turnosProximos.filter((turno) => {
      const fecha = new Date(turno.fecha);
      const time = fecha.getTime();
      if (Number.isNaN(time)) {
        return true;
      }
      return time < tomorrowStartTime || time > tomorrowEndTime;
    });
  }, [data.turnosProximos, tomorrowEndTime, tomorrowStartTime]);

  const { label: tomorrowLabel, turnos: turnosManiana } = tomorrowInfo;

  return (
    <div className="container mt-4">
      <div className="mb-4 text-center text-md-start">
        <h2 className="fw-bold">Hola, {userDisplayName} 👋</h2>
        <p className="text-muted mb-0">Este resumen ejecutivo reúne tus principales indicadores asistenciales y financieros.</p>
      </div>
      <div className="row g-3 mb-4">
        <div className="col-xl-3 col-md-6">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body">
              <p className="text-muted mb-1">Facturación acumulada</p>
              <h4 className="fw-bold mb-1">{formatNumber(data.totalFacturacion)}</h4>
              <small className="text-muted">Incluye montos cobrados y pendientes del período seleccionado.</small>
            </div>
          </div>
        </div>
        <div className="col-xl-3 col-md-6">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body">
              <p className="text-muted mb-1">Pacientes activos</p>
              <h4 className="fw-bold mb-1">{data.totalPacientes}</h4>
              <small className="text-muted">Particulares: {data.pacientesByTipo.particulares} · Centros: {data.pacientesByTipo.centro}</small>
            </div>
          </div>
        </div>
        <div className="col-xl-3 col-md-6">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body">
              <p className="text-muted mb-1">Retención estimada a centros</p>
              <h4 className="fw-bold mb-1">{formatNumber(data.totalRetencionCentros)}</h4>
              <small className="text-muted">Centros con actividad: {data.centrosActivos}/{data.totalCentros}</small>
            </div>
          </div>
        </div>
        <div className="col-xl-3 col-md-6">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body">
              <p className="text-muted mb-1">Ocupación semanal</p>
              <div className="d-flex align-items-baseline gap-2">
                <FaClock className="text-primary" />
                <h4 className="fw-bold mb-0">{Math.round(data.ocupacionSemanal)}%</h4>
              </div>
              <div className="progress mt-2" role="progressbar" aria-label="Ocupación semanal" aria-valuenow={Math.round(data.ocupacionSemanal)} aria-valuemin="0" aria-valuemax="100">
                <div
                  className={`progress-bar ${data.ocupacionSemanal >= 85 ? 'bg-danger' : data.ocupacionSemanal >= 60 ? 'bg-warning text-dark' : 'bg-success'}`}
                  style={{ width: `${Math.min(Math.round(data.ocupacionSemanal), 100)}%` }}
                ></div>
              </div>
              <small className="text-muted d-block mt-2">
                Programados: {formatMinutes(data.minutosProgramadosSemana)} · Capacidad semanal: {formatMinutes(data.minutosDisponiblesSemana)}
              </small>
            </div>
          </div>
        </div>
      </div>

      {/* Sección del selector de fechas */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <h5 className="card-title"><FaCalendarAlt className="me-2" /> Rango de Fechas</h5>
          <div className="row g-3 align-items-end">
            <div className="col-md-5">
              <label htmlFor="startDate" className="form-label">Desde</label>
              <input 
                type="date" 
                id="startDate" 
                name="startDate" 
                className="form-control"
                value={dateRange.startDate}
                onChange={handleDateChange} 
              />
            </div>
            <div className="col-md-5">
              <label htmlFor="endDate" className="form-label">Hasta</label>
              <input 
                type="date" 
                id="endDate" 
                name="endDate" 
                className="form-control"
                value={dateRange.endDate}
                onChange={handleDateChange} 
              />
            </div>
            <div className="col-md-2">
              <button 
                className="btn btn-primary w-100"
                onClick={applyDateFilter}
              >
                Aplicar Filtro
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="row g-4">
        {/* Sección de Resumen Financiero */}
        <div className="col-xl-4 col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-primary text-white">
              <FaMoneyBillWave className="me-2" /> Resumen Financiero
            </div>
            <div className="card-body">
              <ul className="list-group list-group-flush">
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Total Facturación
                  <span className="fw-bold">{formatNumber(data.totalFacturacion)}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Monto Pagado
                  <span className="fw-bold text-success">{formatNumber(data.montoPagado)}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Monto Pendiente
                  <span className="fw-bold text-danger">{formatNumber(data.montoPendiente)}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Ingresos netos de pacientes particulares
                  <span className="fw-bold text-primary">{formatNumber(data.netoParticulares)}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Ingresos netos de centros de salud
                  <span className="fw-bold text-info">{formatNumber(data.netoCentros)}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Total retenido por centros
                  <span className="fw-bold text-warning">{formatNumber(data.totalRetencionCentros)}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Sección de Métricas Administrativas */}
        <div className="col-lg-4 col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-info text-white">
              <FaUsers className="me-2" /> Métricas Administrativas
            </div>
            <div className="card-body">
              <ul className="list-group list-group-flush">
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Pacientes totales
                  <span className="badge bg-primary rounded-pill">{data.totalPacientes}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Atendidos de forma particular
                  <span className="badge bg-success rounded-pill">{data.pacientesByTipo.particulares}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Gestionados vía centros de salud
                  <span className="badge bg-info text-dark rounded-pill">{data.pacientesByTipo.centro}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Obras sociales activas
                  <span className="badge bg-secondary rounded-pill">{data.totalObrasSociales}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Centros con facturación
                  <span className="badge bg-warning text-dark rounded-pill">{data.centrosActivos}/{data.totalCentros}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Facturas Pagadas
                  <span className="badge bg-success rounded-pill">{data.facturasPagadas}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Facturas Pendientes
                  <span className="badge bg-warning text-dark rounded-pill">{data.facturasPendientes}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Salud de la cobranza */}
        <div className="col-lg-4 col-md-12">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-dark text-white">
              <FaFileInvoiceDollar className="me-2" /> Salud de la cobranza
            </div>
            <div className="card-body">
              <p className="text-muted mb-2">
                El <strong>{cobranzaRate}%</strong> de tu facturación está cobrado. Mantén esta tasa por encima del 80% para sostener la liquidez.
              </p>
              <div className="progress" role="progressbar" aria-label="Tasa de cobranza" aria-valuenow={cobranzaRate} aria-valuemin="0" aria-valuemax="100">
                <div
                  className={`progress-bar ${cobranzaRate >= 80 ? 'bg-success' : cobranzaRate >= 60 ? 'bg-warning text-dark' : 'bg-danger'}`}
                  style={{ width: `${Math.min(cobranzaRate, 100)}%` }}
                ></div>
              </div>
              <div className="d-flex justify-content-between small text-muted mt-2">
                <span>Pagadas: {data.facturasPagadas}</span>
                <span>Pendientes: {data.facturasPendientes} ({facturasPendientesRate}%)</span>
              </div>
              <hr />
              <p className="text-muted mb-1">Ticket promedio por paciente</p>
              <h4 className="fw-bold mb-0">{formatNumber(averageTicket)}</h4>
            </div>
          </div>
        </div>

        {/* Resumen de Centros de Salud */}
        <div className="col-xl-4 col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-warning text-dark">
              <FaHospital className="me-2" /> Convenios con Centros
            </div>
            <div className="card-body p-0">
              {data.centrosResumen.length > 0 ? (
                <ul className="list-group list-group-flush">
                  {data.centrosResumen.slice(0, 3).map((centro) => (
                    <li key={centro._id} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <strong>{centro.nombre}</strong>
                          <div className="small text-muted">Ret. {centro.porcentajeRetencion}%</div>
                        </div>
                        <div className="text-end">
                          <div className="fw-bold text-primary">{formatNumber(centro.totalRetencion)}</div>
                          <small className="text-muted">Facturado: {formatNumber(centro.totalFacturado)}</small>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted text-center py-4 mb-0">Aún no registraste centros con actividad.</p>
              )}
            </div>
          </div>
        </div>

        {/* Agenda diaria */}
        <div className="col-12">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-info text-white d-flex align-items-center">
              <FaCalendarAlt className="me-2" /> Agenda del día
            </div>
            <div className="card-body">
              <p className="text-muted small mb-3">
                Visualiza los turnos del día de hoy entre las 8:00 y las 20:00 horas.
              </p>
              <AgendaGantt
                turnos={turnos}
                selectedDate={agendaHoy}
                daysToShow={1}
                startHour={8}
                endHour={20}
                orientation="horizontal"
                emptyMessage="No hay turnos programados para hoy."
              />
            </div>
          </div>
        </div>

        {/* Turnos de mañana */}
        <div className="col-xl-4 col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-primary text-white">
              <FaClock className="me-2" /> Turnos de mañana
              <div className="small text-white-50 mt-1">{tomorrowLabel}</div>
            </div>
            <div className="card-body">
              {turnosManiana.length > 0 ? (
                <ul className="list-group list-group-flush">
                  {turnosManiana.map((turno) => {
                    const pacienteNombre = [turno.paciente?.nombre, turno.paciente?.apellido]
                      .filter(Boolean)
                      .join(' ')
                      .trim() || 'Paciente';
                    const turnoFecha = new Date(turno.fecha);
                    const hora = Number.isNaN(turnoFecha.getTime())
                      ? '--:--'
                      : timeFormatter.format(turnoFecha);
                    return (
                      <li key={turno._id} className="list-group-item">
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <strong>{pacienteNombre}</strong>
                            <div className="small text-muted">{turno.titulo || 'Consulta'}</div>
                          </div>
                          <div className="text-end">
                            <span className="badge bg-light text-dark border fw-semibold">{hora}</span>
                            <div className="small text-muted mt-1">{capitalize(turno.estado || 'programado')}</div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-muted mb-0">No hay turnos asignados para mañana.</p>
              )}
            </div>
          </div>
        </div>

        {/* Próximos turnos */}
        <div className="col-xl-4 col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-secondary text-white">
              <FaCalendarCheck className="me-2" /> Próximos turnos
            </div>
            <div className="card-body">
              {proximosTurnos.length > 0 ? (
                <ul className="list-group list-group-flush">
                  {proximosTurnos.map((turno) => (
                    <li key={turno._id} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <strong>{turno.paciente}</strong>
                          <div className="small text-muted">{turno.titulo}</div>
                        </div>
                        <div className="text-end">
                          <div className="small fw-semibold">{formatDateTime(turno.fecha)}</div>
                          <span className={`badge ${turno.estado === 'confirmado' ? 'bg-success' : turno.estado === 'cancelado' ? 'bg-danger' : 'bg-secondary'}`}>
                            {turno.estado || 'Programado'}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted mb-0">No hay turnos programados más allá de mañana.</p>
              )}
            </div>
          </div>
        </div>

        {/* Sección de Métricas de Crecimiento */}
        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-header bg-success text-white">
              <FaChartBar className="me-2" /> Crecimiento Interanual ({new Date().getFullYear() - 1} vs {new Date().getFullYear()})
            </div>
            <div className="card-body">
              <div className="row g-3 text-center">
                <div className="col-md-6">
                  <h5>Facturación Total</h5>
                  <div className="d-flex align-items-center justify-content-center">
                    {renderGrowthIcon(data.growthMetrics.facturacion.percentage)}
                    <h4 className="mb-0 fw-bold">{data.growthMetrics.facturacion.percentage.toFixed(2)}%</h4>
                  </div>
                  <p className="text-muted mt-2 mb-0">
                    <small>
                      {formatNumber(data.growthMetrics.facturacion.previousYear)} vs {formatNumber(data.growthMetrics.facturacion.currentYear)}
                    </small>
                  </p>
                </div>
                <div className="col-md-6">
                  <h5>Número de Facturas</h5>
                  <div className="d-flex align-items-center justify-content-center">
                    {renderGrowthIcon(data.growthMetrics.facturas.percentage)}
                    <h4 className="mb-0 fw-bold">{data.growthMetrics.facturas.percentage.toFixed(2)}%</h4>
                  </div>
                  <p className="text-muted mt-2 mb-0">
                    <small>
                      {data.growthMetrics.facturas.previousYear} vs {data.growthMetrics.facturas.currentYear}
                    </small>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Gráfico de Barras de Facturación Mensual */}
        <div className="col-xl-6 col-lg-12">
          <div className="card shadow-sm h-100">
            <div className="card-header">
              Facturación Mensual
            </div>
            <div className="card-body">
              {Object.keys(data.monthlyBarChartData).length > 0 ? (
                <Bar data={data.monthlyBarChartData} options={chartOptions} />
              ) : (
                <p className="text-center text-muted">No hay datos suficientes para el gráfico mensual.</p>
              )}
            </div>
          </div>
        </div>

        {/* Distribución por estado */}
        <div className="col-xl-6 col-lg-12">
          <div className="card shadow-sm h-100">
            <div className="card-header">
              <FaFileInvoiceDollar className="me-2" /> Facturas por estado
            </div>
            <div className="card-body">
              {data.facturasEstadoChartData.labels?.length > 0 ? (
                <Bar data={data.facturasEstadoChartData} options={chartOptions} />
              ) : (
                <p className="text-center text-muted">No hay información para mostrar la distribución de estados.</p>
              )}
            </div>
          </div>
        </div>

        {/* Gráfico de Barras de Top Obras Sociales */}
        <div className="col-xl-6 col-lg-12">
          <div className="card shadow-sm h-100">
            <div className="card-header">
              Top 5 Obras Sociales
            </div>
            <div className="card-body">
              {data.obrasSocialesBarChartData.labels?.length > 0 ? (
                <Bar data={data.obrasSocialesBarChartData} options={horizontalChartOptions} />
              ) : (
                <p className="text-center text-muted">No hay datos suficientes para el gráfico de obras sociales.</p>
              )}
            </div>
          </div>
        </div>

        {/* Mora por obra social */}
        <div className="col-xl-6 col-lg-12">
          <div className="card shadow-sm h-100">
            <div className="card-header">
              Mora por obra social
            </div>
            <div className="card-body">
              <p className="text-muted">Saldo vencido total: <strong>{formatNumber(data.montoMoraTotal)}</strong></p>
              {data.moraObraSocialData.labels?.length > 0 ? (
                <Bar data={data.moraObraSocialData} options={horizontalChartOptions} />
              ) : (
                <p className="text-center text-muted">No registras deudas vencidas con obras sociales.</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default DashboardPage;