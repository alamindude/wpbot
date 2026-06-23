// ═══════════════════════════════════════════════
// API Client
// ═══════════════════════════════════════════════

const API = {
  token: localStorage.getItem('bot_admin_token'),

  setToken(t) {
    this.token = t;
    if (t) localStorage.setItem('bot_admin_token', t);
    else localStorage.removeItem('bot_admin_token');
  },

  async request(method, path, body = null) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`/api${path}`, opts);
    const data = await res.json();

    if (res.status === 401) {
      this.setToken(null);
      window.location.reload();
      return;
    }

    return data;
  },

  get: (path) => API.request('GET', path),
  post: (path, body) => API.request('POST', path, body),
  put: (path, body) => API.request('PUT', path, body),
  patch: (path, body) => API.request('PATCH', path, body),
  del: (path) => API.request('DELETE', path),

  // Auth
  login: (u, p) => API.post('/auth/login', { username: u, password: p }),
  me: () => API.get('/auth/me'),

  // Bot
  botStatus: () => API.get('/bot/status'),
  botQR: () => API.get('/bot/qr'),
  botRestart: () => API.post('/bot/restart'),
  botPause: () => API.post('/bot/pause'),
  botResume: () => API.post('/bot/resume'),
  botDisconnect: () => API.post('/bot/disconnect'),
  botSendMessage: (phone, message) => API.post('/bot/send-message', { phone, message }),
  botSettings: () => API.get('/bot/settings'),
  updateBotSettings: (data) => API.put('/bot/settings', data),

  // Users
  getUsers: (params = {}) => API.get(`/users?${new URLSearchParams(params)}`),
  getUser: (phone) => API.get(`/users/${phone}`),
  approveUser: (phone) => API.post(`/users/${phone}/approve`),
  banUser: (phone) => API.post(`/users/${phone}/ban`),
  unbanUser: (phone) => API.post(`/users/${phone}/unban`),
  updateBalance: (phone, amount, type, description) =>
    API.post(`/users/${phone}/balance`, { amount, type, description }),
  deleteUser: (phone) => API.del(`/users/${phone}`),

  // Products
  getProducts: (params = {}) => API.get(`/products?${new URLSearchParams(params)}`),
  getProduct: (id) => API.get(`/products/${id}`),
  createProduct: (data) => API.post('/products', data),
  updateProduct: (id, data) => API.put(`/products/${id}`, data),
  deleteProduct: (id) => API.del(`/products/${id}`),
  toggleProduct: (id) => API.patch(`/products/${id}/toggle`),

  // Orders
  getOrders: (params = {}) => API.get(`/orders?${new URLSearchParams(params)}`),
  getOrderStats: () => API.get('/orders/stats'),
  getOrder: (id) => API.get(`/orders/${id}`),
  retryOrder: (id) => API.post(`/orders/${id}/retry`),
  cancelOrder: (id, reason) => API.post(`/orders/${id}/cancel`, { reason }),
  updateOrderStatus: (id, status) => API.patch(`/orders/${id}/status`, { status }),
};
