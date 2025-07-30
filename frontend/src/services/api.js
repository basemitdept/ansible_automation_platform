import axios from 'axios';

const API_BASE_URL = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Playbooks API
export const playbooksAPI = {
  getAll: () => api.get('/playbooks'),
  create: (data) => api.post('/playbooks', data),
  update: (id, data) => api.put(`/playbooks/${id}`, data),
  delete: (id) => api.delete(`/playbooks/${id}`),
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

export default api; 