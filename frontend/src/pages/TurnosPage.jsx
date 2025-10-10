import React, { useCallback, useEffect, useMemo, useState } from 'react';
import turnosService from '../services/TurnosService';
import PacientesService from '../services/PacientesService';
import { useFeedback } from '../context/FeedbackContext.jsx';
import AgendaGantt from '../components/AgendaGantt.jsx';

const formatoFechaLocal = (fechaISO) => {
  if (!fechaISO) return '';
  return new Date(fechaISO).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

const formatearFechaParaInput = (fechaISO) => {
  if (!fechaISO) return '';
  const fecha = new Date(fechaISO);
  const offset = fecha.getTimezoneOffset();
  const local = new Date(fecha.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

const calcularRango = (rango) => {
  const ahora = new Date();
  const inicio = new Date(ahora);
  const fin = new Date(ahora);

  if (rango === 'hoy') {
    inicio.setHours(0, 0, 0, 0);
    fin.setHours(23, 59, 59, 999);
    return {
      desde: inicio.toISOString(),
      hasta: fin.toISOString(),
    };
  }

  if (rango === 'semana') {
    inicio.setHours(0, 0, 0, 0);
    fin.setDate(fin.getDate() + 7);
    return {
      desde: inicio.toISOString(),
      hasta: fin.toISOString(),
    };
  }

  return {};
};

const estadoBadgeClass = {
  programado: 'bg-primary',
  completado: 'bg-success',
  cancelado: 'bg-secondary',
};

const estadoLabel = {
  programado: 'Programado',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

const obtenerFechaLocalISO = (date = new Date()) => {
  const local = new Date(date);
  local.setHours(0, 0, 0, 0);
  const year = local.getFullYear();
  const month = (local.getMonth() + 1).toString().padStart(2, '0');
  const day = local.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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

const TurnosPage = () => {
  const { showError, showSuccess, showInfo } = useFeedback();
  const [turnos, setTurnos] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    paciente: '',
    titulo: '',
    fecha: '',
    duracionMinutos: 30,
    estado: 'programado',
    notas: '',
    recordatorioHorasAntes: 24,
  });
  const [filtros, setFiltros] = useState({ estado: 'programado', rango: 'semana' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [recordatorioUpdatingId, setRecordatorioUpdatingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [agendaViewMode, setAgendaViewMode] = useState('day');
  const [agendaDate, setAgendaDate] = useState(obtenerFechaLocalISO());
  const [currentPage, setCurrentPage] = useState(1);
  const [futurePage, setFuturePage] = useState(1);

  useEffect(() => {
    const obtenerDatos = async () => {
      try {
        const listaPacientes = await PacientesService.getPacientes();
        setPacientes(listaPacientes);
      } catch (error) {
        showError('No se pudieron cargar los pacientes para agendar turnos.');
      }
    };
    obtenerDatos();
  }, [showError]);

  const loadTurnos = useCallback(async () => {
    try {
      setLoading(true);
      const rango = calcularRango(filtros.rango);
      const parametros = { ...rango };
      if (filtros.estado !== 'todos') {
        parametros.estado = filtros.estado;
      }
      const data = await turnosService.getTurnos(parametros);
      setTurnos(data);
    } catch (error) {
      showError('No se pudieron obtener los turnos. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  }, [filtros.estado, filtros.rango, showError]);

  useEffect(() => {
    loadTurnos();
  }, [loadTurnos]);

  const proximosTurnos = useMemo(() => {
    const ahora = new Date().getTime();
    return turnos.filter((turno) => new Date(turno.fecha).getTime() >= ahora);
  }, [turnos]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredTurnos = useMemo(() => {
    if (!normalizedSearch) {
      return turnos;
    }

    return turnos.filter((turno) => {
      const pacienteNombre = `${turno.paciente?.nombre || ''} ${turno.paciente?.apellido || ''}`.toLowerCase();
      const titulo = (turno.titulo || '').toLowerCase();
      const notas = (turno.notas || '').toLowerCase();
      return (
        pacienteNombre.includes(normalizedSearch)
        || titulo.includes(normalizedSearch)
        || notas.includes(normalizedSearch)
      );
    });
  }, [turnos, normalizedSearch]);

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const hasSearch = normalizedSearch.length > 0;
  const emptyMessage = hasSearch
    ? 'No se encontraron turnos que coincidan con la búsqueda.'
    : 'No hay turnos para los filtros seleccionados.';

  const totalTurnos = filteredTurnos.length;
  const totalPages = Math.max(Math.ceil(totalTurnos / ITEMS_PER_PAGE), 1);
  const paginatedTurnos = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTurnos.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredTurnos, currentPage]);

  const pageNumbers = useMemo(
    () => buildPageNumbers(totalPages, currentPage),
    [totalPages, currentPage],
  );

  const showingFrom = totalTurnos === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const showingTo = totalTurnos === 0 ? 0 : Math.min(currentPage * ITEMS_PER_PAGE, totalTurnos);

  const totalFutureTurnos = proximosTurnos.length;
  const totalFuturePages = Math.max(Math.ceil(totalFutureTurnos / ITEMS_PER_PAGE), 1);
  const paginatedProximosTurnos = useMemo(() => {
    const startIndex = (futurePage - 1) * ITEMS_PER_PAGE;
    return proximosTurnos.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [proximosTurnos, futurePage]);

  const futurePageNumbers = useMemo(
    () => buildPageNumbers(totalFuturePages, futurePage),
    [totalFuturePages, futurePage],
  );

  const futureShowingFrom = totalFutureTurnos === 0 ? 0 : (futurePage - 1) * ITEMS_PER_PAGE + 1;
  const futureShowingTo = totalFutureTurnos === 0 ? 0 : Math.min(futurePage * ITEMS_PER_PAGE, totalFutureTurnos);

  const handlePageChange = (page) => {
    if (typeof page === 'number' && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleFuturePageChange = (page) => {
    if (typeof page === 'number' && page >= 1 && page <= totalFuturePages) {
      setFuturePage(page);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [normalizedSearch, filtros.estado, filtros.rango, turnos.length]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setFuturePage(1);
  }, [totalFutureTurnos]);

  useEffect(() => {
    if (futurePage > totalFuturePages) {
      setFuturePage(totalFuturePages);
    }
  }, [futurePage, totalFuturePages]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setFormData({
      paciente: '',
      titulo: '',
      fecha: '',
      duracionMinutos: 30,
      estado: 'programado',
      notas: '',
      recordatorioHorasAntes: 24,
    });
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.paciente || !formData.fecha) {
      showError('Selecciona un paciente y una fecha para guardar el turno.');
      return;
    }

    const payload = {
      paciente: formData.paciente,
      titulo: formData.titulo,
      fecha: formData.fecha ? new Date(formData.fecha).toISOString() : null,
      duracionMinutos: Number(formData.duracionMinutos) || 30,
      estado: formData.estado,
      notas: formData.notas,
      recordatorioHorasAntes:
        formData.recordatorioHorasAntes === ''
          ? null
          : Number(formData.recordatorioHorasAntes),
    };

    try {
      setSaving(true);
      if (editingId) {
        await turnosService.updateTurno(editingId, payload);
        showSuccess('Turno actualizado correctamente.');
      } else {
        await turnosService.createTurno(payload);
        showSuccess('Turno creado correctamente.');
      }
      resetForm();
      await loadTurnos();
    } catch (error) {
      const message = error.response?.data?.message || 'No se pudo guardar el turno. Intenta nuevamente.';
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (turno) => {
    setEditingId(turno._id);
    setFormData({
      paciente: turno.paciente?._id || '',
      titulo: turno.titulo || '',
      fecha: formatearFechaParaInput(turno.fecha),
      duracionMinutos: turno.duracionMinutos || 30,
      estado: turno.estado || 'programado',
      notas: turno.notas || '',
      recordatorioHorasAntes:
        turno.recordatorioHorasAntes === undefined || turno.recordatorioHorasAntes === null
          ? ''
          : turno.recordatorioHorasAntes,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Deseas eliminar este turno? Esta acción no se puede deshacer.')) {
      return;
    }
    try {
      setDeletingId(id);
      await turnosService.deleteTurno(id);
      setTurnos((prev) => prev.filter((turno) => turno._id !== id));
      if (editingId === id) {
        resetForm();
      }
      showInfo('El turno se eliminó correctamente.');
    } catch (error) {
      const message = error.response?.data?.message || 'No se pudo eliminar el turno. Intenta nuevamente.';
      showError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const toggleRecordatorio = async (turno) => {
    try {
      setRecordatorioUpdatingId(turno._id);
      const actualizado = await turnosService.updateRecordatorio(turno._id, !turno.recordatorioEnviado);
      setTurnos((prev) => prev.map((item) => (item._id === actualizado._id ? actualizado : item)));
      if (actualizado.recordatorioEnviado) {
        showSuccess('El recordatorio se marcó como enviado.');
      } else {
        showInfo('El recordatorio volverá a estar pendiente.');
      }
    } catch (error) {
      showError('No se pudo actualizar el estado del recordatorio.');
    } finally {
      setRecordatorioUpdatingId(null);
    }
  };

  const handleFiltroChange = (event) => {
    const { name, value } = event.target;
    setFiltros((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAgendaDateChange = (event) => {
    setAgendaDate(event.target.value);
  };

  const handleAgendaToday = () => {
    setAgendaDate(obtenerFechaLocalISO());
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-primary text-white d-flex flex-column flex-xl-row align-items-xl-center justify-content-xl-between gap-3">
          <h2 className="mb-0">Agenda de turnos</h2>
          <div className="d-flex flex-column flex-lg-row align-items-lg-center gap-2">
            <div className="d-flex gap-2">
              <select
                name="estado"
                className="form-select"
                value={filtros.estado}
                onChange={handleFiltroChange}
                disabled={loading}
              >
                <option value="todos">Todos los estados</option>
                <option value="programado">Programados</option>
                <option value="completado">Completados</option>
                <option value="cancelado">Cancelados</option>
              </select>
              <select
                name="rango"
                className="form-select"
                value={filtros.rango}
                onChange={handleFiltroChange}
                disabled={loading}
              >
                <option value="todos">Todo el historial</option>
                <option value="hoy">Solo hoy</option>
                <option value="semana">Próximos 7 días</option>
              </select>
            </div>
            <div className="input-group input-group-sm" style={{ maxWidth: '260px' }}>
              <span className="input-group-text" id="turnosSearchIcon" aria-hidden="true">🔍</span>
              <input
                id="turnosSearch"
                type="search"
                className="form-control"
                placeholder="Buscar por paciente o título"
                value={searchTerm}
                onChange={handleSearchChange}
                aria-describedby="turnosSearchIcon"
              />
            </div>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <fieldset disabled={saving} className="border-0 p-0">
              <div className="row g-3">
              <div className="col-md-6 col-lg-4">
                <label className="form-label">Paciente</label>
                <select
                  name="paciente"
                  className="form-select"
                  value={formData.paciente}
                  onChange={handleChange}
                  required
                >
                  <option value="">Seleccione un paciente</option>
                  {pacientes.map((paciente) => (
                    <option key={paciente._id} value={paciente._id}>
                      {paciente.nombre} {paciente.apellido}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 col-lg-4">
                <label className="form-label">Fecha y hora</label>
                <input
                  type="datetime-local"
                  name="fecha"
                  className="form-control"
                  value={formData.fecha}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6 col-lg-2">
                <label className="form-label">Duración (min)</label>
                <input
                  type="number"
                  min="5"
                  name="duracionMinutos"
                  className="form-control"
                  value={formData.duracionMinutos}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-6 col-lg-2">
                <label className="form-label">Estado</label>
                <select
                  name="estado"
                  className="form-select"
                  value={formData.estado}
                  onChange={handleChange}
                >
                  <option value="programado">Programado</option>
                  <option value="completado">Completado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div className="col-md-6 col-lg-4">
                <label className="form-label">Título del turno</label>
                <input
                  type="text"
                  name="titulo"
                  className="form-control"
                  placeholder="Control, primera visita..."
                  value={formData.titulo}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-6 col-lg-4">
                <label className="form-label">Recordatorio (horas antes)</label>
                <input
                  type="number"
                  min="0"
                  name="recordatorioHorasAntes"
                  className="form-control"
                  value={formData.recordatorioHorasAntes}
                  onChange={handleChange}
                  placeholder="24"
                />
              </div>
              <div className="col-12">
                <label className="form-label">Notas</label>
                <textarea
                  name="notas"
                  className="form-control"
                  rows="2"
                  value={formData.notas}
                  onChange={handleChange}
                  placeholder="Detalles clínicos, indicaciones o recordatorios internos"
                ></textarea>
              </div>
                <div className="col-12 d-flex justify-content-end gap-2">
                  {editingId && (
                    <button type="button" className="btn btn-secondary" onClick={resetForm}>
                      Cancelar edición
                    </button>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        {editingId ? 'Guardando cambios...' : 'Creando turno...'}
                      </>
                    ) : (
                      <>{editingId ? 'Actualizar turno' : 'Crear turno'}</>
                    )}
                  </button>
                </div>
              </div>
            </fieldset>
          </form>
        </div>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-header bg-info text-white d-flex flex-column flex-md-row align-items-md-center justify-content-md-between gap-3">
          <h5 className="mb-0">Agenda visual</h5>
          <div className="d-flex flex-column flex-md-row align-items-md-center gap-2">
            <div className="btn-group btn-group-sm" role="group" aria-label="Cambiar vista de agenda">
              <button
                type="button"
                className={`btn ${agendaViewMode === 'day' ? 'btn-primary' : 'btn-outline-light text-white border-light'}`}
                onClick={() => setAgendaViewMode('day')}
              >
                Día
              </button>
              <button
                type="button"
                className={`btn ${agendaViewMode === 'week' ? 'btn-primary' : 'btn-outline-light text-white border-light'}`}
                onClick={() => setAgendaViewMode('week')}
              >
                Semana (7 días)
              </button>
            </div>
            <div className="d-flex align-items-center gap-2">
              <label htmlFor="agendaDate" className="form-label mb-0 text-white-50 small">
                {agendaViewMode === 'week' ? 'Inicio de la semana' : 'Fecha'}
              </label>
              <input
                id="agendaDate"
                type="date"
                className="form-control form-control-sm"
                value={agendaDate}
                onChange={handleAgendaDateChange}
              />
              <button type="button" className="btn btn-outline-light btn-sm" onClick={handleAgendaToday}>
                Hoy
              </button>
            </div>
          </div>
        </div>
        <div className="card-body">
          <AgendaGantt
            turnos={turnos}
            selectedDate={agendaDate}
            daysToShow={agendaViewMode === 'week' ? 7 : 1}
            startHour={8}
            endHour={20}
            minuteHeight={1}
            emptyMessage="No hay turnos programados en el período seleccionado."
          />
        </div>
      </div>

      <div className="card shadow-sm d-none d-md-block">
        <div className="card-body">
          {loading ? (
            <div className="text-center py-4">
              <span className="spinner-border text-primary" role="status" aria-hidden="true"></span>
              <span className="ms-2">Cargando turnos...</span>
            </div>
          ) : filteredTurnos.length === 0 ? (
            <p className="mb-0">{emptyMessage}</p>
          ) : (
            <>
              <div className="d-flex flex-column flex-sm-row justify-content-sm-between align-items-sm-center mb-3">
                <span className="text-muted small">
                  {totalTurnos === 0
                    ? 'Sin turnos para mostrar.'
                    : `Mostrando ${showingFrom}-${showingTo} de ${totalTurnos} turnos`}
                </span>
              </div>
            <table className="table table-hover align-middle">
              <thead className="table-light">
                <tr>
                  <th>Paciente</th>
                  <th>Fecha</th>
                  <th>Duración</th>
                  <th>Estado</th>
                  <th>Recordatorio</th>
                  <th>Notas</th>
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTurnos.map((turno) => (
                  <tr key={turno._id}>
                    <td>
                      <strong>{turno.paciente?.nombre} {turno.paciente?.apellido}</strong>
                      <div className="text-muted small">{turno.titulo || 'Sin título'}</div>
                    </td>
                    <td>{formatoFechaLocal(turno.fecha)}</td>
                    <td>{turno.duracionMinutos} min</td>
                    <td>
                      <span className={`badge ${estadoBadgeClass[turno.estado] || 'bg-secondary'}`}>
                        {estadoLabel[turno.estado] || turno.estado}
                      </span>
                    </td>
                    <td>
                      <div className="d-flex flex-column">
                        {turno.recordatorioProgramadoPara ? (
                          <span className="small text-muted">
                            Programado: {formatoFechaLocal(turno.recordatorioProgramadoPara)}
                          </span>
                        ) : (
                          <span className="small text-muted">Sin recordatorio programado</span>
                        )}
                        <button
                          type="button"
                          className={`btn btn-sm mt-1 ${turno.recordatorioEnviado ? 'btn-success' : 'btn-outline-primary'}`}
                          onClick={() => toggleRecordatorio(turno)}
                          disabled={recordatorioUpdatingId === turno._id || Boolean(deletingId) || saving}
                        >
                          {recordatorioUpdatingId === turno._id ? (
                            <>
                              <span
                                className="spinner-border spinner-border-sm me-2"
                                role="status"
                                aria-hidden="true"
                              ></span>
                              Actualizando...
                            </>
                          ) : turno.recordatorioEnviado ? (
                            'Recordatorio enviado'
                          ) : (
                            'Marcar como enviado'
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="small">{turno.notas || '—'}</td>
                    <td className="text-end">
                      <div className="btn-group" role="group">
                        <button
                          className="btn btn-warning btn-sm"
                          onClick={() => handleEdit(turno)}
                          disabled={saving || Boolean(deletingId)}
                        >
                          Editar
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(turno._id)}
                          disabled={deletingId === turno._id || saving}
                        >
                          {deletingId === turno._id ? (
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
              {totalTurnos > ITEMS_PER_PAGE && (
                <nav className="d-flex justify-content-center mt-3" aria-label="Paginación de turnos">
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
            </>
          )}
        </div>
      </div>

      <div className="d-md-none">
        {loading && (
          <div className="d-flex justify-content-center align-items-center py-4">
            <span className="spinner-border text-primary" role="status" aria-hidden="true"></span>
            <span className="ms-2">Cargando turnos...</span>
          </div>
        )}
        {!loading && filteredTurnos.length === 0 && <p>{emptyMessage}</p>}
        <div className="row g-3">
          {paginatedTurnos.map((turno) => (
            <div className="col-12" key={turno._id}>
              <div className="card shadow-sm">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <h5 className="card-title mb-1">
                        {turno.paciente?.nombre} {turno.paciente?.apellido}
                      </h5>
                      <p className="text-muted mb-2">{turno.titulo || 'Sin título'}</p>
                    </div>
                    <span className={`badge ${estadoBadgeClass[turno.estado] || 'bg-secondary'}`}>
                      {estadoLabel[turno.estado] || turno.estado}
                    </span>
                  </div>
                  <p className="mb-1">
                    <strong>Fecha:</strong> {formatoFechaLocal(turno.fecha)}
                  </p>
                  <p className="mb-1">
                    <strong>Duración:</strong> {turno.duracionMinutos} min
                  </p>
                  <p className="mb-1">
                    <strong>Recordatorio:</strong>{' '}
                    {turno.recordatorioProgramadoPara
                      ? formatoFechaLocal(turno.recordatorioProgramadoPara)
                      : 'No programado'}
                  </p>
                  {turno.notas && (
                    <p className="mb-2">
                      <strong>Notas:</strong> {turno.notas}
                    </p>
                  )}
                  <div className="d-flex flex-wrap gap-2">
                    <button
                      className="btn btn-warning btn-sm"
                      onClick={() => handleEdit(turno)}
                      disabled={saving || Boolean(deletingId)}
                    >
                      Editar
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(turno._id)}
                      disabled={deletingId === turno._id || saving}
                    >
                      {deletingId === turno._id ? (
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
                    <button
                      className={`btn btn-sm ${turno.recordatorioEnviado ? 'btn-success' : 'btn-outline-primary'}`}
                      onClick={() => toggleRecordatorio(turno)}
                      disabled={recordatorioUpdatingId === turno._id || Boolean(deletingId) || saving}
                    >
                      {recordatorioUpdatingId === turno._id
                        ? (
                          <>
                            <span
                              className="spinner-border spinner-border-sm me-2"
                              role="status"
                              aria-hidden="true"
                            ></span>
                            Actualizando...
                          </>
                        )
                        : turno.recordatorioEnviado
                        ? 'Recordatorio enviado'
                        : 'Marcar recordatorio'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {totalTurnos > ITEMS_PER_PAGE && (
          <nav className="d-flex justify-content-center mt-3" aria-label="Paginación de turnos móvil">
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

      <div className="card shadow-sm mt-4">
        <div className="card-body">
          <div className="d-flex flex-column flex-sm-row justify-content-sm-between align-items-sm-center mb-3">
            <h5 className="card-title mb-0">Turnos futuros</h5>
            <span className="text-muted small">
              {totalFutureTurnos === 0
                ? 'Sin turnos próximos.'
                : `Mostrando ${futureShowingFrom}-${futureShowingTo} de ${totalFutureTurnos} turnos futuros`}
            </span>
          </div>
          {totalFutureTurnos === 0 ? (
            <p className="mb-0">No hay turnos próximos agendados.</p>
          ) : (
            <ul className="list-group list-group-flush">
              {paginatedProximosTurnos.map((turno) => (
                <li className="list-group-item d-flex justify-content-between align-items-center" key={turno._id}>
                  <div>
                    <strong>{turno.paciente?.nombre} {turno.paciente?.apellido}</strong>
                    <div className="text-muted small">{turno.titulo || 'Sin título'}</div>
                  </div>
                  <span>{formatoFechaLocal(turno.fecha)}</span>
                </li>
              ))}
            </ul>
          )}
          {totalFutureTurnos > ITEMS_PER_PAGE && (
            <nav className="d-flex justify-content-center mt-3" aria-label="Paginación de turnos futuros">
              <ul className="pagination mb-0">
                <li className={`page-item ${futurePage === 1 ? 'disabled' : ''}`}>
                  <button
                    type="button"
                    className="page-link"
                    onClick={() => handleFuturePageChange(futurePage - 1)}
                    disabled={futurePage === 1}
                  >
                    Anterior
                  </button>
                </li>
                {futurePageNumbers.map((page, index) => (
                  <li
                    key={`${page}-future-${index}`}
                    className={`page-item ${page === futurePage ? 'active' : ''} ${typeof page === 'string' ? 'disabled' : ''}`}
                  >
                    {typeof page === 'string' ? (
                      <span className="page-link">…</span>
                    ) : (
                      <button type="button" className="page-link" onClick={() => handleFuturePageChange(page)}>
                        {page}
                      </button>
                    )}
                  </li>
                ))}
                <li className={`page-item ${futurePage === totalFuturePages ? 'disabled' : ''}`}>
                  <button
                    type="button"
                    className="page-link"
                    onClick={() => handleFuturePageChange(futurePage + 1)}
                    disabled={futurePage === totalFuturePages}
                  >
                    Siguiente
                  </button>
                </li>
              </ul>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
};

export default TurnosPage;
