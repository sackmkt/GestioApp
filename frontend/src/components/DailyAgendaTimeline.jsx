import React, { useMemo } from 'react';
import '../styles/daily-agenda-timeline.css';

const estadoClassName = {
  programado: 'daily-agenda__event--programado',
  completado: 'daily-agenda__event--completado',
  cancelado: 'daily-agenda__event--cancelado',
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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

const formatHourLabel = (hour) => `${hour.toString().padStart(2, '0')}:00`;

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

const buildEventStyle = (startDate, durationMinutes, startHour, totalMinutes) => {
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime()) || totalMinutes <= 0) {
    return null;
  }

  const safeDuration = Number.isFinite(durationMinutes) ? durationMinutes : 0;
  const eventStartMinutes = startDate.getHours() * 60 + startDate.getMinutes() - startHour * 60;
  const eventEndMinutes = eventStartMinutes + safeDuration;

  if (eventEndMinutes <= 0 || eventStartMinutes >= totalMinutes) {
    return null;
  }

  const visibleStartMinutes = clamp(eventStartMinutes, 0, totalMinutes);
  const visibleEndMinutes = clamp(eventEndMinutes, 0, totalMinutes);
  const visibleMinutes = Math.max(visibleEndMinutes - visibleStartMinutes, 0);
  const minVisibleMinutes = Math.max(Math.min(safeDuration, 20), 10);
  const widthMinutes = Math.max(visibleMinutes, minVisibleMinutes);

  const leftPercent = (visibleStartMinutes / totalMinutes) * 100;
  const widthPercent = Math.min((widthMinutes / totalMinutes) * 100, 100 - leftPercent);

  return {
    left: `${leftPercent}%`,
    width: `${widthPercent}%`,
  };
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

  const hours = useMemo(() => {
    return Array.from({ length: normalizedEnd - normalizedStart + 1 }, (_, index) => normalizedStart + index);
  }, [normalizedEnd, normalizedStart]);

  const totalMinutes = Math.max((normalizedEnd - normalizedStart) * 60, 0);
  const hourSlots = Math.max(hours.length - 1, 1);

  const eventsByPaciente = useMemo(() => {
    if (!Array.isArray(turnos) || turnos.length === 0) {
      return [];
    }

    const targetKey = getLocalDateKey(baseDate);
    const map = new Map();

    turnos.forEach((turno) => {
      const fecha = new Date(turno.fecha);
      if (Number.isNaN(fecha.getTime())) {
        return;
      }
      const eventKey = getLocalDateKey(fecha);
      if (eventKey !== targetKey) {
        return;
      }

      const pacienteNombre = [turno.paciente?.nombre, turno.paciente?.apellido]
        .filter(Boolean)
        .join(' ')
        .trim();
      const paciente = pacienteNombre || turno.paciente || 'Paciente';
      const duration = Number.isFinite(turno.duracionMinutos) ? turno.duracionMinutos : 0;

      if (!map.has(paciente)) {
        map.set(paciente, []);
      }

      map.get(paciente).push({
        _id: turno._id,
        fecha,
        duracionMinutos: duration,
        estado: turno.estado || 'programado',
        titulo: turno.titulo || '',
      });
    });

    map.forEach((items, key) => {
      const ordered = [...items].sort((a, b) => a.fecha - b.fecha);
      map.set(key, ordered);
    });

    return Array.from(map.entries());
  }, [baseDate, turnos]);

  const hasEvents = eventsByPaciente.length > 0;

  return (
    <div className="daily-agenda">
      <div className="daily-agenda__hours">
        <div className="daily-agenda__corner" aria-hidden="true"></div>
        <div className="daily-agenda__hours-track">
          {hours.map((hour) => (
            <div key={hour} className="daily-agenda__hours-cell">
              {formatHourLabel(hour)}
            </div>
          ))}
        </div>
      </div>
      <div className="daily-agenda__body">
        {eventsByPaciente.map(([paciente, events]) => (
          <div key={paciente} className="daily-agenda__row">
            <div className="daily-agenda__row-label">{paciente}</div>
            <div className="daily-agenda__row-track">
              <div className="daily-agenda__grid" aria-hidden="true">
                {Array.from({ length: hourSlots + 1 }, (_, index) => (
                  <div
                    key={index}
                    className="daily-agenda__grid-line"
                    style={{ left: `${(index / hourSlots) * 100}%` }}
                  ></div>
                ))}
              </div>
              {events.map((event) => {
                const style = buildEventStyle(event.fecha, event.duracionMinutos, normalizedStart, totalMinutes);
                if (!style) {
                  return null;
                }
                return (
                  <div
                    key={event._id}
                    className={`daily-agenda__event ${estadoClassName[event.estado] || ''}`}
                    style={style}
                  >
                    <span className="daily-agenda__event-time">{formatTimeRange(event.fecha, event.duracionMinutos)}</span>
                    {event.titulo && <span className="daily-agenda__event-title">{event.titulo}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {!hasEvents && (
          <div className="daily-agenda__empty">
            <p className="mb-0 text-muted small">{emptyMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyAgendaTimeline;
