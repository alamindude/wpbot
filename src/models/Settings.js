const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
    value: mongoose.Schema.Types.Mixed,
    description: String,
  },
  { timestamps: true }
);

const Settings = mongoose.model('Settings', settingsSchema);

// Helper methods
Settings.get = async (key, defaultValue = null) => {
  const setting = await Settings.findOne({ key });
  return setting ? setting.value : defaultValue;
};

Settings.set = async (key, value, description = '') => {
  return Settings.findOneAndUpdate(
    { key },
    { value, description },
    { upsert: true, new: true }
  );
};

module.exports = Settings;
