import axios from 'axios';

export const API = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL: API });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('jt_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (e) => {
    const onAuthPage = ['/login', '/reset'].includes(location.pathname);
    if (e.response?.status === 401 && !onAuthPage) {
      localStorage.removeItem('jt_token');
      location.href = '/login';
    }
    return Promise.reject(e);
  },
);

export const errMsg = (e) => {
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m.join(', ');
  return m || (e?.code === 'ERR_NETWORK' ? 'Cannot reach the server. Check your connection.' : e?.message) || 'Something went wrong';
};

export const fileUrl = (id) => `${API}/files/${id}`;

export default api;
