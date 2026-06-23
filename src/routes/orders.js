const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// GET /api/orders
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, user_number, product_id, from, to } = req.query;

    const query = {};
    if (status) query.status = status;
    if (user_number) query.user_number = user_number;
    if (product_id) query.product_id = product_id;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      orders,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

// GET /api/orders/stats
router.get('/stats', authenticate, async (req, res) => {
  try {
    const [total, pending, processing, completed, failed] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'processing' }),
      Order.countDocuments({ status: 'completed' }),
      Order.countDocuments({ status: 'failed' }),
    ]);

    // Revenue (from completed orders)
    const revenueAgg = await Order.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$price' } } },
    ]);

    const revenue = revenueAgg[0]?.total || 0;

    // Total users
    const totalUsers = await User.countDocuments();
    const approvedUsers = await User.countDocuments({ status: 'approved' });
    const pendingUsers = await User.countDocuments({ status: 'pending' });

    // Orders today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ordersToday = await Order.countDocuments({ createdAt: { $gte: today } });

    res.json({
      success: true,
      stats: {
        orders: { total, pending, processing, completed, failed, today: ordersToday },
        revenue,
        users: { total: totalUsers, approved: approvedUsers, pending: pendingUsers },
      },
    });
  } catch (error) {
    logger.error('Stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// GET /api/orders/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const order = await Order.findOne({ order_id: req.params.id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch order' });
  }
});

// POST /api/orders/:id/retry
router.post('/:id/retry', authenticate, async (req, res) => {
  try {
    const order = await Order.findOne({ order_id: req.params.id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (!['failed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Only failed/cancelled orders can be retried' });
    }

    // Re-forward to admin
    const Product = require('../models/Product');
    const product = await Product.findOne({ product_id: order.product_id });
    const user = await User.findOne({ phone_number: order.user_number });

    if (!product || !user) {
      return res.status(400).json({ success: false, message: 'Product or user not found' });
    }

    await Order.findByIdAndUpdate(order._id, {
      status: 'processing',
      retry_count: order.retry_count + 1,
      failure_reason: null,
      forwarded_at: new Date(),
    });

    // Re-send to admin
    try {
      const { sendText } = require('../bot/whatsapp');
      const adminJid = `${order.assigned_admin.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
      await sendText(
        adminJid,
        `🔄 *RETRY ORDER - ${order.order_id}*\n${'─'.repeat(35)}\n\n` +
          `👤 User: ${order.user_number}\n` +
          `📌 Product: ${order.product_name}\n` +
          `💰 Price: ${order.price}\n` +
          `📝 Input: ${order.input_data || 'None'}\n` +
          `🔄 Retry #${order.retry_count + 1}\n\n` +
          `⚡ Reply to this message with the order response.`
      );
    } catch (e) {
      logger.warn('Failed to send retry to admin:', e.message);
    }

    logger.info(`Order ${order.order_id} retried by ${req.admin.username}`);
    res.json({ success: true, message: 'Order retried', order });
  } catch (error) {
    logger.error('Retry order error:', error);
    res.status(500).json({ success: false, message: 'Failed to retry order' });
  }
});

// POST /api/orders/:id/cancel
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const order = await Order.findOne({ order_id: req.params.id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Cannot cancel a completed order' });
    }

    await Order.findByIdAndUpdate(order._id, {
      status: 'cancelled',
      failure_reason: req.body.reason || 'Cancelled by admin',
    });

    // Refund balance
    const user = await User.findOne({ phone_number: order.user_number });
    if (user) {
      const balanceBefore = user.balance;
      user.balance += order.price;
      await user.save();

      await Transaction.create({
        user_number: order.user_number,
        type: 'refund',
        amount: order.price,
        balance_before: balanceBefore,
        balance_after: user.balance,
        description: `Refund for cancelled order ${order.order_id}`,
        order_id: order.order_id,
        performed_by: req.admin.username,
      });

      // Notify user
      try {
        const { sendText } = require('../bot/whatsapp');
        await sendText(
          `${order.user_number.replace(/[^0-9]/g, '')}@s.whatsapp.net`,
          `🔄 *Order Cancelled*\n\nOrder *${order.order_id}* has been cancelled.\nRefund of *${order.price}* has been added to your balance.\n\nNew Balance: *${user.balance}*`
        );
      } catch (e) {
        logger.warn('Could not notify user of cancellation:', e.message);
      }
    }

    logger.info(`Order ${order.order_id} cancelled by ${req.admin.username}`);
    res.json({ success: true, message: 'Order cancelled and refunded' });
  } catch (error) {
    logger.error('Cancel order error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
});

// PATCH /api/orders/:id/status
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findOneAndUpdate(
      { order_id: req.params.id },
      { status, ...(status === 'completed' ? { completed_at: new Date() } : {}) },
      { new: true }
    );

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update order status' });
  }
});

module.exports = router;
