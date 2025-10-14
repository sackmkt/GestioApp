import axios from 'axios';
import authService from './authService';

const API_URL = `${import.meta.env.VITE_APP_API_URL}/centros-salud`;

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

const getCentros = async ({ force = false } = {}) => {
  const cacheKey = getCacheKey();
  if (!force) {
    const cached = readCache(cacheKey);
    if (cached) {
      return cached;
    }
  }
  const response = await axios.get(API_URL, getHeaders());
  writeCache(cacheKey, response.data);
  return response.data;
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

