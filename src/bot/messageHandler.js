const logger = require('../utils/logger');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const { v4: uuidv4 } = require('uuid');
const { sendText, sendFile, sendMessage } = require('./whatsapp');

// Extract text from any message type
const extractText = (msg) => {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.documentMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  ).trim();
};

const handle = async (sock, msg, senderNumber) => {
  const jid = msg.key.remoteJid;
  const text = extractText(msg).toLowerCase();

  if (!text) return;

  logger.info(`Message from ${senderNumber}: ${text}`);

  // Update last active
  await User.findOneAndUpdate(
    { phone_number: senderNumber },
    { last_active: new Date() }
  );

  // Handle /start or /register
  if (text === '/start' || text === '/register' || text === 'hi' || text === 'hello') {
    return handleRegister(jid, senderNumber);
  }

  // Handle /list
  if (text === '/list' || text === '/products') {
    return handleProductList(jid, senderNumber);
  }

  // Handle /balance
  if (text === '/balance' || text === '/bal') {
    return handleBalance(jid, senderNumber);
  }

  // Handle /help
  if (text === '/help') {
    return handleHelp(jid);
  }

  // Handle /status {order_id}
  if (text.startsWith('/status')) {
    const orderId = text.split(' ')[1];
    return handleOrderStatus(jid, senderNumber, orderId);
  }

  // Handle /orders
  if (text === '/orders' || text === '/myorders') {
    return handleMyOrders(jid, senderNumber);
  }

  // Check if it's a product command
  if (text.startsWith('/')) {
    return handleProductCommand(jid, senderNumber, text, msg);
  }
};

const handleRegister = async (jid, senderNumber) => {
  let user = await User.findOne({ phone_number: senderNumber });

  if (!user) {
    user = await User.create({
      phone_number: senderNumber,
      status: 'pending',
    });

    await sendText(
      jid,
      `✅ *Registration Successful!*\n\n` +
        `📱 Your number *${senderNumber}* has been registered.\n\n` +
        `⏳ Your account is *pending approval*. An admin will approve your account soon.\n\n` +
        `Once approved, you can:\n` +
        `• Type */list* to view available products\n` +
        `• Type */balance* to check your balance\n` +
        `• Type */help* for more commands`
    );
  } else if (user.status === 'pending') {
    await sendText(
      jid,
      `⏳ *Account Pending*\n\n` +
        `Your account is still awaiting admin approval.\n` +
        `Please wait for confirmation.`
    );
  } else if (user.status === 'banned') {
    await sendText(
      jid,
      `🚫 *Account Banned*\n\n` +
        `Your account has been banned. Contact support for assistance.`
    );
  } else {
    await sendText(
      jid,
      `👋 *Welcome back!*\n\n` +
        `💰 Balance: *${user.balance}*\n\n` +
        `Type */list* to view products\n` +
        `Type */help* for all commands`
    );
  }
};

const handleProductList = async (jid, senderNumber) => {
  const user = await User.findOne({ phone_number: senderNumber });

  if (!user || user.status !== 'approved') {
    return sendText(
      jid,
      `🚫 *Access Denied*\n\nYou need an approved account to view products.\nType */start* to register.`
    );
  }

  const products = await Product.find({ status: 'active' }).sort({ product_name: 1 });

  if (products.length === 0) {
    return sendText(jid, `📦 No products available at the moment.`);
  }

  let msg = `📦 *Available Products*\n${'─'.repeat(30)}\n\n`;

  for (const p of products) {
    msg += `*/${p.shortcode}*\n`;
    msg += `  📌 ${p.product_name}\n`;
    msg += `  💰 Price: ${p.price}\n`;
    if (p.description) msg += `  ℹ️ ${p.description}\n`;
    if (p.usage_example) msg += `  📝 Usage: ${p.usage_example}\n`;
    msg += `\n`;
  }

  msg += `${'─'.repeat(30)}\n`;
  msg += `💰 Your Balance: *${user.balance}*\n`;
  msg += `\nType the command to place an order.`;

  await sendText(jid, msg);
};

const handleBalance = async (jid, senderNumber) => {
  const user = await User.findOne({ phone_number: senderNumber });

  if (!user) {
    return sendText(jid, `❌ Account not found. Type */start* to register.`);
  }

  if (user.status === 'banned') {
    return sendText(jid, `🚫 Your account is banned.`);
  }

  const recentTx = await Transaction.find({ user_number: senderNumber })
    .sort({ createdAt: -1 })
    .limit(5);

  let msg = `💰 *Account Balance*\n${'─'.repeat(25)}\n\n`;
  msg += `Balance: *${user.balance}*\n`;
  msg += `Status: *${user.status}*\n\n`;

  if (recentTx.length > 0) {
    msg += `📋 *Recent Transactions:*\n`;
    for (const tx of recentTx) {
      const sign = tx.type === 'credit' || tx.type === 'refund' ? '+' : '-';
      const emoji = tx.type === 'credit' ? '💚' : tx.type === 'refund' ? '🔄' : '🔴';
      msg += `${emoji} ${sign}${tx.amount} - ${tx.description || tx.type}\n`;
    }
  }

  await sendText(jid, msg);
};

const handleOrderStatus = async (jid, senderNumber, orderId) => {
  if (!orderId) {
    return sendText(jid, `❌ Usage: */status ORDER-ID*\nExample: /status ORD-ABC12345`);
  }

  const order = await Order.findOne({
    order_id: orderId.toUpperCase(),
    user_number: senderNumber,
  });

  if (!order) {
    return sendText(jid, `❌ Order *${orderId}* not found or doesn't belong to you.`);
  }

  const statusEmoji = {
    pending: '⏳',
    processing: '🔄',
    completed: '✅',
    failed: '❌',
    cancelled: '🚫',
  };

  let msg = `📦 *Order Status*\n${'─'.repeat(25)}\n\n`;
  msg += `🆔 Order: *${order.order_id}*\n`;
  msg += `📦 Product: *${order.product_name}*\n`;
  msg += `${statusEmoji[order.status] || '❓'} Status: *${order.status.toUpperCase()}*\n`;
  msg += `💰 Price: *${order.price}*\n`;
  msg += `📅 Placed: ${new Date(order.createdAt).toLocaleString()}\n`;

  if (order.status === 'completed' && order.completed_at) {
    msg += `✅ Completed: ${new Date(order.completed_at).toLocaleString()}\n`;
  }

  await sendText(jid, msg);
};

const handleMyOrders = async (jid, senderNumber) => {
  const user = await User.findOne({ phone_number: senderNumber });
  if (!user || user.status !== 'approved') {
    return sendText(jid, `🚫 Access denied. Your account must be approved.`);
  }

  const orders = await Order.find({ user_number: senderNumber })
    .sort({ createdAt: -1 })
    .limit(10);

  if (orders.length === 0) {
    return sendText(jid, `📦 You have no orders yet.\n\nType */list* to see available products.`);
  }

  let msg = `📋 *Your Recent Orders*\n${'─'.repeat(30)}\n\n`;

  for (const o of orders) {
    const statusEmoji = { pending: '⏳', processing: '🔄', completed: '✅', failed: '❌', cancelled: '🚫' };
    msg += `${statusEmoji[o.status] || '❓'} *${o.order_id}*\n`;
    msg += `  Product: ${o.product_name} | Price: ${o.price}\n`;
    msg += `  Status: ${o.status.toUpperCase()}\n`;
    msg += `  Date: ${new Date(o.createdAt).toLocaleDateString()}\n\n`;
  }

  await sendText(jid, msg);
};

const handleHelp = async (jid) => {
  const msg =
    `🤖 *Bot Commands*\n${'─'.repeat(30)}\n\n` +
    `*/start* - Register / Welcome\n` +
    `*/list* - View all products\n` +
    `*/balance* - Check your balance\n` +
    `*/orders* - View your order history\n` +
    `*/status ORDER-ID* - Check order status\n` +
    `*/help* - Show this message\n\n` +
    `${'─'.repeat(30)}\n` +
    `📦 *To place an order:*\n` +
    `Type the product command followed by your request\n\n` +
    `Example:\n` +
    `• /premiumbox details\n` +
    `• /giftcard order 2\n` +
    `• /cloudvault request`;

  await sendText(jid, msg);
};

const handleProductCommand = async (jid, senderNumber, text, msg) => {
  // Extract command and input
  const parts = text.split(' ');
  const command = parts[0].slice(1).toLowerCase(); // Remove the /
  const inputData = parts.slice(1).join(' ');

  // Find product by shortcode
  const product = await Product.findOne({ shortcode: command, status: 'active' });

  if (!product) {
    return sendText(
      jid,
      `❌ Unknown command */${command}*\n\nType */list* to see available products.`
    );
  }

  // Check user
  const user = await User.findOne({ phone_number: senderNumber });

  if (!user) {
    return sendText(
      jid,
      `❌ Account not found. Type */start* to register.`
    );
  }

  if (user.status === 'pending') {
    return sendText(
      jid,
      `⏳ *Account Pending*\n\nYour account is awaiting admin approval.\nPlease wait for confirmation.`
    );
  }

  if (user.status === 'banned') {
    return sendText(jid, `🚫 Your account is banned. Contact support.`);
  }

  // Check balance
  if (user.balance < product.price) {
    return sendText(
      jid,
      `❌ *Insufficient Balance*\n\n` +
        `Required: *${product.price}*\n` +
        `Your balance: *${user.balance}*\n\n` +
        `Please top up your balance to continue.`
    );
  }

  // Check if bot is paused
  const isPaused = await Settings.get('bot_paused', false);
  if (isPaused) {
    return sendText(
      jid,
      `⏸️ *System Paused*\n\nOrder processing is temporarily paused. Please try again later.`
    );
  }

  // Get assigned admin
  const globalAdmin = await Settings.get('global_admin', process.env.GLOBAL_ADMIN_NUMBER);
  const assignedAdmin = product.getNextAdmin(globalAdmin);

  if (!assignedAdmin) {
    return sendText(
      jid,
      `❌ *Service Unavailable*\n\nNo admin available for this product. Please try again later.`
    );
  }

  // Create order
  const order = await Order.create({
    order_id: `ORD-${uuidv4().slice(0, 8).toUpperCase()}`,
    user_number: senderNumber,
    product_id: product.product_id,
    product_name: product.product_name,
    command: `/${command}`,
    input_data: inputData,
    price: product.price,
    status: 'pending',
    assigned_admin: assignedAdmin,
    forwarded_at: new Date(),
  });

  // Deduct balance
  const balanceBefore = user.balance;
  user.balance -= product.price;
  await user.save();

  // Record transaction
  await Transaction.create({
    user_number: senderNumber,
    type: 'debit',
    amount: product.price,
    balance_before: balanceBefore,
    balance_after: user.balance,
    description: `Order ${order.order_id} - ${product.product_name}`,
    order_id: order.order_id,
  });

  // Update product order count
  await Product.findOneAndUpdate({ product_id: product.product_id }, { $inc: { total_orders: 1 } });

  // Confirm to user
  await sendText(
    jid,
    `✅ *Order Placed Successfully!*\n${'─'.repeat(30)}\n\n` +
      `🆔 Order ID: *${order.order_id}*\n` +
      `📦 Product: *${product.product_name}*\n` +
      `💰 Charged: *${product.price}*\n` +
      `💳 Remaining Balance: *${user.balance}*\n\n` +
      `⏳ Your order has been forwarded to our team.\n` +
      `You will receive a response shortly.\n\n` +
      `Type */status ${order.order_id}* to track your order.`
  );

  // Forward to admin
  await forwardToAdmin(order, product, user, assignedAdmin, inputData);

  logger.info(`Order ${order.order_id} created and forwarded to admin ${assignedAdmin}`);
};

const forwardToAdmin = async (order, product, user, adminNumber, inputData) => {
  const adminJid = `${adminNumber.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

  const adminMsg =
    `📦 *NEW ORDER - ${order.order_id}*\n${'─'.repeat(35)}\n\n` +
    `👤 User: ${user.phone_number}\n` +
    `📌 Product: ${product.product_name}\n` +
    `💰 Price: ${product.price}\n` +
    `📝 Input: ${inputData || 'No input provided'}\n\n` +
    `${'─'.repeat(35)}\n` +
    `⚡ *Reply to this message* with the order response.\n` +
    `The user will automatically receive your reply.\n\n` +
    `🆔 Order Reference: ${order.order_id}`;

  try {
    const sent = await sendText(adminJid, adminMsg);
    // Store the admin message ID for matching responses
    await Order.findByIdAndUpdate(order._id, {
      admin_message_id: sent?.key?.id,
      status: 'processing',
    });
    logger.info(`Order ${order.order_id} forwarded to admin ${adminNumber}`);
  } catch (err) {
    logger.error(`Failed to forward order ${order.order_id} to admin:`, err);
    await Order.findByIdAndUpdate(order._id, {
      status: 'failed',
      failure_reason: 'Failed to forward to admin',
    });
  }
};

module.exports = { handle };
