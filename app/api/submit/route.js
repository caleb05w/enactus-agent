import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { connectDB } from '@/lib/mongodb'
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
    const files = formData.getAll('files')

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Name, email, and message are required.' }, { status: 400 })
    }

    const fileUrls = []
    for (const file of files) {
      if (file && file.size > 0) {
        const blob = await put(file.name, file, { access: 'public' })
        fileUrls.push(blob.url)
      }
    }

    await connectDB()
    await Submission.create({ name, email, message, fileUrls })
    await postToSlack({ name, email, message, fileUrls, mode: 'submission', channel })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
