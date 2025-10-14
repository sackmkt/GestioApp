import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import turnosService from '../services/TurnosService';
import PacientesService from '../services/PacientesService';
import { useFeedback } from '../context/FeedbackContext.jsx';
import AgendaGantt from '../components/AgendaGantt.jsx';
import MobileTurnoCard from '../components/MobileTurnoCard.jsx';
import { FaPhoneAlt, FaWhatsapp, FaSms } from 'react-icons/fa';
import '../styles/contact-actions.css';
import '../styles/turnos-mobile.css';

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

const EMPTY_FORM = {
  paciente: '',
  titulo: '',
  fecha: '',
  duracionMinutos: 30,
  estado: 'programado',
  notas: '',
  recordatorioHorasAntes: 24,
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
const POSTPONE_MINUTES = 60;

const DEFAULT_PAGINATION = {
  page: 1,
  limit: ITEMS_PER_PAGE,
  totalDocs: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

const sanitizeDialValue = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/[^+\d]/g, '');
};

const sanitizeWhatsappValue = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\D/g, '');
};

const buildContactLinks = (turno) => {
  if (!turno) {
    return null;
  }

  const rawPhone = typeof turno.paciente === 'object'
    ? (turno.paciente?.telefono || turno.paciente?.telefonoMovil || '')
    : (turno.telefonoPaciente || turno.telefono || '');

  const trimmed = rawPhone?.trim();

  if (!trimmed) {
    return null;
  }

  const telValue = sanitizeDialValue(trimmed);
  const whatsappValue = sanitizeWhatsappValue(trimmed);

  const contact = {
    phoneLabel: trimmed,
    tel: telValue ? `tel:${telValue}` : null,
    sms: telValue ? `sms:${telValue}` : null,
    whatsapp: whatsappValue ? `https://wa.me/${whatsappValue}` : null,
  };

  if (!contact.tel && !contact.sms && !contact.whatsapp) {
    return null;
  }

  return contact;
};

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
  const location = useLocation();
  const [turnos, setTurnos] = useState([]);
  const [agendaTurnos, setAgendaTurnos] = useState([]);
  const [upcomingTurnos, setUpcomingTurnos] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(() => ({ ...EMPTY_FORM }));
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
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const formRef = useRef(null);
  const [completingId, setCompletingId] = useState(null);
  const [postponingId, setPostponingId] = useState(null);

  const trimmedSearch = searchTerm.trim();
  const hasSearch = trimmedSearch.length > 0;

  useEffect(() => {
    const obtenerDatos = async () => {
      try {
        const response = await PacientesService.getPacientes({
          limit: 0,
          fields: 'nombre,apellido,dni',
        });
        setPacientes(Array.isArray(response?.data) ? response.data : []);
      } catch (error) {
        console.error('No se pudieron cargar los pacientes para agendar turnos.', error);
        showError('No se pudieron cargar los pacientes para agendar turnos.');
      }
    };
    obtenerDatos();
  }, [showError]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const createParam = params.get('crear') || params.get('create');
    if (!createParam) {
      return;
    }

    setEditingId(null);
    setFormData(() => ({
      ...EMPTY_FORM,
      fecha: formatearFechaParaInput(new Date().toISOString()),
    }));

    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);

    params.delete('crear');
    params.delete('create');
    const remaining = params.toString();
    window.history.replaceState({}, '', `${location.pathname}${remaining ? `?${remaining}` : ''}`);
  }, [location.pathname, location.search]);

  const loadTurnos = useCallback(async (pageToLoad = 1) => {
    setLoading(true);
    try {
      const rango = calcularRango(filtros.rango);
      const parametros = {
        ...rango,
        page: pageToLoad,
        limit: ITEMS_PER_PAGE,
        search: trimmedSearch || undefined,
      };
      if (filtros.estado !== 'todos') {
        parametros.estado = filtros.estado;
      }
      const response = await turnosService.getTurnos(parametros);
      const data = Array.isArray(response?.data) ? response.data : [];
      setTurnos(data);
      setAgendaTurnos(Array.isArray(response?.agenda) ? response.agenda : data);
      setUpcomingTurnos(Array.isArray(response?.upcoming) ? response.upcoming : []);
      const paginationData = response?.pagination || {};
      const resolvedPage = paginationData.page ?? pageToLoad;
      const resolvedLimit = paginationData.limit ?? ITEMS_PER_PAGE;
      const resolvedTotalDocs = paginationData.totalDocs ?? data.length;
      const resolvedTotalPages = paginationData.totalPages
        ?? Math.max(Math.ceil(resolvedTotalDocs / (resolvedLimit || 1)), 1);
      setPagination({
        page: resolvedPage,
        limit: resolvedLimit,
        totalDocs: resolvedTotalDocs,
        totalPages: resolvedTotalPages,
        hasNextPage: paginationData.hasNextPage ?? (resolvedPage < resolvedTotalPages),
        hasPrevPage: paginationData.hasPrevPage ?? (resolvedPage > 1),
      });
      return { resolvedPage };
    } catch (error) {
      console.error('Error al obtener turnos.', error);
      setTurnos([]);
      setAgendaTurnos([]);
      setUpcomingTurnos([]);
      setPagination(DEFAULT_PAGINATION);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [filtros.estado, filtros.rango, trimmedSearch]);

  const refreshTurnos = useCallback(async () => {
    const { resolvedPage } = await loadTurnos(currentPage);
    if (resolvedPage !== undefined && resolvedPage !== currentPage) {
      setCurrentPage(resolvedPage);
    }
  }, [currentPage, loadTurnos]);

  useEffect(() => {
    let cancelled = false;

    const fetchTurnos = async () => {
      try {
        const { resolvedPage } = await loadTurnos(currentPage);
        if (!cancelled && resolvedPage !== undefined && resolvedPage !== currentPage) {
          setCurrentPage(resolvedPage);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('No se pudieron obtener los turnos.', error);
          showError('No se pudieron obtener los turnos. Intenta nuevamente.');
        }
      }
    };

    fetchTurnos();

    return () => {
      cancelled = true;
    };
  }, [currentPage, loadTurnos, showError]);

  const emptyMessage = hasSearch
    ? 'No se encontraron turnos que coincidan con la búsqueda.'
    : 'No hay turnos para los filtros seleccionados.';

  const totalTurnos = pagination.totalDocs;
  const totalPages = Math.max(pagination.totalPages, 1);
  const pageNumbers = useMemo(
    () => buildPageNumbers(totalPages, pagination.page),
    [totalPages, pagination.page],
  );

  const showingFrom = totalTurnos === 0
    ? 0
    : (Math.max(pagination.page, 1) - 1) * (pagination.limit || ITEMS_PER_PAGE) + 1;
  const showingTo = totalTurnos === 0
    ? 0
    : Math.min(showingFrom + turnos.length - 1, totalTurnos);

  const totalFutureTurnos = upcomingTurnos.length;
  const totalFuturePages = Math.max(Math.ceil(totalFutureTurnos / ITEMS_PER_PAGE), 1);
  const paginatedProximosTurnos = useMemo(() => {
    const startIndex = (futurePage - 1) * ITEMS_PER_PAGE;
    return upcomingTurnos.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [upcomingTurnos, futurePage]);

  const futurePageNumbers = useMemo(
    () => buildPageNumbers(totalFuturePages, futurePage),
    [totalFuturePages, futurePage],
  );

  const futureShowingFrom = totalFutureTurnos === 0 ? 0 : (futurePage - 1) * ITEMS_PER_PAGE + 1;
  const futureShowingTo = totalFutureTurnos === 0 ? 0 : Math.min(futurePage * ITEMS_PER_PAGE, totalFutureTurnos);

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setCurrentPage(1);
    setFuturePage(1);
  };

  const handlePageChange = (page) => {
    if (
      typeof page === 'number'
      && page >= 1
      && page <= totalPages
      && page !== currentPage
    ) {
      setCurrentPage(page);
    }
  };

  const handleFuturePageChange = (page) => {
    if (
      typeof page === 'number'
      && page >= 1
      && page <= totalFuturePages
      && page !== futurePage
    ) {
      setFuturePage(page);
    }
  };

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
    setFormData(() => ({ ...EMPTY_FORM }));
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
      const targetPage = editingId ? currentPage : 1;
      if (targetPage === currentPage) {
        await loadTurnos(targetPage);
      } else {
        setCurrentPage(targetPage);
      }
      setFuturePage(1);
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
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Deseas eliminar este turno? Esta acción no se puede deshacer.')) {
      return;
    }
    try {
      setDeletingId(id);
      await turnosService.deleteTurno(id);
      if (editingId === id) {
        resetForm();
      }
      const isLastItemOnPage = turnos.length <= 1;
      const targetPage = isLastItemOnPage && pagination.page > 1
        ? pagination.page - 1
        : pagination.page;
      if (targetPage === currentPage) {
        await loadTurnos(targetPage);
      } else {
        setCurrentPage(targetPage);
      }
      setFuturePage(1);
      showInfo('El turno se eliminó correctamente.');
    } catch (error) {
      const message = error.response?.data?.message || 'No se pudo eliminar el turno. Intenta nuevamente.';
      console.error('Error al eliminar turno.', error);
      showError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCompleteTurno = useCallback(async (turno) => {
    if (!turno?._id) {
      return;
    }
    try {
      setCompletingId(turno._id);
      await turnosService.updateTurno(turno._id, { estado: 'completado' });
      await refreshTurnos();
      showSuccess('Turno marcado como completado.');
    } catch (error) {
      console.error('No se pudo completar el turno desde gesto móvil.', error);
      const message = error.response?.data?.error || 'No se pudo marcar el turno como completado.';
      showError(message);
    } finally {
      setCompletingId(null);
    }
  }, [refreshTurnos, showError, showSuccess]);

  const handlePostponeTurno = useCallback(async (turno) => {
    if (!turno?._id || !turno.fecha) {
      return;
    }
    const confirmMessage = `¿Deseas posponer este turno ${POSTPONE_MINUTES} minutos? Podrás ajustar el horario luego.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }
    try {
      setPostponingId(turno._id);
      const nuevaFecha = new Date(turno.fecha);
      if (Number.isNaN(nuevaFecha.getTime())) {
        throw new Error('Fecha del turno inválida.');
      }
      nuevaFecha.setMinutes(nuevaFecha.getMinutes() + POSTPONE_MINUTES);
      const payload = {
        fecha: nuevaFecha.toISOString(),
      };
      if (turno.estado === 'cancelado') {
        payload.estado = 'programado';
      }
      await turnosService.updateTurno(turno._id, payload);
      await refreshTurnos();
      showInfo(`Turno pospuesto ${POSTPONE_MINUTES} minutos.`);
    } catch (error) {
      console.error('No se pudo posponer el turno desde gesto móvil.', error);
      const message = error.response?.data?.error || 'No se pudo posponer el turno.';
      showError(message);
    } finally {
      setPostponingId(null);
    }
  }, [refreshTurnos, showError, showInfo]);

  const toggleRecordatorio = async (turno) => {
    try {
      setRecordatorioUpdatingId(turno._id);
      const actualizado = await turnosService.updateRecordatorio(turno._id, !turno.recordatorioEnviado);
      setTurnos((prev) => prev.map((item) => (item._id === actualizado._id ? actualizado : item)));
      setAgendaTurnos((prev) => prev.map((item) => (item._id === actualizado._id ? actualizado : item)));
      setUpcomingTurnos((prev) => prev.map((item) => (item._id === actualizado._id ? actualizado : item)));
      if (actualizado.recordatorioEnviado) {
        showSuccess('El recordatorio se marcó como enviado.');
      } else {
        showInfo('El recordatorio volverá a estar pendiente.');
      }
    } catch (error) {
      console.error('No se pudo actualizar el estado del recordatorio.', error);
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
    setCurrentPage(1);
    setFuturePage(1);
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
          <form onSubmit={handleSubmit} ref={formRef}>
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
            turnos={agendaTurnos}
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
          ) : turnos.length === 0 ? (
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
                {turnos.map((turno) => (
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
          {totalTurnos > (pagination.limit || ITEMS_PER_PAGE) && (
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
        {!loading && turnos.length === 0 && <p>{emptyMessage}</p>}
        {!loading && turnos.length > 0 && (
          <p className="text-muted small mb-3">
            Consejo rápido: arrastra un turno a la derecha para completarlo o a la izquierda para posponerlo {POSTPONE_MINUTES} minutos.
          </p>
        )}
        <div className="row g-3">
          {turnos.map((turno) => {
            const mobileTurno = {
              ...turno,
              fechaFormateada: formatoFechaLocal(turno.fecha),
              estadoBadgeClass: estadoBadgeClass[turno.estado] || 'bg-secondary',
              estadoLabel: estadoLabel[turno.estado] || turno.estado,
              recordatorioLabel: turno.recordatorioProgramadoPara
                ? formatoFechaLocal(turno.recordatorioProgramadoPara)
                : 'No programado',
            };
            return (
              <div className="col-12" key={turno._id}>
                <MobileTurnoCard
                  turno={mobileTurno}
                  onEdit={() => handleEdit(turno)}
                  onDelete={() => handleDelete(turno._id)}
                  onToggleRecordatorio={() => toggleRecordatorio(turno)}
                  onComplete={handleCompleteTurno}
                  onPostpone={handlePostponeTurno}
                  disableActions={saving || Boolean(deletingId)}
                  isDeleting={deletingId === turno._id}
                  isRecordatorioUpdating={recordatorioUpdatingId === turno._id}
                  isCompleting={completingId === turno._id}
                  isPostponing={postponingId === turno._id}
                  completeLabel="Soltar para completar"
                  postponeLabel={`Soltar para posponer ${POSTPONE_MINUTES} min`}
                />
              </div>
            );
          })}
        </div>
        {totalTurnos > (pagination.limit || ITEMS_PER_PAGE) && (
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
              {paginatedProximosTurnos.map((turno) => {
                const pacienteNombre = turno.paciente
                  ? `${turno.paciente.nombre || ''} ${turno.paciente.apellido || ''}`.trim() || 'Paciente'
                  : 'Paciente';
                const contact = buildContactLinks(turno);
                return (
                  <li className="list-group-item" key={turno._id}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <strong>{pacienteNombre}</strong>
                        <div className="text-muted small">{turno.titulo || 'Sin título'}</div>
                        {contact?.phoneLabel && (
                          <div className="text-muted small">{contact.phoneLabel}</div>
                        )}
                      </div>
                      <div className="text-end">
                        <span>{formatoFechaLocal(turno.fecha)}</span>
                        {contact && (
                          <div className="contact-actions contact-actions--compact contact-actions--end mt-2">
                            {contact.tel && (
                              <a
                                className="contact-action contact-action--call"
                                href={contact.tel}
                                title={`Llamar a ${pacienteNombre}`}
                              >
                                <FaPhoneAlt />
                              </a>
                            )}
                            {contact.whatsapp && (
                              <a
                                className="contact-action contact-action--whatsapp"
                                href={contact.whatsapp}
                                target="_blank"
                                rel="noreferrer"
                                title={`Enviar WhatsApp a ${pacienteNombre}`}
                              >
                                <FaWhatsapp />
                              </a>
                            )}
                            {contact.sms && (
                              <a
                                className="contact-action contact-action--sms"
                                href={contact.sms}
                                title={`Enviar SMS a ${pacienteNombre}`}
                              >
                                <FaSms />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
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
