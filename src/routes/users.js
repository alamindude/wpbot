const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// GET /api/users — list users
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { phone_number: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await User.countDocuments(query);

    res.json({ success: true, users, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// GET /api/users/:phone
router.get('/:phone', authenticate, async (req, res) => {
  try {
    const user = await User.findOne({ phone_number: req.params.phone });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const orders = await Order.find({ user_number: req.params.phone })
      .sort({ createdAt: -1 })
      .limit(20);

    const transactions = await Transaction.find({ user_number: req.params.phone })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ success: true, user, orders, transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
});

// POST /api/users/:phone/approve
router.post('/:phone/approve', authenticate, async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { phone_number: req.params.phone },
      { status: 'approved' },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Notify user via WhatsApp
    try {
      const { sendText } = require('../bot/whatsapp');
      await sendText(
        `${req.params.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`,
        `✅ *Account Approved!*\n\nYour account has been approved. You can now:\n• Type */list* to view products\n• Type */balance* to check your balance`
      );
    } catch (e) {
      logger.warn('Could not send approval notification:', e.message);
    }

    logger.info(`User ${req.params.phone} approved by admin ${req.admin.username}`);
    res.json({ success: true, message: 'User approved', user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to approve user' });
  }
});

// POST /api/users/:phone/ban
router.post('/:phone/ban', authenticate, async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { phone_number: req.params.phone },
      { status: 'banned' },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    logger.info(`User ${req.params.phone} banned by admin ${req.admin.username}`);
    res.json({ success: true, message: 'User banned', user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to ban user' });
  }
});

// POST /api/users/:phone/unban
router.post('/:phone/unban', authenticate, async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { phone_number: req.params.phone },
      { status: 'approved' },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User unbanned', user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to unban user' });
  }
});

// POST /api/users/:phone/balance
router.post('/:phone/balance', authenticate, async (req, res) => {
  try {
    const { amount, type, description } = req.body;

    if (!amount || !type || !['credit', 'debit'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Valid amount and type (credit/debit) required' });
    }

    const user = await User.findOne({ phone_number: req.params.phone });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const balanceBefore = user.balance;

    if (type === 'credit') {
      user.balance += Number(amount);
    } else {
      if (user.balance < Number(amount)) {
        return res.status(400).json({ success: false, message: 'Insufficient balance' });
      }
      user.balance -= Number(amount);
    }

    await user.save();

    await Transaction.create({
      user_number: req.params.phone,
      type,
      amount: Number(amount),
      balance_before: balanceBefore,
      balance_after: user.balance,
      description: description || `Manual ${type} by admin`,
      performed_by: req.admin.username,
    });

    // Notify user
    try {
      const { sendText } = require('../bot/whatsapp');
      const sign = type === 'credit' ? '+' : '-';
      await sendText(
        `${req.params.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`,
        `💰 *Balance Update*\n\n${sign}${amount} ${type === 'credit' ? 'added to' : 'deducted from'} your balance.\n\n` +
          `New Balance: *${user.balance}*\n` +
          `Reason: ${description || `Manual ${type}`}`
      );
    } catch (e) {
      logger.warn('Could not send balance notification:', e.message);
    }

    logger.info(`Balance ${type} ${amount} for user ${req.params.phone} by ${req.admin.username}`);
    res.json({ success: true, message: `Balance ${type}ed successfully`, user });
  } catch (error) {
    logger.error('Balance update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update balance' });
  }
});

// DELETE /api/users/:phone
router.delete('/:phone', authenticate, async (req, res) => {
  try {
    await User.findOneAndDelete({ phone_number: req.params.phone });
    logger.info(`User ${req.params.phone} deleted by ${req.admin.username}`);
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

module.exports = router;
