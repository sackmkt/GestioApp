import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PacientesService from '../services/PacientesService';
import ObrasSocialesService from '../services/ObrasSocialesService';
import CentrosSaludService from '../services/CentrosSaludService';
import { useFeedback } from '../context/FeedbackContext.jsx';

const EMPTY_FORM = {
  nombre: '',
  apellido: '',
  dni: '',
  email: '',
  telefono: '',
  obraSocial: '',
  tipoAtencion: 'particular',
  centroSalud: '',
};

const ATENCION_LABELS = {
  particular: 'Atención particular',
  centro: 'Derivado por centro de salud',
};

const toBase64 = (file) => new Promise((resolve, reject) => {
  if (!file) {
    resolve(null);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
  reader.readAsDataURL(file);
});

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '—';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function PacientesPage() {
  const { showError, showSuccess, showInfo } = useFeedback();
  const [pacientes, setPacientes] = useState([]);
  const [obrasSociales, setObrasSociales] = useState([]);
  const [centrosSalud, setCentrosSalud] = useState([]);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState(null);
  const [documentForm, setDocumentForm] = useState({ nombre: '', descripcion: '', archivo: null });
  const [documentError, setDocumentError] = useState(null);
  const [documentUploadLoading, setDocumentUploadLoading] = useState(false);
  const [documentDeleteLoadingId, setDocumentDeleteLoadingId] = useState(null);
  const [documentDownloadLoadingId, setDocumentDownloadLoadingId] = useState(null);
  const documentFileInputRef = useRef(null);

  const fetchPacientes = useCallback(async () => {
    try {
      setListLoading(true);
      const data = await PacientesService.getPacientes();
      setPacientes(data);
    } catch (err) {
      showError('No se pudieron cargar los pacientes. Intenta nuevamente.');
    } finally {
      setListLoading(false);
    }
  }, [showError]);

  const fetchObrasSociales = useCallback(async () => {
    try {
      const data = await ObrasSocialesService.getObrasSociales();
      setObrasSociales(data);
    } catch (err) {
      showError('No se pudieron cargar las obras sociales.');
    }
  }, [showError]);

  const fetchCentrosSalud = useCallback(async () => {
    try {
      const data = await CentrosSaludService.getCentros();
      setCentrosSalud(data);
    } catch (err) {
      showError('No se pudieron cargar los centros de salud.');
    }
  }, [showError]);

  useEffect(() => {
    fetchPacientes();
    fetchObrasSociales();
    fetchCentrosSalud();
  }, [fetchCentrosSalud, fetchObrasSociales, fetchPacientes]);

  const resumenPacientes = useMemo(() => {
    const particulares = pacientes.filter((p) => p.tipoAtencion === 'particular').length;
    const porCentro = pacientes.filter((p) => p.tipoAtencion === 'centro').length;
    const conContacto = pacientes.filter((p) => p.email || p.telefono).length;

    const centrosVinculados = pacientes.reduce((acc, paciente) => {
      const centroId = paciente.centroSalud?._id || paciente.centroSalud;
      if (paciente.tipoAtencion === 'centro' && centroId) {
        acc.add(centroId);
      }
      return acc;
    }, new Set());

    return {
      total: pacientes.length,
      particulares,
      porCentro,
      conContacto,
      centrosActivos: centrosVinculados.size,
    };
  }, [pacientes]);

  const pacienteSeleccionado = useMemo(
    () => pacientes.find((paciente) => paciente._id === editingId),
    [pacientes, editingId],
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name === 'tipoAtencion' && value !== 'centro') {
        return { ...prev, tipoAtencion: value, centroSalud: '' };
      }
      return { ...prev, [name]: value };
    });
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
    setError(null);
    setDocumentForm({ nombre: '', descripcion: '', archivo: null });
    setDocumentError(null);
    if (documentFileInputRef.current) {
      documentFileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const payload = {
      nombre: formData.nombre.trim(),
      apellido: formData.apellido.trim(),
      dni: formData.dni.trim(),
      email: formData.email.trim(),
      telefono: formData.telefono.trim(),
      obraSocial: formData.obraSocial,
      tipoAtencion: formData.tipoAtencion,
      centroSalud: formData.tipoAtencion === 'centro' ? formData.centroSalud || null : null,
    };

    if (!payload.obraSocial) {
      delete payload.obraSocial;
    }

    if (!payload.nombre || !payload.apellido || !payload.dni) {
      setError('Nombre, apellido y DNI son obligatorios.');
      return;
    }

    if (payload.tipoAtencion === 'centro' && !payload.centroSalud) {
      setError('Selecciona el centro de salud que deriva al paciente.');
      return;
    }

    try {
      setFormLoading(true);
      if (editingId) {
        await PacientesService.updatePaciente(editingId, payload);
        showSuccess('Paciente actualizado correctamente.');
      } else {
        await PacientesService.createPaciente(payload);
        showSuccess('Paciente agregado correctamente.');
      }
      resetForm();
      await fetchPacientes();
    } catch (err) {
      const message = err.response?.data?.message || err.response?.data?.error || 'No se pudo guardar el paciente.';
      setError(message);
      showError(message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Deseas eliminar este paciente?')) {
      return;
    }
    try {
      setDeleteLoadingId(id);
      await PacientesService.deletePaciente(id);
      if (editingId === id) {
        resetForm();
      }
      await fetchPacientes();
      showInfo('El paciente se eliminó correctamente.');
    } catch (err) {
      const message = err.response?.data?.message || 'No se pudo eliminar el paciente.';
      showError(message);
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const handleEdit = (paciente) => {
    setEditingId(paciente._id);
    setFormData({
      nombre: paciente.nombre,
      apellido: paciente.apellido,
      dni: paciente.dni,
      email: paciente.email || '',
      telefono: paciente.telefono || '',
      obraSocial: paciente.obraSocial?._id || '',
      tipoAtencion: paciente.tipoAtencion || 'particular',
      centroSalud: paciente.centroSalud?._id || '',
    });
    setDocumentForm({ nombre: '', descripcion: '', archivo: null });
    setDocumentError(null);
    if (documentFileInputRef.current) {
      documentFileInputRef.current.value = '';
    }
  };

  const handleCancelEdit = () => {
    resetForm();
  };

  const handleDocumentFieldChange = (field, value) => {
    setDocumentForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleDocumentFileChange = (event) => {
    const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    setDocumentForm((prev) => ({ ...prev, archivo: file }));
  };

  const handleDocumentUpload = async (event) => {
    event.preventDefault();
    setDocumentError(null);

    if (!editingId) {
      setDocumentError('Selecciona un paciente antes de adjuntar documentos.');
      return;
    }

    const nombre = documentForm.nombre.trim();
    if (!nombre) {
      setDocumentError('Asigna un nombre descriptivo al documento.');
      return;
    }

    if (!documentForm.archivo) {
      setDocumentError('Selecciona un archivo para adjuntar.');
      return;
    }

    try {
      setDocumentUploadLoading(true);
      const base64 = await toBase64(documentForm.archivo);
      if (!base64) {
        throw new Error('No se pudo preparar el archivo para subirlo.');
      }

      const payload = {
        nombre,
        descripcion: documentForm.descripcion.trim(),
        archivo: {
          nombre: documentForm.archivo.name,
          tipo: documentForm.archivo.type,
          base64,
        },
      };

      const nuevoDocumento = await PacientesService.uploadDocumento(editingId, payload);
      setPacientes((prev) => prev.map((paciente) => (
        paciente._id === editingId
          ? { ...paciente, documentos: [...(paciente.documentos || []), nuevoDocumento] }
          : paciente
      )));
      setDocumentForm({ nombre: '', descripcion: '', archivo: null });
      if (documentFileInputRef.current) {
        documentFileInputRef.current.value = '';
      }
      showSuccess('Documento adjuntado correctamente.');
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'No se pudo adjuntar el documento.';
      setDocumentError(message);
      showError(message);
    } finally {
      setDocumentUploadLoading(false);
    }
  };

  const handleDocumentDelete = async (documentId) => {
    if (!editingId || !documentId) {
      return;
    }
    if (!window.confirm('¿Deseas eliminar este documento?')) {
      return;
    }
    try {
      setDocumentDeleteLoadingId(documentId);
      await PacientesService.deleteDocumento(editingId, documentId);
      setPacientes((prev) => prev.map((paciente) => (
        paciente._id === editingId
          ? { ...paciente, documentos: (paciente.documentos || []).filter((doc) => doc._id !== documentId) }
          : paciente
      )));
      showInfo('Documento eliminado correctamente.');
    } catch (err) {
      const message = err.response?.data?.error || 'No se pudo eliminar el documento.';
      showError(message);
    } finally {
      setDocumentDeleteLoadingId(null);
    }
  };

  const handleDocumentDownload = async (documentId) => {
    if (!editingId || !documentId) {
      return;
    }
    try {
      setDocumentDownloadLoadingId(documentId);
      const { blob, filename } = await PacientesService.downloadDocumento(editingId, documentId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const message = err.response?.data?.error || 'No se pudo descargar el documento.';
      showError(message);
    } finally {
      setDocumentDownloadLoadingId(null);
    }
  };

  return (
    <div className="container py-4">
      <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between mb-4">
        <div>
          <h2 className="fw-bold mb-1">Pacientes</h2>
          <p className="text-muted mb-0">Centraliza el seguimiento de tus pacientes y sus datos de contacto.</p>
        </div>
        <div className="mt-3 mt-md-0">
          <div className="d-flex gap-3">
            <div className="text-center">
              <span className="text-muted small d-block">Total</span>
              <strong className="fs-5">{resumenPacientes.total}</strong>
            </div>
            <div className="text-center">
              <span className="text-muted small d-block">Particulares</span>
              <strong className="fs-5 text-success">{resumenPacientes.particulares}</strong>
            </div>
            <div className="text-center">
              <span className="text-muted small d-block">Por centros</span>
              <strong className="fs-5 text-primary">{resumenPacientes.porCentro}</strong>
            </div>
            <div className="text-center">
              <span className="text-muted small d-block">Con contacto</span>
              <strong className="fs-5">{resumenPacientes.conContacto}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-header bg-primary text-white">
          {editingId ? 'Editar paciente' : 'Agregar nuevo paciente'}
        </div>
        <div className="card-body">
          {error && <div className="alert alert-danger">{error}</div>}
          <form onSubmit={handleSubmit}>
            <fieldset disabled={formLoading} className="border-0 p-0">
              <div className="row g-3">
              <div className="col-md-6 col-lg-3">
                <input
                  type="text"
                  name="nombre"
                  className="form-control"
                  placeholder="Nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6 col-lg-3">
                <input
                  type="text"
                  name="apellido"
                  className="form-control"
                  placeholder="Apellido"
                  value={formData.apellido}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6 col-lg-3">
                <input
                  type="text"
                  name="dni"
                  className="form-control"
                  placeholder="DNI"
                  value={formData.dni}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6 col-lg-3">
                <select
                  name="obraSocial"
                  className="form-select"
                  value={formData.obraSocial}
                  onChange={handleChange}
                >
                  <option value="">Sin obra social</option>
                  {obrasSociales.map((os) => (
                    <option key={os._id} value={os._id}>
                      {os.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 col-lg-3">
                <input
                  type="email"
                  name="email"
                  className="form-control"
                  placeholder="Correo electrónico"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-6 col-lg-3">
                <input
                  type="tel"
                  name="telefono"
                  className="form-control"
                  placeholder="Teléfono"
                  value={formData.telefono}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-6 col-lg-3">
                <select
                  name="tipoAtencion"
                  className="form-select"
                  value={formData.tipoAtencion}
                  onChange={handleChange}
                >
                  <option value="particular">Atención particular</option>
                  <option value="centro">Atención derivada por centro</option>
                </select>
              </div>
              {formData.tipoAtencion === 'centro' && (
                <div className="col-md-6 col-lg-3">
                  <select
                    name="centroSalud"
                    className="form-select"
                    value={formData.centroSalud}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Selecciona un centro</option>
                    {centrosSalud.map((centro) => (
                      <option key={centro._id} value={centro._id}>
                        {centro.nombre} ({centro.porcentajeRetencion}% ret.)
                      </option>
                    ))}
                  </select>
                </div>
              )}
                <div className="col-12 mt-3 d-flex justify-content-end">
                  {editingId && (
                    <button type="button" className="btn btn-outline-secondary me-2" onClick={handleCancelEdit}>
                      Cancelar
                    </button>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={formLoading}>
                    {formLoading ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        {editingId ? 'Actualizando...' : 'Guardando...'}
                      </>
                    ) : (
                      <>{editingId ? 'Actualizar paciente' : 'Agregar paciente'}</>
                    )}
                  </button>
                </div>
              </div>
            </fieldset>
          </form>
      </div>
    </div>

      {editingId && (
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-light">
            Documentación del paciente
          </div>
          <div className="card-body">
            {documentError && <div className="alert alert-danger">{documentError}</div>}
            <form onSubmit={handleDocumentUpload} className="row g-3 align-items-end">
              <div className="col-lg-4">
                <label htmlFor="documentoNombre" className="form-label">Nombre del documento</label>
                <input
                  type="text"
                  id="documentoNombre"
                  className="form-control"
                  value={documentForm.nombre}
                  onChange={(e) => handleDocumentFieldChange('nombre', e.target.value)}
                  placeholder="Ej: Derivación clínica"
                  required
                />
              </div>
              <div className="col-lg-4">
                <label htmlFor="documentoDescripcion" className="form-label">Descripción (opcional)</label>
                <input
                  type="text"
                  id="documentoDescripcion"
                  className="form-control"
                  value={documentForm.descripcion}
                  onChange={(e) => handleDocumentFieldChange('descripcion', e.target.value)}
                  placeholder="Notas internas"
                />
              </div>
              <div className="col-lg-4">
                <label htmlFor="documentoArchivo" className="form-label">Archivo</label>
                <input
                  type="file"
                  id="documentoArchivo"
                  className="form-control"
                  onChange={handleDocumentFileChange}
                  ref={documentFileInputRef}
                  accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"
                  required
                />
              </div>
              <div className="col-12 text-end">
                <button type="submit" className="btn btn-secondary" disabled={documentUploadLoading}>
                  {documentUploadLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Subiendo...
                    </>
                  ) : (
                    'Adjuntar documento'
                  )}
                </button>
              </div>
            </form>

            <hr className="my-4" />
            <h6 className="text-uppercase text-muted">Archivos adjuntos</h6>
            {pacienteSeleccionado?.documentos?.length ? (
              <ul className="list-group list-group-flush">
                {pacienteSeleccionado.documentos.map((documento) => (
                  <li key={documento._id} className="list-group-item d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                    <div>
                      <strong>{documento.nombre}</strong>
                      <div className="small text-muted">{formatDateTime(documento.createdAt)} · {formatFileSize(documento.size)}</div>
                      {documento.descripcion && (
                        <div className="small text-muted fst-italic">{documento.descripcion}</div>
                      )}
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => handleDocumentDownload(documento._id)}
                        disabled={documentDownloadLoadingId === documento._id}
                      >
                        {documentDownloadLoadingId === documento._id ? (
                          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        ) : (
                          'Descargar'
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => handleDocumentDelete(documento._id)}
                        disabled={documentDeleteLoadingId === documento._id}
                      >
                        {documentDeleteLoadingId === documento._id ? (
                          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        ) : (
                          'Eliminar'
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted mb-0">Aún no hay documentos adjuntos para este paciente.</p>
            )}
          </div>
        </div>
      )}

      <div className="card shadow-sm d-none d-md-block">
        <div className="card-body p-0">
          <table className="table table-striped table-hover mb-0">
            <thead className="table-dark">
              <tr>
                <th>Nombre</th>
                <th>DNI</th>
                <th>Contacto</th>
                <th>Obra Social</th>
                <th>Modalidad</th>
                <th className="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan="6" className="text-center py-4">
                    <div className="d-inline-flex align-items-center gap-2">
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      <span>Cargando pacientes...</span>
                    </div>
                  </td>
                </tr>
              ) : pacientes.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-muted">
                    No hay pacientes cargados todavía.
                  </td>
                </tr>
              ) : (
                pacientes.map((paciente) => (
                  <tr key={paciente._id}>
                  <td>{paciente.nombre} {paciente.apellido}</td>
                  <td>{paciente.dni}</td>
                  <td>
                    <div className="small text-muted">
                      {paciente.email ? <div><strong>Email:</strong> {paciente.email}</div> : <div className="text-muted">Sin email</div>}
                      {paciente.telefono ? <div><strong>Tel.:</strong> {paciente.telefono}</div> : <div className="text-muted">Sin teléfono</div>}
                    </div>
                  </td>
                  <td>{paciente.obraSocial ? paciente.obraSocial.nombre : 'Sin obra social'}</td>
                  <td>
                    <span className={`badge ${paciente.tipoAtencion === 'centro' ? 'bg-primary' : 'bg-success'}`}>
                      {ATENCION_LABELS[paciente.tipoAtencion]}
                    </span>
                    {paciente.tipoAtencion === 'centro' && paciente.centroSalud && (
                      <div className="small text-muted mt-1">
                        {paciente.centroSalud.nombre} · Ret. {paciente.centroSalud.porcentajeRetencion}%
                      </div>
                    )}
                  </td>
                  <td className="text-end">
                    <button
                      className="btn btn-warning btn-sm me-2"
                      onClick={() => handleEdit(paciente)}
                      disabled={formLoading || Boolean(deleteLoadingId)}
                    >
                      Editar
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(paciente._id)}
                      disabled={deleteLoadingId === paciente._id || formLoading}
                    >
                      {deleteLoadingId === paciente._id ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-2"
                            role="status"
                            aria-hidden="true"
                          ></span>
                          Eliminando...
                        </>
                      ) : (
                        'Eliminar'
                      )}
                    </button>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="d-md-none">
        <div className="row g-3">
          {listLoading && (
            <div className="col-12">
              <div className="d-flex justify-content-center align-items-center py-4">
                <span className="spinner-border text-primary" role="status" aria-hidden="true"></span>
                <span className="ms-2">Cargando pacientes...</span>
              </div>
            </div>
          )}
          {!listLoading && pacientes.length === 0 && (
            <div className="col-12">
              <div className="alert alert-light text-center mb-0">Todavía no registraste pacientes.</div>
            </div>
          )}
          {!listLoading &&
            pacientes.map((paciente) => (
              <div className="col-12" key={paciente._id}>
                <div className="card shadow-sm">
                  <div className="card-body">
                    <h5 className="card-title">{paciente.nombre} {paciente.apellido}</h5>
                  <p className="card-text mb-1"><strong>DNI:</strong> {paciente.dni}</p>
                  <p className="card-text mb-1">
                    <strong>Contacto:</strong>{' '}
                    {paciente.email || paciente.telefono
                      ? [paciente.email, paciente.telefono].filter(Boolean).join(' · ')
                      : 'No informado'}
                  </p>
                  <p className="card-text mb-1"><strong>Obra Social:</strong> {paciente.obraSocial ? paciente.obraSocial.nombre : 'Sin obra social'}</p>
                  <p className="card-text">
                    <span className={`badge ${paciente.tipoAtencion === 'centro' ? 'bg-primary' : 'bg-success'}`}>
                      {ATENCION_LABELS[paciente.tipoAtencion]}
                    </span>
                    {paciente.tipoAtencion === 'centro' && paciente.centroSalud && (
                      <span className="d-block mt-1 text-muted">
                        {paciente.centroSalud.nombre} · Ret. {paciente.centroSalud.porcentajeRetencion}%
                      </span>
                    )}
                  </p>
                    <div className="d-flex justify-content-end gap-2 mt-3">
                      <button
                        className="btn btn-warning btn-sm"
                        onClick={() => handleEdit(paciente)}
                        disabled={formLoading || Boolean(deleteLoadingId)}
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(paciente._id)}
                        disabled={deleteLoadingId === paciente._id || formLoading}
                      >
                        {deleteLoadingId === paciente._id ? (
                          <>
                            <span
                              className="spinner-border spinner-border-sm me-2"
                              role="status"
                              aria-hidden="true"
                            ></span>
                            Eliminando...
                          </>
                        ) : (
                          'Eliminar'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default PacientesPage;
