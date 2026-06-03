import mongoose from 'mongoose'

const PositionSchema = new mongoose.Schema({
  title: String,
  company: String,
  description: String,
  startDate: String,
  endDate: String,
}, { _id: false })

const EducationSchema = new mongoose.Schema({
  school: String,
  degree: String,
  field: String,
  startDate: String,
  endDate: String,
}, { _id: false })

const ProfileSchema = new mongoose.Schema(
  {
    slackUsername: { type: String, required: true, unique: true },
    linkedinUrl: String,
    name: { type: String, required: true },
    headline: String,
    summary: String,
    positions: [PositionSchema],
    education: [EducationSchema],
    skills: [String],
  },
  { timestamps: true }
)

export default mongoose.models.Profile || mongoose.model('Profile', ProfileSchema)
