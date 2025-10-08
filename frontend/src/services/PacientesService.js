import axios from 'axios';
import authService from './authService';

const API_URL = `${import.meta.env.VITE_APP_API_URL}/pacientes`;

const getHeaders = () => {
  const token = authService.getToken();
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const getPacientes = async () => {
  try {
    const response = await axios.get(API_URL, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al obtener pacientes:', error);
    throw error;
  }
};

const createPaciente = async (pacienteData) => {
  try {
    const response = await axios.post(API_URL, pacienteData, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al crear paciente:', error);
    throw error;
  }
};

const updatePaciente = async (id, pacienteData) => {
  try {
    const response = await axios.put(`${API_URL}/${id}`, pacienteData, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al actualizar paciente:', error);
    throw error;
  }
};

const deletePaciente = async (id) => {
  try {
    await axios.delete(`${API_URL}/${id}`, getHeaders());
  } catch (error) {
    console.error('Error al eliminar paciente:', error);
    throw error;
  }
};

const uploadDocumento = async (pacienteId, documentoData) => {
  try {
    const response = await axios.post(`${API_URL}/${pacienteId}/documentos`, documentoData, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al subir documento de paciente:', error);
    throw error;
  }
};

const deleteDocumento = async (pacienteId, documentoId) => {
  try {
    await axios.delete(`${API_URL}/${pacienteId}/documentos/${documentoId}`, getHeaders());
  } catch (error) {
    console.error('Error al eliminar documento de paciente:', error);
    throw error;
  }
};

const downloadDocumento = async (pacienteId, documentoId) => {
  try {
    const headers = getHeaders().headers;
    const response = await axios.get(`${API_URL}/${pacienteId}/documentos/${documentoId}/descarga`, {
      headers,
      responseType: 'blob',
    });
    return response;
  } catch (error) {
    console.error('Error al descargar documento de paciente:', error);
    throw error;
  }
};

const pacientesService = {
  getPacientes,
  createPaciente,
  updatePaciente,
  deletePaciente,
  uploadDocumento,
  deleteDocumento,
  downloadDocumento,
};

export default pacientesService;
