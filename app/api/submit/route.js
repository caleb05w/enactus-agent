import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { uploadFiles } from '@/lib/upload'
import Submission from '@/lib/models/Submission'
import { postToSlack } from '@/lib/slack'

const encoder = new TextEncoder()

function emit(controller, data) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

export async function POST(req) {
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
  const fileList = formData.getAll('files')

  if (!name || !email || !message) {
    return NextResponse.json({ error: 'Name, email, and message are required.' }, { status: 400 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        emit(controller, { step: 0 })
        const { urls: fileUrls, errors: uploadErrors } = await uploadFiles(fileList)
        if (uploadErrors.length > 0) console.warn('Some file uploads failed:', uploadErrors)

        emit(controller, { step: 1 })
        await connectDB()
        await Submission.create({ name, email, message, fileUrls })

        emit(controller, { step: 2 })
        await postToSlack({ name, email, message, fileUrls, mode: 'submission', channel })

        emit(controller, { done: true, summary: { name, channel, fileCount: fileUrls.length } })
      } catch (err) {
        console.error('[submit] Error:', err?.message ?? err)

        if (!process.env.MONGODB_URI) console.warn('[submit] Missing env: MONGODB_URI')
        if (!process.env.SLACK_BOT_TOKEN) console.warn('[submit] Missing env: SLACK_BOT_TOKEN')

        emit(controller, { error: err?.message ?? 'Something went wrong.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
}
