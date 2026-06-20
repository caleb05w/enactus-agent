import mongoose from 'mongoose'

// A proposed change awaiting the owner's reaction. Caleb Jr posts an approval
// card to Slack; the owner reacts ✅ (approve) or ❌ (skip); the next run reads
// the reaction and dispatches approved items to the Cursor agent.
const AgentActionSchema = new mongoose.Schema(
  {
    source: { type: String, required: true },
    messageTs: { type: String, required: true },
    itemIndex: { type: Number, default: 0 },
    summary: { type: String },
    actionType: { type: String },
    confidence: { type: Number },
    approvalChannel: { type: String },
    approvalTs: { type: String },
    status: { type: String, default: 'pending' }, // pending | dispatched | completed | rejected | failed
    // Where the request came from, so we can reply to the initiator.
    requesterId: { type: String },
    messageLink: { type: String },
    sourceName: { type: String },
    // Which repo this change targets (routed by Haiku).
    repoName: { type: String },
    repoUrl: { type: String },
    repoRef: { type: String },
    // Cursor background-agent tracking.
    cursorAgentId: { type: String },
    cursorUrl: { type: String },
    branch: { type: String },
    prUrl: { type: String },
    reportedAt: { type: Date },
  },
  { timestamps: true }
)

AgentActionSchema.index({ source: 1, messageTs: 1, itemIndex: 1 }, { unique: true })

export default mongoose.models.AgentAction || mongoose.model('AgentAction', AgentActionSchema)
