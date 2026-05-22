import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const adminApi = {
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),

  getStats: () =>
    apiClient.get('/admin/stats'),

  getUsers: (params?: { status?: string; page?: number; limit?: number }) =>
    apiClient.get('/admin/users', { params }),

  setUserStatus: (id: string, status: string) =>
    apiClient.patch(`/admin/users/${id}/status`, { status }),

  deleteUser: (id: string) =>
    apiClient.delete(`/admin/users/${id}`),
};
