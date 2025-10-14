import axios from 'axios';
import authService from './authService';

const API_URL = `${import.meta.env.VITE_APP_API_URL}/obras-sociales`;

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const getCurrentToken = () => authService.getToken() || null;

const getHeaders = () => {
  const token = getCurrentToken();
  if (!token) {
    throw new Error('Token de autenticación no disponible');
  }
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const getCacheKey = () => getCurrentToken();

const readCache = (key) => {
  if (!key) {
    return null;
  }

  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.timestamp >= CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.data;
};

const writeCache = (key, data) => {
  if (!key) {
    cache.clear();
    return;
  }

  cache.set(key, { data, timestamp: Date.now() });
};

const invalidateCache = () => {
  const key = getCacheKey();
  if (!key) {
    cache.clear();
    return;
  }

  cache.delete(key);
};

const getObrasSociales = async ({ force = false } = {}) => {
  const cacheKey = getCacheKey();
  if (!force) {
    const cached = readCache(cacheKey);
    if (cached) {
      return cached;
    }
  }
  try {
    const response = await axios.get(API_URL, getHeaders());
    writeCache(cacheKey, response.data);
    return response.data;
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
