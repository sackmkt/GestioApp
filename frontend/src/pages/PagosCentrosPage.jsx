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

const getMonthKey = (value) => {
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

const getCentroRetencionPorcentaje = (factura) => {
  if (!factura) {
    return 0;
  }

  const porcentaje = factura.centroRetencionPorcentaje ?? factura.centroSalud?.porcentajeRetencion;
  const numeric = Number(porcentaje);
  return Number.isFinite(numeric) ? numeric : 0;
};

const getCentroTotal = (factura) => {
  if (!factura) {
    return 0;
  }

  if (Number.isFinite(Number(factura.centroTotal))) {
    return Number(factura.centroTotal);
  }

  const porcentaje = getCentroRetencionPorcentaje(factura);
  const montoTotal = Number(factura.montoTotal) || 0;
  return (montoTotal * porcentaje) / 100;
};

const getCentroPagado = (factura) => {
  if (!factura) {
    return 0;
  }

  if (Number.isFinite(Number(factura.centroPagado))) {
    return Number(factura.centroPagado);
  }

  const pagosCentro = Array.isArray(factura.pagosCentro) ? factura.pagosCentro : [];
  return pagosCentro.reduce((sum, pago) => sum + (Number(pago.monto) || 0), 0);
};

const getCentroSaldoPendiente = (factura) => {
  if (!factura) {
    return 0;
  }

  if (Number.isFinite(Number(factura.centroSaldoPendiente))) {
    return Math.max(Number(factura.centroSaldoPendiente), 0);
  }

  const total = getCentroTotal(factura);
  const pagado = getCentroPagado(factura);
  const saldo = total - pagado;
  return saldo > 0 ? saldo : 0;
};

const SALDO_THRESHOLD = 1e-2;

const DEFAULT_FILTERS = {
  month: 'all',
  center: 'all',
  pendientes: true,
};

function PagosCentrosPage() {
  const { showError, showSuccess } = useFeedback();
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCenterId, setSelectedCenterId] = useState('');
  const [paymentForm, setPaymentForm] = useState({ facturaId: '', monto: '', fecha: '', metodo: '', nota: '' });
  const [isRegistering, setIsRegistering] = useState(false);

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
      console.error('No se pudieron cargar las facturas para el resumen de pagos a centros.', error);
      showError('No pudimos cargar los datos de pagos a centros. Intenta nuevamente más tarde.');
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
    facturas.forEach((factura) => {
      if (!factura.centroSalud?._id) {
        return;
      }
      const key = getMonthKey(factura.fechaEmision || factura.fechaVencimiento || factura.createdAt);
      if (key !== 'sin-fecha') {
        monthSet.add(key);
      }
    });

    return Array.from(monthSet)
      .sort((a, b) => getMonthSortValue(b) - getMonthSortValue(a))
      .map((key) => ({ value: key, label: formatMonthLabel(key) }));
  }, [facturas]);

  const centerOptions = useMemo(() => {
    const map = new Map();
    facturas.forEach((factura) => {
      const centroId = factura.centroSalud?._id;
      if (!centroId) {
        return;
      }
      const nombre = factura.centroSalud?.nombre || 'Centro sin nombre';
      if (!map.has(centroId)) {
        map.set(centroId, { value: centroId, label: nombre });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [facturas]);

  const filteredFacturas = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();

    return facturas.filter((factura) => {
      const centroId = factura.centroSalud?._id;
      if (!centroId) {
        return false;
      }

      const monthKey = getMonthKey(factura.fechaEmision || factura.fechaVencimiento || factura.createdAt);
      if (filters.month !== 'all' && monthKey !== filters.month) {
        return false;
      }

      if (filters.center !== 'all' && filters.center !== centroId) {
        return false;
      }

      if (filters.pendientes && getCentroSaldoPendiente(factura) <= SALDO_THRESHOLD) {
        return false;
      }

      if (!lowerSearch) {
        return true;
      }

      const pacienteNombre = factura.paciente
        ? `${factura.paciente?.nombre || ''} ${factura.paciente?.apellido || ''}`.toLowerCase()
        : '';
      const numeroFactura = `${factura.puntoVenta || ''}-${factura.numeroFactura || ''}`.toLowerCase();
      const centroNombre = factura.centroSalud?.nombre?.toLowerCase() || '';

      return [pacienteNombre, numeroFactura, centroNombre].some((value) => value.includes(lowerSearch));
    });
  }, [facturas, filters.center, filters.month, filters.pendientes, searchTerm]);

  const summary = useMemo(() => {
    const totals = {
      totalComprometido: 0,
      totalPagado: 0,
      totalPendiente: 0,
    };
    const centrosMap = new Map();
    const mesesMap = new Map();

    filteredFacturas.forEach((factura) => {
      const centroId = factura.centroSalud?._id;
      if (!centroId) {
        return;
      }

      const centroNombre = factura.centroSalud?.nombre || 'Centro sin nombre';
      const totalCentro = getCentroTotal(factura);
      const pagadoCentro = getCentroPagado(factura);
      const saldoCentro = getCentroSaldoPendiente(factura);

      totals.totalComprometido += totalCentro;
      totals.totalPagado += pagadoCentro;
      totals.totalPendiente += saldoCentro;

      if (!centrosMap.has(centroId)) {
        centrosMap.set(centroId, {
          id: centroId,
          nombre: centroNombre,
          facturas: 0,
          totalComprometido: 0,
          totalPagado: 0,
          totalPendiente: 0,
          pacientes: new Map(),
        });
      }

      const centroEntry = centrosMap.get(centroId);
      centroEntry.facturas += 1;
      centroEntry.totalComprometido += totalCentro;
      centroEntry.totalPagado += pagadoCentro;
      centroEntry.totalPendiente += saldoCentro;

      const pacienteId = factura.paciente?._id || `paciente-${factura._id}`;
      const pacienteNombreBase = factura.paciente
        ? `${factura.paciente?.nombre || ''} ${factura.paciente?.apellido || ''}`.trim()
        : '';
      const pacienteNombre = pacienteNombreBase || 'Paciente sin identificar';

      if (!centroEntry.pacientes.has(pacienteId)) {
        centroEntry.pacientes.set(pacienteId, {
          id: pacienteId,
          nombre: pacienteNombre,
          facturas: 0,
          totalComprometido: 0,
          totalPagado: 0,
          totalPendiente: 0,
        });
      }

      const pacienteEntry = centroEntry.pacientes.get(pacienteId);
      pacienteEntry.facturas += 1;
      pacienteEntry.totalComprometido += totalCentro;
      pacienteEntry.totalPagado += pagadoCentro;
      pacienteEntry.totalPendiente += saldoCentro;

      const monthKey = getMonthKey(factura.fechaEmision || factura.fechaVencimiento || factura.createdAt);
      if (!mesesMap.has(monthKey)) {
        mesesMap.set(monthKey, {
          key: monthKey,
          label: formatMonthLabel(monthKey),
          totalComprometido: 0,
          totalPagado: 0,
          totalPendiente: 0,
          facturas: 0,
        });
      }

      const mesEntry = mesesMap.get(monthKey);
      mesEntry.totalComprometido += totalCentro;
      mesEntry.totalPagado += pagadoCentro;
      mesEntry.totalPendiente += saldoCentro;
      mesEntry.facturas += 1;
    });

    const centros = Array.from(centrosMap.values())
      .map((centro) => ({
        ...centro,
        pacientes: Array.from(centro.pacientes.values()).sort((a, b) => b.totalPendiente - a.totalPendiente),
      }))
      .sort((a, b) => b.totalPendiente - a.totalPendiente);

    const meses = Array.from(mesesMap.values()).sort((a, b) => getMonthSortValue(b.key) - getMonthSortValue(a.key));

    return {
      totals,
      centros,
      meses,
    };
  }, [filteredFacturas]);

  const centrosConDeuda = useMemo(() => {
    const map = new Map();

    facturas.forEach((factura) => {
      const centroId = factura.centroSalud?._id;
      if (!centroId) {
        return;
      }
      const saldo = getCentroSaldoPendiente(factura);
      if (saldo <= SALDO_THRESHOLD) {
        return;
      }
      const nombre = factura.centroSalud?.nombre || 'Centro sin nombre';
      if (!map.has(centroId)) {
        map.set(centroId, { id: centroId, nombre, saldoTotal: 0 });
      }
      map.get(centroId).saldoTotal += saldo;
    });

    return Array.from(map.values()).sort((a, b) => b.saldoTotal - a.saldoTotal);
  }, [facturas]);

  useEffect(() => {
    if (!centrosConDeuda.some((centro) => centro.id === selectedCenterId)) {
      setSelectedCenterId(centrosConDeuda[0]?.id || '');
    }
  }, [centrosConDeuda, selectedCenterId]);

  const pendientesDelCentro = useMemo(() => {
    if (!selectedCenterId) {
      return [];
    }

    return facturas
      .filter((factura) => factura.centroSalud?._id === selectedCenterId)
      .map((factura) => ({
        factura,
        saldo: getCentroSaldoPendiente(factura),
      }))
      .filter((entry) => entry.saldo > SALDO_THRESHOLD)
      .sort((a, b) => b.saldo - a.saldo)
      .map((entry) => {
        const { factura, saldo } = entry;
        const pacienteNombre = factura.paciente
          ? `${factura.paciente?.nombre || ''} ${factura.paciente?.apellido || ''}`.trim()
          : '';
        return {
          id: factura._id,
          paciente: pacienteNombre || 'Paciente sin identificar',
          numeroFactura: factura.numeroFactura || 'Sin número',
          saldo,
        };
      });
  }, [facturas, selectedCenterId]);

  useEffect(() => {
    if (pendientesDelCentro.length > 0 && !pendientesDelCentro.some((item) => item.id === paymentForm.facturaId)) {
      setPaymentForm((prev) => ({ ...prev, facturaId: pendientesDelCentro[0].id }));
    }
    if (pendientesDelCentro.length === 0) {
      setPaymentForm((prev) => ({ ...prev, facturaId: '' }));
    }
  }, [pendientesDelCentro, paymentForm.facturaId]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handlePaymentFormChange = (field, value) => {
    setPaymentForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRegisterPayment = async (event) => {
    event.preventDefault();
    if (!paymentForm.facturaId) {
      showError('Selecciona una factura pendiente para registrar el pago.');
      return;
    }
    const monto = Number(paymentForm.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      showError('Ingresa un monto válido para registrar el pago al centro.');
      return;
    }
    if (!paymentForm.fecha) {
      showError('Selecciona la fecha del pago.');
      return;
    }

    try {
      setIsRegistering(true);
      await facturasService.registrarPagoCentro(paymentForm.facturaId, {
        monto,
        fecha: paymentForm.fecha,
        metodo: paymentForm.metodo || undefined,
        nota: paymentForm.nota || undefined,
      });
      showSuccess('Pago registrado correctamente.');
      setPaymentForm({ facturaId: paymentForm.facturaId, monto: '', fecha: paymentForm.fecha, metodo: '', nota: '' });
      await loadFacturas();
    } catch (error) {
      console.error('Error al registrar el pago al centro.', error);
      showError('No pudimos registrar el pago. Revisa los datos e intenta nuevamente.');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <section className="py-2">
      <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-lg-between gap-3 mb-4">
        <div>
          <h1 className="h2 mb-1">Pagos a centros de salud</h1>
          <p className="text-muted mb-0">
            Visualiza lo comprometido, pagado y pendiente por centro y paciente para organizar tus egresos mensuales.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={() => setFilters(DEFAULT_FILTERS)} disabled={loading}>
            Limpiar filtros
          </button>
          <button type="button" className="btn btn-outline-primary" onClick={loadFacturas} disabled={loading}>
            Actualizar datos
          </button>
        </div>
      </div>

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
              <label htmlFor="centerFilter" className="form-label">Centro de salud</label>
              <select
                id="centerFilter"
                className="form-select"
                value={filters.center}
                onChange={(event) => handleFilterChange('center', event.target.value)}
                disabled={loading}
              >
                <option value="all">Todos</option>
                {centerOptions.map((center) => (
                  <option key={center.value} value={center.value}>
                    {center.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-4 col-lg-3">
              <label className="form-label" htmlFor="pendientesToggle">
                Mostrar solo pendientes
              </label>
              <div className="form-check form-switch">
                <input
                  id="pendientesToggle"
                  className="form-check-input"
                  type="checkbox"
                  checked={filters.pendientes}
                  onChange={(event) => handleFilterChange('pendientes', event.target.checked)}
                  disabled={loading}
                />
                <label className="form-check-label" htmlFor="pendientesToggle">
                  {filters.pendientes ? 'Solo facturas con saldo al centro' : 'Ver todos los registros'}
                </label>
              </div>
            </div>
            <div className="col-12 col-lg-3">
              <label htmlFor="search" className="form-label">Buscar</label>
              <input
                id="search"
                type="search"
                className="form-control"
                placeholder="Paciente, factura o centro"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-12 col-md-6 col-xl-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <h3 className="h6 text-muted text-uppercase mb-2">Total comprometido</h3>
              <p className="h4 mb-0">{formatCurrency(summary.totals.totalComprometido)}</p>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-6 col-xl-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <h3 className="h6 text-muted text-uppercase mb-2">Pagado a centros</h3>
              <p className="h4 text-success mb-0">{formatCurrency(summary.totals.totalPagado)}</p>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-6 col-xl-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <h3 className="h6 text-muted text-uppercase mb-2">Saldo pendiente</h3>
              <p className="h4 text-danger mb-0">{formatCurrency(summary.totals.totalPendiente)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <h2 className="h5 mb-3">Registrar pago al centro</h2>
          {centrosConDeuda.length === 0 ? (
            <p className="text-muted mb-0">No hay centros con saldo pendiente. ¡Estás al día con tus pagos!</p>
          ) : (
            <form className="row g-3" onSubmit={handleRegisterPayment}>
              <div className="col-12 col-lg-3">
                <label htmlFor="centerSelect" className="form-label">Centro de salud</label>
                <select
                  id="centerSelect"
                  className="form-select"
                  value={selectedCenterId}
                  onChange={(event) => {
                    setSelectedCenterId(event.target.value);
                    setPaymentForm((prev) => ({ ...prev, facturaId: '' }));
                  }}
                  disabled={isRegistering}
                >
                  {centrosConDeuda.map((centro) => (
                    <option key={centro.id} value={centro.id}>
                      {centro.nombre} — {formatCurrency(centro.saldoTotal)} pendientes
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-lg-3">
                <label htmlFor="facturaSelect" className="form-label">Factura</label>
                <select
                  id="facturaSelect"
                  className="form-select"
                  value={paymentForm.facturaId}
                  onChange={(event) => handlePaymentFormChange('facturaId', event.target.value)}
                  disabled={isRegistering || pendientesDelCentro.length === 0}
                >
                  <option value="">Selecciona una factura</option>
                  {pendientesDelCentro.map((factura) => (
                    <option key={factura.id} value={factura.id}>
                      {factura.numeroFactura} — {factura.paciente} ({formatCurrency(factura.saldo)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-lg-2">
                <label htmlFor="monto" className="form-label">Monto</label>
                <input
                  id="monto"
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control"
                  value={paymentForm.monto}
                  onChange={(event) => handlePaymentFormChange('monto', event.target.value)}
                  disabled={isRegistering || pendientesDelCentro.length === 0}
                />
              </div>
              <div className="col-12 col-lg-2">
                <label htmlFor="fecha" className="form-label">Fecha</label>
                <input
                  id="fecha"
                  type="date"
                  className="form-control"
                  value={paymentForm.fecha}
                  onChange={(event) => handlePaymentFormChange('fecha', event.target.value)}
                  disabled={isRegistering || pendientesDelCentro.length === 0}
                />
              </div>
              <div className="col-12 col-lg-2">
                <label htmlFor="metodo" className="form-label">Método</label>
                <select
                  id="metodo"
                  className="form-select"
                  value={paymentForm.metodo || ''}
                  onChange={(event) => handlePaymentFormChange('metodo', event.target.value)}
                  disabled={isRegistering || pendientesDelCentro.length === 0}
                >
                  <option value="">Selecciona el método</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia bancaria">Transferencia bancaria</option>
                </select>
              </div>
              <div className="col-12">
                <label htmlFor="nota" className="form-label">Nota</label>
                <textarea
                  id="nota"
                  className="form-control"
                  rows="2"
                  placeholder="Comentarios adicionales sobre el pago"
                  value={paymentForm.nota}
                  onChange={(event) => handlePaymentFormChange('nota', event.target.value)}
                  disabled={isRegistering || pendientesDelCentro.length === 0}
                ></textarea>
              </div>
              <div className="col-12 d-flex justify-content-end">
                <button type="submit" className="btn btn-primary" disabled={isRegistering || pendientesDelCentro.length === 0}>
                  {isRegistering ? 'Registrando…' : 'Registrar pago'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="row g-4">
        <div className="col-12 col-xl-6">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h2 className="h5 mb-3">Centros con saldo</h2>
              {loading ? (
                <p className="text-muted mb-0">Cargando información…</p>
              ) : summary.centros.length === 0 ? (
                <p className="text-muted mb-0">No se registran centros de salud para los filtros seleccionados.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Centro</th>
                        <th className="text-center">Facturas</th>
                        <th className="text-end">Comprometido</th>
                        <th className="text-end">Pagado</th>
                        <th className="text-end">Pendiente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.centros.map((centro) => (
                        <tr key={centro.id}>
                          <td>{centro.nombre}</td>
                          <td className="text-center">{centro.facturas}</td>
                          <td className="text-end">{formatCurrency(centro.totalComprometido)}</td>
                          <td className="text-end">{formatCurrency(centro.totalPagado)}</td>
                          <td className="text-end text-danger">{formatCurrency(centro.totalPendiente)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="col-12 col-xl-6">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h2 className="h5 mb-3">Pacientes por centro</h2>
              {loading ? (
                <p className="text-muted mb-0">Cargando información…</p>
              ) : summary.centros.length === 0 ? (
                <p className="text-muted mb-0">Selecciona otro filtro para ver pacientes asociados.</p>
              ) : (
                <div className="table-responsive" style={{ maxHeight: '360px' }}>
                  <table className="table table-sm align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Centro</th>
                        <th>Paciente</th>
                        <th className="text-end">Pendiente</th>
                        <th className="text-center">Facturas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.centros.flatMap((centro) =>
                        centro.pacientes.map((paciente) => (
                          <tr key={`${centro.id}-${paciente.id}`}>
                            <td>{centro.nombre}</td>
                            <td>{paciente.nombre}</td>
                            <td className="text-end text-danger">{formatCurrency(paciente.totalPendiente)}</td>
                            <td className="text-center">{paciente.facturas}</td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm my-4">
        <div className="card-body">
          <h2 className="h5 mb-3">Flujo mensual</h2>
          {loading ? (
            <p className="text-muted mb-0">Cargando información…</p>
          ) : summary.meses.length === 0 ? (
            <p className="text-muted mb-0">No se registran datos para los filtros seleccionados.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Mes</th>
                    <th className="text-end">Comprometido</th>
                    <th className="text-end">Pagado</th>
                    <th className="text-end">Pendiente</th>
                    <th className="text-center">Facturas</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.meses.map((mes) => (
                    <tr key={mes.key}>
                      <td>{mes.label}</td>
                      <td className="text-end">{formatCurrency(mes.totalComprometido)}</td>
                      <td className="text-end">{formatCurrency(mes.totalPagado)}</td>
                      <td className="text-end text-danger">{formatCurrency(mes.totalPendiente)}</td>
                      <td className="text-center">{mes.facturas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <h2 className="h5 mb-3">Facturas incluidas</h2>
          {loading ? (
            <p className="text-muted mb-0">Cargando facturas…</p>
          ) : filteredFacturas.length === 0 ? (
            <p className="text-muted mb-0">No se encontraron facturas según los filtros aplicados.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Centro</th>
                    <th>Paciente</th>
                    <th>Factura</th>
                    <th className="text-end">Comprometido</th>
                    <th className="text-end">Pagado</th>
                    <th className="text-end">Pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFacturas.map((factura) => {
                    const centroNombre = factura.centroSalud?.nombre || 'Centro sin nombre';
                    const pacienteNombre = factura.paciente
                      ? `${factura.paciente?.nombre || ''} ${factura.paciente?.apellido || ''}`.trim()
                      : '';
                    const totalCentro = getCentroTotal(factura);
                    const pagadoCentro = getCentroPagado(factura);
                    const saldoCentro = getCentroSaldoPendiente(factura);
                    return (
                      <tr key={factura._id}>
                        <td>{centroNombre}</td>
                        <td>{pacienteNombre || 'Paciente sin identificar'}</td>
                        <td>
                          <div className="fw-semibold">{factura.numeroFactura || 'Sin número'}</div>
                          <small className="text-muted">{new Date(factura.fechaEmision || factura.createdAt).toLocaleDateString()}</small>
                        </td>
                        <td className="text-end">{formatCurrency(totalCentro)}</td>
                        <td className="text-end">{formatCurrency(pagadoCentro)}</td>
                        <td className="text-end text-danger">{formatCurrency(saldoCentro)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default PagosCentrosPage;
