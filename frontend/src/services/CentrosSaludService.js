import axios from 'axios';
import authService from './authService';

const API_URL = `${import.meta.env.VITE_APP_API_URL}/centros-salud`;

const getHeaders = () => {
  const token = authService.getToken();
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const list = async () => {
  const response = await axios.get(API_URL, getHeaders());
  return response.data;
};

const create = async (payload) => {
  const response = await axios.post(API_URL, payload, getHeaders());
  return response.data;
};

const update = async (id, payload) => {
  const response = await axios.put(`${API_URL}/${id}`, payload, getHeaders());
  return response.data;
};

const remove = async (id) => {
  await axios.delete(`${API_URL}/${id}`, getHeaders());
};

export default {
  list,
  create,
  update,
  remove,
};
