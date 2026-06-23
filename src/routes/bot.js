const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { authenticate } = require('../middleware/auth');
const Settings = require('../models/Settings');
const logger = require('../utils/logger');

let currentQR = null;

const setCurrentQR = (qr) => {
  currentQR = qr;
};

// GET /api/bot/status
router.get('/status', authenticate, async (req, res) => {
  try {
    const { getConnectionStatus } = require('../bot/whatsapp');
    const isPaused = await Settings.get('bot_paused', false);
    const globalAdmin = await Settings.get('global_admin', process.env.GLOBAL_ADMIN_NUMBER);

    res.json({
      success: true,
      status: getConnectionStatus(),
      is_paused: isPaused,
      global_admin: globalAdmin,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get bot status' });
  }
});

// GET /api/bot/qr
router.get('/qr', authenticate, async (req, res) => {
  try {
    if (!currentQR) {
      return res.status(404).json({ success: false, message: 'No QR code available. Bot may already be connected.' });
    }
    const qrDataUrl = await QRCode.toDataURL(currentQR);
    res.json({ success: true, qr: qrDataUrl });
  } catch (error) {
    logger.error('QR code error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate QR code' });
  }
});

// POST /api/bot/restart
router.post('/restart', authenticate, async (req, res) => {
  try {
    const { restartBot } = require('../bot/whatsapp');
    logger.info(`Bot restart requested by ${req.admin.username}`);
    res.json({ success: true, message: 'Bot restarting...' });
    setTimeout(() => restartBot(), 500);
  } catch (error) {
    logger.error('Restart error:', error);
    res.status(500).json({ success: false, message: 'Failed to restart bot' });
  }
});

// POST /api/bot/pause
router.post('/pause', authenticate, async (req, res) => {
  try {
    await Settings.set('bot_paused', true, 'Bot processing paused');
    logger.info(`Bot paused by ${req.admin.username}`);
    res.json({ success: true, message: 'Bot processing paused' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to pause bot' });
  }
});

// POST /api/bot/resume
router.post('/resume', authenticate, async (req, res) => {
  try {
    await Settings.set('bot_paused', false, 'Bot processing resumed');
    logger.info(`Bot resumed by ${req.admin.username}`);
    res.json({ success: true, message: 'Bot processing resumed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to resume bot' });
  }
});

// POST /api/bot/disconnect
router.post('/disconnect', authenticate, async (req, res) => {
  try {
    const { disconnectBot } = require('../bot/whatsapp');
    await disconnectBot();
    currentQR = null;
    logger.info(`Bot disconnected by ${req.admin.username}`);
    res.json({ success: true, message: 'Bot disconnected' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to disconnect bot' });
  }
});

// POST /api/bot/send-message (manual message sending)
router.post('/send-message', authenticate, async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ success: false, message: 'phone and message required' });
    }

    const { sendText } = require('../bot/whatsapp');
    await sendText(`${phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`, message);

    logger.info(`Manual message sent to ${phone} by ${req.admin.username}`);
    res.json({ success: true, message: 'Message sent' });
  } catch (error) {
    logger.error('Send message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// GET /api/bot/settings
router.get('/settings', authenticate, async (req, res) => {
  try {
    const globalAdmin = await Settings.get('global_admin', process.env.GLOBAL_ADMIN_NUMBER);
    const botPaused = await Settings.get('bot_paused', false);
    const welcomeMessage = await Settings.get('welcome_message', '');

    res.json({
      success: true,
      settings: { global_admin: globalAdmin, bot_paused: botPaused, welcome_message: welcomeMessage },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get settings' });
  }
});

// PUT /api/bot/settings
router.put('/settings', authenticate, async (req, res) => {
  try {
    const { global_admin, welcome_message } = req.body;

    if (global_admin !== undefined) {
      await Settings.set('global_admin', global_admin, 'Global fallback admin number');
    }
    if (welcome_message !== undefined) {
      await Settings.set('welcome_message', welcome_message, 'Bot welcome message');
    }

    logger.info(`Settings updated by ${req.admin.username}`);
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
});

module.exports = { router, setCurrentQR };
