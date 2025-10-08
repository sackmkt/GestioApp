import axios from 'axios';
import authService from './authService';

const API_BASE_URL = import.meta.env.VITE_APP_API_URL || 'http://localhost:5000/api';

const withAuthHeaders = () => ({
  headers: {
    Authorization: `Bearer ${authService.getToken()}`,
  },
});

const getProfile = async () => {
  const response = await axios.get(`${API_BASE_URL}/users/me`, withAuthHeaders());
  return response.data;
};

const updateProfile = async (profileData) => {
  const response = await axios.put(`${API_BASE_URL}/users/me`, profileData, withAuthHeaders());
  return response.data;
};

const userService = {
  getProfile,
  updateProfile,
};

export default userService;

