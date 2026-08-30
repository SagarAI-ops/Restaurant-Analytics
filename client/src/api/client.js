import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance
const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - inject JWT token
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 unauthorized
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth and redirect to login
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/**
 * Generic API methods
 */
export const api = {
  // GET request
  get: (url, params) => client.get(url, { params }),
  
  // POST request
  post: (url, data) => client.post(url, data),
  
  // PUT request
  put: (url, data) => client.put(url, data),
  
  // PATCH request
  patch: (url, data) => client.patch(url, data),
  
  // DELETE request
  delete: (url) => client.delete(url),
};

export default client;
