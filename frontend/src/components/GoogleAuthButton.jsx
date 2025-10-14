import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleIdentity } from '../utils/googleIdentity.js';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_APP_GOOGLE_CLIENT_ID;

function GoogleAuthButton({
  text = 'signin_with',
  shape = 'rectangular',
  theme = 'filled_blue',
  size = 'large',
  onCredential,
  onError,
  className = '',
  disabled = false,
}) {
  const containerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState('');
  const disabledRef = useRef(disabled);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    let isMounted = true;

    if (!GOOGLE_CLIENT_ID) {
      setInitError('Configura el ID de cliente de Google para habilitar esta opción.');
      return () => {
        isMounted = false;
      };
    }

    loadGoogleIdentity()
      .then((accountsId) => {
        if (!isMounted) {
          return;
        }

        if (!containerRef.current) {
          return;
        }

        accountsId.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (!isMounted || disabledRef.current) {
              return;
            }

            if (response?.credential) {
              onCredential?.(response.credential);
            } else {
              const message = 'No recibimos la credencial de Google. Intenta nuevamente.';
              onError?.(message);
            }
          },
          ux_mode: 'popup',
          auto_select: false,
        });

        accountsId.renderButton(containerRef.current, {
          type: 'standard',
          theme,
          size,
          text,
          shape,
          logo_alignment: 'center',
        });

        setIsReady(true);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        console.error('No se pudo cargar Google Identity Services:', error);
        setInitError('No pudimos cargar el botón de Google. Intenta nuevamente más tarde.');
        onError?.('No pudimos cargar Google. Intenta nuevamente más tarde.');
      });

    return () => {
      isMounted = false;
    };
  }, [onCredential, onError, shape, size, text, theme]);

  if (initError) {
    return (
      <div className={`google-auth-button ${className}`} aria-live="polite">
        <button type="button" className="google-auth-button__fallback" disabled>
          {initError}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`google-auth-button ${className} ${disabled ? 'google-auth-button--disabled' : ''}`.trim()}
      aria-busy={!isReady}
    >
      <div ref={containerRef} className="google-auth-button__container" />
      {!isReady && <span className="google-auth-button__loading">Cargando Google…</span>}
    </div>
  );
}

export default GoogleAuthButton;
