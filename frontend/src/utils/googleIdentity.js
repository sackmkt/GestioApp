const SCRIPT_ID = 'google-identity-services';
let loadPromise = null;

export const loadGoogleIdentity = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Identity Services solo está disponible en el navegador.'));
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(SCRIPT_ID);
    let scriptElement = existingScript;

    const cleanupAndResolve = () => {
      scriptElement?.removeEventListener('load', handleLoad);
      scriptElement?.removeEventListener('error', handleError);
    };

    const handleLoad = () => {
      cleanupAndResolve();
      if (window.google?.accounts?.id) {
        resolve(window.google.accounts.id);
      } else {
        reject(new Error('No se pudo inicializar Google Identity Services.'));
      }
    };

    const handleError = (event) => {
      cleanupAndResolve();
      const error = event instanceof Event ? new Error('Error al cargar Google Identity Services.') : event;
      reject(error);
    };

    if (!scriptElement) {
      scriptElement = document.createElement('script');
      scriptElement.id = SCRIPT_ID;
      scriptElement.src = 'https://accounts.google.com/gsi/client';
      scriptElement.async = true;
      scriptElement.defer = true;
      document.head.appendChild(scriptElement);
    }

    scriptElement.addEventListener('load', handleLoad, { once: true });
    scriptElement.addEventListener('error', handleError, { once: true });
  }).catch((error) => {
    loadPromise = null;
    throw error;
  });

  return loadPromise;
};

export default loadGoogleIdentity;
