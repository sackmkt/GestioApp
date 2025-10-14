import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ObrasSocialesService from '../services/ObrasSocialesService';
import { useFeedback } from '../context/FeedbackContext.jsx';

const ITEMS_PER_PAGE = 16;

const buildPageNumbers = (totalPages, currentPage) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    pages.push('start-ellipsis');
  }

  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }

  if (end < totalPages - 1) {
    pages.push('end-ellipsis');
  }

  pages.push(totalPages);

  return pages;
};

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
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const formRef = useRef(null);

  const scrollToForm = useCallback(() => {
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const fetchObrasSociales = useCallback(async () => {
    try {
      setListLoading(true);
      const data = await ObrasSocialesService.getObrasSociales();
      setObrasSociales(data);
    } catch (error) {
      console.error('No se pudieron cargar las obras sociales.', error);
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
    scrollToForm();
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

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredObrasSociales = useMemo(() => {
    if (!normalizedSearch) {
      return obrasSociales;
    }

    return obrasSociales.filter((obra) => {
      const nombre = (obra.nombre || '').toLowerCase();
      const cuit = (obra.cuit || '').toString().toLowerCase();
      const telefono = (obra.telefono || '').toLowerCase();
      const email = (obra.email || '').toLowerCase();
      return (
        nombre.includes(normalizedSearch)
        || cuit.includes(normalizedSearch)
        || telefono.includes(normalizedSearch)
        || email.includes(normalizedSearch)
      );
    });
  }, [obrasSociales, normalizedSearch]);

  const hasSearch = Boolean(normalizedSearch);
  const emptyObrasMessage = hasSearch
    ? 'No se encontraron obras sociales que coincidan con la búsqueda.'
    : 'No hay obras sociales registradas.';

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const totalObras = filteredObrasSociales.length;
  const totalPages = Math.max(Math.ceil(totalObras / ITEMS_PER_PAGE), 1);
  const paginatedObrasSociales = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredObrasSociales.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredObrasSociales, currentPage]);

  const pageNumbers = useMemo(
    () => buildPageNumbers(totalPages, currentPage),
    [totalPages, currentPage],
  );

  const showingFrom = totalObras === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const showingTo = totalObras === 0 ? 0 : Math.min(currentPage * ITEMS_PER_PAGE, totalObras);

  const handlePageChange = (page) => {
    if (typeof page === 'number' && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [normalizedSearch, obrasSociales.length]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="gestio-page container">
      <header className="gestio-page__header" aria-labelledby="obras-heading">
        <div className="gestio-page__title-group">
          <h1 id="obras-heading" className="gestio-page__title">
            Obras Sociales
          </h1>
          <p className="gestio-page__description">Gestiona los convenios y datos de contacto de cada financiador.</p>
        </div>
        <div className="gestio-page__meta">
          <div className="gestio-page__meta-item">
            <span className="gestio-page__meta-label">Registradas</span>
            <span className="gestio-page__meta-value">{obrasSociales.length}</span>
          </div>
          <div className="gestio-page__meta-item">
            <span className="gestio-page__meta-label">Coinciden con la búsqueda</span>
            <span className="gestio-page__meta-value text-primary">{filteredObrasSociales.length}</span>
          </div>
        </div>
      </header>

      <section className="gestio-page__filters" aria-label="Búsqueda de obras sociales">
        <div className="gestio-page__filters-search">
          <label htmlFor="obrasSearch" className="form-label fw-semibold">
            Buscar obras sociales
          </label>
          <div className="input-group">
            <span className="input-group-text" id="obrasSearchIcon" aria-hidden="true">
              🔍
            </span>
            <input
              id="obrasSearch"
              type="search"
              className="form-control"
              placeholder="Buscar por nombre o CUIT/CUIL"
              value={searchTerm}
              onChange={handleSearchChange}
              aria-describedby="obrasSearchIcon"
            />
          </div>
        </div>
      </section>

      <div className="card shadow-sm mb-4">
        <div className="card-header bg-info text-white">
          <h2 className="mb-0">Gestión de Obras Sociales</h2>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit} ref={formRef}>
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
          <div className="d-flex flex-column flex-sm-row justify-content-sm-between align-items-sm-center mb-3">
            <span className="text-muted small">
              {totalObras === 0
                ? 'Sin obras sociales para mostrar.'
                : `Mostrando ${showingFrom}-${showingTo} de ${totalObras} obras sociales`}
            </span>
          </div>
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
              ) : filteredObrasSociales.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center text-muted py-4">
                    {emptyObrasMessage}
                  </td>
                </tr>
              ) : (
                paginatedObrasSociales.map((os) => (
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
          {totalObras > ITEMS_PER_PAGE && (
            <nav className="d-flex justify-content-center mt-3" aria-label="Paginación de obras sociales">
              <ul className="pagination mb-0">
                <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                  <button
                    type="button"
                    className="page-link"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Anterior
                  </button>
                </li>
                {pageNumbers.map((page, index) => (
                  <li
                    key={`${page}-${index}`}
                    className={`page-item ${page === currentPage ? 'active' : ''} ${typeof page === 'string' ? 'disabled' : ''}`}
                  >
                    {typeof page === 'string' ? (
                      <span className="page-link">…</span>
                    ) : (
                      <button type="button" className="page-link" onClick={() => handlePageChange(page)}>
                        {page}
                      </button>
                    )}
                  </li>
                ))}
                <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                  <button
                    type="button"
                    className="page-link"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Siguiente
                  </button>
                </li>
              </ul>
            </nav>
          )}
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
          {!listLoading && filteredObrasSociales.length === 0 && (
            <div className="col-12">
              <div className="alert alert-light text-center mb-0">{emptyObrasMessage}</div>
            </div>
          )}
          {!listLoading
            && paginatedObrasSociales.map((os) => (
              <div className="col-12" key={os._id}>
                <div className="card shadow-sm">
                  <div className="card-body">
                    <h5 className="card-title">{os.nombre}</h5>
                    <p className="card-text mb-1"><strong>CUIT/CUIL:</strong> {os.cuit || '—'}</p>
                    <p className="card-text mb-1"><strong>Teléfono:</strong> {os.telefono}</p>
                    <p className="card-text"><strong>Email:</strong> {os.email}</p>
                    <div className="d-flex justify-content-end gap-2 mt-3">
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
        {totalObras > ITEMS_PER_PAGE && (
          <nav className="d-flex justify-content-center mt-3" aria-label="Paginación de obras sociales móvil">
            <ul className="pagination mb-0">
              <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                <button
                  type="button"
                  className="page-link"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Anterior
                </button>
              </li>
              {pageNumbers.map((page, index) => (
                <li
                  key={`${page}-mobile-${index}`}
                  className={`page-item ${page === currentPage ? 'active' : ''} ${typeof page === 'string' ? 'disabled' : ''}`}
                >
                  {typeof page === 'string' ? (
                    <span className="page-link">…</span>
                  ) : (
                    <button type="button" className="page-link" onClick={() => handlePageChange(page)}>
                      {page}
                    </button>
                  )}
                </li>
              ))}
              <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                <button
                  type="button"
                  className="page-link"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                </button>
              </li>
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}

export default ObrasSocialesPage;