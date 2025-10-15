import axios from 'axios';
import authService from './authService';

const API_URL = `${import.meta.env.VITE_APP_API_URL}/facturas`;

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

const appendMesServicioParam = (params, mesServicio) => {
  if (mesServicio === undefined || mesServicio === null) {
    return;
  }

  const value = String(mesServicio).trim();
  if (!value) {
    return;
  }

  params.append('mesServicio', value);
};

const buildGetFacturasQuery = (filters = {}) => {
  const params = new URLSearchParams();
  appendMesServicioParam(params, filters.mesServicio);
  return params.toString() ? `?${params.toString()}` : '';
};

const buildExportFacturasQuery = (filters = {}) => {
  const params = new URLSearchParams();

  if (filters.startDate) {
    params.append('startDate', filters.startDate);
  }

  if (filters.endDate) {
    params.append('endDate', filters.endDate);
  }

  if (filters.userId) {
    params.append('usuarioId', filters.userId);
  }

  appendMesServicioParam(params, filters.mesServicio);

  return params.toString() ? `?${params.toString()}` : '';
};

const getFacturas = async (filters = {}) => {
  try {
    const queryString = buildGetFacturasQuery(filters);
    const response = await axios.get(`${API_URL}${queryString}`, getHeaders());
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

const updateFactura = async (id, facturaData) => {
  try {
    const response = await axios.put(`${API_URL}/${id}`, facturaData, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al actualizar factura:', error);
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

const registrarPago = async (id, pagoData) => {
  try {
    const response = await axios.post(`${API_URL}/${id}/pagos`, pagoData, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al registrar pago:', error);
    throw error;
  }
};

const actualizarPago = async (facturaId, pagoId, pagoData) => {
  try {
    const response = await axios.patch(`${API_URL}/${facturaId}/pagos/${pagoId}`, pagoData, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al actualizar pago:', error);
    throw error;
  }
};

const eliminarPago = async (facturaId, pagoId) => {
  try {
    const response = await axios.delete(`${API_URL}/${facturaId}/pagos/${pagoId}`, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al eliminar pago:', error);
    throw error;
  }
};

const registrarPagoCentro = async (id, pagoData) => {
  try {
    const response = await axios.post(`${API_URL}/${id}/pagos-centro`, pagoData, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al registrar pago al centro:', error);
    throw error;
  }
};

const actualizarPagoCentro = async (facturaId, pagoId, pagoData) => {
  try {
    const response = await axios.patch(`${API_URL}/${facturaId}/pagos-centro/${pagoId}`, pagoData, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al actualizar pago al centro:', error);
    throw error;
  }
};

const eliminarPagoCentro = async (facturaId, pagoId) => {
  try {
    const response = await axios.delete(`${API_URL}/${facturaId}/pagos-centro/${pagoId}`, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al eliminar pago al centro:', error);
    throw error;
  }
};

const uploadDocumento = async (facturaId, payload) => {
  try {
    const response = await axios.post(`${API_URL}/${facturaId}/documentos`, payload, getHeaders());
    return response.data;
  } catch (error) {
    console.error('Error al adjuntar documento de factura:', error);
    throw error;
  }
};

const deleteDocumento = async (facturaId, documentoId) => {
  try {
    await axios.delete(`${API_URL}/${facturaId}/documentos/${documentoId}`, getHeaders());
  } catch (error) {
    console.error('Error al eliminar documento de factura:', error);
    throw error;
  }
};

const downloadDocumento = async (facturaId, documentoId) => {
  try {
    const response = await axios.get(
      `${API_URL}/${facturaId}/documentos/${documentoId}/descargar`,
      getHeadersWithConfig({ responseType: 'blob' }),
    );

    const filename = extractFilename(response.headers['content-disposition'], 'comprobante.pdf');
    return {
      blob: response.data,
      filename,
      contentType: response.headers['content-type'],
    };
  } catch (error) {
    console.error('Error al descargar documento de factura:', error);
    throw error;
  }
};

const exportFacturas = async (filters = {}) => {
  try {
    const queryString = buildExportFacturasQuery(filters);

    const response = await axios.get(`${API_URL}/export${queryString}`, getHeadersWithConfig({ responseType: 'blob' }));
    const filename = extractFilename(response.headers['content-disposition'], 'facturas.xls');
    return {
      blob: response.data,
      filename,
      contentType: response.headers['content-type'],
    };
  } catch (error) {
    console.error('Error al exportar facturas:', error);
    throw error;
  }
};

export default {
  getFacturas,
  createFactura,
  updateFactura,
  deleteFactura,
  registrarPago,
  actualizarPago,
  eliminarPago,
  registrarPagoCentro,
  actualizarPagoCentro,
  eliminarPagoCentro,
  uploadDocumento,
  deleteDocumento,
  downloadDocumento,
  exportFacturas,
};
