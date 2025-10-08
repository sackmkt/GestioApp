import React, { useState, useEffect, useMemo } from 'react';
import facturasService from '../services/FacturasService';
import pacientesService from '../services/PacientesService';
import obrasSocialesService from '../services/ObrasSocialesService';

const ESTADO_OPTIONS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'presentada', label: 'Presentada' },
  { value: 'observada', label: 'Observada' },
  { value: 'pagada_parcial', label: 'Pagada Parcialmente' },
  { value: 'pagada', label: 'Pagada' },
];

const ESTADO_LABELS = ESTADO_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

const ESTADO_BADGES = {
  pendiente: 'bg-warning text-dark',
  presentada: 'bg-info text-dark',
  observada: 'bg-danger',
  pagada_parcial: 'bg-primary',
  pagada: 'bg-success',
};

const EMPTY_FORM = {
  paciente: '',
  obraSocial: '',
  centroSalud: '',
  numeroFactura: '',
  montoTotal: '',
  fechaEmision: '',
  fechaVencimiento: '',
  estado: 'pendiente',
  interes: '',
  observaciones: '',
};

const EMPTY_PAYMENT_FORM = {
  monto: '',
  fecha: '',
  metodo: '',
  nota: '',
};

const formatCurrency = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '$0,00';
  }
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(numericValue);
};

const formatDate = (value) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString();
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

const esFacturaVencida = (factura) => {
  if (!factura || factura.pagado) {
    return false;
  }
  if (!factura.fechaVencimiento) {
    return false;
  }
  const vencimiento = new Date(factura.fechaVencimiento);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return !Number.isNaN(vencimiento.getTime()) && vencimiento < hoy;
};

function FacturasPage() {
  const [facturas, setFacturas] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [obrasSociales, setObrasSociales] = useState([]);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSearchTerm, setFilterSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [expandedFacturaId, setExpandedFacturaId] = useState(null);
  const [paymentForms, setPaymentForms] = useState({});
  const [paymentErrors, setPaymentErrors] = useState({});

  useEffect(() => {
    fetchFacturas();
    fetchPacientes();
    fetchObrasSociales();
  }, []);

  const fetchFacturas = async () => {
    try {
      const data = await facturasService.getFacturas();
      setFacturas(data);
    } catch (fetchError) {
      console.error('Error fetching facturas:', fetchError);
    }
  };

  const fetchPacientes = async () => {
    try {
      const data = await pacientesService.getPacientes();
      setPacientes(data);
    } catch (fetchError) {
      console.error('Error fetching pacientes:', fetchError);
    }
  };

  const fetchObrasSociales = async () => {
    try {
      const data = await obrasSocialesService.getObrasSociales();
      setObrasSociales(data);
    } catch (fetchError) {
      console.error('Error fetching obras sociales:', fetchError);
    }
  };

  const selectedPaciente = useMemo(() => {
    if (!formData.paciente) {
      return null;
    }
    return pacientes.find((paciente) => paciente._id === formData.paciente) || null;
  }, [formData.paciente, pacientes]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePacienteChange = (e) => {
    const pacienteId = e.target.value;
    const pacienteSeleccionado = pacientes.find((p) => p._id === pacienteId);
    const obraSocialId = pacienteSeleccionado?.obraSocial?._id || '';
    const centroId = pacienteSeleccionado?.centroSalud?._id || '';

    setFormData((prev) => ({
      ...prev,
      paciente: pacienteId,
      obraSocial: obraSocialId,
      centroSalud: centroId,
    }));
  };

  const resetForm = () => {
    setFormData({ ...EMPTY_FORM });
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const payload = {
      ...formData,
      numeroFactura: Number(formData.numeroFactura),
      montoTotal: Number(formData.montoTotal),
      interes: formData.interes === '' ? 0 : Number(formData.interes),
    };

    payload.fechaVencimiento = payload.fechaVencimiento || null;
    payload.observaciones = payload.observaciones ? payload.observaciones.trim() : '';
    payload.obraSocial = formData.obraSocial || null;
    payload.centroSalud = formData.centroSalud || null;

    if (!Number.isFinite(payload.numeroFactura) || !Number.isFinite(payload.montoTotal)) {
      setError('El número de factura y el monto deben ser valores numéricos.');
      return;
    }

    if (payload.interes < 0 || !Number.isFinite(payload.interes)) {
      setError('El interés no puede ser negativo.');
      return;
    }

    try {
      if (editingId) {
        await facturasService.updateFactura(editingId, payload);
      } else {
        await facturasService.createFactura(payload);
      }

      resetForm();
      fetchFacturas();
    } catch (submitError) {
      if (submitError.response && submitError.response.status === 400) {
        const message = submitError.response.data?.error
          || 'El número de factura ya existe. Por favor, elige uno diferente.';
        setError(message);
      } else {
        setError('Ocurrió un error al intentar crear o actualizar la factura.');
        console.error('Error al procesar la factura:', submitError);
      }
    }
  };

  const handleDelete = async (id) => {
    try {
      await facturasService.deleteFactura(id);
      if (expandedFacturaId === id) {
        setExpandedFacturaId(null);
      }
      fetchFacturas();
    } catch (deleteError) {
      console.error('Error deleting factura:', deleteError);
    }
  };

  const handleEdit = (factura) => {
    const estado = normalizeEstado(factura);
    setEditingId(factura._id);
    setFormData({
      paciente: factura.paciente?._id || '',
      obraSocial: factura.obraSocial?._id || '',
      centroSalud: factura.centroSalud?._id || '',
      numeroFactura: factura.numeroFactura,
      montoTotal: factura.montoTotal,
      fechaEmision: factura.fechaEmision ? new Date(factura.fechaEmision).toISOString().substring(0, 10) : '',
      fechaVencimiento: factura.fechaVencimiento ? new Date(factura.fechaVencimiento).toISOString().substring(0, 10) : '',
      estado,
      interes: factura.interes ?? '',
      observaciones: factura.observaciones || '',
    });
  };

  const handleCancelEdit = () => {
    resetForm();
  };

  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleSearchClick = () => {
    setFilterSearchTerm(searchTerm);
  };

  const toggleExpandFactura = (facturaId) => {
    setExpandedFacturaId((prev) => (prev === facturaId ? null : facturaId));
    setPaymentErrors((prev) => ({ ...prev, [facturaId]: null }));
  };

  const handleEstadoUpdate = async (facturaId, nuevoEstado) => {
    try {
      await facturasService.updateFactura(facturaId, { estado: nuevoEstado });
      fetchFacturas();
    } catch (estadoError) {
      console.error('Error al actualizar estado:', estadoError);
    }
  };

  const handlePaymentFormChange = (facturaId, field, value) => {
    setPaymentForms((prev) => ({
      ...prev,
      [facturaId]: {
        ...(prev[facturaId] || EMPTY_PAYMENT_FORM),
        [field]: value,
      },
    }));
  };

  const resetPaymentForm = (facturaId) => {
    setPaymentForms((prev) => ({
      ...prev,
      [facturaId]: { ...EMPTY_PAYMENT_FORM },
    }));
  };

  const handleRegisterPayment = async (facturaId) => {
    const form = paymentForms[facturaId] || EMPTY_PAYMENT_FORM;
    const monto = Number(form.monto);

    if (!Number.isFinite(monto) || monto <= 0) {
      setPaymentErrors((prev) => ({
        ...prev,
        [facturaId]: 'Ingrese un monto válido para registrar el pago.',
      }));
      return;
    }

    try {
      await facturasService.registrarPago(facturaId, {
        monto,
        fecha: form.fecha || undefined,
        metodo: form.metodo || undefined,
        nota: form.nota || undefined,
      });
      resetPaymentForm(facturaId);
      setPaymentErrors((prev) => ({ ...prev, [facturaId]: null }));
      fetchFacturas();
    } catch (paymentError) {
      const message = paymentError.response?.data?.error || 'Error al registrar el pago.';
      setPaymentErrors((prev) => ({
        ...prev,
        [facturaId]: message,
      }));
      console.error('Error al registrar pago:', paymentError);
    }
  };

  const handleDeletePayment = async (facturaId, pagoId) => {
    try {
      await facturasService.eliminarPago(facturaId, pagoId);
      fetchFacturas();
    } catch (paymentError) {
      const message = paymentError.response?.data?.error || 'Error al eliminar el pago.';
      setPaymentErrors((prev) => ({
        ...prev,
        [facturaId]: message,
      }));
      console.error('Error al eliminar pago:', paymentError);
    }
  };

  const handleLiquidarSaldo = async (factura) => {
    const saldoPendiente = Number(factura.saldoPendiente || 0);
    if (saldoPendiente <= 0) {
      return;
    }

    try {
      await facturasService.registrarPago(factura._id, {
        monto: saldoPendiente,
        fecha: new Date().toISOString(),
        metodo: 'Liquidación',
        nota: 'Liquidación rápida del saldo pendiente',
      });
      fetchFacturas();
    } catch (paymentError) {
      const message = paymentError.response?.data?.error || 'Error al liquidar la factura.';
      setPaymentErrors((prev) => ({
        ...prev,
        [factura._id]: message,
      }));
      console.error('Error al liquidar saldo:', paymentError);
    }
  };

  const appliedSearch = filterSearchTerm.trim().toLowerCase();

  const filteredFacturas = useMemo(() => {
    return facturas.filter((factura) => {
      const estado = normalizeEstado(factura);
      const matchesStatus = (() => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'vencidas') return esFacturaVencida(factura);
        return estado === statusFilter;
      })();

      if (!matchesStatus) {
        return false;
      }

      if (!appliedSearch) {
        return true;
      }

      const numeroFactura = factura.numeroFactura !== null && factura.numeroFactura !== undefined
        ? String(factura.numeroFactura)
        : '';

      const pacienteNombre = factura.paciente
        ? `${factura.paciente?.nombre || ''} ${factura.paciente?.apellido || ''}`.trim()
        : '';

      const obraSocialNombre = factura.obraSocial?.nombre || '';

      const valuesToSearch = [numeroFactura, pacienteNombre, obraSocialNombre].map((value) => value.toLowerCase());
      return valuesToSearch.some((value) => value.includes(appliedSearch));
    });
  }, [facturas, statusFilter, appliedSearch]);

  const resumenCentros = useMemo(() => {
    let totalRetencion = 0;
    let netoTotal = 0;
    let cantidadFacturasCentro = 0;

    filteredFacturas.forEach((factura) => {
      if (factura.centroSalud?._id) {
        cantidadFacturasCentro += 1;
        totalRetencion += Number(factura.retencionCentroSobreTotal) || 0;
        netoTotal += Number(factura.montoTotalNeto ?? (factura.montoTotal || 0));
      }
    });

    return {
      totalRetencion,
      netoTotal,
      cantidadFacturasCentro,
    };
  }, [filteredFacturas]);

  const statusCounts = useMemo(() => {
    const counts = {
      all: facturas.length,
      vencidas: facturas.filter((factura) => esFacturaVencida(factura)).length,
      pendiente: 0,
      presentada: 0,
      observada: 0,
      pagada_parcial: 0,
      pagada: 0,
    };

    facturas.forEach((factura) => {
      const estado = normalizeEstado(factura);
      if (counts[estado] !== undefined) {
        counts[estado] += 1;
      }
    });

    return counts;
  }, [facturas]);

  const renderStatusTabs = () => {
    const tabs = [
      { key: 'all', label: `Todas (${statusCounts.all})` },
      { key: 'vencidas', label: `Vencidas (${statusCounts.vencidas})` },
      { key: 'pendiente', label: `Pendientes (${statusCounts.pendiente})` },
      { key: 'presentada', label: `Presentadas (${statusCounts.presentada})` },
      { key: 'observada', label: `Observadas (${statusCounts.observada})` },
      { key: 'pagada_parcial', label: `Parciales (${statusCounts.pagada_parcial})` },
      { key: 'pagada', label: `Pagadas (${statusCounts.pagada})` },
    ];

    return (
      <ul className="nav nav-tabs card-header-tabs mt-3 flex-nowrap overflow-auto">
        {tabs.map((tab) => (
          <li className="nav-item" key={tab.key}>
            <button
              type="button"
              className={`nav-link ${statusFilter === tab.key ? 'active' : ''}`}
              onClick={() => setStatusFilter(tab.key)}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    );
  };

  const getPaymentForm = (facturaId) => paymentForms[facturaId] || EMPTY_PAYMENT_FORM;

  return (
    <div className="container mt-4">
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-success text-white">
          <h2 className="mb-0">Gestión de Facturación</h2>
        </div>
        <div className="card-body">
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              <div className="col-md-6 col-lg-4">
                <label htmlFor="paciente" className="form-label">Paciente</label>
                <select
                  id="paciente"
                  name="paciente"
                  className="form-select"
                  value={formData.paciente}
                  onChange={handlePacienteChange}
                  required
                >
                  <option value="">Seleccione Paciente</option>
                  {pacientes.map((p) => (
                    <option key={p._id} value={p._id}>{`${p.nombre} ${p.apellido}`}</option>
                  ))}
                </select>
              </div>
              {selectedPaciente && (
                <div className="col-12">
                  <div
                    className={`alert ${selectedPaciente.tipoAtencion === 'centro' ? 'alert-warning' : 'alert-info'} mb-0`}
                  >
                    {selectedPaciente.tipoAtencion === 'centro' ? (
                      <>
                        <strong>Este paciente se atiende a través de un centro de salud.</strong>{' '}
                        {selectedPaciente.centroSalud ? (
                          <span>
                            Centro: {selectedPaciente.centroSalud.nombre} · Retención {selectedPaciente.centroSalud.retencionPorcentaje}%
                          </span>
                        ) : (
                          <span>No hay un centro asignado, revisá la ficha del paciente.</span>
                        )}
                      </>
                    ) : (
                      <strong>Este paciente se factura de manera particular.</strong>
                    )}
                    <div className="small mt-2 mb-0">
                      Contacto: {selectedPaciente.email || 'sin correo registrado'} · {selectedPaciente.telefono || 'sin teléfono'}
                    </div>
                  </div>
                </div>
              )}
              <div className="col-md-6 col-lg-4">
                <label htmlFor="obraSocial" className="form-label">Obra Social</label>
                <select
                  id="obraSocial"
                  name="obraSocial"
                  className="form-select"
                  value={formData.obraSocial}
                  onChange={handleChange}
                  required
                >
                  <option value="">Seleccione Obra Social</option>
                  {obrasSociales.map((os) => (
                    <option key={os._id} value={os._id}>{os.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 col-lg-4">
                <label htmlFor="numeroFactura" className="form-label">Número de Factura</label>
                <input
                  type="number"
                  id="numeroFactura"
                  name="numeroFactura"
                  className="form-control"
                  placeholder="Ej. 12345"
                  value={formData.numeroFactura}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6 col-lg-4">
                <label htmlFor="montoTotal" className="form-label">Monto Total</label>
                <input
                  type="number"
                  id="montoTotal"
                  name="montoTotal"
                  className="form-control"
                  placeholder="Ej. 500.50"
                  value={formData.montoTotal}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  required
                />
              </div>
              <div className="col-md-6 col-lg-4">
                <label htmlFor="fechaEmision" className="form-label">Fecha de Emisión</label>
                <input
                  type="date"
                  id="fechaEmision"
                  name="fechaEmision"
                  className="form-control"
                  value={formData.fechaEmision}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6 col-lg-4">
                <label htmlFor="fechaVencimiento" className="form-label">Fecha de Vencimiento</label>
                <input
                  type="date"
                  id="fechaVencimiento"
                  name="fechaVencimiento"
                  className="form-control"
                  value={formData.fechaVencimiento}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-6 col-lg-4">
                <label htmlFor="estado" className="form-label">Estado de Cobranza</label>
                <select
                  id="estado"
                  name="estado"
                  className="form-select"
                  value={formData.estado}
                  onChange={handleChange}
                >
                  {ESTADO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 col-lg-4">
                <label htmlFor="interes" className="form-label">Interés (%)</label>
                <input
                  type="number"
                  id="interes"
                  name="interes"
                  className="form-control"
                  placeholder="Ej. 5"
                  value={formData.interes}
                  onChange={handleChange}
                  min="0"
                  step="0.1"
                />
              </div>
              <div className="col-12">
                <label htmlFor="observaciones" className="form-label">Observaciones</label>
                <textarea
                  id="observaciones"
                  name="observaciones"
                  className="form-control"
                  rows="2"
                  placeholder="Notas internas sobre la factura"
                  value={formData.observaciones}
                  onChange={handleChange}
                />
              </div>
              <div className="col-12 mt-3 d-flex justify-content-end">
                {editingId && (
                  <button type="button" className="btn btn-secondary me-2" onClick={handleCancelEdit}>
                    Cancelar
                  </button>
                )}
                <button type="submit" className="btn btn-success">
                  {editingId ? 'Actualizar Factura' : 'Agregar Factura'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-header">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
            <h4 className="mb-0">Listado de Facturas</h4>
            <div className="input-group" style={{ maxWidth: '320px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Buscar por paciente, factura u obra social"
                value={searchTerm}
                onChange={handleInputChange}
              />
              <button className="btn btn-outline-secondary" type="button" onClick={handleSearchClick}>
                Buscar
              </button>
            </div>
          </div>
          {renderStatusTabs()}
          {resumenCentros.cantidadFacturasCentro > 0 && (
            <div className="d-flex flex-wrap gap-3 mt-3 small text-muted">
              <span>
                Facturas gestionadas vía centros: <strong>{resumenCentros.cantidadFacturasCentro}</strong>
              </span>
              <span>
                Retenciones acumuladas: <strong>{formatCurrency(resumenCentros.totalRetencion)}</strong>
              </span>
              <span>
                Neto estimado para el profesional: <strong>{formatCurrency(resumenCentros.netoTotal)}</strong>
              </span>
            </div>
          )}
        </div>
        <div className="card-body">
          <div className="table-responsive d-none d-md-block">
            <table className="table table-striped table-hover mb-0 align-middle">
              <thead className="table-dark">
                <tr>
                  <th>N° Factura</th>
                  <th>Paciente</th>
                  <th>Obra Social</th>
                  <th>Modalidad</th>
                  <th>Monto</th>
                  <th>Emitida</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th>Cobrado</th>
                  <th>Saldo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredFacturas.map((factura) => {
                  const estado = normalizeEstado(factura);
                  const badgeClass = ESTADO_BADGES[estado] || 'bg-secondary';
                  const isVencida = esFacturaVencida(factura);
                  return (
                    <React.Fragment key={factura._id}>
                      <tr className={factura.pagado ? 'table-success' : ''}>
                        <td>{factura.numeroFactura}</td>
                        <td>
                          {factura.paciente ? (
                            <>
                              <div className="fw-semibold">{factura.paciente.nombre} {factura.paciente.apellido}</div>
                              <div className="text-muted small">DNI: {factura.paciente.dni || '—'}</div>
                              {factura.paciente.email && (
                                <div className="text-muted small">Correo: {factura.paciente.email}</div>
                              )}
                              {factura.paciente.telefono && (
                                <div className="text-muted small">Teléfono: {factura.paciente.telefono}</div>
                              )}
                            </>
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td>{factura.obraSocial ? factura.obraSocial.nombre : 'N/A'}</td>
                        <td>
                          <div>{factura.paciente?.tipoAtencion === 'centro' ? 'Centro de salud' : 'Particular'}</div>
                          {factura.centroSalud && (
                            <span className="badge bg-light text-dark border mt-1">
                              {factura.centroSalud.nombre}
                              {Number.isFinite(Number(factura.retencionPorcentajeCentro)) && (
                                <> · {factura.retencionPorcentajeCentro}%</>
                              )}
                            </span>
                          )}
                        </td>
                        <td>
                          <div>{formatCurrency(factura.montoTotal)}</div>
                          {factura.centroSalud && (
                            <div className="text-muted small">
                              Neto: {formatCurrency(factura.montoTotalNeto)} · Retención: {formatCurrency(factura.retencionCentroSobreTotal)}
                            </div>
                          )}
                        </td>
                        <td>{formatDate(factura.fechaEmision)}</td>
                        <td>
                          {formatDate(factura.fechaVencimiento)}
                          {isVencida && (
                            <span className="badge bg-danger ms-2">Vencida</span>
                          )}
                        </td>
                        <td>
                          <div className="d-flex flex-column gap-2">
                            <span className={`badge rounded-pill ${badgeClass}`}>
                              {ESTADO_LABELS[estado] || estado}
                            </span>
                            <select
                              className="form-select form-select-sm"
                              value={estado}
                              onChange={(e) => handleEstadoUpdate(factura._id, e.target.value)}
                            >
                              {ESTADO_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td>{formatCurrency(factura.montoCobrado || 0)}</td>
                        <td>{formatCurrency(factura.saldoPendiente || 0)}</td>
                        <td>
                          <div className="d-flex flex-column gap-2">
                            <button
                              className="btn btn-outline-primary btn-sm"
                              type="button"
                              onClick={() => toggleExpandFactura(factura._id)}
                            >
                              {expandedFacturaId === factura._id ? 'Ocultar' : 'Detalles'}
                            </button>
                            <button
                              className="btn btn-warning btn-sm"
                              type="button"
                              onClick={() => handleEdit(factura)}
                            >
                              Editar
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              type="button"
                              onClick={() => handleDelete(factura._id)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedFacturaId === factura._id && (
                        <tr>
                          <td colSpan="10">
                            <div className="p-3 bg-light border rounded">
                              <div className="row g-3">
                                <div className="col-md-4">
                                  <h6 className="text-uppercase text-muted">Detalle</h6>
                                  <p className="mb-1"><strong>Monto Total:</strong> {formatCurrency(factura.montoTotal)}</p>
                                  <p className="mb-1"><strong>Interés:</strong> {factura.interes ? `${factura.interes}%` : '0%'}</p>
                                  <p className="mb-1"><strong>Observaciones:</strong> {factura.observaciones || '—'}</p>
                                  <p className="mb-1"><strong>Saldo Pendiente:</strong> {formatCurrency(factura.saldoPendiente || 0)}</p>
                                  {factura.centroSalud && (
                                    <>
                                      <p className="mb-1"><strong>Centro de Salud:</strong> {factura.centroSalud.nombre}</p>
                                      <p className="mb-1">
                                        <strong>Retención aplicada:</strong> {formatCurrency(factura.retencionCentroSobreTotal)}
                                        {Number.isFinite(Number(factura.retencionPorcentajeCentro)) && (
                                          <> ({factura.retencionPorcentajeCentro}% sobre el total)</>
                                        )}
                                      </p>
                                      <p className="mb-1"><strong>Neto para el profesional:</strong> {formatCurrency(factura.montoTotalNeto)}</p>
                                    </>
                                  )}
                                  <div className="d-flex gap-2 mt-3">
                                    <button
                                      className="btn btn-success btn-sm"
                                      type="button"
                                      onClick={() => handleLiquidarSaldo(factura)}
                                      disabled={(factura.saldoPendiente || 0) <= 0}
                                    >
                                      Liquidar saldo
                                    </button>
                                    <button
                                      className="btn btn-outline-secondary btn-sm"
                                      type="button"
                                      onClick={() => handleEstadoUpdate(factura._id, 'presentada')}
                                    >
                                      Marcar como presentada
                                    </button>
                                  </div>
                                  {paymentErrors[factura._id] && (
                                    <div className="alert alert-danger mt-3 mb-0" role="alert">
                                      {paymentErrors[factura._id]}
                                    </div>
                                  )}
                                </div>
                                <div className="col-md-8">
                                  <h6 className="text-uppercase text-muted">Pagos registrados</h6>
                                  {factura.pagos && factura.pagos.length > 0 ? (
                                    <div className="table-responsive">
                                      <table className="table table-sm align-middle">
                                        <thead>
                                          <tr>
                                            <th>Monto</th>
                                            <th>Fecha</th>
                                            <th>Método</th>
                                            <th>Nota</th>
                                            <th></th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {factura.pagos.map((pago) => (
                                            <tr key={pago._id}>
                                              <td>{formatCurrency(pago.monto)}</td>
                                              <td>{formatDate(pago.fecha)}</td>
                                              <td>{pago.metodo || '—'}</td>
                                              <td>{pago.nota || '—'}</td>
                                              <td className="text-end">
                                                <button
                                                  className="btn btn-outline-danger btn-sm"
                                                  type="button"
                                                  onClick={() => handleDeletePayment(factura._id, pago._id)}
                                                >
                                                  Eliminar
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="text-muted">Aún no se registraron pagos para esta factura.</p>
                                  )}

                                  <div className="mt-4">
                                    <h6 className="text-uppercase text-muted">Registrar nuevo pago</h6>
                                    <div className="row g-2">
                                      <div className="col-sm-3">
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          className="form-control"
                                          placeholder="Monto"
                                          value={getPaymentForm(factura._id).monto}
                                          onChange={(e) => handlePaymentFormChange(factura._id, 'monto', e.target.value)}
                                        />
                                      </div>
                                      <div className="col-sm-3">
                                        <input
                                          type="date"
                                          className="form-control"
                                          value={getPaymentForm(factura._id).fecha}
                                          onChange={(e) => handlePaymentFormChange(factura._id, 'fecha', e.target.value)}
                                        />
                                      </div>
                                      <div className="col-sm-3">
                                        <input
                                          type="text"
                                          className="form-control"
                                          placeholder="Método"
                                          value={getPaymentForm(factura._id).metodo}
                                          onChange={(e) => handlePaymentFormChange(factura._id, 'metodo', e.target.value)}
                                        />
                                      </div>
                                      <div className="col-sm-3">
                                        <input
                                          type="text"
                                          className="form-control"
                                          placeholder="Nota"
                                          value={getPaymentForm(factura._id).nota}
                                          onChange={(e) => handlePaymentFormChange(factura._id, 'nota', e.target.value)}
                                        />
                                      </div>
                                      <div className="col-12 d-flex justify-content-end gap-2">
                                        <button
                                          className="btn btn-outline-secondary btn-sm"
                                          type="button"
                                          onClick={() => resetPaymentForm(factura._id)}
                                        >
                                          Limpiar
                                        </button>
                                        <button
                                          className="btn btn-primary btn-sm"
                                          type="button"
                                          onClick={() => handleRegisterPayment(factura._id)}
                                        >
                                          Registrar pago
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="d-md-none">
            <div className="row g-3">
              {filteredFacturas.map((factura) => {
                const estado = normalizeEstado(factura);
                const badgeClass = ESTADO_BADGES[estado] || 'bg-secondary';
                const paymentForm = getPaymentForm(factura._id);
                return (
                  <div className="col-12" key={factura._id}>
                    <div className="card shadow-sm">
                      <div className="card-body">
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <h5 className="card-title mb-1">Factura N° {factura.numeroFactura}</h5>
                            <p className="mb-1"><strong>Paciente:</strong> {factura.paciente ? `${factura.paciente.nombre} ${factura.paciente.apellido}` : 'N/A'}</p>
                            {factura.paciente?.email && (
                              <p className="mb-1 text-muted small"><strong>Correo:</strong> {factura.paciente.email}</p>
                            )}
                            {factura.paciente?.telefono && (
                              <p className="mb-1 text-muted small"><strong>Tel.:</strong> {factura.paciente.telefono}</p>
                            )}
                            <p className="mb-1"><strong>Modalidad:</strong> {factura.paciente?.tipoAtencion === 'centro' ? 'Centro de salud' : 'Particular'}</p>
                            {factura.centroSalud && (
                              <p className="mb-1 text-muted small">
                                <strong>Centro:</strong> {factura.centroSalud.nombre} · {factura.retencionPorcentajeCentro}%
                              </p>
                            )}
                            <p className="mb-1"><strong>Monto:</strong> {formatCurrency(factura.montoTotal)}</p>
                            {factura.centroSalud && (
                              <p className="mb-1 text-muted small">
                                Neto: {formatCurrency(factura.montoTotalNeto)} · Retención: {formatCurrency(factura.retencionCentroSobreTotal)}
                              </p>
                            )}
                            <p className="mb-1"><strong>Emitida:</strong> {formatDate(factura.fechaEmision)}</p>
                            <p className="mb-1"><strong>Vence:</strong> {formatDate(factura.fechaVencimiento)}</p>
                          </div>
                          <span className={`badge rounded-pill ${badgeClass}`}>{ESTADO_LABELS[estado] || estado}</span>
                        </div>
                        <p className="mb-1"><strong>Cobrado:</strong> {formatCurrency(factura.montoCobrado || 0)}</p>
                        <p className="mb-2"><strong>Saldo:</strong> {formatCurrency(factura.saldoPendiente || 0)}</p>
                        <p className="mb-3"><strong>Observaciones:</strong> {factura.observaciones || '—'}</p>
                        {factura.centroSalud && (
                          <p className="mb-3 text-muted small">
                            Retención acumulada sobre lo cobrado: {formatCurrency(factura.retencionCentroSobreCobrado)}
                          </p>
                        )}

                        <div className="mb-3">
                          <label className="form-label">Estado de Cobranza</label>
                          <select
                            className="form-select"
                            value={estado}
                            onChange={(e) => handleEstadoUpdate(factura._id, e.target.value)}
                          >
                            {ESTADO_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="d-flex flex-wrap gap-2 mb-3">
                          <button className="btn btn-warning btn-sm" type="button" onClick={() => handleEdit(factura)}>
                            Editar
                          </button>
                          <button className="btn btn-danger btn-sm" type="button" onClick={() => handleDelete(factura._id)}>
                            Eliminar
                          </button>
                          <button
                            className="btn btn-success btn-sm"
                            type="button"
                            onClick={() => handleLiquidarSaldo(factura)}
                            disabled={(factura.saldoPendiente || 0) <= 0}
                          >
                            Liquidar saldo
                          </button>
                        </div>

                        <div className="mb-3">
                          <h6 className="text-uppercase text-muted">Pagos</h6>
                          {factura.pagos && factura.pagos.length > 0 ? (
                            <ul className="list-group mb-2">
                              {factura.pagos.map((pago) => (
                                <li className="list-group-item d-flex justify-content-between align-items-start" key={pago._id}>
                                  <div>
                                    <div>{formatCurrency(pago.monto)} • {formatDate(pago.fecha)}</div>
                                    <small className="text-muted">{pago.metodo || 'Método no especificado'} - {pago.nota || 'Sin nota'}</small>
                                  </div>
                                  <button
                                    className="btn btn-outline-danger btn-sm"
                                    type="button"
                                    onClick={() => handleDeletePayment(factura._id, pago._id)}
                                  >
                                    Eliminar
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-muted">Sin pagos registrados.</p>
                          )}
                        </div>

                        <div className="mb-3">
                          <h6 className="text-uppercase text-muted">Registrar pago</h6>
                          <div className="row g-2">
                            <div className="col-12">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="form-control"
                                placeholder="Monto"
                                value={paymentForm.monto}
                                onChange={(e) => handlePaymentFormChange(factura._id, 'monto', e.target.value)}
                              />
                            </div>
                            <div className="col-12">
                              <input
                                type="date"
                                className="form-control"
                                value={paymentForm.fecha}
                                onChange={(e) => handlePaymentFormChange(factura._id, 'fecha', e.target.value)}
                              />
                            </div>
                            <div className="col-12">
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Método"
                                value={paymentForm.metodo}
                                onChange={(e) => handlePaymentFormChange(factura._id, 'metodo', e.target.value)}
                              />
                            </div>
                            <div className="col-12">
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Nota"
                                value={paymentForm.nota}
                                onChange={(e) => handlePaymentFormChange(factura._id, 'nota', e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="d-flex justify-content-end gap-2 mt-2">
                            <button
                              className="btn btn-outline-secondary btn-sm"
                              type="button"
                              onClick={() => resetPaymentForm(factura._id)}
                            >
                              Limpiar
                            </button>
                            <button
                              className="btn btn-primary btn-sm"
                              type="button"
                              onClick={() => handleRegisterPayment(factura._id)}
                            >
                              Registrar pago
                            </button>
                          </div>
                          {paymentErrors[factura._id] && (
                            <div className="alert alert-danger mt-3 mb-0" role="alert">
                              {paymentErrors[factura._id]}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FacturasPage;
