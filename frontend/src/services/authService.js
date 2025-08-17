import axios from 'axios';

const API_URL = 'http://localhost:5000/api/users';

const register = async (userData) => {
  const response = await axios.post(`${API_URL}/register`, userData);
  if (response.data.token) {
    localStorage.setItem('user', JSON.stringify(response.data));
  }
  return response.data;
};

const login = async (userData) => {
  const response = await axios.post(`${API_URL}/login`, userData);
  if (response.data.token) {
    localStorage.setItem('user', JSON.stringify(response.data));
  }
  return response.data;
};

const logout = () => {
  localStorage.removeItem('user');
};

const getToken = () => {
    const user = JSON.parse(localStorage.getItem('user'));
    return user?.token;
  };
  
  const authService = {
    register,
    login,
    logout,
    getToken, // Agrega esta función
  };
  
  export default authService;