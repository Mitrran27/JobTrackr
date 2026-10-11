import { reactive } from 'vue';
import api from './api';
import { clearCache } from './cache';

export const auth = reactive({
  token: localStorage.getItem('jt_token') || '',
  user: null,
  async login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    this.set(data);
  },
  async register(name, email, password) {
    const { data } = await api.post('/auth/register', { name, email, password });
    this.set(data);
  },
  set(data) {
    clearCache();
    this.token = data.token;
    this.user = data.user;
    localStorage.setItem('jt_token', data.token);
  },
  async load() {
    if (!this.token || this.user) return;
    try {
      this.user = (await api.get('/auth/me')).data;
    } catch {
      this.logout();
    }
  },
  logout() {
    clearCache();
    this.token = '';
    this.user = null;
    localStorage.removeItem('jt_token');
    if (window.caches) {
      caches.delete('jt-api');
      caches.delete('jt-files');
    }
  },
});
