const logger = require('../utils/logger');
const Order = require('../models/Order');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const { sendText, sendFile, sendMessage } = require('./whatsapp');

const FILES_DIR = process.env.FILES_DIR || './files';

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

const handle = async (sock, msg, adminNumber) => {
  const text = extractText(msg);
  const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

  logger.info(`Admin ${adminNumber} sent a response`);

  // Try to find the order in multiple ways:
  // 1. By quoted message ID (most reliable)
  // 2. By ORDER-ID mention in text
  // 3. By latest pending order assigned to this admin

  let order = null;

  // Method 1: Match by quoted message ID
  if (quotedId) {
    order = await Order.findOne({
      admin_message_id: quotedId,
      status: 'processing',
    });
    if (order) logger.info(`Matched order ${order.order_id} by quoted message ID`);
  }

  // Method 2: Match by ORDER-ID in text
  if (!order && text) {
    const orderIdMatch = text.match(/ORD-[A-Z0-9]{8}/i);
    if (orderIdMatch) {
      order = await Order.findOne({
        order_id: orderIdMatch[0].toUpperCase(),
        assigned_admin: adminNumber,
        status: 'processing',
      });
      if (order) logger.info(`Matched order ${order.order_id} by ORDER-ID in text`);
    }
  }

  // Method 3: Latest pending order for this admin
  if (!order) {
    order = await Order.findOne({
      assigned_admin: adminNumber,
      status: 'processing',
    }).sort({ createdAt: -1 });

    if (order) {
      logger.info(`Matched order ${order.order_id} by latest pending (fallback)`);
    }
  }

  if (!order) {
    logger.warn(`Admin ${adminNumber} sent a message but no matching order found`);
    return sendText(
      `${adminNumber.replace(/[^0-9]/g, '')}@s.whatsapp.net`,
      `⚠️ No pending order found to match your response.\n\nPlease reply directly to the order notification message.`
    );
  }

  // Get user JID
  const userJid = `${order.user_number.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  const msgType = detectMessageType(msg);

  try {
    // Handle different message types
    if (msgType === 'image' || msgType === 'document' || msgType === 'video' || msgType === 'audio') {
      await handleMediaResponse(sock, msg, order, userJid, msgType, text);
    } else if (text) {
      await handleTextResponse(order, userJid, text);
    } else {
      logger.warn(`Admin response for ${order.order_id} had no content`);
      return;
    }

    // Update order status
    await Order.findByIdAndUpdate(order._id, {
      status: 'completed',
      completed_at: new Date(),
      'response_data.text': text || '',
    });

    // Confirm to admin
    await sendText(
      `${adminNumber.replace(/[^0-9]/g, '')}@s.whatsapp.net`,
      `✅ Response for order *${order.order_id}* delivered to user *${order.user_number}*`
    );

    logger.info(`Order ${order.order_id} completed and response sent to user ${order.user_number}`);
  } catch (err) {
    logger.error(`Failed to process admin response for ${order.order_id}:`, err);
    await sendText(
      `${adminNumber.replace(/[^0-9]/g, '')}@s.whatsapp.net`,
      `❌ Failed to deliver response for order *${order.order_id}*. Please try again.`
    );
  }
};

const detectMessageType = (msg) => {
  const m = msg.message;
  if (!m) return 'text';
  if (m.imageMessage) return 'image';
  if (m.documentMessage) return 'document';
  if (m.videoMessage) return 'video';
  if (m.audioMessage) return 'audio';
  return 'text';
};

const handleTextResponse = async (order, userJid, text) => {
  const responseMsg =
    `📦 *Order ${order.order_id} - Response*\n${'─'.repeat(30)}\n\n` +
    `${text}\n\n` +
    `${'─'.repeat(30)}\n` +
    `✅ *Order Completed*`;

  await sendText(userJid, responseMsg);
};

const handleMediaResponse = async (sock, msg, order, userJid, msgType, caption) => {
  // Download the media
  const { downloadMediaMessage } = require('@whiskeysockets/baileys');

  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});

    // Save to file storage
    const orderDir = path.join(FILES_DIR, order.order_id);
    if (!fs.existsSync(orderDir)) {
      fs.mkdirSync(orderDir, { recursive: true });
    }

    const msgContent = msg.message;
    let fileName, mimeType, ext;

    if (msgType === 'image') {
      const imgMsg = msgContent.imageMessage;
      mimeType = imgMsg.mimetype || 'image/jpeg';
      ext = mimeType.split('/')[1] || 'jpg';
      fileName = `image.${ext}`;
    } else if (msgType === 'document') {
      const docMsg = msgContent.documentMessage;
      fileName = docMsg.fileName || 'document';
      mimeType = docMsg.mimetype || 'application/octet-stream';
    } else if (msgType === 'video') {
      mimeType = 'video/mp4';
      fileName = 'video.mp4';
    } else {
      mimeType = 'audio/ogg';
      fileName = 'audio.ogg';
    }

    const filePath = path.join(orderDir, fileName);
    fs.writeFileSync(filePath, buffer);

    // Update order with file info
    await Order.findByIdAndUpdate(order._id, {
      'response_data.type': msgType,
      'response_data.file_path': filePath,
      'response_data.file_name': fileName,
      'response_data.mime_type': mimeType,
      'response_data.caption': caption || '',
    });

    // Send header to user
    const headerMsg =
      `📦 *Order ${order.order_id} - Response*\n${'─'.repeat(30)}\n`;
    await sendText(userJid, headerMsg);

    // Forward the media to user
    if (msgType === 'image') {
      await sock.sendMessage(userJid, {
        image: buffer,
        caption: caption || `✅ Order ${order.order_id} completed`,
      });
    } else if (msgType === 'video') {
      await sock.sendMessage(userJid, {
        video: buffer,
        caption: caption || `✅ Order ${order.order_id} completed`,
      });
    } else if (msgType === 'audio') {
      await sock.sendMessage(userJid, {
        audio: buffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: false,
      });
    } else {
      // Document
      const docMsg = msg.message.documentMessage;
      await sock.sendMessage(userJid, {
        document: buffer,
        fileName: docMsg.fileName || fileName,
        mimetype: mimeType,
        caption: caption || `✅ Order ${order.order_id} completed`,
      });
    }

    // Send caption text separately if present
    if (caption && msgType !== 'image' && msgType !== 'document') {
      await sendText(userJid, caption);
    }

    await sendText(userJid, `✅ *Order ${order.order_id} Completed*`);
  } catch (err) {
    logger.error('Error downloading/forwarding media:', err);
    throw err;
  }
};

module.exports = { handle };
