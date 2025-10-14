import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import centrosSaludService from '../services/CentrosSaludService';
import facturasService from '../services/FacturasService';
import { useFeedback } from '../context/FeedbackContext.jsx';

const EMPTY_FORM = {
  nombre: '',
  porcentajeRetencion: '',
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value) || 0);
};

const formatDateLabel = (value) => {
  if (!value) {
    return '';
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
};

function CentrosSaludPage() {
  const { showError, showSuccess, showInfo } = useFeedback();
  const [centros, setCentros] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [retentionPeriod, setRetentionPeriod] = useState('all');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const formRef = useRef(null);

  const scrollToForm = useCallback(() => {
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const fetchCentros = useCallback(async () => {
    try {
      const data = await centrosSaludService.getCentros();
      setCentros(data);
    } catch (err) {
      console.error('No se pudieron cargar los centros de salud.', err);
      showError('No se pudieron cargar los centros de salud.');
    }
  }, [showError]);

  const fetchFacturas = useCallback(async () => {
    try {
      const data = await facturasService.getFacturas();
      setFacturas(data);
    } catch (err) {
      console.error('No se pudo obtener la facturación vinculada a los centros.', err);
      showError('No se pudo obtener la facturación vinculada a los centros.');
    }
  }, [showError]);

  useEffect(() => {
    fetchCentros();
    fetchFacturas();
  }, [fetchCentros, fetchFacturas]);

  const { start: customRangeStart, end: customRangeEnd } = customRange;

  const filteredFacturas = useMemo(() => {
    if (!Array.isArray(facturas) || facturas.length === 0) {
      return [];
    }

    if (retentionPeriod === 'all') {
      return facturas;
    }

    let startDate = null;
    let endDate = null;

    if (retentionPeriod === 'currentMonth') {
      const today = new Date();
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (retentionPeriod === 'custom') {
      if (customRangeStart) {
        const parsedStart = new Date(`${customRangeStart}T00:00:00`);
        if (!Number.isNaN(parsedStart.getTime())) {
          startDate = parsedStart;
        }
      }

      if (customRangeEnd) {
        const parsedEnd = new Date(`${customRangeEnd}T23:59:59`);
        if (!Number.isNaN(parsedEnd.getTime())) {
          endDate = parsedEnd;
        }
      }
    }

    if (startDate && endDate && startDate > endDate) {
      const temp = startDate;
      startDate = endDate;
      endDate = temp;
    }

    return facturas.filter((factura) => {
      const rawDate = factura.fechaEmision || factura.fecha || factura.fechaFactura || factura.createdAt;
      if (!rawDate) {
        return false;
      }

      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) {
        return false;
      }

      if (startDate && date < startDate) {
        return false;
      }

      if (endDate && date > endDate) {
        return false;
      }

      return true;
    });
  }, [customRangeEnd, customRangeStart, facturas, retentionPeriod]);

  const resumenCentros = useMemo(() => {
    const acumulado = centros.reduce((acc, centro) => {
      acc[centro._id] = {
        centro,
        totalFacturado: 0,
        totalRetencion: 0,
        cantidadFacturas: 0,
      };
      return acc;
    }, {});

    filteredFacturas.forEach((factura) => {
      const centroId = factura.centroSalud?._id || factura.centroSalud;
      if (centroId && acumulado[centroId]) {
        const porcentaje = acumulado[centroId].centro.porcentajeRetencion || 0;
        acumulado[centroId].totalFacturado += factura.montoTotal || 0;
        acumulado[centroId].totalRetencion += (factura.montoTotal || 0) * (porcentaje / 100);
        acumulado[centroId].cantidadFacturas += 1;
      }
    });

    return Object.values(acumulado).sort((a, b) => b.totalRetencion - a.totalRetencion);
  }, [centros, filteredFacturas]);

  const showCustomRange = retentionPeriod === 'custom';

  const totalRetencion = useMemo(() => {
    return resumenCentros.reduce((sum, item) => sum + item.totalRetencion, 0);
  }, [resumenCentros]);

  const retentionPeriodLabel = useMemo(() => {
    if (retentionPeriod === 'all') {
      return 'Todo el historial';
    }

    if (retentionPeriod === 'currentMonth') {
      const today = new Date();
      const monthLabel = today.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      return `Mes en curso · ${monthLabel}`;
    }

    if (retentionPeriod === 'custom') {
      const startLabel = formatDateLabel(customRangeStart);
      const endLabel = formatDateLabel(customRangeEnd);

      if (startLabel && endLabel) {
        return `Del ${startLabel} al ${endLabel}`;
      }

      if (startLabel) {
        return `Desde ${startLabel}`;
      }

      if (endLabel) {
        return `Hasta ${endLabel}`;
      }

      return 'Rango personalizado';
    }

    return 'Todo el historial';
  }, [customRangeEnd, customRangeStart, retentionPeriod]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredResumenCentros = useMemo(() => {
    if (!normalizedSearch) {
      return resumenCentros;
    }

    return resumenCentros.filter(({ centro }) => {
      const nombre = (centro.nombre || '').toLowerCase();
      return nombre.includes(normalizedSearch);
    });
  }, [resumenCentros, normalizedSearch]);

  const handleRetentionPeriodChange = (event) => {
    const value = event.target.value;
    setRetentionPeriod(value);

    if (value !== 'custom') {
      setCustomRange({ start: '', end: '' });
    }
  };

  const handleCustomRangeChange = (key) => (event) => {
    const { value } = event.target;
    setCustomRange((prev) => ({ ...prev, [key]: value }));
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const hasSearch = normalizedSearch.length > 0;
  const emptyMessage = resumenCentros.length === 0
    ? 'Todavía no registraste centros de salud.'
    : 'No se encontraron centros que coincidan con la búsqueda.';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const porcentaje = Number(formData.porcentajeRetencion);
    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
      setError('El porcentaje de retención debe estar entre 0% y 100%.');
      return;
    }

    const payload = {
      nombre: formData.nombre.trim(),
      porcentajeRetencion: porcentaje,
    };

    if (!payload.nombre) {
      setError('El nombre del centro es obligatorio.');
      return;
    }

    try {
      setLoading(true);
      const isEditing = Boolean(editingId);
      if (isEditing) {
        await centrosSaludService.updateCentro(editingId, payload);
      } else {
        await centrosSaludService.createCentro(payload);
      }
      resetForm();
      fetchCentros();
      showSuccess(isEditing ? 'Centro de salud actualizado correctamente.' : 'Centro de salud creado correctamente.');
    } catch (err) {
      const message = err.response?.data?.error || 'No se pudo guardar el centro de salud.';
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (centro) => {
    setEditingId(centro._id);
    setFormData({
      nombre: centro.nombre,
      porcentajeRetencion: centro.porcentajeRetencion,
    });
    scrollToForm();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Deseas eliminar este centro de salud? Esta acción no se puede deshacer.')) {
      return;
    }
    try {
      setLoading(true);
      await centrosSaludService.deleteCentro(id);
      if (editingId === id) {
        resetForm();
      }
      fetchCentros();
      showInfo('El centro de salud se eliminó correctamente.');
    } catch (err) {
      console.error('No se pudo eliminar el centro de salud.', err);
      showError('No se pudo eliminar el centro de salud.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-4">
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-4">
        <div className="w-100 w-lg-auto">
          <h2 className="fw-bold mb-1">Red de Centros de Salud</h2>
          <p className="text-muted mb-0">Administra los convenios vigentes y controla las retenciones asociadas.</p>
        </div>
        <div className="text-lg-end mt-2 mt-lg-0 w-100 w-lg-auto">
          <h5 className="text-primary mb-1">Retención acumulada</h5>
          <h3 className="fw-bold">{formatCurrency(totalRetencion)}</h3>
          <small className="text-muted">Período: {retentionPeriodLabel}</small>
        </div>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-4 col-lg-3">
              <label className="form-label" htmlFor="retentionPeriod">Período a analizar</label>
              <select
                id="retentionPeriod"
                className="form-select"
                value={retentionPeriod}
                onChange={handleRetentionPeriodChange}
              >
                <option value="all">Todo el historial</option>
                <option value="currentMonth">Mes en curso</option>
                <option value="custom">Rango personalizado</option>
              </select>
            </div>
            {showCustomRange && (
              <>
                <div className="col-sm-6 col-md-4 col-lg-3">
                  <label className="form-label" htmlFor="retentionStart">Desde</label>
                  <input
                    id="retentionStart"
                    type="date"
                    className="form-control"
                    value={customRangeStart}
                    max={customRangeEnd || undefined}
                    onChange={handleCustomRangeChange('start')}
                  />
                </div>
                <div className="col-sm-6 col-md-4 col-lg-3">
                  <label className="form-label" htmlFor="retentionEnd">Hasta</label>
                  <input
                    id="retentionEnd"
                    type="date"
                    className="form-control"
                    value={customRangeEnd}
                    min={customRangeStart || undefined}
                    onChange={handleCustomRangeChange('end')}
                  />
                </div>
              </>
            )}
            <div className="col-lg d-flex align-items-end">
              <p className="text-muted small mb-0">
                El total mostrado incluye las retenciones correspondientes a las facturas emitidas en el período elegido.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-header bg-primary text-white">
          {editingId ? 'Editar centro de salud' : 'Agregar centro de salud'}
        </div>
        <div className="card-body">
          {error && <div className="alert alert-danger">{error}</div>}
          <form className="row g-3 align-items-end" onSubmit={handleSubmit} ref={formRef}>
            <div className="col-md-6">
              <label className="form-label" htmlFor="nombreCentro">Nombre del centro</label>
              <input
                id="nombreCentro"
                type="text"
                name="nombre"
                className="form-control"
                value={formData.nombre}
                onChange={handleChange}
                placeholder="Ej. Centro Médico Norte"
                required
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="retencionCentro">Retención (%)</label>
              <input
                id="retencionCentro"
                type="number"
                name="porcentajeRetencion"
                className="form-control"
                min="0"
                max="100"
                step="0.1"
                value={formData.porcentajeRetencion}
                onChange={handleChange}
                placeholder="Ej. 20"
                required
              />
            </div>
            <div className="col-md-2 d-flex gap-2">
              {editingId && (
                <button
                  type="button"
                  className="btn btn-outline-secondary flex-fill"
                  onClick={resetForm}
                  disabled={loading}
                >
                  Cancelar
                </button>
              )}
              <button type="submit" className="btn btn-primary flex-fill" disabled={loading}>
                {editingId ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-header bg-light d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3">
          <div className="w-100 w-lg-auto">
            <strong>Centros registrados</strong>
            <div className="text-muted small">
              Total: {resumenCentros.length}
              {hasSearch && ` · Coincidencias: ${filteredResumenCentros.length}`}
            </div>
          </div>
          <div className="input-group input-group-sm flex-grow-1 flex-lg-grow-0 w-100 w-lg-auto">
            <span className="input-group-text" id="centrosSearchIcon" aria-hidden="true">🔍</span>
            <input
              id="centrosSearch"
              type="search"
              className="form-control"
              placeholder="Buscar por nombre"
              value={searchTerm}
              onChange={handleSearchChange}
              aria-describedby="centrosSearchIcon"
            />
          </div>
        </div>
        <div className="card-body p-0">
          {filteredResumenCentros.length === 0 ? (
            <p className="text-center text-muted py-4 mb-0">{emptyMessage}</p>
          ) : (
            <>
              <div className="table-responsive d-none d-lg-block">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Centro</th>
                      <th className="text-center">Retención</th>
                      <th className="text-end">Facturación vinculada</th>
                      <th className="text-end">Retención a pagar</th>
                      <th className="text-center">Facturas</th>
                      <th className="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResumenCentros.map(({ centro, totalFacturado, totalRetencion, cantidadFacturas }) => (
                      <tr key={centro._id}>
                        <td>
                          <div className="fw-semibold">{centro.nombre}</div>
                          <small className="text-muted">Actualizado el {new Date(centro.updatedAt).toLocaleDateString()}</small>
                        </td>
                        <td className="text-center">{centro.porcentajeRetencion}%</td>
                        <td className="text-end">{formatCurrency(totalFacturado)}</td>
                        <td className="text-end fw-bold text-primary">{formatCurrency(totalRetencion)}</td>
                        <td className="text-center">{cantidadFacturas}</td>
                        <td className="text-end">
                          <div className="btn-group btn-group-sm" role="group">
                            <button className="btn btn-outline-secondary" onClick={() => handleEdit(centro)} disabled={loading}>
                              Editar
                            </button>
                            <button className="btn btn-outline-danger" onClick={() => handleDelete(centro._id)} disabled={loading}>
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="d-lg-none p-3">
                <div className="centros-list-mobile" role="list">
                  {filteredResumenCentros.map(({ centro, totalFacturado, totalRetencion, cantidadFacturas }) => (
                    <article key={centro._id} className="centros-list-mobile__item" role="listitem" aria-label={`Centro ${centro.nombre}`}>
                      <header className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                        <div>
                          <h3 className="h6 mb-1">{centro.nombre}</h3>
                          <p className="text-muted small mb-0">Actualizado el {new Date(centro.updatedAt).toLocaleDateString()}</p>
                        </div>
                        <span className="badge bg-primary-subtle text-primary border border-primary-subtle fw-semibold">
                          {centro.porcentajeRetencion}% Retención
                        </span>
                      </header>

                      <div className="centros-list-mobile__metrics mb-3">
                        <div>
                          <span className="centros-list-mobile__metric-label">Facturación vinculada</span>
                          <span className="centros-list-mobile__metric-value">{formatCurrency(totalFacturado)}</span>
                        </div>
                        <div>
                          <span className="centros-list-mobile__metric-label">Retención a pagar</span>
                          <span className="centros-list-mobile__metric-value text-primary">{formatCurrency(totalRetencion)}</span>
                        </div>
                      </div>

                      <div className="d-flex flex-column flex-sm-row gap-2 align-items-stretch align-items-sm-center">
                        <span className="badge bg-light text-primary border border-primary-subtle">
                          Facturas: {cantidadFacturas}
                        </span>
                        <div className="d-flex flex-column flex-sm-row gap-2 w-100 justify-content-sm-end">
                          <button
                            className="btn btn-outline-secondary"
                            onClick={() => handleEdit(centro)}
                            disabled={loading}
                          >
                            Editar
                          </button>
                          <button
                            className="btn btn-outline-danger"
                            onClick={() => handleDelete(centro._id)}
                            disabled={loading}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default CentrosSaludPage;
