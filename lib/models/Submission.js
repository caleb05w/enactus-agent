import mongoose from 'mongoose'

const SubmissionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true },
    fileUrls: [{ type: String }],
  },
  { timestamps: true }
)

export default mongoose.models.Submission || mongoose.model('Submission', SubmissionSchema)
