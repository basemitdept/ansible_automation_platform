import axios from 'axios';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid, redirect to login
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Playbooks API
export const playbooksAPI = {
  getAll: () => api.get('/playbooks'),
  create: (data) => api.post('/playbooks', data),
  update: (id, data) => api.put(`/playbooks/${id}`, data),
  delete: (id) => api.delete(`/playbooks/${id}`),
};

// Playbook Files API
export const playbookFilesAPI = {
  getAll: (playbookId) => api.get(`/playbooks/${playbookId}/files`),
  upload: (playbookId, formData) => api.post(`/playbooks/${playbookId}/files`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
  delete: (playbookId, fileId) => api.delete(`/playbooks/${playbookId}/files/${fileId}`),
  download: (playbookId, fileId) => api.get(`/playbooks/${playbookId}/files/${fileId}/download`, {
    responseType: 'blob',
  }),
};

// Host Groups API
export const hostGroupsAPI = {
  getAll: () => api.get('/host-groups'),
  create: (data) => api.post('/host-groups', data),
  update: (id, data) => api.put(`/host-groups/${id}`, data),
  delete: (id) => api.delete(`/host-groups/${id}`),
};

// Hosts API
export const hostsAPI = {
  getAll: () => api.get('/hosts'),
  create: (data) => api.post('/hosts', data),
  createBulk: (data) => api.post('/hosts/bulk', data),
  update: (id, data) => api.put(`/hosts/${id}`, data),
  delete: (id) => api.delete(`/hosts/${id}`),
};

// Tasks API
export const tasksAPI = {
  getAll: () => api.get('/tasks'),
  getById: (id) => api.get(`/tasks/${id}`),
  execute: (data) => api.post('/execute', data),
  delete: (id) => api.delete(`/tasks/${id}`),
};

// History API
export const historyAPI = {
  getAll: () => api.get('/history'),
  delete: (id) => api.delete(`/history/${id}`),
};

// Artifacts API
export const artifactsAPI = {
  getByExecution: (executionId) => api.get(`/artifacts/${executionId}`),
  getData: (artifactId) => api.get(`/artifacts/${artifactId}/data`),
};

export const credentialsAPI = {
  getAll: () => api.get('/credentials'),
  create: (credential) => api.post('/credentials', credential),
  update: (id, credential) => api.put(`/credentials/${id}`, credential),
  delete: (id) => api.delete(`/credentials/${id}`),
  getPassword: (id) => api.get(`/credentials/${id}/password`),
};

export const webhooksAPI = {
  getAll: () => api.get('/webhooks'),
  create: (data) => api.post('/webhooks', data),
  update: (id, data) => api.put(`/webhooks/${id}`, data),
  delete: (id) => api.delete(`/webhooks/${id}`),
  regenerateToken: (id) => api.post(`/webhooks/${id}/regenerate-token`),
  trigger: (token, data) => api.post(`/webhook/trigger/${token}`, data)
};

export const apiTokensAPI = {
  getAll: () => api.get('/tokens'),
  create: (data) => api.post('/tokens', data),
  update: (id, data) => api.put(`/tokens/${id}`, data),
  delete: (id) => api.delete(`/tokens/${id}`),
  regenerate: (id) => api.post(`/tokens/${id}/regenerate`)
};

// Authentication API
export const authAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  getCurrentUser: () => api.get('/auth/current-user'),
};

// Users API
export const usersAPI = {
  getAll: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

export default api; 
