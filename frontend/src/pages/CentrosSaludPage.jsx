import React, { useState, useEffect, useMemo } from 'react';
import centrosSaludService from '../services/CentrosSaludService';
import facturasService from '../services/FacturasService';

const initialForm = {
  nombre: '',
  localidad: '',
  provincia: '',
  retencionPorcentaje: '',
};

const formatCurrency = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '$0,00';
  }
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(numericValue);
};

function CentrosSaludPage() {
  const [centros, setCentros] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [formData, setFormData] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCentros();
    fetchFacturas();
  }, []);

  const fetchCentros = async () => {
    try {
      const data = await centrosSaludService.list();
      setCentros(data);
    } catch (fetchError) {
      console.error('Error al obtener centros de salud:', fetchError);
      setError('No pudimos cargar los centros de salud. Intenta nuevamente más tarde.');
    }
  };

  const fetchFacturas = async () => {
    try {
      const data = await facturasService.getFacturas();
      setFacturas(data);
    } catch (fetchError) {
      console.error('Error al obtener facturas:', fetchError);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData(initialForm);
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    const payload = {
      ...formData,
      nombre: formData.nombre.trim(),
      localidad: formData.localidad.trim(),
      provincia: formData.provincia.trim(),
      retencionPorcentaje: formData.retencionPorcentaje === ''
        ? null
        : Number(formData.retencionPorcentaje),
    };

    if (!payload.nombre) {
      setError('El nombre del centro de salud es obligatorio.');
      return;
    }

    if (payload.retencionPorcentaje == null || Number.isNaN(payload.retencionPorcentaje)) {
      setError('Debes indicar un porcentaje de retención válido.');
      return;
    }

    if (payload.retencionPorcentaje < 0 || payload.retencionPorcentaje > 100) {
      setError('El porcentaje de retención debe estar entre 0 y 100.');
      return;
    }

    try {
      setLoading(true);
      if (editingId) {
        await centrosSaludService.update(editingId, payload);
      } else {
        await centrosSaludService.create(payload);
      }
      await fetchCentros();
      await fetchFacturas();
      resetForm();
    } catch (submitError) {
      console.error('Error al guardar el centro de salud:', submitError);
      const message = submitError.response?.data?.error
        || 'Ocurrió un error al guardar el centro de salud.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (centro) => {
    setEditingId(centro._id);
    setFormData({
      nombre: centro.nombre || '',
      localidad: centro.localidad || '',
      provincia: centro.provincia || '',
      retencionPorcentaje: centro.retencionPorcentaje ?? '',
    });
    setError(null);
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm('¿Seguro que deseas eliminar este centro de salud?');
    if (!confirmed) {
      return;
    }
    try {
      await centrosSaludService.remove(id);
      await fetchCentros();
      await fetchFacturas();
      if (editingId === id) {
        resetForm();
      }
    } catch (deleteError) {
      console.error('Error al eliminar centro de salud:', deleteError);
      setError('No fue posible eliminar el centro de salud.');
    }
  };

  const metricsPorCentro = useMemo(() => {
    const totals = {};

    centros.forEach((centro) => {
      totals[centro._id] = {
        totalFacturado: 0,
        retencionCalculada: 0,
        netoProfesional: 0,
        cobrado: 0,
        retencionSobreCobrado: 0,
      };
    });

    facturas.forEach((factura) => {
      const centroId = factura.centroSalud?._id;
      if (!centroId || !totals[centroId]) {
        return;
      }
      const metrics = totals[centroId];
      metrics.totalFacturado += Number(factura.montoTotal) || 0;
      metrics.retencionCalculada += Number(factura.retencionCentroSobreTotal) || 0;
      metrics.netoProfesional += Number(factura.montoTotalNeto ?? (factura.montoTotal || 0));
      metrics.cobrado += Number(factura.montoCobrado) || 0;
      metrics.retencionSobreCobrado += Number(factura.retencionCentroSobreCobrado) || 0;
    });

    return totals;
  }, [centros, facturas]);

  return (
    <div className="container py-4">
      <div className="row g-4">
        <div className="col-12 col-lg-5">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
              <h2 className="h5 mb-0">{editingId ? 'Editar Centro de Salud' : 'Nuevo Centro de Salud'}</h2>
            </div>
            <div className="card-body">
              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label" htmlFor="nombre">Nombre</label>
                  <input
                    type="text"
                    id="nombre"
                    name="nombre"
                    className="form-control"
                    value={formData.nombre}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="localidad">Localidad</label>
                    <input
                      type="text"
                      id="localidad"
                      name="localidad"
                      className="form-control"
                      value={formData.localidad}
                      onChange={handleChange}
                      placeholder="Ej: Rosario"
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="provincia">Provincia</label>
                    <input
                      type="text"
                      id="provincia"
                      name="provincia"
                      className="form-control"
                      value={formData.provincia}
                      onChange={handleChange}
                      placeholder="Ej: Santa Fe"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="form-label" htmlFor="retencionPorcentaje">Porcentaje de retención (%)</label>
                  <input
                    type="number"
                    id="retencionPorcentaje"
                    name="retencionPorcentaje"
                    className="form-control"
                    value={formData.retencionPorcentaje}
                    onChange={handleChange}
                    min="0"
                    max="100"
                    step="0.1"
                    required
                  />
                </div>
                <div className="d-flex justify-content-between mt-4">
                  {editingId ? (
                    <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>
                      Cancelar
                    </button>
                  ) : <span />}
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? 'Guardando…' : editingId ? 'Actualizar Centro' : 'Agregar Centro'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-7">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-white border-0">
              <h2 className="h5 mb-0">Centros de Salud y Retenciones</h2>
              <p className="text-muted mb-0">Visualiza rápidamente cuánto se retiene y el neto que corresponde al profesional.</p>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-striped table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Centro</th>
                      <th className="text-center">Retención</th>
                      <th>Total Facturado</th>
                      <th>Retención Calculada</th>
                      <th>Neto Profesional</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {centros.length === 0 && (
                      <tr>
                        <td colSpan="6" className="text-center py-4 text-muted">
                          Aún no registraste centros de salud.
                        </td>
                      </tr>
                    )}
                    {centros.map((centro) => {
                      const metrics = metricsPorCentro[centro._id] || {
                        totalFacturado: 0,
                        retencionCalculada: 0,
                        netoProfesional: 0,
                      };
                      return (
                        <tr key={centro._id}>
                          <td>
                            <strong>{centro.nombre}</strong>
                            <div className="small text-muted">
                              {[centro.localidad, centro.provincia].filter(Boolean).join(', ')}
                            </div>
                          </td>
                          <td className="text-center">{centro.retencionPorcentaje}%</td>
                          <td>{formatCurrency(metrics.totalFacturado)}</td>
                          <td>{formatCurrency(metrics.retencionCalculada)}</td>
                          <td>{formatCurrency(metrics.netoProfesional)}</td>
                          <td className="text-end">
                            <div className="btn-group btn-group-sm" role="group">
                              <button className="btn btn-outline-primary" onClick={() => handleEdit(centro)}>
                                Editar
                              </button>
                              <button className="btn btn-outline-danger" onClick={() => handleDelete(centro._id)}>
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {centros.length > 0 && (
                <div className="border-top p-3 bg-light small text-muted">
                  Los montos mostrados consideran todas las facturas vinculadas a cada centro de salud.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CentrosSaludPage;
