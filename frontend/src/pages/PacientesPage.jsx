import React, { useState, useEffect } from 'react';
import PacientesService from '../services/PacientesService';
import ObrasSocialesService from '../services/ObrasSocialesService';
import CentrosSaludService from '../services/CentrosSaludService';

const initialFormData = {
  nombre: '',
  apellido: '',
  dni: '',
  email: '',
  telefono: '',
  obraSocial: '',
  tipoAtencion: 'particular',
  centroSalud: '',
};

const atencionLabels = {
  particular: 'Atención particular',
  centro: 'Centro de salud',
};

function PacientesPage() {
  const [pacientes, setPacientes] = useState([]);
  const [obrasSociales, setObrasSociales] = useState([]);
  const [centrosSalud, setCentrosSalud] = useState([]);
  const [formData, setFormData] = useState(initialFormData);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPacientes();
    fetchObrasSociales();
    fetchCentrosSalud();
  }, []);

  const fetchPacientes = async () => {
    try {
      const data = await PacientesService.getPacientes();
      setPacientes(data);
    } catch (fetchError) {
      console.error('Error al obtener pacientes:', fetchError);
      setError('No pudimos cargar la lista de pacientes. Intenta nuevamente.');
    }
  };

  const fetchObrasSociales = async () => {
    try {
      const data = await ObrasSocialesService.getObrasSociales();
      setObrasSociales(data);
    } catch (fetchError) {
      console.error('Error al obtener obras sociales:', fetchError);
    }
  };

  const fetchCentrosSalud = async () => {
    try {
      const data = await CentrosSaludService.list();
      setCentrosSalud(data);
    } catch (fetchError) {
      console.error('Error al obtener centros de salud:', fetchError);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTipoAtencionChange = (event) => {
    const { value } = event.target;
    setFormData((prev) => ({
      ...prev,
      tipoAtencion: value,
      centroSalud: value === 'centro' ? prev.centroSalud : '',
    }));
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    const payload = {
      nombre: formData.nombre.trim(),
      apellido: formData.apellido.trim(),
      dni: formData.dni.trim(),
      email: formData.email.trim(),
      telefono: formData.telefono.trim(),
      obraSocial: formData.obraSocial || null,
      tipoAtencion: formData.tipoAtencion,
      centroSalud: formData.tipoAtencion === 'centro' ? formData.centroSalud : null,
    };

    if (!payload.nombre || !payload.apellido || !payload.dni) {
      setError('Completá nombre, apellido y DNI para continuar.');
      return;
    }

    if (payload.tipoAtencion === 'centro' && !payload.centroSalud) {
      setError('Seleccioná el centro de salud correspondiente para este paciente.');
      return;
    }

    try {
      if (editingId) {
        await PacientesService.updatePaciente(editingId, payload);
      } else {
        await PacientesService.createPaciente(payload);
      }
      resetForm();
      fetchPacientes();
    } catch (submitError) {
      console.error('Error al guardar paciente:', submitError);
      const message = submitError.response?.data?.error
        || 'Ocurrió un error al guardar el paciente.';
      setError(message);
    }
  };

  const handleEdit = (paciente) => {
    setEditingId(paciente._id);
    setFormData({
      nombre: paciente.nombre || '',
      apellido: paciente.apellido || '',
      dni: paciente.dni || '',
      email: paciente.email || '',
      telefono: paciente.telefono || '',
      obraSocial: paciente.obraSocial?._id || '',
      tipoAtencion: paciente.tipoAtencion || 'particular',
      centroSalud: paciente.centroSalud?._id || '',
    });
    setError(null);
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm('¿Estás seguro de eliminar este paciente?');
    if (!confirmed) {
      return;
    }
    try {
      await PacientesService.deletePaciente(id);
      fetchPacientes();
      if (editingId === id) {
        resetForm();
      }
    } catch (deleteError) {
      console.error('Error al eliminar paciente:', deleteError);
      setError('No fue posible eliminar el paciente.');
    }
  };

  const pacientesTotales = pacientes.length;
  const pacientesPorModalidad = pacientes.reduce((acc, paciente) => {
    const tipo = paciente.tipoAtencion || 'particular';
    acc[tipo] = (acc[tipo] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="container mt-4">
      <div className="row g-4">
        <div className="col-12 col-lg-4">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-primary text-white">
              <h2 className="h5 mb-0">{editingId ? 'Editar paciente' : 'Nuevo paciente'}</h2>
            </div>
            <div className="card-body">
              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="needs-validation" noValidate>
                <div className="row g-3">
                  <div className="col-sm-6">
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
                  <div className="col-sm-6">
                    <label className="form-label" htmlFor="apellido">Apellido</label>
                    <input
                      type="text"
                      id="apellido"
                      name="apellido"
                      className="form-control"
                      value={formData.apellido}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label" htmlFor="dni">DNI</label>
                    <input
                      type="text"
                      id="dni"
                      name="dni"
                      className="form-control"
                      value={formData.dni}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label" htmlFor="telefono">Teléfono</label>
                    <input
                      type="tel"
                      id="telefono"
                      name="telefono"
                      className="form-control"
                      value={formData.telefono}
                      onChange={handleChange}
                      placeholder="Ej: +54 9 11 1234 5678"
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label" htmlFor="email">Correo electrónico</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      className="form-control"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="profesional@correo.com"
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Modalidad de atención</label>
                    <div className="d-flex gap-3">
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="radio"
                          name="tipoAtencion"
                          id="atencionParticular"
                          value="particular"
                          checked={formData.tipoAtencion === 'particular'}
                          onChange={handleTipoAtencionChange}
                        />
                        <label className="form-check-label" htmlFor="atencionParticular">
                          Particular (el profesional factura directo al paciente)
                        </label>
                      </div>
                    </div>
                    <div className="form-check mt-2">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="tipoAtencion"
                        id="atencionCentro"
                        value="centro"
                        checked={formData.tipoAtencion === 'centro'}
                        onChange={handleTipoAtencionChange}
                      />
                      <label className="form-check-label" htmlFor="atencionCentro">
                        Centro de salud (el profesional presta servicios mediante un centro)
                      </label>
                    </div>
                  </div>
                  {formData.tipoAtencion === 'centro' && (
                    <div className="col-12">
                      <label className="form-label" htmlFor="centroSalud">Centro de salud</label>
                      <select
                        id="centroSalud"
                        name="centroSalud"
                        className="form-select"
                        value={formData.centroSalud}
                        onChange={handleChange}
                        required
                      >
                        <option value="">Seleccioná un centro</option>
                        {centrosSalud.map((centro) => (
                          <option key={centro._id} value={centro._id}>
                            {centro.nombre} ({centro.retencionPorcentaje}%)
                          </option>
                        ))}
                      </select>
                      {centrosSalud.length === 0 && (
                        <div className="form-text text-danger">
                          Primero cargá tus centros de salud en la sección correspondiente.
                        </div>
                      )}
                    </div>
                  )}
                  <div className="col-12">
                    <label className="form-label" htmlFor="obraSocial">Obra social</label>
                    <select
                      id="obraSocial"
                      name="obraSocial"
                      className="form-select"
                      value={formData.obraSocial}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Seleccioná una obra social</option>
                      {obrasSociales.map((os) => (
                        <option key={os._id} value={os._id}>
                          {os.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="d-flex justify-content-between mt-4">
                  {editingId ? (
                    <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>
                      Cancelar
                    </button>
                  ) : <span />}
                  <button type="submit" className="btn btn-primary">
                    {editingId ? 'Actualizar paciente' : 'Agregar paciente'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="card shadow-sm mt-4">
            <div className="card-body">
              <h3 className="h6 text-uppercase text-muted mb-3">Resumen rápido</h3>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span>Total de pacientes</span>
                <span className="fw-bold">{pacientesTotales}</span>
              </div>
              <div className="d-flex justify-content-between align-items-center small text-muted">
                <span>Particulares</span>
                <span>{pacientesPorModalidad.particular || 0}</span>
              </div>
              <div className="d-flex justify-content-between align-items-center small text-muted">
                <span>Por centro de salud</span>
                <span>{pacientesPorModalidad.centro || 0}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-8">
          <div className="card shadow-sm d-none d-md-block">
            <div className="card-header bg-white border-0">
              <h2 className="h5 mb-0">Pacientes registrados</h2>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-striped table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Paciente</th>
                      <th>Contacto</th>
                      <th>Modalidad</th>
                      <th>Obra Social</th>
                      <th className="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pacientes.length === 0 && (
                      <tr>
                        <td colSpan="5" className="text-center py-4 text-muted">Aún no registraste pacientes.</td>
                      </tr>
                    )}
                    {pacientes.map((paciente) => (
                      <tr key={paciente._id}>
                        <td>
                          <div className="fw-semibold">{paciente.nombre} {paciente.apellido}</div>
                          <div className="text-muted small">DNI: {paciente.dni}</div>
                        </td>
                        <td>
                          <div>{paciente.email || 'Sin correo'}</div>
                          <div className="text-muted small">{paciente.telefono || 'Sin teléfono'}</div>
                        </td>
                        <td>
                          <div>{atencionLabels[paciente.tipoAtencion || 'particular']}</div>
                          {paciente.tipoAtencion === 'centro' && (
                            <span className="badge bg-light text-dark border mt-1">
                              {paciente.centroSalud?.nombre || 'Sin centro asignado'}
                            </span>
                          )}
                        </td>
                        <td>{paciente.obraSocial ? paciente.obraSocial.nombre : 'Sin obra social'}</td>
                        <td className="text-end">
                          <div className="btn-group btn-group-sm" role="group">
                            <button
                              className="btn btn-outline-primary"
                              onClick={() => handleEdit(paciente)}
                            >
                              Editar
                            </button>
                            <button
                              className="btn btn-outline-danger"
                              onClick={() => handleDelete(paciente._id)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="d-md-none">
            <div className="row g-3">
              {pacientes.map((paciente) => (
                <div className="col-12" key={paciente._id}>
                  <div className="card shadow-sm">
                    <div className="card-body">
                      <h5 className="card-title">{paciente.nombre} {paciente.apellido}</h5>
                      <p className="mb-1"><strong>DNI:</strong> {paciente.dni}</p>
                      <p className="mb-1"><strong>Correo:</strong> {paciente.email || '—'}</p>
                      <p className="mb-1"><strong>Teléfono:</strong> {paciente.telefono || '—'}</p>
                      <p className="mb-1"><strong>Modalidad:</strong> {atencionLabels[paciente.tipoAtencion || 'particular']}</p>
                      {paciente.tipoAtencion === 'centro' && (
                        <p className="mb-1"><strong>Centro:</strong> {paciente.centroSalud?.nombre || 'Sin asignar'}</p>
                      )}
                      <p className="mb-2"><strong>Obra Social:</strong> {paciente.obraSocial ? paciente.obraSocial.nombre : 'Sin obra social'}</p>
                      <div className="d-flex justify-content-end gap-2">
                        <button className="btn btn-outline-primary btn-sm" onClick={() => handleEdit(paciente)}>
                          Editar
                        </button>
                        <button className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(paciente._id)}>
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PacientesPage;
