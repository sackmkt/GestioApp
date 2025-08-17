import React, { useState, useEffect, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import facturasService from '../services/FacturasService';
import pacientesService from '../services/PacientesService';
import obrasSocialesService from '../services/ObrasSocialesService';
import { FaMoneyBillWave, FaCheckCircle, FaTimesCircle, FaUsers, FaMedkit, FaChartBar, FaUserFriends, FaCalendarAlt, FaAngleDoubleUp, FaAngleDoubleDown } from 'react-icons/fa';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

function DashboardPage() {
  const [allFacturas, setAllFacturas] = useState([]);
  const [data, setData] = useState({
    totalFacturacion: 0,
    montoPagado: 0,
    montoPendiente: 0,
    facturasPagadas: 0,
    facturasPendientes: 0,
    totalPacientes: 0,
    totalObrasSociales: 0,
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

    setData(prevData => ({
      ...prevData,
      totalFacturacion,
      montoPagado,
      montoPendiente,
      facturasPagadas,
      facturasPendientes,
      pieChartData,
      monthlyBarChartData,
    }));
  }, [dateRange]);

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

  // useEffect para la carga inicial de datos
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [facturas, pacientes, obrasSociales] = await Promise.all([
          facturasService.getFacturas(),
          pacientesService.getPacientes(),
          obrasSocialesService.getObrasSociales(),
        ]);
        setAllFacturas(facturas);
        // Los datos de pacientes y obras sociales no necesitan filtrarse por fecha
        setData(prevData => ({
          ...prevData,
          totalPacientes: pacientes.length,
          totalObrasSociales: obrasSociales.length,
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
      <h2 className="mb-4 text-center">Dashboard Financiero</h2>
      
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
                  Total de Pacientes
                  <span className="badge bg-primary rounded-pill">{data.totalPacientes}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Total de Obras Sociales
                  <span className="badge bg-primary rounded-pill">{data.totalObrasSociales}</span>
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