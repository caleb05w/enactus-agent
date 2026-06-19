import mongoose from 'mongoose'

// Per-source scrape watermark — the timestamp of the last message Caleb Jr
// processed for a given channel or DM. This is the "note of what we scraped".
const AgentCursorSchema = new mongoose.Schema(
  {
    source: { type: String, required: true, unique: true },
    lastTs: { type: String, default: '0' },
  },
  { timestamps: true }
)

export default mongoose.models.AgentCursor || mongoose.model('AgentCursor', AgentCursorSchema)
