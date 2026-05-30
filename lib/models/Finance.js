import mongoose from 'mongoose'

const FinanceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['reimbursement', 'request'], required: true },
    item: { type: String, required: true },
    date: { type: String, required: true },
    amount: { type: String, required: true },
    etransferName: { type: String, required: true },
    etransferEmail: { type: String, required: true },
    receiptUrl: { type: String },
  },
  { timestamps: true }
)

export default mongoose.models.Finance || mongoose.model('Finance', FinanceSchema)
