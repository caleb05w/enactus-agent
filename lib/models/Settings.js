import mongoose from 'mongoose'

// Generic key/value store for app-level config (e.g. which Slack channel
// notifications post to). One document per key.
const SettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
)

export default mongoose.models.Settings || mongoose.model('Settings', SettingsSchema)
