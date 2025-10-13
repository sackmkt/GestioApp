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

const getHeadersWithConfig = (config = {}) => {
  const base = getHeaders();
  return {
    ...base,
    ...config,
    headers: {
      ...base.headers,
      ...(config.headers || {}),
    },
  };
};

const extractFilename = (disposition, fallback = 'documento.pdf') => {
  if (!disposition) {
    return fallback;
  }
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match ? decodeURIComponent(match[1]) : fallback;
};

const getPacientes = async (params = {}) => {
  try {
    const response = await axios.get(API_URL, getHeadersWithConfig({ params }));
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

const uploadDocumento = async (pacienteId, payload) => {
  try {
    const response = await axios.post(`${API_URL}/${pacienteId}/documentos`, payload, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al adjuntar documento del paciente:', error);
    throw error;
  }
};

const deleteDocumento = async (pacienteId, documentoId) => {
  try {
    await axios.delete(`${API_URL}/${pacienteId}/documentos/${documentoId}`, getHeaders());
  } catch (error) {
    console.error('Error al eliminar documento del paciente:', error);
    throw error;
  }
};

const downloadDocumento = async (pacienteId, documentoId) => {
  try {
    const response = await axios.get(
      `${API_URL}/${pacienteId}/documentos/${documentoId}/descargar`,
      getHeadersWithConfig({ responseType: 'blob' }),
    );

    const filename = extractFilename(response.headers['content-disposition'], 'documento.pdf');
    return {
      blob: response.data,
      filename,
      contentType: response.headers['content-type'],
    };
  } catch (error) {
    console.error('Error al descargar documento del paciente:', error);
    throw error;
  }
};

const exportPacientes = async () => {
  try {
    const response = await axios.get(`${API_URL}/export`, getHeadersWithConfig({ responseType: 'blob' }));
    const filename = extractFilename(response.headers['content-disposition'], 'pacientes.csv');
    return {
      blob: response.data,
      filename,
      contentType: response.headers['content-type'],
    };
  } catch (error) {
    console.error('Error al exportar pacientes:', error);
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
  exportPacientes,
};

export default pacientesService;