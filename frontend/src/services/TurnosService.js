import axios from 'axios';
import authService from './authService';

const API_URL = `${import.meta.env.VITE_APP_API_URL}/turnos`;

const getHeaders = () => {
  const token = authService.getToken();
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const buildQueryString = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
};

const getTurnos = async (params = {}) => {
  try {
    const response = await axios.get(`${API_URL}${buildQueryString(params)}`, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al obtener turnos:', error);
    throw error;
  }
};

const createTurno = async (turnoData) => {
  try {
    const response = await axios.post(API_URL, turnoData, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al crear turno:', error);
    throw error;
  }
};

const updateTurno = async (id, turnoData) => {
  try {
    const response = await axios.put(`${API_URL}/${id}`, turnoData, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al actualizar turno:', error);
    throw error;
  }
};

const deleteTurno = async (id) => {
  try {
    await axios.delete(`${API_URL}/${id}`, getHeaders());
  } catch (error) {
    console.error('Error al eliminar turno:', error);
    throw error;
  }
};

const updateRecordatorio = async (id, estado) => {
  try {
    const response = await axios.patch(
      `${API_URL}/${id}/recordatorio`,
      { recordatorioEnviado: estado },
      getHeaders()
    );
    return response.data;
  } catch (error) {
    console.error('Error al actualizar recordatorio:', error);
    throw error;
  }
};

const turnosService = {
  getTurnos,
  createTurno,
  updateTurno,
  deleteTurno,
  updateRecordatorio,
};

export default turnosService;
