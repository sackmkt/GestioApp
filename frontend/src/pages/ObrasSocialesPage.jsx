import React, { useState, useEffect } from 'react';
import ObrasSocialesService from '../services/ObrasSocialesService';

function ObrasSocialesPage() {
  const [obrasSociales, setObrasSociales] = useState([]);
  const [formData, setFormData] = useState({
    nombre: '',
    telefono: '',
    email: '',
    cuitCuil: '',
  });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchObrasSociales();
  }, []);

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
      await ObrasSocialesService.updateObraSocial(editingId, formData);
      setEditingId(null);
    } else {
      await ObrasSocialesService.createObraSocial(formData);
    }
    setFormData({ nombre: '', telefono: '', email: '', cuitCuil: '' });
    fetchObrasSociales();
  };

  const handleDelete = async (id) => {
    await ObrasSocialesService.deleteObraSocial(id);
    fetchObrasSociales();
  };

  const handleEdit = (os) => {
    setEditingId(os._id);
    setFormData({
      nombre: os.nombre,
      telefono: os.telefono,
      email: os.email,
      cuitCuil: os.cuitCuil || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({
      nombre: '',
      telefono: '',
      email: '',
      cuitCuil: '',
    });
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-info text-white">
          <h2 className="mb-0">Gestión de Obras Sociales</h2>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              <div className="col-md-3">
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
              <div className="col-md-3">
                <input
                  type="text"
                  name="telefono"
                  className="form-control"
                  placeholder="Teléfono"
                  value={formData.telefono}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-3">
                <input
                  type="email"
                  name="email"
                  className="form-control"
                  placeholder="Email"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-3">
                <input
                  type="text"
                  name="cuitCuil"
                  className="form-control"
                  placeholder="CUIT / CUIL"
                  value={formData.cuitCuil}
                  onChange={handleChange}
                />
              </div>
              <div className="col-12 mt-3 d-flex justify-content-end">
                {editingId && (
                  <button type="button" className="btn btn-secondary me-2" onClick={handleCancelEdit}>
                    Cancelar
                  </button>
                )}
                <button type="submit" className="btn btn-info text-white">
                  {editingId ? 'Actualizar Obra Social' : 'Agregar Obra Social'}
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
                <th>Teléfono</th>
                <th>Email</th>
                <th>CUIT / CUIL</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {obrasSociales.map((os) => (
                <tr key={os._id}>
                  <td>{os.nombre}</td>
                  <td>{os.telefono}</td>
                  <td>{os.email}</td>
                  <td>{os.cuitCuil || '-'}</td>
                  <td>
                    <button
                      className="btn btn-warning btn-sm me-2"
                      onClick={() => handleEdit(os)}
                    >
                      Editar
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(os._id)}
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
          {obrasSociales.map((os) => (
            <div className="col-12" key={os._id}>
              <div className="card shadow-sm">
                <div className="card-body">
                  <h5 className="card-title">{os.nombre}</h5>
                  <p className="card-text mb-1"><strong>Teléfono:</strong> {os.telefono}</p>
                  <p className="card-text mb-1"><strong>Email:</strong> {os.email}</p>
                  <p className="card-text"><strong>CUIT / CUIL:</strong> {os.cuitCuil || '-'}</p>
                  <div className="d-flex justify-content-between mt-3">
                    <button
                      className="btn btn-warning btn-sm me-2"
                      onClick={() => handleEdit(os)}
                    >
                      Editar
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(os._id)}
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

export default ObrasSocialesPage;