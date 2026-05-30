import { google } from 'googleapis'
import { Readable } from 'stream'

let cachedAuth = null

function getAuth() {
  if (cachedAuth) return cachedAuth
  cachedAuth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return cachedAuth
}

export async function uploadReceiptToDrive(file) {
  if (!(file instanceof File) || file.size === 0) return ''

  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  const buffer = Buffer.from(await file.arrayBuffer())
  const stream = Readable.from(buffer)

  const { data } = await drive.files.create({
    requestBody: {
      name: `${Date.now()}-${file.name}`,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    },
    media: {
      mimeType: file.type || 'application/octet-stream',
      body: stream,
    },
    fields: 'id, webViewLink',
  })

  // Make viewable by anyone with the link so it works in Slack
  await drive.permissions.create({
    fileId: data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  })

  return data.webViewLink
}
