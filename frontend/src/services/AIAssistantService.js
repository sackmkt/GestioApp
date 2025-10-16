import axios from 'axios';
import authService from './authService';

const API_BASE_URL = import.meta.env.VITE_APP_API_URL || 'http://localhost:5000/api';

const getHeaders = () => {
  const token = authService.getToken();
  if (!token) {
    return {};
  }

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const sendMessage = async ({ messages, temperature } = {}) => {
  const payload = {
    messages,
  };

  if (typeof temperature === 'number') {
    payload.temperature = temperature;
  }

  const response = await axios.post(`${API_BASE_URL}/ai/chat`, payload, getHeaders());
  return response.data;
};

const aiAssistantService = {
  sendMessage,
};

export default aiAssistantService;
