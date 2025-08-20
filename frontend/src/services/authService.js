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
  const user = JSON.parse(localStorage.getItem('user'));
  return user?.token;
};

const authService = {
  register,
  login,
  logout,
  getToken,
};

export default authService;