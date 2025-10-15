import React, { useCallback, useEffect, useMemo, useState } from 'react';
import facturasService from '../services/FacturasService';
import { useFeedback } from '../context/FeedbackContext.jsx';

const formatCurrency = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '$0,00';
  }
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(numericValue);
};

const formatNumber = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '0';
  }
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(numericValue);
};

const MONTH_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const getMonthKey = (factura) => {
  if (!factura) {
    return 'sin-fecha';
  }

  if (factura.mesServicio && MONTH_KEY_REGEX.test(factura.mesServicio)) {
    return factura.mesServicio;
  }

  const value = factura.fechaEmision || factura.fechaVencimiento || factura.createdAt;
  if (!value) {
    return 'sin-fecha';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'sin-fecha';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthSortValue = (key) => {
  if (!key || key === 'sin-fecha') {
    return Number.NEGATIVE_INFINITY;
  }

  const [yearStr, monthStr] = key.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return Number.NEGATIVE_INFINITY;
  }

  return year * 100 + month;
};

const formatMonthLabel = (key) => {
  if (!key || key === 'sin-fecha') {
    return 'Sin fecha';
  }

  const [yearStr, monthStr] = key.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return key;
  }

  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
};

const getMontoCobrado = (factura) => {
  if (!factura) {
    return 0;
  }

  const montoCobrado = Number(factura.montoCobrado);
  if (Number.isFinite(montoCobrado)) {
    return montoCobrado;
  }

  if (Array.isArray(factura.pagos) && factura.pagos.length > 0) {
    return factura.pagos.reduce((sum, pago) => sum + (Number(pago.monto) || 0), 0);
  }

  const montoPagado = Number(factura.montoPagado);
  return Number.isFinite(montoPagado) ? montoPagado : 0;
};

const getSaldoPendiente = (factura) => {
  if (!factura) {
    return 0;
  }

  const saldo = Number(factura.saldoPendiente);
  if (Number.isFinite(saldo)) {
    return Math.max(saldo, 0);
  }

  const montoTotal = Number(factura.montoTotal) || 0;
  const montoCobrado = getMontoCobrado(factura);
  const restante = montoTotal - montoCobrado;
  return restante > 0 ? restante : 0;
};

const normalizeEstado = (factura) => {
  if (!factura) {
    return 'pendiente';
  }
  if (factura.estado) {
    return factura.estado;
  }
  return factura.pagado ? 'pagada' : 'pendiente';
};

const PAYMENT_METHODS = {
  efectivo: { label: 'Efectivo', includes: ['efectivo', 'cash', 'contado'] },
  transferencia: { label: 'Transferencia bancaria', includes: ['transfer', 'banco', 'cbu'] },
  tarjeta: { label: 'Tarjeta', includes: ['tarjeta', 'crédito', 'débito'] },
  otros: { label: 'Otros métodos (revisar)', includes: [] },
};

const STATUS_FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'pagadas', label: 'Pagadas' },
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'observadas', label: 'Observadas' },
  { value: 'parcial', label: 'Pagadas parcialmente' },
];

const SALDO_THRESHOLD = 1e-2;

const DEFAULT_FILTERS = {
  month: 'all',
  status: 'all',
  obraSocial: 'all',
};

function CobranzasPage() {
  const { showError } = useFeedback();
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchTerm, setSearchTerm] = useState('');
  const [activePanel, setActivePanel] = useState('pacientes');

  const loadFacturas = useCallback(async () => {
    setLoading(true);
    try {
      const response = await facturasService.getFacturas();
      if (Array.isArray(response)) {
        setFacturas(response);
      } else if (response?.data && Array.isArray(response.data)) {
        setFacturas(response.data);
      } else {
        setFacturas([]);
      }
    } catch (error) {
      console.error('No se pudieron obtener las facturas para el resumen de cobranzas.', error);
      showError('No pudimos cargar las cobranzas. Intenta nuevamente en unos instantes.');
      setFacturas([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadFacturas();
  }, [loadFacturas]);

  const availableMonths = useMemo(() => {
    const monthSet = new Set();
    let hasUnassigned = false;

    facturas.forEach((factura) => {
      const key = getMonthKey(factura);
      if (key === 'sin-fecha') {
        hasUnassigned = true;
      } else {
        monthSet.add(key);
      }
    });

    const options = Array.from(monthSet)
      .sort((a, b) => getMonthSortValue(b) - getMonthSortValue(a))
      .map((key) => ({ value: key, label: formatMonthLabel(key) }));

    if (hasUnassigned) {
      options.push({ value: 'sin-fecha', label: 'Sin mes asignado' });
    }

    return options;
  }, [facturas]);

  const obraSocialOptions = useMemo(() => {
    const map = new Map();
    facturas.forEach((factura) => {
      const id = factura.obraSocial?._id || 'particular';
      const nombre = factura.obraSocial?.nombre || 'Particulares';
      if (!map.has(id)) {
        map.set(id, { value: id, label: nombre });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [facturas]);

  const filteredFacturas = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();

    return facturas.filter((factura) => {
      const monthKey = getMonthKey(factura);
      if (filters.month !== 'all' && monthKey !== filters.month) {
        return false;
      }

      const estado = normalizeEstado(factura);
      if (filters.status === 'pagadas' && estado !== 'pagada') {
        return false;
      }
      if (filters.status === 'pendientes' && estado === 'pagada') {
        return false;
      }
      if (filters.status === 'observadas' && estado !== 'observada') {
        return false;
      }
      if (filters.status === 'parcial' && estado !== 'pagada_parcial') {
        return false;
      }

      const obraId = factura.obraSocial?._id || 'particular';
      if (filters.obraSocial !== 'all' && filters.obraSocial !== obraId) {
        return false;
      }

      if (!lowerSearch) {
        return true;
      }

      const numeroFactura = `${factura.puntoVenta || ''}-${factura.numeroFactura || ''}`.toLowerCase();
      const comprobante = factura.comprobante || '';
      const paciente = factura.paciente
        ? `${factura.paciente?.nombre || ''} ${factura.paciente?.apellido || ''}`.toLowerCase()
        : '';
      const obraSocial = factura.obraSocial?.nombre?.toLowerCase() || '';

      return [numeroFactura, comprobante, paciente, obraSocial].some((value) =>
        value.includes(lowerSearch),
      );
    });
  }, [facturas, filters.month, filters.obraSocial, filters.status, searchTerm]);

  const cobranzasSummary = useMemo(() => {
    const totals = {
      totalFacturado: 0,
      totalCobrado: 0,
      totalPendiente: 0,
      facturasPagas: 0,
      facturasPendientes: 0,
      facturasObservadas: 0,
      facturasParcial: 0,
    };

    const pacientesMap = new Map();
    const obrasMap = new Map();
    const mesesMap = new Map();
    const paymentSummary = {
      efectivo: { label: PAYMENT_METHODS.efectivo.label, monto: 0, pagos: 0 },
      transferencia: { label: PAYMENT_METHODS.transferencia.label, monto: 0, pagos: 0 },
      tarjeta: { label: PAYMENT_METHODS.tarjeta.label, monto: 0, pagos: 0 },
      otros: { label: PAYMENT_METHODS.otros.label, monto: 0, pagos: 0 },
    };

    filteredFacturas.forEach((factura) => {
      const montoTotal = Number(factura.montoTotal) || 0;
      const montoCobrado = getMontoCobrado(factura);
      const saldoPendiente = getSaldoPendiente(factura);
      const estado = normalizeEstado(factura);

      totals.totalFacturado += montoTotal;
      totals.totalCobrado += montoCobrado;
      totals.totalPendiente += saldoPendiente;

      if (estado === 'pagada') {
        totals.facturasPagas += 1;
      } else if (estado === 'observada') {
        totals.facturasObservadas += 1;
        totals.facturasPendientes += 1;
      } else if (estado === 'pagada_parcial') {
        totals.facturasParcial += 1;
        totals.facturasPendientes += 1;
      } else {
        totals.facturasPendientes += 1;
      }

      const pacienteId = factura.paciente?._id || `paciente-${factura._id}`;
      const pacienteNombreBase = factura.paciente
        ? `${factura.paciente?.nombre || ''} ${factura.paciente?.apellido || ''}`.trim()
        : '';
      const pacienteNombre = pacienteNombreBase || 'Paciente sin identificar';

      if (!pacientesMap.has(pacienteId)) {
        pacientesMap.set(pacienteId, {
          id: pacienteId,
          nombre: pacienteNombre,
          facturas: 0,
          totalFacturado: 0,
          totalCobrado: 0,
          saldoPendiente: 0,
        });
      }

      const pacienteEntry = pacientesMap.get(pacienteId);
      pacienteEntry.facturas += 1;
      pacienteEntry.totalFacturado += montoTotal;
      pacienteEntry.totalCobrado += montoCobrado;
      pacienteEntry.saldoPendiente += saldoPendiente;

      const obraId = factura.obraSocial?._id || 'particular';
      const obraNombre = factura.obraSocial?.nombre || 'Particulares';
      if (!obrasMap.has(obraId)) {
        obrasMap.set(obraId, {
          id: obraId,
          nombre: obraNombre,
          facturas: 0,
          totalFacturado: 0,
          totalCobrado: 0,
          saldoPendiente: 0,
          pagas: 0,
          pendientes: 0,
        });
      }

      const obraEntry = obrasMap.get(obraId);
      obraEntry.facturas += 1;
      obraEntry.totalFacturado += montoTotal;
      obraEntry.totalCobrado += montoCobrado;
      obraEntry.saldoPendiente += saldoPendiente;
      if (estado === 'pagada') {
        obraEntry.pagas += 1;
      } else {
        obraEntry.pendientes += 1;
      }

      const monthKey = getMonthKey(factura);
      if (!mesesMap.has(monthKey)) {
        mesesMap.set(monthKey, {
          key: monthKey,
          label: formatMonthLabel(monthKey),
          totalFacturado: 0,
          totalCobrado: 0,
          totalPendiente: 0,
          facturas: 0,
        });
      }

      const monthEntry = mesesMap.get(monthKey);
      monthEntry.totalFacturado += montoTotal;
      monthEntry.totalCobrado += montoCobrado;
      monthEntry.totalPendiente += saldoPendiente;
      monthEntry.facturas += 1;

      if (Array.isArray(factura.pagos)) {
        factura.pagos.forEach((pago) => {
          const montoPago = Number(pago.monto) || 0;
          const metodo = pago.metodo?.toString().toLowerCase() || '';
          const matchingKey = Object.entries(PAYMENT_METHODS).find(([, config]) =>
            config.includes.some((keyword) => metodo.includes(keyword)),
          );
          const key = matchingKey ? matchingKey[0] : 'otros';
          paymentSummary[key].monto += montoPago;
          paymentSummary[key].pagos += 1;
        });
      }
    });

    const pacientesConSaldo = Array.from(pacientesMap.values())
      .filter((paciente) => paciente.saldoPendiente > SALDO_THRESHOLD)
      .sort((a, b) => b.saldoPendiente - a.saldoPendiente);

    const obras = Array.from(obrasMap.values()).sort((a, b) => b.totalFacturado - a.totalFacturado);

    const meses = Array.from(mesesMap.values()).sort((a, b) => getMonthSortValue(b.key) - getMonthSortValue(a.key));

    return {
      totals,
      pacientesConSaldo,
      obras,
      meses,
      paymentSummary,
    };
  }, [filteredFacturas]);

  const panelTabs = [
    { key: 'pacientes', label: 'Pacientes con saldo', total: cobranzasSummary.pacientesConSaldo.length },
    { key: 'obras', label: 'Obras sociales', total: cobranzasSummary.obras.length },
    { key: 'meses', label: 'Flujo mensual', total: cobranzasSummary.meses.length },
    { key: 'facturas', label: 'Facturas incluidas', total: filteredFacturas.length },
  ];

  const activePanelMeta = panelTabs.find((panel) => panel.key === activePanel) || panelTabs[0];

  const renderActivePanel = () => {
    if (loading) {
      return <p className="text-muted mb-0">Cargando información…</p>;
    }

    switch (activePanel) {
      case 'pacientes': {
        if (cobranzasSummary.pacientesConSaldo.length === 0) {
          return <p className="text-muted mb-0">No hay pacientes con deuda para los filtros seleccionados.</p>;
        }

        return (
          <div className="table-responsive" style={{ maxHeight: '320px' }}>
            <table className="table table-sm align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Paciente</th>
                  <th className="text-center">Facturas</th>
                  <th className="text-end">Facturado</th>
                  <th className="text-end">Cobrado</th>
                  <th className="text-end">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {cobranzasSummary.pacientesConSaldo.slice(0, 12).map((paciente) => (
                  <tr key={paciente.id}>
                    <td>{paciente.nombre}</td>
                    <td className="text-center">{paciente.facturas}</td>
                    <td className="text-end">{formatCurrency(paciente.totalFacturado)}</td>
                    <td className="text-end">{formatCurrency(paciente.totalCobrado)}</td>
                    <td className="text-end fw-semibold text-danger">{formatCurrency(paciente.saldoPendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case 'obras': {
        if (cobranzasSummary.obras.length === 0) {
          return <p className="text-muted mb-0">No se registran obras sociales para los filtros aplicados.</p>;
        }

        return (
          <div className="table-responsive" style={{ maxHeight: '320px' }}>
            <table className="table table-sm align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Obra social</th>
                  <th className="text-center">Facturas</th>
                  <th className="text-end">Cobrado</th>
                  <th className="text-end">Pendiente</th>
                  <th className="text-center">Pagadas</th>
                  <th className="text-center">Pendientes</th>
                </tr>
              </thead>
              <tbody>
                {cobranzasSummary.obras.slice(0, 12).map((obra) => (
                  <tr key={obra.id}>
                    <td>{obra.nombre}</td>
                    <td className="text-center">{obra.facturas}</td>
                    <td className="text-end text-success">{formatCurrency(obra.totalCobrado)}</td>
                    <td className="text-end text-danger">{formatCurrency(obra.saldoPendiente)}</td>
                    <td className="text-center text-success">{obra.pagas}</td>
                    <td className="text-center text-warning">{obra.pendientes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case 'meses': {
        if (cobranzasSummary.meses.length === 0) {
          return <p className="text-muted mb-0">No hay datos mensuales para los filtros seleccionados.</p>;
        }

        return (
          <div className="table-responsive" style={{ maxHeight: '320px' }}>
            <table className="table table-sm align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Mes</th>
                  <th className="text-end">Facturado</th>
                  <th className="text-end">Cobrado</th>
                  <th className="text-end">Pendiente</th>
                  <th className="text-center">Facturas</th>
                </tr>
              </thead>
              <tbody>
                {cobranzasSummary.meses.slice(0, 12).map((mes) => (
                  <tr key={mes.key}>
                    <td>{mes.label}</td>
                    <td className="text-end">{formatCurrency(mes.totalFacturado)}</td>
                    <td className="text-end text-success">{formatCurrency(mes.totalCobrado)}</td>
                    <td className="text-end text-danger">{formatCurrency(mes.totalPendiente)}</td>
                    <td className="text-center">{mes.facturas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case 'facturas': {
        if (filteredFacturas.length === 0) {
          return <p className="text-muted mb-0">No se encontraron facturas con los filtros seleccionados.</p>;
        }

        return (
          <div className="table-responsive" style={{ maxHeight: '360px' }}>
            <table className="table table-hover table-sm align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Factura</th>
                  <th>Paciente</th>
                  <th>Obra social</th>
                  <th className="text-end">Total</th>
                  <th className="text-end">Cobrado</th>
                  <th className="text-end">Saldo</th>
                  <th className="text-end">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredFacturas.slice(0, 40).map((factura) => {
                  const estado = normalizeEstado(factura);
                  const saldo = getSaldoPendiente(factura);
                  const pacienteNombre = factura.paciente
                    ? `${factura.paciente?.nombre || ''} ${factura.paciente?.apellido || ''}`.trim()
                    : '';
                  const obraSocialNombre = factura.obraSocial?.nombre || 'Particulares';

                  return (
                    <tr key={factura._id}>
                      <td>
                        <div className="fw-semibold">{factura.numeroFactura || 'Sin número'}</div>
                        <small className="text-muted">{new Date(factura.fechaEmision || factura.createdAt).toLocaleDateString()}</small>
                      </td>
                      <td>{pacienteNombre || 'Paciente sin identificar'}</td>
                      <td>{obraSocialNombre}</td>
                      <td className="text-end">{formatCurrency(factura.montoTotal)}</td>
                      <td className="text-end">{formatCurrency(getMontoCobrado(factura))}</td>
                      <td className={`text-end ${saldo > SALDO_THRESHOLD ? 'text-danger fw-semibold' : ''}`}>
                        {formatCurrency(saldo)}
                      </td>
                      <td className="text-end">
                        <span className="badge bg-light text-uppercase text-muted">
                          {estado.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="gestio-page container">
      <header className="gestio-page__header" aria-labelledby="cobranzas-heading">
        <div className="gestio-page__title-group">
          <h1 id="cobranzas-heading" className="gestio-page__title">
            Resumen de cobranzas
          </h1>
          <p className="gestio-page__description">
            Controlá los ingresos por facturación, identifica saldos pendientes y organiza tus cobros por paciente, obra social y mes.
          </p>
        </div>
        <div className="gestio-page__actions">
          <button type="button" className="btn btn-outline-secondary" onClick={() => setFilters(DEFAULT_FILTERS)} disabled={loading}>
            Limpiar filtros
          </button>
          <button type="button" className="btn btn-outline-primary" onClick={loadFacturas} disabled={loading}>
            Actualizar datos
          </button>
        </div>
      </header>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <h2 className="h5 mb-3">Filtros</h2>
          <div className="row g-3 align-items-end">
            <div className="col-12 col-md-4 col-lg-3">
              <label htmlFor="monthFilter" className="form-label">Mes</label>
              <select
                id="monthFilter"
                className="form-select"
                value={filters.month}
                onChange={(event) => handleFilterChange('month', event.target.value)}
                disabled={loading}
              >
                <option value="all">Todos los meses</option>
                {availableMonths.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-4 col-lg-3">
              <label htmlFor="statusFilter" className="form-label">Estado</label>
              <select
                id="statusFilter"
                className="form-select"
                value={filters.status}
                onChange={(event) => handleFilterChange('status', event.target.value)}
                disabled={loading}
              >
                {STATUS_FILTERS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-4 col-lg-3">
              <label htmlFor="obraFilter" className="form-label">Obra social</label>
              <select
                id="obraFilter"
                className="form-select"
                value={filters.obraSocial}
                onChange={(event) => handleFilterChange('obraSocial', event.target.value)}
                disabled={loading}
              >
                <option value="all">Todas</option>
                {obraSocialOptions.map((obra) => (
                  <option key={obra.value} value={obra.value}>
                    {obra.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12 col-lg-3">
              <label htmlFor="search" className="form-label">Buscar</label>
              <input
                id="search"
                type="search"
                className="form-control"
                placeholder="Paciente, factura u obra social"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </div>
      </div>

      <section className="gestio-summary-grid" aria-label="Indicadores de cobranzas">
        <article className="gestio-summary-card">
          <span className="gestio-summary-card__label">Total facturado</span>
          <span className="gestio-summary-card__value">{formatCurrency(cobranzasSummary.totals.totalFacturado)}</span>
        </article>
        <article className="gestio-summary-card">
          <span className="gestio-summary-card__label">Total cobrado</span>
          <span className="gestio-summary-card__value text-success">{formatCurrency(cobranzasSummary.totals.totalCobrado)}</span>
        </article>
        <article className="gestio-summary-card">
          <span className="gestio-summary-card__label">Saldo pendiente</span>
          <span className="gestio-summary-card__value text-danger">{formatCurrency(cobranzasSummary.totals.totalPendiente)}</span>
        </article>
        <article className="gestio-summary-card">
          <span className="gestio-summary-card__label">Estado de facturas</span>
          <ul className="list-unstyled mb-0 small text-muted">
            <li className="d-flex justify-content-between">
              <span>Pagadas</span>
              <strong className="text-success">{formatNumber(cobranzasSummary.totals.facturasPagas)}</strong>
            </li>
            <li className="d-flex justify-content-between">
              <span>Pendientes</span>
              <strong className="text-warning">{formatNumber(cobranzasSummary.totals.facturasPendientes)}</strong>
            </li>
            <li className="d-flex justify-content-between">
              <span>Parciales</span>
              <strong className="text-primary">{formatNumber(cobranzasSummary.totals.facturasParcial)}</strong>
            </li>
            <li className="d-flex justify-content-between">
              <span>Observadas</span>
              <strong className="text-danger">{formatNumber(cobranzasSummary.totals.facturasObservadas)}</strong>
            </li>
          </ul>
        </article>
      </section>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <h2 className="h5 mb-2">Métodos de cobro</h2>
          <p className="text-muted small mb-3">Solo se admiten pagos en efectivo o transferencias bancarias para los pacientes particulares.</p>
          {Object.values(cobranzasSummary.paymentSummary).every((method) => method.pagos === 0) ? (
            <p className="text-muted mb-0">Aún no se registraron pagos en las facturas seleccionadas.</p>
          ) : (
            <div className="row g-3">
              {Object.entries(cobranzasSummary.paymentSummary).map(([key, method]) => (
                <div className="col-12 col-md-6 col-xl-3" key={key}>
                  <div className="border rounded p-3 h-100">
                    <p className="mb-1 fw-semibold">{method.label}</p>
                    <p className="mb-0">{formatCurrency(method.monto)} cobrados</p>
                    <p className="text-muted small mb-0">{formatNumber(method.pagos)} pagos</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-lg-between gap-3 mb-3">
            <div>
              <h2 className="h5 mb-1">Detalle inteligente</h2>
              <p className="text-muted mb-0 small">Explora los segmentos clave sin perder de vista el total de registros.</p>
            </div>
            <div className="nav nav-pills flex-nowrap overflow-auto">
              {panelTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`nav-link ${activePanel === tab.key ? 'active' : ''}`}
                  onClick={() => setActivePanel(tab.key)}
                >
                  {tab.label}
                  <span className="badge rounded-pill bg-light text-dark ms-2">{formatNumber(tab.total)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-lg-between gap-3 mb-3">
            <small className="text-muted">
              {activePanelMeta ? `Mostrando hasta ${activePanel === 'facturas' ? 40 : 12} registros de ${formatNumber(activePanelMeta.total)} en ${activePanelMeta.label.toLowerCase()}.` : ''}
            </small>
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setActivePanel('pacientes')}
                disabled={activePanel === 'pacientes'}
              >
                Ver pacientes
              </button>
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={() => setActivePanel('facturas')}
                disabled={activePanel === 'facturas'}
              >
                Ver facturas
              </button>
            </div>
          </div>
          {renderActivePanel()}
        </div>
      </div>
    </div>
  );
}

export default CobranzasPage;
