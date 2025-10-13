import axios from 'axios';

// Usamos import.meta.env para acceder a la variable de entorno de Render.
const API_BASE_URL = import.meta.env.VITE_APP_API_URL || 'http://localhost:5000/api';

const register = async (userData) => {
  const response = await axios.post(`${API_BASE_URL}/users/register`, userData);
  if (response.data.token) {
    localStorage.setItem('user', JSON.stringify(response.data));
  }
  return response.data;
};

const login = async (userData) => {
  const response = await axios.post(`${API_BASE_URL}/users/login`, userData);
  if (response.data.token) {
    localStorage.setItem('user', JSON.stringify(response.data));
  }
  return response.data;
};

const logout = () => {
  localStorage.removeItem('user');
};

const getToken = () => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) {
      return null;
    }
    const user = JSON.parse(raw);
    return user?.token || null;
  } catch (error) {
    console.warn('No se pudo obtener el token almacenado.', error);
    localStorage.removeItem('user');
    return null;
  }
};

const requestPasswordReset = async (email) => {
  const response = await axios.post(`${API_BASE_URL}/users/forgot-password`, {
    email: email.trim().toLowerCase(),
  });
  return response.data;
};

const resetPassword = async ({ token, password }) => {
  const response = await axios.post(`${API_BASE_URL}/users/reset-password`, {
    token,
    password,
  });
  return response.data;
};

const authService = {
  register,
  login,
  logout,
  getToken,
  requestPasswordReset,
  resetPassword,
};

export default authService;
