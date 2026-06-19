import mongoose from 'mongoose'

// Audit trail — one entry per message Caleb Jr triaged, with the decision it
// made. Raw DM bodies are intentionally NOT stored (PII); only the Haiku
// summary is kept for DM sources. See guardrail G15/G17 in the spec.
const AgentLogSchema = new mongoose.Schema(
  {
    source: { type: String, required: true },
    messageTs: { type: String, required: true },
    requesterId: { type: String },
    text: { type: String },
    summary: { type: String },
    directedAtOwner: { type: Boolean },
    actionType: { type: String },
    confidence: { type: Number },
    decision: { type: String }, // ignored | parked | shadow-would-act | acted
    reason: { type: String },
    prUrl: { type: String },
  },
  { timestamps: true }
)

AgentLogSchema.index({ source: 1, messageTs: 1 }, { unique: true })

export default mongoose.models.AgentLog || mongoose.model('AgentLog', AgentLogSchema)
