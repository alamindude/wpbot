const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    phone_number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
      default: 'Unknown',
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'banned'],
      default: 'pending',
    },
    is_admin: {
      type: Boolean,
      default: false,
    },
    registered_at: {
      type: Date,
      default: Date.now,
    },
    last_active: {
      type: Date,
      default: Date.now,
    },
    notes: String,
  },
  { timestamps: true }
);

userSchema.index({ phone_number: 1 });
userSchema.index({ status: 1 });

module.exports = mongoose.model('User', userSchema);
