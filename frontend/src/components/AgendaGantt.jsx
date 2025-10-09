import React, { useMemo } from 'react';
import '../styles/agenda-gantt.css';

const estadoClassName = {
  programado: 'agenda-gantt__event--programado',
  completado: 'agenda-gantt__event--completado',
  cancelado: 'agenda-gantt__event--cancelado',
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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

const capitalize = (value) => {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
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

const parseLocalDateString = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const isoDateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDateOnlyRegex.test(value)) {
    return null;
  }
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return new Date(year, month - 1, day);
};

const ensureDate = (value) => {
  const fallback = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  if (!value) {
    return fallback();
  }

  if (value instanceof Date) {
    const cloned = new Date(value);
    if (Number.isNaN(cloned.getTime())) {
      return fallback();
    }
    cloned.setHours(0, 0, 0, 0);
    return cloned;
  }

  const localParsed = parseLocalDateString(value);
  if (localParsed) {
    localParsed.setHours(0, 0, 0, 0);
    return localParsed;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback();
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const getEventStyle = (startDate, durationMinutes, minuteHeight, startHour, totalMinutes) => {
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
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
  const rawHeightMinutes = visibleEndMinutes - visibleStartMinutes;
  const adjustedHeightMinutes = Math.max(rawHeightMinutes, Math.min(safeDuration, 15));
  const height = Math.max(adjustedHeightMinutes * minuteHeight, 26);
  const top = visibleStartMinutes * minuteHeight;

  return {
    top: `${top}px`,
    height: `${height}px`,
  };
};

const getHorizontalEventStyle = (startDate, durationMinutes, startHour, totalMinutes) => {
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
  const rawDuration = visibleEndMinutes - visibleStartMinutes;
  const fallbackDuration = Math.min(Math.max(safeDuration, 15), totalMinutes);
  const effectiveDuration = Math.max(rawDuration, fallbackDuration);

  const leftPercent = (visibleStartMinutes / totalMinutes) * 100;
  const widthPercent = (effectiveDuration / totalMinutes) * 100;

  return {
    left: `${leftPercent}%`,
    width: `${widthPercent}%`,
  };
};

const AgendaGantt = ({
  turnos,
  selectedDate,
  daysToShow = 1,
  startHour = 8,
  endHour = 20,
  minuteHeight = 1.1,
  orientation = 'vertical',
  emptyMessage = 'No hay turnos programados en el período seleccionado.',
}) => {
  const baseDate = useMemo(() => ensureDate(selectedDate), [selectedDate]);

  const safeDaysToShow = Math.max(Number.isFinite(daysToShow) ? daysToShow : 1, 1);

  const days = useMemo(
    () => Array.from({ length: safeDaysToShow }, (_, index) => {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + index);
      return date;
    }),
    [baseDate, safeDaysToShow],
  );

  const hours = useMemo(() => {
    const safeStart = Math.min(startHour, endHour);
    const safeEnd = Math.max(startHour, endHour);
    return Array.from({ length: safeEnd - safeStart + 1 }, (_, index) => safeStart + index);
  }, [startHour, endHour]);

  const totalMinutes = Math.max((endHour - startHour) * 60, 0);
  const timelineHeight = totalMinutes * minuteHeight;

  const eventsByDay = useMemo(() => {
    const map = new Map();
    days.forEach((day) => {
      map.set(getLocalDateKey(day), []);
    });

    if (!Array.isArray(turnos) || turnos.length === 0) {
      return map;
    }

    turnos.forEach((turno) => {
      const fecha = new Date(turno.fecha);
      if (Number.isNaN(fecha.getTime())) {
        return;
      }
      const key = getLocalDateKey(fecha);
      if (!map.has(key)) {
        return;
      }

      const duration = Number.isFinite(turno.duracionMinutos) ? turno.duracionMinutos : 0;
      const pacienteNombre = [turno.paciente?.nombre, turno.paciente?.apellido]
        .filter(Boolean)
        .join(' ')
        .trim();

      map.get(key).push({
        _id: turno._id,
        fecha,
        duracionMinutos: duration,
        estado: turno.estado || 'programado',
        paciente: pacienteNombre || 'Paciente',
        titulo: turno.titulo || '',
        notas: turno.notas || '',
      });
    });

    map.forEach((value, mapKey) => {
      const ordered = [...value].sort((a, b) => a.fecha - b.fecha);
      map.set(mapKey, ordered);
    });

    return map;
  }, [days, turnos]);

  const eventsAvailable = useMemo(
    () => Array.from(eventsByDay.values()).some((events) => events.length > 0),
    [eventsByDay],
  );

  const orientationClass = orientation === 'horizontal' ? 'agenda-gantt--horizontal' : 'agenda-gantt--vertical';

  const firstDay = useMemo(() => (days.length > 0 ? days[0] : null), [days]);
  const firstDayKey = useMemo(() => (firstDay ? getLocalDateKey(firstDay) : ''), [firstDay]);
  const firstDayEvents = useMemo(() => {
    if (!firstDayKey) {
      return [];
    }
    const events = eventsByDay.get(firstDayKey);
    return Array.isArray(events) ? events : [];
  }, [eventsByDay, firstDayKey]);

  const patientRows = useMemo(() => {
    if (orientation !== 'horizontal') {
      return [];
    }
    if (!firstDayEvents || firstDayEvents.length === 0) {
      return [];
    }
    const groups = new Map();
    firstDayEvents.forEach((event) => {
      const name = event.paciente || 'Paciente';
      if (!groups.has(name)) {
        groups.set(name, []);
      }
      groups.get(name).push(event);
    });
    return Array.from(groups.entries()).map(([paciente, items]) => ({
      paciente,
      events: [...items].sort((a, b) => a.fecha - b.fecha),
    }));
  }, [firstDayEvents, orientation]);

  if (orientation === 'horizontal') {

    const hourTemplateColumns = `repeat(${hours.length}, minmax(80px, 1fr))`;
    const rowCount = patientRows.length || 1;
    const rowHeight = 64;
    const timelineHeightHorizontal = rowCount * rowHeight;

    return (
      <div className={`agenda-gantt ${orientationClass}`}>
        <div className="agenda-gantt__horizontal">
          <div className="agenda-gantt__horizontal-label-column">
            <div className="agenda-gantt__horizontal-label-header">Paciente</div>
            <div className="agenda-gantt__horizontal-labels">
              {patientRows.map((row) => (
                <div key={row.paciente} className="agenda-gantt__horizontal-label" style={{ height: `${rowHeight}px` }}>
                  {row.paciente}
                </div>
              ))}
            </div>
          </div>
          <div className="agenda-gantt__horizontal-main">
            <div className="agenda-gantt__scroll">
              <div className="agenda-gantt__horizontal-main-track">
                <div className="agenda-gantt__horizontal-hours" style={{ gridTemplateColumns: hourTemplateColumns }}>
                  {hours.map((hour) => (
                    <div key={hour} className="agenda-gantt__horizontal-hour">
                      {formatHourLabel(hour)}
                    </div>
                  ))}
                </div>
                <div
                  className="agenda-gantt__horizontal-timeline"
                  style={{ height: `${timelineHeightHorizontal}px` }}
                >
                  <div className="agenda-gantt__horizontal-grid" style={{ gridTemplateColumns: hourTemplateColumns }}>
                    {hours.map((hour) => (
                      <div key={`grid-${hour}`} className="agenda-gantt__horizontal-grid-cell"></div>
                    ))}
                  </div>
                  <div className="agenda-gantt__horizontal-rows">
                    {patientRows.map((row) => (
                      <div key={row.paciente} className="agenda-gantt__horizontal-row" style={{ height: `${rowHeight}px` }}>
                        {row.events.map((event) => {
                          const eventStyle = getHorizontalEventStyle(
                            event.fecha,
                            event.duracionMinutos,
                            startHour,
                            totalMinutes,
                          );
                          if (!eventStyle) {
                            return null;
                          }
                          return (
                            <div
                              key={event._id}
                              className={`agenda-gantt__event agenda-gantt__event--horizontal ${
                                estadoClassName[event.estado] || ''
                              }`}
                              style={eventStyle}
                            >
                              <div className="agenda-gantt__event-time">
                                {formatTimeRange(event.fecha, event.duracionMinutos)}
                              </div>
                              {event.titulo && (
                                <div className="agenda-gantt__event-subtitle">{event.titulo}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {!eventsAvailable && (
          <div className="agenda-gantt__empty">
            <p className="mb-0 text-muted small">{emptyMessage}</p>
          </div>
        )}
      </div>
    );
  }

  const gridTemplateColumns = useMemo(
    () => `80px repeat(${days.length}, minmax(160px, 1fr))`,
    [days.length],
  );

  return (
    <div className={`agenda-gantt ${orientationClass}`}>
      <div className="agenda-gantt__scroll">
        <div className="agenda-gantt__layout">
          <div className="agenda-gantt__header" style={{ gridTemplateColumns }}>
            <div className="agenda-gantt__header-spacer" aria-hidden="true"></div>
            {days.map((day) => {
              const weekdayLabel = capitalize(
                new Intl.DateTimeFormat('es-AR', {
                  weekday: 'short',
                }).format(day),
              );
              const dateLabel = new Intl.DateTimeFormat('es-AR', {
                day: '2-digit',
                month: 'short',
              }).format(day);
              const key = getLocalDateKey(day);
              return (
                <div key={key} className="agenda-gantt__header-cell">
                  <span className="agenda-gantt__header-weekday">{weekdayLabel}</span>
                  <span className="agenda-gantt__header-date">{dateLabel}</span>
                </div>
              );
            })}
          </div>
          <div className="agenda-gantt__body" style={{ gridTemplateColumns }}>
            <div className="agenda-gantt__time-column" style={{ height: `${timelineHeight}px` }}>
              {hours.map((hour, index) => (
                <div
                  key={hour}
                  className={`agenda-gantt__time-cell ${index === 0 ? 'agenda-gantt__time-cell--first' : ''}`}
                  style={{ height: `${60 * minuteHeight}px` }}
                >
                  {formatHourLabel(hour)}
                </div>
              ))}
            </div>
            {days.map((day) => {
              const key = getLocalDateKey(day);
              const events = eventsByDay.get(key) || [];
              return (
                <div key={key} className="agenda-gantt__day-column">
                  <div className="agenda-gantt__day-inner" style={{ height: `${timelineHeight}px` }}>
                    <div className="agenda-gantt__hour-grid">
                      {hours.map((hour) => (
                        <div
                          key={`${key}-${hour}`}
                          className="agenda-gantt__hour-cell"
                          style={{ height: `${60 * minuteHeight}px` }}
                        ></div>
                      ))}
                    </div>
                    {events.map((event) => {
                      const eventStyle = getEventStyle(
                        event.fecha,
                        event.duracionMinutos,
                        minuteHeight,
                        startHour,
                        totalMinutes,
                      );
                      if (!eventStyle) {
                        return null;
                      }
                      return (
                        <div
                          key={event._id}
                          className={`agenda-gantt__event ${estadoClassName[event.estado] || ''}`}
                          style={eventStyle}
                        >
                          <div className="agenda-gantt__event-time">
                            {formatTimeRange(event.fecha, event.duracionMinutos)}
                          </div>
                          <div className="agenda-gantt__event-title">{event.paciente}</div>
                          {event.titulo && (
                            <div className="agenda-gantt__event-subtitle">{event.titulo}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {!eventsAvailable && (
        <div className="agenda-gantt__empty">
          <p className="mb-0 text-muted small">{emptyMessage}</p>
        </div>
      )}
    </div>
  );
};

export default AgendaGantt;
