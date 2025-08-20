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

const pacientesService = {
  getPacientes,
  createPaciente,
  updatePaciente,
  deletePaciente,
};

export default pacientesService;