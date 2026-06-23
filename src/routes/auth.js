const express = require('express');
const router = express.Router();
const AdminUser = require('../models/AdminUser');
const { generateToken, authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const admin = await AdminUser.findOne({ username, is_active: true });
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    admin.last_login = new Date();
    await admin.save();

    const token = generateToken(admin._id);
    logger.info(`Admin ${username} logged in`);

    res.json({
      success: true,
      token,
      admin: { id: admin._id, username: admin.username, role: admin.role },
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({
    success: true,
    admin: {
      id: req.admin._id,
      username: req.admin.username,
      role: req.admin.role,
      last_login: req.admin.last_login,
    },
  });
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const admin = await AdminUser.findById(req.admin._id);
    if (!(await admin.comparePassword(currentPassword))) {
      return res.status(401).json({ success: false, message: 'Current password incorrect' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    admin.password = newPassword;
    await admin.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

module.exports = router;
