const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const orderSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: true,
      unique: true,
      default: () => `ORD-${uuidv4().slice(0, 8).toUpperCase()}`,
    },
    user_number: {
      type: String,
      required: true,
      ref: 'User',
    },
    product_id: {
      type: String,
      required: true,
      ref: 'Product',
    },
    product_name: String,
    command: {
      type: String,
      required: true,
    },
    input_data: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'pending',
    },
    assigned_admin: {
      type: String,
      required: true,
    },
    // Message ID from WhatsApp for tracking
    admin_message_id: String,
    user_message_id: String,
    response_data: {
      type: {
        type: String,
        enum: ['text', 'image', 'document', 'video', 'audio', 'mixed'],
      },
      text: String,
      file_path: String,
      file_name: String,
      mime_type: String,
      caption: String,
    },
    failure_reason: String,
    retry_count: {
      type: Number,
      default: 0,
    },
    forwarded_at: Date,
    completed_at: Date,
  },
  { timestamps: true }
);

orderSchema.index({ order_id: 1 });
orderSchema.index({ user_number: 1 });
orderSchema.index({ assigned_admin: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
