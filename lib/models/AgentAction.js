import mongoose from 'mongoose'

// A proposed change awaiting the owner's reaction. Caleb Jr posts an approval
// card to Slack; the owner reacts ✅ (approve) or ❌ (skip); the next run reads
// the reaction and dispatches approved items to the Cursor agent.
const AgentActionSchema = new mongoose.Schema(
  {
    source: { type: String, required: true },
    messageTs: { type: String, required: true },
    summary: { type: String },
    actionType: { type: String },
    confidence: { type: Number },
    approvalChannel: { type: String },
    approvalTs: { type: String },
    status: { type: String, default: 'pending' }, // pending | approved | dispatched | rejected
    prUrl: { type: String },
  },
  { timestamps: true }
)

AgentActionSchema.index({ source: 1, messageTs: 1 }, { unique: true })

export default mongoose.models.AgentAction || mongoose.model('AgentAction', AgentActionSchema)
