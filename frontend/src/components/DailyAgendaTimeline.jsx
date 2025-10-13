import React, { useMemo } from 'react';
import { FaPhoneAlt, FaWhatsapp, FaSms } from 'react-icons/fa';
import '../styles/daily-agenda-timeline.css';

const ESTADO_META = {
  programado: { label: 'Programado', color: '#0d6efd' },
  completado: { label: 'Completado', color: '#198754' },
  cancelado: { label: 'Cancelado', color: '#6c757d' },
};

const hexToRgba = (hex, alpha = 1) => {
  if (typeof hex !== 'string') {
    return `rgba(13, 110, 253, ${alpha})`;
  }

  const sanitized = hex.replace('#', '');
  if (sanitized.length !== 3 && sanitized.length !== 6) {
    return `rgba(13, 110, 253, ${alpha})`;
  }

  const fullHex = sanitized.length === 3
    ? sanitized.split('').map((char) => char + char).join('')
    : sanitized;

  const bigint = parseInt(fullHex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const buildToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const parseDateOnly = (value) => {
  if (!value) {
    return buildToday();
  }

  if (value instanceof Date) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return buildToday();
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  if (typeof value === 'string') {
    const isoDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateMatch) {
      const [, year, month, day] = isoDateMatch.map(Number);
      const parsed = new Date(year, month - 1, day);
      if (Number.isNaN(parsed.getTime())) {
        return buildToday();
      }
      parsed.setHours(0, 0, 0, 0);
      return parsed;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return buildToday();
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  return buildToday();
};

const getLocalDateKey = (date) => {
  if (!(date instanceof Date)) {
    return '';
  }
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
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

const formatTimeRange = (startDate, durationMinutes) => {
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
    return '';
  }
  const safeDuration = Number.isFinite(durationMinutes) ? durationMinutes : 0;
  const endDate = new Date(startDate.getTime() + safeDuration * 60000);
  const formatter = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
};

const DailyAgendaTimeline = ({
  turnos,
  selectedDate,
  startHour = 8,
  endHour = 20,
  emptyMessage = 'No hay turnos programados para este día.',
}) => {
  const baseDate = useMemo(() => parseDateOnly(selectedDate), [selectedDate]);

  const safeStartHour = Number.isFinite(startHour) ? startHour : 8;
  const safeEndHour = Number.isFinite(endHour) ? endHour : 20;
  const normalizedStart = Math.min(safeStartHour, safeEndHour);
  const normalizedEnd = Math.max(safeStartHour, safeEndHour);

  const workHoursLabel = useMemo(() => {
    if (!Number.isFinite(normalizedStart) || !Number.isFinite(normalizedEnd)) {
      return '';
    }
    const pad = (value) => value.toString().padStart(2, '0');
    return `${pad(normalizedStart)}:00 - ${pad(normalizedEnd)}:00`;
  }, [normalizedEnd, normalizedStart]);

  const eventsForDay = useMemo(() => {
    if (!Array.isArray(turnos) || turnos.length === 0) {
      return [];
    }

    const targetKey = getLocalDateKey(baseDate);

    return turnos
      .map((turno) => {
        const fecha = new Date(turno.fecha);
        if (Number.isNaN(fecha.getTime())) {
          return null;
        }

        if (getLocalDateKey(fecha) !== targetKey) {
          return null;
        }

        const pacienteNombre = [turno.paciente?.nombre, turno.paciente?.apellido]
          .filter(Boolean)
          .join(' ')
          .trim();

        return {
          _id: turno._id || `${fecha.getTime()}-${pacienteNombre}`,
          fecha,
          duracionMinutos: Number.isFinite(turno.duracionMinutos) ? turno.duracionMinutos : 0,
          estado: turno.estado || 'programado',
          titulo: turno.titulo || '',
          paciente: pacienteNombre || turno.paciente || 'Paciente',
          contact: buildContactLinks(turno),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.fecha - b.fecha);
  }, [baseDate, turnos]);

  const dateLabel = useMemo(() => {
    if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) {
      return '';
    }

    return baseDate.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }, [baseDate]);

  const hasEvents = eventsForDay.length > 0;

  return (
    <div className="daily-agenda">
      <div className="daily-agenda__header">
        <div>
          <h6 className="daily-agenda__title mb-1">Agenda del día</h6>
          {dateLabel && <p className="daily-agenda__subtitle mb-0 text-muted text-capitalize">{dateLabel}</p>}
        </div>
        {workHoursLabel && (
          <span className="daily-agenda__work-hours text-muted">Horario: {workHoursLabel}</span>
        )}
      </div>
      {hasEvents ? (
        <ul className="daily-agenda__timeline">
          {eventsForDay.map((event) => {
            const meta = ESTADO_META[event.estado] || ESTADO_META.programado;
            const statusLabel = meta?.label || 'Programado';
            const statusColor = meta?.color || ESTADO_META.programado.color;

            return (
              <li
                key={event._id}
                className="daily-agenda__item"
                style={{
                  '--status-color': statusColor,
                  '--status-color-soft': hexToRgba(statusColor, 0.12),
                  '--status-color-border': hexToRgba(statusColor, 0.24),
                }}
              >
                <div className="daily-agenda__time">{formatTimeRange(event.fecha, event.duracionMinutos)}</div>
                <div className="daily-agenda__details">
                  <span className="daily-agenda__patient">{event.paciente}</span>
                  {event.titulo && <span className="daily-agenda__title">{event.titulo}</span>}
                  <span className="daily-agenda__status">{statusLabel}</span>
                  {event.contact?.phoneLabel && (
                    <span className="daily-agenda__contact text-muted">{event.contact.phoneLabel}</span>
                  )}
                  {event.contact && (
                    <div className="daily-agenda__actions">
                      {event.contact.tel && (
                        <a className="daily-agenda__action daily-agenda__action--call" href={event.contact.tel} aria-label={`Llamar a ${event.paciente}`}>
                          <FaPhoneAlt />
                        </a>
                      )}
                      {event.contact.whatsapp && (
                        <a
                          className="daily-agenda__action daily-agenda__action--whatsapp"
                          href={event.contact.whatsapp}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Enviar WhatsApp a ${event.paciente}`}
                        >
                          <FaWhatsapp />
                        </a>
                      )}
                      {event.contact.sms && (
                        <a className="daily-agenda__action daily-agenda__action--sms" href={event.contact.sms} aria-label={`Enviar SMS a ${event.paciente}`}>
                          <FaSms />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="daily-agenda__empty">
          <p className="mb-0 text-muted small">{emptyMessage}</p>
        </div>
      )}
    </div>
  );
};

export default DailyAgendaTimeline;
