import axios from 'axios';
import authService from './authService';

const API_URL = `${import.meta.env.VITE_APP_API_URL}/centros-salud`;

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedCentros = null;
let cacheTimestamp = 0;

const getHeaders = () => {
  const token = authService.getToken();
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const invalidateCache = () => {
  cachedCentros = null;
  cacheTimestamp = 0;
};

const getCentros = async ({ force = false } = {}) => {
  if (!force && cachedCentros && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedCentros;
  }
  const response = await axios.get(API_URL, getHeaders());
  cachedCentros = response.data;
  cacheTimestamp = Date.now();
  return cachedCentros;
};

const createCentro = async (data) => {
  const response = await axios.post(API_URL, data, getHeaders());
  invalidateCache();
  return response.data;
};

const updateCentro = async (id, data) => {
  const response = await axios.put(`${API_URL}/${id}`, data, getHeaders());
  invalidateCache();
  return response.data;
};

const deleteCentro = async (id) => {
  await axios.delete(`${API_URL}/${id}`, getHeaders());
  invalidateCache();
};

export default {
  getCentros,
  createCentro,
  updateCentro,
  deleteCentro,
};
