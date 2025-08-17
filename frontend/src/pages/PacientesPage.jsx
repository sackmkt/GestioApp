import React, { useState, useEffect } from 'react';
import PacientesService from '../services/PacientesService';
import ObrasSocialesService from '../services/ObrasSocialesService';

function PacientesPage() {
  const [pacientes, setPacientes] = useState([]);
  const [obrasSociales, setObrasSociales] = useState([]);
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    obraSocial: '',
  });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchPacientes();
    fetchObrasSociales();
  }, []);

  const fetchPacientes = async () => {
    const data = await PacientesService.getPacientes();
    setPacientes(data);
  };

  const fetchObrasSociales = async () => {
    const data = await ObrasSocialesService.getObrasSociales();
    setObrasSociales(data);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await PacientesService.updatePaciente(editingId, formData);
      setEditingId(null);
    } else {
      await PacientesService.createPaciente(formData);
    }
    setFormData({
      nombre: '',
      apellido: '',
      dni: '',
      obraSocial: '',
    });
    fetchPacientes();
  };

  const handleDelete = async (id) => {
    await PacientesService.deletePaciente(id);
    fetchPacientes();
  };

  const handleEdit = (paciente) => {
    setEditingId(paciente._id);
    setFormData({
      nombre: paciente.nombre,
      apellido: paciente.apellido,
      dni: paciente.dni,
      obraSocial: paciente.obraSocial?._id || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({
      nombre: '',
      apellido: '',
      dni: '',
      obraSocial: '',
    });
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-primary text-white">
          <h2 className="mb-0">Gestión de Pacientes</h2>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
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
                  required
                >
                  <option value="">Seleccione Obra Social</option>
                  {obrasSociales.map((os) => (
                    <option key={os._id} value={os._id}>
                      {os.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 mt-3 d-flex justify-content-end">
                {editingId && (
                  <button type="button" className="btn btn-secondary me-2" onClick={handleCancelEdit}>
                    Cancelar
                  </button>
                )}
                <button type="submit" className="btn btn-primary">
                  {editingId ? 'Actualizar Paciente' : 'Agregar Paciente'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Tabla para dispositivos grandes (desktop) */}
      <div className="card shadow-sm d-none d-md-block">
        <div className="card-body">
          <table className="table table-striped table-hover mb-0">
            <thead className="table-dark">
              <tr>
                <th>Nombre</th>
                <th>Apellido</th>
                <th>DNI</th>
                <th>Obra Social</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pacientes.map((paciente) => (
                <tr key={paciente._id}>
                  <td>{paciente.nombre}</td>
                  <td>{paciente.apellido}</td>
                  <td>{paciente.dni}</td>
                  <td>
                    {paciente.obraSocial ? paciente.obraSocial.nombre : 'Sin Obra Social'}
                  </td>
                  <td>
                    <button
                      className="btn btn-warning btn-sm me-2"
                      onClick={() => handleEdit(paciente)}
                    >
                      Editar
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(paciente._id)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards para dispositivos pequeños (móvil) */}
      <div className="d-md-none">
        <div className="row g-3">
          {pacientes.map((paciente) => (
            <div className="col-12" key={paciente._id}>
              <div className="card shadow-sm">
                <div className="card-body">
                  <h5 className="card-title">{paciente.nombre} {paciente.apellido}</h5>
                  <p className="card-text mb-1"><strong>DNI:</strong> {paciente.dni}</p>
                  <p className="card-text"><strong>Obra Social:</strong> {paciente.obraSocial ? paciente.obraSocial.nombre : 'Sin Obra Social'}</p>
                  <div className="d-flex justify-content-between mt-3">
                    <button
                      className="btn btn-warning btn-sm me-2"
                      onClick={() => handleEdit(paciente)}
                    >
                      Editar
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(paciente._id)}
                    >
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
  );
}

export default PacientesPage;