import React, { useCallback, useMemo, useRef, useState } from 'react';

const COMPLETE_THRESHOLD = 110;
const POSTPONE_THRESHOLD = -110;
const ACTIVATION_ZONE = 72;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const MobileTurnoCard = ({
  turno,
  onEdit,
  onDelete,
  onToggleRecordatorio,
  onComplete,
  onPostpone,
  disableActions,
  isDeleting,
  isRecordatorioUpdating,
  isCompleting,
  isPostponing,
  postponeLabel,
  completeLabel,
}) => {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const pointerIdRef = useRef(null);
  const startXRef = useRef(0);
  const translateRef = useRef(0);
  const cardRef = useRef(null);

  const isProcessing = isCompleting || isPostponing;
  const isCompletingZone = translateX > ACTIVATION_ZONE;
  const isPostponingZone = translateX < -ACTIVATION_ZONE;

  const actionHint = useMemo(() => {
    if (isCompletingZone) {
      return completeLabel;
    }
    if (isPostponingZone) {
      return postponeLabel;
    }
    return 'Desliza para acceder a acciones rápidas';
  }, [completeLabel, isCompletingZone, isPostponingZone, postponeLabel]);

  const resetDrag = useCallback(() => {
    setTranslateX(0);
    translateRef.current = 0;
    setIsDragging(false);
    pointerIdRef.current = null;
  }, []);

  const handlePointerDown = useCallback((event) => {
    if (event.pointerType === 'mouse' || isProcessing) {
      return;
    }
    if (event.target.closest('[data-gesture-ignore="true"]')) {
      return;
    }

    pointerIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    translateRef.current = translateX;
    setIsDragging(true);
    cardRef.current?.setPointerCapture(event.pointerId);
  }, [isProcessing, translateX]);

  const handlePointerMove = useCallback((event) => {
    if (!isDragging || pointerIdRef.current !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - startXRef.current;
    const nextValue = clamp(deltaX, -160, 160);
    translateRef.current = nextValue;
    setTranslateX(nextValue);
  }, [isDragging]);

  const triggerAction = useCallback(async (deltaX) => {
    if (deltaX > COMPLETE_THRESHOLD && onComplete) {
      await onComplete(turno);
    } else if (deltaX < POSTPONE_THRESHOLD && onPostpone) {
      await onPostpone(turno);
    }
  }, [onComplete, onPostpone, turno]);

  const handlePointerEnd = useCallback(async (event) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }
    cardRef.current?.releasePointerCapture(event.pointerId);
    setIsDragging(false);
    const finalDelta = translateRef.current;
    resetDrag();
    await triggerAction(finalDelta);
  }, [resetDrag, triggerAction]);

  const handlePointerCancel = useCallback((event) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }
    cardRef.current?.releasePointerCapture(event.pointerId);
    resetDrag();
  }, [resetDrag]);

  const cardClasses = useMemo(() => {
    const classes = ['turno-mobile-card'];
    if (isDragging) {
      classes.push('turno-mobile-card--dragging');
    }
    if (isCompletingZone || isCompleting) {
      classes.push('turno-mobile-card--completing');
    }
    if (isPostponingZone || isPostponing) {
      classes.push('turno-mobile-card--postponing');
    }
    if (isProcessing) {
      classes.push('turno-mobile-card--processing');
    }
    return classes.join(' ');
  }, [isCompleting, isCompletingZone, isDragging, isPostponing, isPostponingZone, isProcessing]);

  return (
    <article
      ref={cardRef}
      className={cardClasses}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerCancel}
      role="group"
      aria-roledescription="Turno con gestos táctiles"
    >
      <div className="turno-mobile-card__background turno-mobile-card__background--complete" aria-hidden="true">
        <span aria-hidden="true">✓ Completar</span>
      </div>
      <div className="turno-mobile-card__background turno-mobile-card__background--postpone" aria-hidden="true">
        <span aria-hidden="true">⏰ Posponer</span>
      </div>
      <div
        className="turno-mobile-card__content"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div className="turno-mobile-card__header">
          <div>
            <h5 className="turno-mobile-card__title">{turno.paciente?.nombre} {turno.paciente?.apellido}</h5>
            <p className="turno-mobile-card__subtitle">{turno.titulo || 'Sin título'}</p>
          </div>
          <span className={`badge ${turno.estadoBadgeClass}`}>{turno.estadoLabel}</span>
        </div>
        <dl className="turno-mobile-card__details">
          <div>
            <dt>Fecha</dt>
            <dd>{turno.fechaFormateada}</dd>
          </div>
          <div>
            <dt>Duración</dt>
            <dd>{turno.duracionMinutos} min</dd>
          </div>
          <div>
            <dt>Recordatorio</dt>
            <dd>{turno.recordatorioLabel}</dd>
          </div>
        </dl>
        {turno.notas && (
          <p className="turno-mobile-card__notes">{turno.notas}</p>
        )}
        <div className="turno-mobile-card__actions">
          <button
            type="button"
            className="btn btn-warning btn-sm"
            onClick={onEdit}
            disabled={disableActions}
            data-gesture-ignore="true"
          >
            Editar
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={onDelete}
            disabled={disableActions || isDeleting}
            data-gesture-ignore="true"
          >
            {isDeleting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Eliminando...
              </>
            ) : (
              'Eliminar'
            )}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${turno.recordatorioEnviado ? 'btn-success' : 'btn-outline-primary'}`}
            onClick={onToggleRecordatorio}
            disabled={disableActions || isRecordatorioUpdating}
            data-gesture-ignore="true"
          >
            {isRecordatorioUpdating ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Actualizando...
              </>
            ) : turno.recordatorioEnviado ? (
              'Recordatorio enviado'
            ) : (
              'Marcar recordatorio'
            )}
          </button>
        </div>
        <p className="turno-mobile-card__hint" aria-live="polite">{actionHint}</p>
      </div>
      {isProcessing && (
        <div className="turno-mobile-card__processing" aria-live="polite">
          {isCompleting ? 'Marcando como completado…' : 'Posponiendo turno…'}
        </div>
      )}
    </article>
  );
};
export default MobileTurnoCard;
