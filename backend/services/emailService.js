const ensureFetch = () => {
  if (typeof fetch !== 'function') {
    throw new Error('El entorno no soporta la API fetch necesaria para enviar correos.');
  }
  return fetch;
};

const buildResetLink = (token) => {
  const baseUrl = process.env.FRONTEND_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
  const url = new URL('/reset-password', baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
};

const sendPasswordResetEmail = async ({ to, token }) => {
  if (!to || !token) {
    throw new Error('Correo electrónico y token son obligatorios para enviar el restablecimiento.');
  }

  const endpoint = process.env.EMAIL_RESET_API_URL || process.env.EMAIL_RESET_WEBHOOK_URL;
  if (!endpoint) {
    throw new Error('No se configuró un endpoint para el envío de correos de restablecimiento.');
  }

  const resetLink = buildResetLink(token);
  const headers = { 'Content-Type': 'application/json' };

  if (process.env.EMAIL_RESET_API_KEY) {
    headers.Authorization = `Bearer ${process.env.EMAIL_RESET_API_KEY}`;
  }

  const body = JSON.stringify({
    to,
    template: 'password-reset',
    resetLink,
    token,
    metadata: {
      project: 'Gestio',
      purpose: 'password-reset',
    },
  });

  const fetchFn = ensureFetch();

  const response = await fetchFn(endpoint, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const description = `${response.status} ${response.statusText}`.trim();
    throw new Error(`El proveedor de correo respondió con un estado inesperado: ${description}`);
  }
};

module.exports = {
  sendPasswordResetEmail,
};
