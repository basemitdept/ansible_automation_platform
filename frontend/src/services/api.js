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
  upload: (playbookId, formData, config = {}) => api.post(`/playbooks/${playbookId}/files`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    ...config,
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
  bulkDelete: (hostIds) => api.delete('/hosts/bulk-delete', { data: { host_ids: hostIds } }),
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
  getAll: (params = {}) => {
    // Default to getting all records (no pagination) for better user experience
    const queryParams = new URLSearchParams({
      per_page: 0, // 0 means return all records
      ...params
    });
    return api.get(`/history?${queryParams}`);
  },
  getLight: (limit = 50) => {
    // Lightweight version for dashboard - gets recent records without heavy output data
    return api.get(`/history?light=true&per_page=${limit}`);
  },
  getStats: () => {
    // Get only statistics (counts) for dashboard without heavy data
    return api.get('/history/stats');
  },
  getPaginated: (page = 1, perPage = 25) => {
    return api.get(`/history?page=${page}&per_page=${perPage}`);
  },
  getPaginatedLight: (page = 1, perPage = 10) => {
    // Lightweight paginated version for history page - faster loading
    return api.get(`/history?light=true&page=${page}&per_page=${perPage}`);
  },
  getById: (id) => {
    // Get single execution with full details (including output)
    return api.get(`/history/${id}`);
  },
  delete: (id) => api.delete(`/history/${id}`),
  refreshOutput: (id) => api.post(`/history/${id}/refresh-output`),
};

// Artifacts API
export const artifactsAPI = {
  getByExecution: (executionId, params = {}) => {
    const queryParams = new URLSearchParams(params);
    const query = queryParams.toString();
    return api.get(`/artifacts/${executionId}${query ? `?${query}` : ''}`);
  },
  getData: (artifactId) => api.get(`/artifacts/${artifactId}/data`),
};

export const credentialsAPI = {
  getAll: () => api.get('/credentials'),
  create: (credential) => api.post('/credentials', credential),
  update: (id, credential) => api.put(`/credentials/${id}`, credential),
  delete: (id) => api.delete(`/credentials/${id}`),
  getPassword: (id) => api.get(`/credentials/${id}/password`),
};

export const variablesAPI = {
  getAll: () => api.get('/variables'),
  create: (data) => api.post('/variables', data),
  update: (id, data) => api.put(`/variables/${id}`, data),
  delete: (id) => api.delete(`/variables/${id}`),
  reveal: (id) => api.get(`/variables/${id}/reveal`),
  getForExecution: () => api.get('/variables/execution'),
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
