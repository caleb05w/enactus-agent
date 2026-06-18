import { connectDB } from './mongodb'
import Settings from './models/Settings'

export async function getSetting(key) {
  await connectDB()
  const doc = await Settings.findOne({ key }).lean()
  return doc?.value ?? null
}

export async function setSetting(key, value) {
  await connectDB()
  await Settings.findOneAndUpdate(
    { key },
    { value },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  return value
}
