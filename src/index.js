require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const connectDB = require('../config/database');
const logger = require('./utils/logger');
const { apiLimiter } = require('./middleware/rateLimiter');

// Bot & Routes
const { connectWhatsApp, setQRCallback, setSocketIO } = require('./bot/whatsapp');
const { router: botRouter, setCurrentQR } = require('./routes/bot');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ─── Security & Middleware ───────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? process.env.BASE_URL : '*' }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(apiLimiter);

// ─── Static Files ────────────────────────────────────────────────────────────
const adminPanelPath = path.join(__dirname, '../admin-panel/public');
app.use(express.static(adminPanelPath));

// Serve uploaded files (protected in production)
const filesDir = process.env.FILES_DIR || path.join(process.cwd(), 'files');
if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/bot', botRouter);

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ─── Admin Panel SPA Fallback ────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(adminPanelPath, 'index.html'));
  } else {
    res.status(404).json({ success: false, message: 'Route not found' });
  }
});

// ─── Socket.IO ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  logger.info('Admin panel connected via WebSocket');
  socket.on('disconnect', () => logger.info('Admin panel disconnected'));
});

setSocketIO(io);

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── Startup ─────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await connectDB();

    // Seed default admin if not exists
    await seedDefaultAdmin();

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Admin panel: http://localhost:${PORT}`);
    });

    // Start WhatsApp bot
    setQRCallback((qr) => {
      setCurrentQR(qr);
      io.emit('bot_qr', { qr });
      logger.info('QR code ready for scanning');
    });

    logger.info('Starting WhatsApp bot...');
    await connectWhatsApp();
  } catch (err) {
    logger.error('Startup failed:', err);
    process.exit(1);
  }
};

const seedDefaultAdmin = async () => {
  const AdminUser = require('./models/AdminUser');
  const count = await AdminUser.countDocuments();
  if (count === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    await AdminUser.create({ username, password, role: 'superadmin' });
    logger.info(`Default admin created: ${username}`);
  }
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

start();
