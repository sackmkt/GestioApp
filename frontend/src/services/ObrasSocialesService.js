import axios from 'axios';
import authService from './authService';

const API_URL = 'http://localhost:5000/api/obras-sociales';

const getHeaders = () => {
  const token = authService.getToken();
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const getObrasSociales = async () => {
  try {
    const response = await axios.get(API_URL, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al obtener obras sociales:', error);
    throw error;
  }
};

const createObraSocial = async (obraSocialData) => {
  try {
    const response = await axios.post(API_URL, obraSocialData, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al crear obra social:', error.response?.data?.error || error.message);
    throw error;
  }
};

const updateObraSocial = async (id, obraSocialData) => {
  try {
    const response = await axios.put(`${API_URL}/${id}`, obraSocialData, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al actualizar obra social:', error);
    throw error;
  }
};

const deleteObraSocial = async (id) => {
  try {
    await axios.delete(`${API_URL}/${id}`, getHeaders());
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