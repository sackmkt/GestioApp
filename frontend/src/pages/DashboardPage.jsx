import React, { useState, useEffect, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import facturasService from '../services/FacturasService';
import pacientesService from '../services/PacientesService';
import obrasSocialesService from '../services/ObrasSocialesService';
import centrosSaludService from '../services/CentrosSaludService';
import { FaMoneyBillWave, FaCheckCircle, FaTimesCircle, FaUsers, FaMedkit, FaChartBar, FaUserFriends, FaCalendarAlt, FaAngleDoubleUp, FaAngleDoubleDown, FaHospital } from 'react-icons/fa';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

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
    ingresoParticulares: 0,
    ingresoCentrosNetos: 0,
    pacientesByTipo: { particulares: 0, centro: 0 },
    centrosResumen: [],
    pieChartData: {},
    monthlyBarChartData: {},
    obrasSocialesBarChartData: {},
    pacientesBarChartData: {},
    growthMetrics: {
      facturacion: { currentYear: 0, previousYear: 0, percentage: 0 },
      facturas: { currentYear: 0, previousYear: 0, percentage: 0 },
    },
  });

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

    const {
      centrosResumen,
      totalRetencionCentros,
      ingresoCentrosNetos,
      ingresoParticulares,
    } = summarizeFinancials(filteredFacturas, centros);
    const centrosActivos = centrosResumen.filter((centro) => centro.totalFacturado > 0).length;

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
      ingresoCentrosNetos,
      ingresoParticulares,
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

  const calculatePacientesData = (facturas) => {
    const pacientesData = facturas.reduce((acc, f) => {
      if (f.paciente?.nombre && f.paciente?.apellido) {
        const nombreCompleto = `${f.paciente.nombre} ${f.paciente.apellido}`;
        acc[nombreCompleto] = (acc[nombreCompleto] || 0) + f.montoTotal;
      }
      return acc;
    }, {});

    const sortedPacientes = Object.entries(pacientesData)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    return {
      labels: sortedPacientes.map(([nombre]) => nombre),
      datasets: [{
        label: 'Monto Facturado',
        data: sortedPacientes.map(([, monto]) => monto),
        backgroundColor: 'rgba(0, 123, 255, 0.6)',
        borderColor: 'rgba(0, 123, 255, 1)',
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
        netoProfesional: 0,
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
        };
      }

      const referencia = centrosMap[centroId];
      const porcentaje = referencia.porcentajeRetencion || 0;
      const monto = factura.montoTotal || 0;
      referencia.totalFacturado += monto;
      referencia.totalRetencion += monto * (porcentaje / 100);
      referencia.netoProfesional = referencia.totalFacturado - referencia.totalRetencion;
    });

    return Object.values(centrosMap).sort((a, b) => b.totalRetencion - a.totalRetencion);
  };

  const summarizeFinancials = (facturas, centrosList) => {
    const facturasArray = Array.isArray(facturas) ? facturas : [];
    const centrosResumen = calculateCentrosResumen(facturasArray, centrosList);
    const totalRetencionCentros = centrosResumen.reduce((sum, centro) => sum + centro.totalRetencion, 0);
    const ingresoCentrosNetos = centrosResumen.reduce((sum, centro) => sum + centro.netoProfesional, 0);

    const ingresoParticulares = facturasArray.reduce((sum, factura) => {
      const tipoAtencion = factura.paciente?.tipoAtencion;
      const asociadoACentro = Boolean(factura.centroSalud || factura.paciente?.centroSalud);
      if (tipoAtencion === 'centro' || asociadoACentro) {
        return sum;
      }
      return sum + (factura.montoTotal || 0);
    }, 0);

    return {
      centrosResumen,
      totalRetencionCentros,
      ingresoCentrosNetos,
      ingresoParticulares,
    };
  };

  // useEffect para la carga inicial de datos
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [facturas, pacientes, obrasSociales, centros] = await Promise.all([
          facturasService.getFacturas(),
          pacientesService.getPacientes(),
          obrasSocialesService.getObrasSociales(),
          centrosSaludService.getCentros(),
        ]);
        const pacientesByTipo = {
          particulares: pacientes.filter((p) => p.tipoAtencion !== 'centro').length,
          centro: pacientes.filter((p) => p.tipoAtencion === 'centro').length,
        };
        const {
          centrosResumen,
          totalRetencionCentros,
          ingresoCentrosNetos,
          ingresoParticulares,
        } = summarizeFinancials(facturas, centros);
        const centrosActivos = centrosResumen.filter((centro) => centro.totalFacturado > 0).length;
        setAllFacturas(facturas);
        setCentros(centros);
        // Los datos de pacientes y obras sociales no necesitan filtrarse por fecha
        setData(prevData => ({
          ...prevData,
          totalPacientes: pacientes.length,
          totalObrasSociales: obrasSociales.length,
          totalCentros: centros.length,
          centrosActivos,
          totalRetencionCentros,
          ingresoCentrosNetos,
          ingresoParticulares,
          pacientesByTipo,
          centrosResumen,
          obrasSocialesBarChartData: calculateObrasSocialesData(facturas),
          pacientesBarChartData: calculatePacientesData(facturas),
          growthMetrics: calculateGrowthMetrics(facturas),
        }));
      } catch (error) {
        console.error('Error fetching initial dashboard data:', error);
      }
    };
    fetchInitialData();
  }, []);

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

  return (
    <div className="container mt-4">
      <div className="mb-4 text-center text-md-start">
        <h2 className="fw-bold">Hola, {userDisplayName} 👋</h2>
        <p className="text-muted mb-0">Este resumen ejecutivo reúne tus principales indicadores asistenciales y financieros.</p>
      </div>
      <div className="row g-3 mb-4 row-cols-1 row-cols-md-2 row-cols-xl-4">
        <div className="col">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body">
              <p className="text-muted mb-1">Facturación acumulada</p>
              <h4 className="fw-bold mb-1">{formatNumber(data.totalFacturacion)}</h4>
              <small className="text-muted">Incluye montos cobrados y pendientes del período seleccionado.</small>
            </div>
          </div>
        </div>
        <div className="col">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body">
              <p className="text-muted mb-1">Ingreso neto - Particulares</p>
              <h4 className="fw-bold mb-1">{formatNumber(data.ingresoParticulares)}</h4>
              <small className="text-muted">Corresponde a la facturación directa sin intermediarios.</small>
            </div>
          </div>
        </div>
        <div className="col">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body">
              <p className="text-muted mb-1">Ingreso neto - Centros de salud</p>
              <h4 className="fw-bold mb-1">{formatNumber(data.ingresoCentrosNetos)}</h4>
              <small className="text-muted">Monto disponible luego de aplicar retenciones vigentes.</small>
            </div>
          </div>
        </div>
        <div className="col">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body">
              <p className="text-muted mb-1">Retención estimada a centros</p>
              <h4 className="fw-bold mb-1">{formatNumber(data.totalRetencionCentros)}</h4>
              <small className="text-muted">Centros con actividad: {data.centrosActivos}/{data.totalCentros}</small>
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
        <div className="col-lg-4 col-md-6">
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
                  Ingreso neto particulares
                  <span className="fw-bold text-primary">{formatNumber(data.ingresoParticulares)}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Ingreso neto centros de salud
                  <span className="fw-bold text-info">{formatNumber(data.ingresoCentrosNetos)}</span>
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

        {/* Gráfico de Torta */}
        <div className="col-lg-4 col-md-12">
          <div className="card shadow-sm h-100">
            <div className="card-header">
              Distribución de Facturas
            </div>
            <div className="card-body d-flex align-items-center justify-content-center">
              {data.facturasPagadas + data.facturasPendientes > 0 ? (
                <div style={{ height: '250px', width: '250px' }}>
                  <Pie data={data.pieChartData} />
                </div>
              ) : (
                <p className="text-center text-muted">No hay datos de facturas para mostrar.</p>
              )}
            </div>
          </div>
        </div>

        {/* Resumen de Centros de Salud */}
        <div className="col-lg-4 col-md-6">
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
                          <div className="fw-bold text-success">{formatNumber(centro.netoProfesional)}</div>
                          <small className="text-muted d-block">Retenido: {formatNumber(centro.totalRetencion)}</small>
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
        <div className="col-lg-6 col-md-12">
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

        {/* Gráfico de Barras de Top Obras Sociales */}
        <div className="col-lg-6 col-md-12">
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
        
        {/* Gráfico de Barras de Top Pacientes */}
        <div className="col-lg-6 col-md-12">
          <div className="card shadow-sm h-100">
            <div className="card-header">
              Top 5 Pacientes
            </div>
            <div className="card-body">
              {data.pacientesBarChartData.labels?.length > 0 ? (
                <Bar data={data.pacientesBarChartData} options={horizontalChartOptions} />
              ) : (
                <p className="text-center text-muted">No hay datos suficientes para el gráfico de pacientes.</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default DashboardPage;