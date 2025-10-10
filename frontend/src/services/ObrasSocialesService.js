import axios from 'axios';
import authService from './authService';

const API_URL = `${import.meta.env.VITE_APP_API_URL}/obras-sociales`;

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedObrasSociales = null;
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
  cachedObrasSociales = null;
  cacheTimestamp = 0;
};

const getObrasSociales = async ({ force = false } = {}) => {
  if (!force && cachedObrasSociales && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedObrasSociales;
  }
  try {
    const response = await axios.get(API_URL, getHeaders());
    cachedObrasSociales = response.data;
    cacheTimestamp = Date.now();
    return cachedObrasSociales;
  } catch (error) {
    console.error('Error al obtener obras sociales:', error);
    throw error;
  }
};

const createObraSocial = async (obraSocialData) => {
  try {
    const response = await axios.post(API_URL, obraSocialData, getHeaders());
    invalidateCache();
    return response.data;
  } catch (error) {
    console.error('Error al crear obra social:', error.response?.data?.error || error.message);
    throw error;
  }
};

const updateObraSocial = async (id, obraSocialData) => {
  try {
    const response = await axios.put(`${API_URL}/${id}`, obraSocialData, getHeaders());
    invalidateCache();
    return response.data;
  } catch (error) {
    console.error('Error al actualizar obra social:', error);
    throw error;
  }
};

const deleteObraSocial = async (id) => {
  try {
    await axios.delete(`${API_URL}/${id}`, getHeaders());
    invalidateCache();
  } catch (error) {
    console.error('Error al eliminar obra social:', error);
    throw error;
  }
};

export default {
  getObrasSociales,
  createObraSocial,
  updateObraSocial,
  deleteObraSocial,
};