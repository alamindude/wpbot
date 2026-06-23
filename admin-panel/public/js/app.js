// ═══════════════════════════════════════════════════════
// WhatsApp Bot Admin Panel - Main App
// ═══════════════════════════════════════════════════════

let socket = null;
let currentPage = 'dashboard';
let botStatus = 'disconnected';

// ── Toast Notifications ──────────────────────────────
function toast(msg, type = 'info') {
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Modal ────────────────────────────────────────────
function showModal(title, bodyHTML, footerHTML = '') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-footer').innerHTML = footerHTML;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ── Status Badge ─────────────────────────────────────
function updateBotStatusUI(status) {
  botStatus = status;
  const dot = document.getElementById('bot-dot');
  const txt = document.getElementById('bot-status-text');
  const badge = document.getElementById('bot-status-badge');

  dot.className = 'bot-status-dot ' + status;
  txt.textContent = status.charAt(0).toUpperCase() + status.slice(1);

  const cls = status === 'connected' ? 'online' : status === 'connecting' || status === 'qr' ? 'connecting' : 'offline';
  if (badge) badge.className = 'nav-badge ' + cls;
}

// ── Loading Spinner ──────────────────────────────────
function loadingHTML(msg = 'Loading...') {
  return `<div class="loading"><i class="fas fa-circle-notch"></i>${msg}</div>`;
}

// ── Badge HTML ───────────────────────────────────────
function statusBadge(status) {
  const map = {
    approved: 'success', active: 'success', completed: 'success', connected: 'success',
    pending: 'warning', processing: 'warning', connecting: 'warning',
    banned: 'danger', failed: 'danger', inactive: 'danger', disconnected: 'danger',
    cancelled: 'muted',
  };
  return `<span class="badge badge-${map[status] || 'muted'}">${status}</span>`;
}

// ── Page Router ──────────────────────────────────────
function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });

  const titles = {
    dashboard: 'Dashboard', 'bot-control': 'Bot Control', users: 'Users',
    products: 'Products', orders: 'Orders', settings: 'Settings',
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  const area = document.getElementById('content-area');
  area.innerHTML = loadingHTML();

  const pages = { dashboard: renderDashboard, 'bot-control': renderBotControl, users: renderUsers, products: renderProducts, orders: renderOrders, settings: renderSettings };
  if (pages[page]) pages[page](area);
}

// ════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════
async function renderDashboard(area) {
  const data = await API.getOrderStats();
  if (!data?.success) { area.innerHTML = '<div class="card">Failed to load stats.</div>'; return; }

  const s = data.stats;
  area.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card green"><i class="fas fa-shopping-cart stat-icon text-success"></i><div class="stat-value">${s.orders.total}</div><div class="stat-label">Total Orders</div></div>
      <div class="stat-card orange"><i class="fas fa-clock stat-icon text-warning"></i><div class="stat-value">${s.orders.pending + s.orders.processing}</div><div class="stat-label">Pending</div></div>
      <div class="stat-card blue"><i class="fas fa-check-circle stat-icon text-success"></i><div class="stat-value">${s.orders.completed}</div><div class="stat-label">Completed</div></div>
      <div class="stat-card red"><i class="fas fa-times-circle stat-icon text-danger"></i><div class="stat-value">${s.orders.failed}</div><div class="stat-label">Failed</div></div>
      <div class="stat-card green"><i class="fas fa-dollar-sign stat-icon text-success"></i><div class="stat-value">${s.revenue}</div><div class="stat-label">Revenue</div></div>
      <div class="stat-card blue"><i class="fas fa-users stat-icon" style="color:var(--info)"></i><div class="stat-value">${s.users.total}</div><div class="stat-label">Total Users</div></div>
      <div class="stat-card orange"><i class="fas fa-user-clock stat-icon text-warning"></i><div class="stat-value">${s.users.pending}</div><div class="stat-label">Pending Users</div></div>
      <div class="stat-card green"><i class="fas fa-calendar-day stat-icon text-success"></i><div class="stat-value">${s.orders.today}</div><div class="stat-label">Orders Today</div></div>
    </div>

    <div class="card">
      <div class="card-title"><i class="fas fa-clock text-warning"></i> Recent Pending Orders</div>
      <div id="recent-orders-wrap">${loadingHTML()}</div>
    </div>

    <div class="card">
      <div class="card-title"><i class="fas fa-user-clock text-warning"></i> Pending User Approvals</div>
      <div id="pending-users-wrap">${loadingHTML()}</div>
    </div>
  `;

  // Load recent pending orders
  const ordersData = await API.getOrders({ status: 'processing', limit: 8 });
  const ow = document.getElementById('recent-orders-wrap');
  if (ordersData?.orders?.length > 0) {
    ow.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Order ID</th><th>User</th><th>Product</th><th>Price</th><th>Status</th><th>Time</th></tr></thead>
      <tbody>${ordersData.orders.map(o => `
        <tr><td><strong>${o.order_id}</strong></td><td>${o.user_number}</td><td>${o.product_name}</td>
        <td>${o.price}</td><td>${statusBadge(o.status)}</td>
        <td>${timeAgo(o.createdAt)}</td></tr>
      `).join('')}</tbody>
    </table></div>`;
  } else {
    ow.innerHTML = '<p class="text-muted text-center" style="padding:16px">No pending orders</p>';
  }

  // Load pending users
  const usersData = await API.getUsers({ status: 'pending', limit: 8 });
  const uw = document.getElementById('pending-users-wrap');
  if (usersData?.users?.length > 0) {
    uw.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Phone</th><th>Registered</th><th>Action</th></tr></thead>
      <tbody>${usersData.users.map(u => `
        <tr><td>${u.phone_number}</td><td>${timeAgo(u.createdAt)}</td>
        <td><button class="btn btn-primary btn-sm" onclick="approveUser('${u.phone_number}')">Approve</button></td></tr>
      `).join('')}</tbody>
    </table></div>`;
  } else {
    uw.innerHTML = '<p class="text-muted text-center" style="padding:16px">No pending users</p>';
  }
}

// ════════════════════════════════════════════════════
// BOT CONTROL
// ════════════════════════════════════════════════════
async function renderBotControl(area) {
  const statusData = await API.botStatus();

  area.innerHTML = `
    <div class="bot-control-grid">
      <div class="card">
        <div class="card-title"><i class="fab fa-whatsapp text-success"></i> Connection Status</div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <div class="bot-status-dot ${statusData?.status || 'disconnected'}" style="width:14px;height:14px"></div>
          <strong style="font-size:16px">${(statusData?.status || 'Unknown').toUpperCase()}</strong>
          ${statusData?.is_paused ? '<span class="badge badge-warning">PAUSED</span>' : ''}
        </div>

        <div class="control-btn-grid">
          <button class="control-btn green" onclick="restartBot()"><i class="fas fa-redo"></i>Restart</button>
          <button class="control-btn" onclick="showQR()"><i class="fas fa-qrcode"></i>Show QR</button>
          <button class="control-btn orange" onclick="pauseBot()"><i class="fas fa-pause"></i>Pause</button>
          <button class="control-btn green" onclick="resumeBot()"><i class="fas fa-play"></i>Resume</button>
          <button class="control-btn red" onclick="disconnectBot()"><i class="fas fa-power-off"></i>Disconnect</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><i class="fas fa-paper-plane text-info"></i> Send Message</div>
        <div class="form-group"><label>Phone Number</label><input type="text" id="msg-phone" placeholder="+1234567890" /></div>
        <div class="form-group"><label>Message</label><textarea id="msg-text" placeholder="Type your message..." rows="4"></textarea></div>
        <button class="btn btn-primary" onclick="sendManualMessage()"><i class="fas fa-paper-plane"></i> Send</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><i class="fas fa-cog"></i> Global Admin Setting</div>
      <div style="display:flex;gap:10px;align-items:flex-end">
        <div class="form-group" style="flex:1;margin:0">
          <label>Global Fallback Admin Number</label>
          <input type="text" id="global-admin-input" placeholder="+1234567890" value="${statusData?.global_admin || ''}" />
        </div>
        <button class="btn btn-primary" onclick="updateGlobalAdmin()"><i class="fas fa-save"></i> Save</button>
      </div>
    </div>
  `;
}

async function restartBot() {
  if (!confirm('Restart the WhatsApp bot?')) return;
  const res = await API.botRestart();
  toast(res?.message || 'Bot restarting...', res?.success ? 'info' : 'error');
}

async function showQR() {
  showModal('Scan QR Code', loadingHTML('Generating QR...'));
  const res = await API.botQR();
  if (res?.success) {
    document.getElementById('modal-body').innerHTML = `
      <div class="qr-container">
        <img src="${res.qr}" alt="QR Code" />
        <p class="text-muted mt-1" style="font-size:13px">Scan this code with WhatsApp to connect the bot</p>
      </div>`;
  } else {
    document.getElementById('modal-body').innerHTML = `<p class="text-muted text-center">${res?.message || 'No QR code available. Bot may already be connected.'}</p>`;
  }
  document.getElementById('modal-footer').innerHTML = `<button class="btn btn-ghost" onclick="closeModal()">Close</button>`;
}

async function pauseBot() {
  const res = await API.botPause();
  toast(res?.message || 'Bot paused', res?.success ? 'warning' : 'error');
}

async function resumeBot() {
  const res = await API.botResume();
  toast(res?.message || 'Bot resumed', res?.success ? 'success' : 'error');
}

async function disconnectBot() {
  if (!confirm('Disconnect the WhatsApp bot? You will need to scan QR again.')) return;
  const res = await API.botDisconnect();
  toast(res?.message || 'Disconnected', res?.success ? 'info' : 'error');
}

async function sendManualMessage() {
  const phone = document.getElementById('msg-phone').value.trim();
  const message = document.getElementById('msg-text').value.trim();
  if (!phone || !message) return toast('Phone and message required', 'error');
  const res = await API.botSendMessage(phone, message);
  if (res?.success) { toast('Message sent!', 'success'); document.getElementById('msg-text').value = ''; }
  else toast(res?.message || 'Failed', 'error');
}

async function updateGlobalAdmin() {
  const val = document.getElementById('global-admin-input').value.trim();
  const res = await API.updateBotSettings({ global_admin: val });
  toast(res?.message || (res?.success ? 'Saved' : 'Failed'), res?.success ? 'success' : 'error');
}

// ════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════
let userPage = 1;
async function renderUsers(area, page = 1, search = '', status = '') {
  userPage = page;
  area.innerHTML = `
    <div class="toolbar">
      <div class="search-box"><i class="fas fa-search"></i><input type="text" id="user-search" placeholder="Search phone or name..." value="${search}" oninput="debounceUserSearch(this.value)" /></div>
      <select id="user-status-filter" onchange="renderUsers(document.getElementById('content-area'),1,document.getElementById('user-search').value,this.value)">
        <option value="" ${!status ? 'selected' : ''}>All Status</option>
        <option value="pending" ${status==='pending'?'selected':''}>Pending</option>
        <option value="approved" ${status==='approved'?'selected':''}>Approved</option>
        <option value="banned" ${status==='banned'?'selected':''}>Banned</option>
      </select>
      <button class="btn btn-primary" onclick="showAddUserModal()"><i class="fas fa-plus"></i> Add User</button>
    </div>
    <div class="card"><div id="users-table">${loadingHTML()}</div></div>
  `;

  const data = await API.getUsers({ page, limit: 20, search, status });
  const wrap = document.getElementById('users-table');
  if (!data?.success) { wrap.innerHTML = '<p class="text-danger">Failed to load users</p>'; return; }

  if (data.users.length === 0) { wrap.innerHTML = '<p class="text-muted text-center" style="padding:20px">No users found</p>'; return; }

  wrap.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Phone</th><th>Name</th><th>Balance</th><th>Status</th><th>Registered</th><th>Actions</th></tr></thead>
      <tbody>${data.users.map(u => `
        <tr>
          <td><strong>${u.phone_number}</strong></td>
          <td>${u.name || '—'}</td>
          <td><strong>${u.balance}</strong></td>
          <td>${statusBadge(u.status)}</td>
          <td>${timeAgo(u.createdAt)}</td>
          <td>
            <div style="display:flex;gap:5px;flex-wrap:wrap">
              ${u.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="approveUser('${u.phone_number}')"><i class="fas fa-check"></i></button>` : ''}
              ${u.status !== 'banned' ? `<button class="btn btn-danger btn-sm" onclick="banUser('${u.phone_number}')"><i class="fas fa-ban"></i></button>` : `<button class="btn btn-info btn-sm" onclick="unbanUser('${u.phone_number}')"><i class="fas fa-unlock"></i></button>`}
              <button class="btn btn-ghost btn-sm" onclick="showBalanceModal('${u.phone_number}', ${u.balance})"><i class="fas fa-wallet"></i></button>
              <button class="btn btn-ghost btn-sm" onclick="viewUser('${u.phone_number}')"><i class="fas fa-eye"></i></button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    ${renderPagination(page, data.totalPages, (p) => `renderUsers(document.getElementById('content-area'),${p},'${search}','${status}')`)}
  `;
}

let userSearchTimeout;
function debounceUserSearch(val) {
  clearTimeout(userSearchTimeout);
  userSearchTimeout = setTimeout(() => {
    const status = document.getElementById('user-status-filter')?.value || '';
    renderUsers(document.getElementById('content-area'), 1, val, status);
  }, 400);
}

async function approveUser(phone) {
  const res = await API.approveUser(phone);
  toast(res?.message || (res?.success ? 'Approved' : 'Failed'), res?.success ? 'success' : 'error');
  if (res?.success) refreshCurrentPage();
}

async function banUser(phone) {
  if (!confirm(`Ban user ${phone}?`)) return;
  const res = await API.banUser(phone);
  toast(res?.message || (res?.success ? 'Banned' : 'Failed'), res?.success ? 'warning' : 'error');
  if (res?.success) refreshCurrentPage();
}

async function unbanUser(phone) {
  const res = await API.unbanUser(phone);
  toast(res?.message || (res?.success ? 'Unbanned' : 'Failed'), res?.success ? 'success' : 'error');
  if (res?.success) refreshCurrentPage();
}

function showBalanceModal(phone, currentBalance) {
  showModal('Update Balance', `
    <p style="margin-bottom:16px">Current Balance: <strong>${currentBalance}</strong></p>
    <div class="form-group"><label>Type</label>
      <select id="bal-type"><option value="credit">Credit (+)</option><option value="debit">Debit (-)</option></select>
    </div>
    <div class="form-group"><label>Amount</label><input type="number" id="bal-amount" placeholder="100" min="1" /></div>
    <div class="form-group"><label>Description</label><input type="text" id="bal-desc" placeholder="Manual top-up" /></div>
  `, `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitBalance('${phone}')">Update</button>`);
}

async function submitBalance(phone) {
  const amount = document.getElementById('bal-amount').value;
  const type = document.getElementById('bal-type').value;
  const desc = document.getElementById('bal-desc').value;
  if (!amount || amount <= 0) return toast('Enter valid amount', 'error');
  const res = await API.updateBalance(phone, amount, type, desc);
  toast(res?.message || (res?.success ? 'Updated' : 'Failed'), res?.success ? 'success' : 'error');
  if (res?.success) { closeModal(); refreshCurrentPage(); }
}

async function viewUser(phone) {
  showModal('User Details', loadingHTML());
  const data = await API.getUser(phone);
  if (!data?.success) { document.getElementById('modal-body').innerHTML = '<p class="text-danger">Failed to load user</p>'; return; }
  const u = data.user;
  document.getElementById('modal-body').innerHTML = `
    <div class="two-col" style="margin-bottom:16px">
      <div><strong>Phone:</strong><br>${u.phone_number}</div>
      <div><strong>Status:</strong><br>${statusBadge(u.status)}</div>
      <div><strong>Balance:</strong><br><strong style="color:var(--green)">${u.balance}</strong></div>
      <div><strong>Registered:</strong><br>${new Date(u.createdAt).toLocaleDateString()}</div>
    </div>
    <strong>Recent Orders (${data.orders.length})</strong>
    ${data.orders.slice(0,5).map(o => `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">${o.order_id} — ${o.product_name} — ${statusBadge(o.status)}</div>`).join('') || '<p class="text-muted">No orders</p>'}
  `;
  document.getElementById('modal-footer').innerHTML = `<button class="btn btn-ghost" onclick="closeModal()">Close</button>`;
}

function showAddUserModal() {
  toast('Users register automatically via WhatsApp /start command', 'info');
}

// ════════════════════════════════════════════════════
// PRODUCTS
// ════════════════════════════════════════════════════
async function renderProducts(area) {
  area.innerHTML = `
    <div class="toolbar">
      <div style="flex:1"></div>
      <button class="btn btn-primary" onclick="showProductModal()"><i class="fas fa-plus"></i> Add Product</button>
    </div>
    <div class="card"><div id="products-table">${loadingHTML()}</div></div>
  `;

  const data = await API.getProducts();
  const wrap = document.getElementById('products-table');
  if (!data?.success) { wrap.innerHTML = '<p class="text-danger">Failed to load products</p>'; return; }

  if (data.products.length === 0) {
    wrap.innerHTML = `<div class="text-center" style="padding:40px"><i class="fas fa-box" style="font-size:48px;color:var(--text-muted);display:block;margin-bottom:16px"></i><p class="text-muted">No products yet</p><button class="btn btn-primary mt-2" onclick="showProductModal()">Add First Product</button></div>`;
    return;
  }

  wrap.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Name</th><th>Shortcode</th><th>Price</th><th>Admins</th><th>Orders</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${data.products.map(p => `
      <tr>
        <td><strong>${p.product_name}</strong><br><small class="text-muted">${p.description || ''}</small></td>
        <td><code>/${p.shortcode}</code></td>
        <td><strong>${p.price}</strong></td>
        <td>${p.assigned_admins?.length || 0} admin(s)</td>
        <td>${p.total_orders || 0}</td>
        <td>${statusBadge(p.status)}</td>
        <td>
          <div style="display:flex;gap:5px">
            <button class="btn btn-ghost btn-sm" onclick="showProductModal('${p.product_id}')"><i class="fas fa-edit"></i></button>
            <button class="btn btn-ghost btn-sm" onclick="toggleProduct('${p.product_id}')"><i class="fas fa-power-off"></i></button>
            <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.product_id}', '${p.product_name}')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

async function showProductModal(productId = null) {
  let product = null;
  if (productId) {
    const data = await API.getProduct(productId);
    product = data?.product;
  }

  showModal(product ? 'Edit Product' : 'Add Product', `
    <div class="form-group"><label>Product Name *</label><input type="text" id="p-name" value="${product?.product_name || ''}" placeholder="Premium Box" /></div>
    <div class="two-col">
      <div class="form-group"><label>Shortcode (no /) *</label><input type="text" id="p-code" value="${product?.shortcode || ''}" placeholder="premiumbox" /></div>
      <div class="form-group"><label>Price *</label><input type="number" id="p-price" value="${product?.price || ''}" placeholder="100" min="0" /></div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="p-desc" rows="2">${product?.description || ''}</textarea></div>
    <div class="form-group"><label>Usage Example</label><input type="text" id="p-example" value="${product?.usage_example || ''}" placeholder="/premiumbox order details" /></div>
    <div class="form-group"><label>Assigned Admins (one per line)</label><textarea id="p-admins" rows="3" placeholder="+1234567890&#10;+0987654321">${(product?.assigned_admins || []).join('\n')}</textarea></div>
    <div class="form-group"><label>Routing Mode</label>
      <select id="p-routing">
        <option value="specific" ${product?.routing_mode==='specific'?'selected':''}>Specific Admin</option>
        <option value="load_balanced" ${product?.routing_mode==='load_balanced'?'selected':''}>Load Balanced</option>
        <option value="global_fallback" ${product?.routing_mode==='global_fallback'?'selected':''}>Global Fallback</option>
      </select>
    </div>
    <div class="form-group"><label>Status</label>
      <select id="p-status">
        <option value="active" ${!product || product.status==='active' ? 'selected':''}>Active</option>
        <option value="inactive" ${product?.status==='inactive'?'selected':''}>Inactive</option>
      </select>
    </div>
  `, `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="submitProduct('${productId || ''}')">
      ${productId ? 'Update' : 'Create'} Product
    </button>`);
}

async function submitProduct(productId) {
  const data = {
    product_name: document.getElementById('p-name').value.trim(),
    shortcode: document.getElementById('p-code').value.trim().replace('/', ''),
    price: Number(document.getElementById('p-price').value),
    description: document.getElementById('p-desc').value.trim(),
    usage_example: document.getElementById('p-example').value.trim(),
    assigned_admins: document.getElementById('p-admins').value.split('\n').map(s => s.trim()).filter(Boolean),
    routing_mode: document.getElementById('p-routing').value,
    status: document.getElementById('p-status').value,
  };

  if (!data.product_name || !data.shortcode || isNaN(data.price)) {
    return toast('Name, shortcode, and price are required', 'error');
  }

  const res = productId ? await API.updateProduct(productId, data) : await API.createProduct(data);
  toast(res?.message || (res?.success ? 'Saved' : 'Failed'), res?.success ? 'success' : 'error');
  if (res?.success) { closeModal(); renderProducts(document.getElementById('content-area')); }
}

async function toggleProduct(id) {
  const res = await API.toggleProduct(id);
  toast(res?.message || (res?.success ? 'Toggled' : 'Failed'), res?.success ? 'info' : 'error');
  if (res?.success) renderProducts(document.getElementById('content-area'));
}

async function deleteProduct(id, name) {
  if (!confirm(`Delete product "${name}"? This cannot be undone.`)) return;
  const res = await API.deleteProduct(id);
  toast(res?.message || (res?.success ? 'Deleted' : 'Failed'), res?.success ? 'success' : 'error');
  if (res?.success) renderProducts(document.getElementById('content-area'));
}

// ════════════════════════════════════════════════════
// ORDERS
// ════════════════════════════════════════════════════
let orderPage = 1;
async function renderOrders(area, page = 1, status = '') {
  orderPage = page;
  area.innerHTML = `
    <div class="toolbar">
      <select id="order-status-filter" onchange="renderOrders(document.getElementById('content-area'),1,this.value)">
        <option value="" ${!status?'selected':''}>All Status</option>
        <option value="pending" ${status==='pending'?'selected':''}>Pending</option>
        <option value="processing" ${status==='processing'?'selected':''}>Processing</option>
        <option value="completed" ${status==='completed'?'selected':''}>Completed</option>
        <option value="failed" ${status==='failed'?'selected':''}>Failed</option>
        <option value="cancelled" ${status==='cancelled'?'selected':''}>Cancelled</option>
      </select>
    </div>
    <div class="card"><div id="orders-table">${loadingHTML()}</div></div>
  `;

  const data = await API.getOrders({ page, limit: 20, status });
  const wrap = document.getElementById('orders-table');
  if (!data?.success) { wrap.innerHTML = '<p class="text-danger">Failed to load orders</p>'; return; }

  if (data.orders.length === 0) { wrap.innerHTML = '<p class="text-muted text-center" style="padding:20px">No orders found</p>'; return; }

  wrap.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Order ID</th><th>User</th><th>Product</th><th>Price</th><th>Admin</th><th>Status</th><th>Time</th><th>Actions</th></tr></thead>
    <tbody>${data.orders.map(o => `
      <tr>
        <td><strong>${o.order_id}</strong><br><small class="text-muted">${o.input_data?.slice(0,30) || ''}</small></td>
        <td>${o.user_number}</td>
        <td>${o.product_name}</td>
        <td>${o.price}</td>
        <td>${o.assigned_admin}</td>
        <td>${statusBadge(o.status)}</td>
        <td>${timeAgo(o.createdAt)}</td>
        <td>
          <div style="display:flex;gap:5px">
            ${['failed','cancelled'].includes(o.status) ? `<button class="btn btn-warning btn-sm" onclick="retryOrder('${o.order_id}')"><i class="fas fa-redo"></i></button>` : ''}
            ${!['completed','cancelled'].includes(o.status) ? `<button class="btn btn-danger btn-sm" onclick="cancelOrder('${o.order_id}')"><i class="fas fa-times"></i></button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="viewOrder('${o.order_id}')"><i class="fas fa-eye"></i></button>
          </div>
        </td>
      </tr>`).join('')}
    </tbody>
  </table></div>
  ${renderPagination(page, data.totalPages, (p) => `renderOrders(document.getElementById('content-area'),${p},'${status}')`)}`;
}

async function retryOrder(id) {
  const res = await API.retryOrder(id);
  toast(res?.message || (res?.success ? 'Retried' : 'Failed'), res?.success ? 'info' : 'error');
  if (res?.success) refreshCurrentPage();
}

async function cancelOrder(id) {
  if (!confirm(`Cancel order ${id} and refund user?`)) return;
  const reason = prompt('Reason (optional):', 'Cancelled by admin');
  const res = await API.cancelOrder(id, reason);
  toast(res?.message || (res?.success ? 'Cancelled' : 'Failed'), res?.success ? 'success' : 'error');
  if (res?.success) refreshCurrentPage();
}

async function viewOrder(id) {
  showModal('Order Details', loadingHTML());
  const data = await API.getOrder(id);
  if (!data?.success) { document.getElementById('modal-body').innerHTML = '<p class="text-danger">Not found</p>'; return; }
  const o = data.order;
  document.getElementById('modal-body').innerHTML = `
    <div class="two-col">
      <div><strong>Order ID</strong><br>${o.order_id}</div>
      <div><strong>Status</strong><br>${statusBadge(o.status)}</div>
      <div><strong>User</strong><br>${o.user_number}</div>
      <div><strong>Product</strong><br>${o.product_name}</div>
      <div><strong>Price</strong><br><strong>${o.price}</strong></div>
      <div><strong>Admin</strong><br>${o.assigned_admin}</div>
      <div><strong>Command</strong><br><code>${o.command}</code></div>
      <div><strong>Input</strong><br>${o.input_data || '—'}</div>
      <div><strong>Created</strong><br>${new Date(o.createdAt).toLocaleString()}</div>
      <div><strong>Completed</strong><br>${o.completed_at ? new Date(o.completed_at).toLocaleString() : '—'}</div>
    </div>
    ${o.failure_reason ? `<div class="error-msg mt-1"><i class="fas fa-exclamation-triangle"></i> ${o.failure_reason}</div>` : ''}
    ${o.response_data?.text ? `<div class="card" style="margin-top:12px;background:var(--bg3)"><strong>Response:</strong><br><p style="white-space:pre-wrap;margin-top:8px;font-size:13px">${o.response_data.text}</p></div>` : ''}
  `;
  document.getElementById('modal-footer').innerHTML = `<button class="btn btn-ghost" onclick="closeModal()">Close</button>`;
}

// ════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════
async function renderSettings(area) {
  const settings = await API.botSettings();
  area.innerHTML = `
    <div class="card">
      <div class="card-title"><i class="fas fa-cog"></i> System Settings</div>
      <div class="form-group"><label>Global Admin Number</label>
        <input type="text" id="s-global-admin" value="${settings?.settings?.global_admin || ''}" placeholder="+1234567890" />
      </div>
      <div class="form-group"><label>Welcome Message (optional)</label>
        <textarea id="s-welcome" rows="4">${settings?.settings?.welcome_message || ''}</textarea>
      </div>
      <button class="btn btn-primary" onclick="saveSettings()"><i class="fas fa-save"></i> Save Settings</button>
    </div>

    <div class="card">
      <div class="card-title"><i class="fas fa-lock"></i> Change Password</div>
      <div class="form-group"><label>Current Password</label><input type="password" id="s-cur-pass" /></div>
      <div class="form-group"><label>New Password</label><input type="password" id="s-new-pass" /></div>
      <button class="btn btn-primary" onclick="changePassword()"><i class="fas fa-key"></i> Change Password</button>
    </div>
  `;
}

async function saveSettings() {
  const data = {
    global_admin: document.getElementById('s-global-admin').value.trim(),
    welcome_message: document.getElementById('s-welcome').value.trim(),
  };
  const res = await API.updateBotSettings(data);
  toast(res?.message || (res?.success ? 'Saved' : 'Failed'), res?.success ? 'success' : 'error');
}

async function changePassword() {
  const currentPassword = document.getElementById('s-cur-pass').value;
  const newPassword = document.getElementById('s-new-pass').value;
  if (!currentPassword || !newPassword) return toast('Both fields required', 'error');
  const res = await API.post('/auth/change-password', { currentPassword, newPassword });
  toast(res?.message || (res?.success ? 'Password changed' : 'Failed'), res?.success ? 'success' : 'error');
  if (res?.success) { document.getElementById('s-cur-pass').value = ''; document.getElementById('s-new-pass').value = ''; }
}

// ── Pagination Helper ────────────────────────────────
function renderPagination(current, total, callbackStr) {
  if (total <= 1) return '';
  let html = '<div class="pagination">';
  html += `<button class="page-btn" ${current === 1 ? 'disabled' : ''} onclick="${callbackStr.replace('${p}', current - 1)}">‹</button>`;
  for (let i = Math.max(1, current - 2); i <= Math.min(total, current + 2); i++) {
    html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="${callbackStr.replace('${p}', i)}">${i}</button>`;
  }
  html += `<button class="page-btn" ${current === total ? 'disabled' : ''} onclick="${callbackStr.replace('${p}', current + 1)}">›</button>`;
  html += '</div>';
  return html;
}

// ── Time Ago ─────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function refreshCurrentPage() {
  navigateTo(currentPage);
}

// ════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Logging in...';

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');

    try {
      const res = await API.login(username, password);
      if (res?.success) {
        API.setToken(res.token);
        initApp(res.admin);
      } else {
        errEl.textContent = res?.message || 'Login failed';
        errEl.classList.remove('hidden');
      }
    } catch (e) {
      errEl.textContent = 'Network error. Please try again.';
      errEl.classList.remove('hidden');
    }

    btn.disabled = false;
    btn.innerHTML = '<span>Login</span>';
  });

  // Check if already logged in
  if (API.token) {
    const res = await API.me();
    if (res?.success) {
      initApp(res.admin);
    } else {
      API.setToken(null);
    }
  }
});

function initApp(admin) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('admin-name').textContent = admin.username;

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page) {
        navigateTo(page);
        // Close sidebar on mobile
        document.getElementById('sidebar').classList.remove('open');
      }
    });
  });

  // Mobile menu
  document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  document.getElementById('sidebar-close').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
  });

  // Modal close
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('Logout?')) {
      API.setToken(null);
      window.location.reload();
    }
  });

  // Socket.IO
  socket = io();
  socket.on('bot_status', (data) => {
    updateBotStatusUI(data.status);
  });
  socket.on('bot_qr', (data) => {
    updateBotStatusUI('qr');
  });

  // Load bot status
  API.botStatus().then(data => {
    if (data?.status) updateBotStatusUI(data.status);
  });

  // Load default page
  navigateTo('dashboard');

  // Refresh stats every 30s
  setInterval(() => {
    if (currentPage === 'dashboard') renderDashboard(document.getElementById('content-area'));
  }, 30000);
}
