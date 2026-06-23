const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
} = require('@whiskeysockets/baileys');

const path = require('path');
const fs = require('fs');
const pino = require('pino');
const logger = require('../utils/logger');
const messageHandler = require('./messageHandler');
const adminResponseHandler = require('./adminResponseHandler');

let sock = null;
let qrCallback = null;
let connectionStatus = 'disconnected';
let io = null;

const AUTH_DIR = path.join(process.cwd(), 'auth_info');

const getBotInstance = () => sock;
const getConnectionStatus = () => connectionStatus;

const setQRCallback = (cb) => {
  qrCallback = cb;
};

const setSocketIO = (socketIO) => {
  io = socketIO;
};

const emitStatus = (status, data = {}) => {
  connectionStatus = status;
  if (io) {
    io.emit('bot_status', { status, ...data });
  }
};

const connectWhatsApp = async () => {
  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    logger.info(`Using Baileys v${version.join('.')}`);

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: true,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
      },
      generateHighQualityLinkPreview: false,
      shouldIgnoreJid: (jid) => isJidBroadcast(jid),
      getMessage: async () => ({ conversation: '' }),
    });

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.info('New QR code generated');
        emitStatus('qr', { qr });
        if (qrCallback) qrCallback(qr);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        logger.warn(`Connection closed. Status: ${statusCode}. Reconnecting: ${shouldReconnect}`);
        emitStatus('disconnected', { statusCode });

        if (shouldReconnect) {
          setTimeout(() => connectWhatsApp(), 5000);
        } else {
          logger.error('Logged out from WhatsApp. Please scan QR again.');
          // Clear auth files to force re-scan
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true });
          }
          setTimeout(() => connectWhatsApp(), 3000);
        }
      } else if (connection === 'open') {
        logger.info('WhatsApp connection established!');
        emitStatus('connected');
      } else if (connection === 'connecting') {
        emitStatus('connecting');
      }
    });

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;

        try {
          const jid = msg.key.remoteJid;
          const senderNumber = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');

          // Check if message is from an admin (response to order)
          const Settings = require('../models/Settings');
          const globalAdmin = await Settings.get('global_admin', process.env.GLOBAL_ADMIN_NUMBER);
          
          // Get all product admins
          const Product = require('../models/Product');
          const products = await Product.find({ status: 'active' });
          const allAdmins = new Set([globalAdmin]);
          products.forEach(p => p.assigned_admins.forEach(a => allAdmins.add(a)));

          const cleanSender = senderNumber.replace(/[^0-9]/g, '');
          const isFromAdmin = [...allAdmins].some(a => 
            a && a.replace(/[^0-9]/g, '') === cleanSender
          );

          if (isFromAdmin) {
            await adminResponseHandler.handle(sock, msg, senderNumber);
          } else {
            await messageHandler.handle(sock, msg, senderNumber);
          }
        } catch (err) {
          logger.error('Error processing message:', err);
        }
      }
    });

    return sock;
  } catch (error) {
    logger.error('Failed to connect WhatsApp:', error);
    emitStatus('error', { message: error.message });
    setTimeout(() => connectWhatsApp(), 10000);
  }
};

const sendMessage = async (jid, content) => {
  if (!sock) throw new Error('Bot not connected');
  const formattedJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
  return sock.sendMessage(formattedJid, content);
};

const sendText = async (jid, text) => {
  return sendMessage(jid, { text });
};

const sendFile = async (jid, filePath, fileName, caption = '', mimeType) => {
  if (!sock) throw new Error('Bot not connected');
  
  const fileBuffer = fs.readFileSync(filePath);
  const formattedJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;

  if (mimeType && mimeType.startsWith('image/')) {
    return sock.sendMessage(formattedJid, {
      image: fileBuffer,
      caption,
    });
  } else {
    return sock.sendMessage(formattedJid, {
      document: fileBuffer,
      fileName,
      mimetype: mimeType || 'application/octet-stream',
      caption,
    });
  }
};

const disconnectBot = async () => {
  if (sock) {
    await sock.logout();
    sock = null;
    emitStatus('disconnected');
  }
};

const restartBot = async () => {
  logger.info('Restarting WhatsApp bot...');
  if (sock) {
    sock.end();
    sock = null;
  }
  emitStatus('restarting');
  setTimeout(() => connectWhatsApp(), 2000);
};

module.exports = {
  connectWhatsApp,
  getBotInstance,
  getConnectionStatus,
  setQRCallback,
  setSocketIO,
  sendText,
  sendFile,
  sendMessage,
  disconnectBot,
  restartBot,
};
