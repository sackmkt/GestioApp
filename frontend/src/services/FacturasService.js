import axios from 'axios';
import authService from './authService';

const API_URL = 'http://localhost:5000/api/facturas';

const getHeaders = () => {
  const token = authService.getToken();
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const getFacturas = async () => {
  try {
    const response = await axios.get(API_URL, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al obtener facturas:', error);
    throw error;
  }
};

const createFactura = async (facturaData) => {
  try {
    const response = await axios.post(API_URL, facturaData, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al crear factura:', error);
    throw error;
  }
};

const deleteFactura = async (id) => {
  try {
    await axios.delete(`${API_URL}/${id}`, getHeaders());
  } catch (error) {
    console.error('Error al eliminar factura:', error);
    throw error;
  }
};

// Función para marcar una factura como pagada
const markAsPaid = async (id) => {
  try {
    const response = await axios.put(`${API_URL}/${id}`, {}, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al marcar factura como pagada:', error);
    throw error;
  }
};

export default {
  getFacturas,
  createFactura,
  deleteFactura,
  markAsPaid,
};