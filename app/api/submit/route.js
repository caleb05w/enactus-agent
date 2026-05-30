import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { uploadFiles } from '@/lib/upload'
import Submission from '@/lib/models/Submission'
import { postToSlack } from '@/lib/slack'

export async function POST(req) {
  try {
    const formData = await req.formData()
    const mode = formData.get('mode') || 'submission'
    const channel = formData.get('channel') || 'agent_test'

    if (mode === 'message') {
      const message = formData.get('message')
      if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })
      await postToSlack({ message, mode: 'message', channel })
      return NextResponse.json({ success: true })
    }

    const name = formData.get('name')
    const email = formData.get('email')
    const message = formData.get('message')

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Name, email, and message are required.' }, { status: 400 })
    }

    const { urls: fileUrls, errors: uploadErrors } = await uploadFiles(formData.getAll('files'))
    if (uploadErrors.length > 0) console.warn('Some file uploads failed:', uploadErrors)

    await connectDB()
    await Submission.create({ name, email, message, fileUrls })
    await postToSlack({ name, email, message, fileUrls, mode: 'submission', channel })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
