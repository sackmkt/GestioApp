import React, { useCallback, useEffect, useState } from 'react';
import ObrasSocialesService from '../services/ObrasSocialesService';
import { useFeedback } from '../context/FeedbackContext.jsx';

function ObrasSocialesPage() {
  const { showError, showSuccess, showInfo } = useFeedback();
  const [obrasSociales, setObrasSociales] = useState([]);
  const [formData, setFormData] = useState({
    nombre: '',
    telefono: '',
    email: '',
    cuit: '',
  });
  const [editingId, setEditingId] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState(null);

  const fetchObrasSociales = useCallback(async () => {
    try {
      setListLoading(true);
      const data = await ObrasSocialesService.getObrasSociales();
      setObrasSociales(data);
    } catch (error) {
      showError('No se pudieron cargar las obras sociales.');
    } finally {
      setListLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchObrasSociales();
  }, [fetchObrasSociales]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setFormLoading(true);
      if (editingId) {
        await ObrasSocialesService.updateObraSocial(editingId, formData);
        showSuccess('Obra social actualizada correctamente.');
        setEditingId(null);
      } else {
        await ObrasSocialesService.createObraSocial(formData);
        showSuccess('Obra social creada correctamente.');
      }
      setFormData({ nombre: '', telefono: '', email: '', cuit: '' });
      await fetchObrasSociales();
    } catch (error) {
      const message = error.response?.data?.message || 'No se pudo guardar la obra social. Intenta nuevamente.';
      showError(message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Deseas eliminar esta obra social?')) {
      return;
    }
    try {
      setDeleteLoadingId(id);
      await ObrasSocialesService.deleteObraSocial(id);
      await fetchObrasSociales();
      showInfo('La obra social se eliminó correctamente.');
      if (editingId === id) {
        handleCancelEdit();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'No se pudo eliminar la obra social.';
      showError(message);
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const handleEdit = (os) => {
    setEditingId(os._id);
    setFormData({
      nombre: os.nombre,
      telefono: os.telefono,
      email: os.email,
      cuit: os.cuit || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({
      nombre: '',
      telefono: '',
      email: '',
      cuit: '',
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
            <fieldset disabled={formLoading} className="border-0 p-0">
              <div className="row g-3">
              <div className="col-md-4">
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
              <div className="col-md-4">
                <input
                  type="text"
                  name="cuit"
                  className="form-control"
                  placeholder="CUIT/CUIL"
                  value={formData.cuit}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-4">
                <input
                  type="text"
                  name="telefono"
                  className="form-control"
                  placeholder="Teléfono"
                  value={formData.telefono}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-4">
                <input
                  type="email"
                  name="email"
                  className="form-control"
                  placeholder="Email"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
                <div className="col-12 mt-3 d-flex justify-content-end">
                  {editingId && (
                    <button type="button" className="btn btn-secondary me-2" onClick={handleCancelEdit}>
                      Cancelar
                    </button>
                  )}
                  <button type="submit" className="btn btn-info text-white" disabled={formLoading}>
                    {formLoading ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        {editingId ? 'Actualizando...' : 'Agregando...'}
                      </>
                    ) : (
                      <>{editingId ? 'Actualizar Obra Social' : 'Agregar Obra Social'}</>
                    )}
                  </button>
                </div>
              </div>
            </fieldset>
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
                <th>CUIT/CUIL</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan="5" className="text-center py-4">
                    <div className="d-inline-flex align-items-center gap-2">
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      <span>Cargando obras sociales...</span>
                    </div>
                  </td>
                </tr>
              ) : obrasSociales.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center text-muted py-4">
                    No hay obras sociales registradas.
                  </td>
                </tr>
              ) : (
                obrasSociales.map((os) => (
                  <tr key={os._id}>
                    <td>{os.nombre}</td>
                    <td>{os.cuit || '—'}</td>
                    <td>{os.telefono}</td>
                    <td>{os.email}</td>
                    <td>
                      <button
                        className="btn btn-warning btn-sm me-2"
                        onClick={() => handleEdit(os)}
                        disabled={formLoading || Boolean(deleteLoadingId)}
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(os._id)}
                        disabled={deleteLoadingId === os._id || formLoading}
                      >
                        {deleteLoadingId === os._id ? (
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

      {/* Cards para dispositivos pequeños (móvil) */}
      <div className="d-md-none">
        <div className="row g-3">
          {listLoading && (
            <div className="col-12">
              <div className="d-flex justify-content-center align-items-center py-4">
                <span className="spinner-border text-info" role="status" aria-hidden="true"></span>
                <span className="ms-2">Cargando obras sociales...</span>
              </div>
            </div>
          )}
          {!listLoading && obrasSociales.length === 0 && (
            <div className="col-12">
              <div className="alert alert-light text-center mb-0">Todavía no registraste obras sociales.</div>
            </div>
          )}
          {!listLoading &&
            obrasSociales.map((os) => (
            <div className="col-12" key={os._id}>
              <div className="card shadow-sm">
                <div className="card-body">
                  <h5 className="card-title">{os.nombre}</h5>
                  <p className="card-text mb-1"><strong>CUIT/CUIL:</strong> {os.cuit || '—'}</p>
                  <p className="card-text mb-1"><strong>Teléfono:</strong> {os.telefono}</p>
                  <p className="card-text"><strong>Email:</strong> {os.email}</p>
                  <div className="d-flex justify-content-between mt-3">
                    <button
                      className="btn btn-warning btn-sm me-2"
                      onClick={() => handleEdit(os)}
                      disabled={formLoading || Boolean(deleteLoadingId)}
                    >
                      Editar
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(os._id)}
                      disabled={deleteLoadingId === os._id || formLoading}
                    >
                      {deleteLoadingId === os._id ? (
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

export default ObrasSocialesPage;