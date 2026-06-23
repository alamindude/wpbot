const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    product_id: {
      type: String,
      required: true,
      unique: true,
    },
    product_name: {
      type: String,
      required: true,
      trim: true,
    },
    shortcode: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      trim: true,
    },
    usage_example: {
      type: String,
      trim: true,
    },
    assigned_admins: [
      {
        type: String, // phone numbers
        trim: true,
      },
    ],
    routing_mode: {
      type: String,
      enum: ['specific', 'load_balanced', 'global_fallback'],
      default: 'specific',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    total_orders: {
      type: Number,
      default: 0,
    },
    // Round-robin index for load balancing
    current_admin_index: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

productSchema.index({ shortcode: 1 });
productSchema.index({ status: 1 });

// Get next admin for load balancing
productSchema.methods.getNextAdmin = function (globalAdmin) {
  if (this.assigned_admins.length === 0) {
    return globalAdmin;
  }
  if (this.routing_mode === 'global_fallback' || this.assigned_admins.length === 0) {
    return globalAdmin;
  }
  if (this.assigned_admins.length === 1) {
    return this.assigned_admins[0];
  }
  // Load balance
  const admin = this.assigned_admins[this.current_admin_index % this.assigned_admins.length];
  this.current_admin_index = (this.current_admin_index + 1) % this.assigned_admins.length;
  this.save();
  return admin;
};

module.exports = mongoose.model('Product', productSchema);
