import axios from 'axios';
import authService from './authService';

const API_URL = `${import.meta.env.VITE_APP_API_URL}/centros-salud`;

const getHeaders = () => {
  const token = authService.getToken();
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const getCentros = async () => {
  const response = await axios.get(API_URL, getHeaders());
  return response.data;
};

const createCentro = async (data) => {
  const response = await axios.post(API_URL, data, getHeaders());
  return response.data;
};

const updateCentro = async (id, data) => {
  const response = await axios.put(`${API_URL}/${id}`, data, getHeaders());
  return response.data;
};

const deleteCentro = async (id) => {
  await axios.delete(`${API_URL}/${id}`, getHeaders());
};

export default {
  getCentros,
  createCentro,
  updateCentro,
  deleteCentro,
};
