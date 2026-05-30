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

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() })
}

function sanitize(str) {
  return str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function buildReceiptFilename(item, etransferName, event, originalFilename) {
  const ext = originalFilename.split('.').pop()
  const [firstName = '', ...rest] = etransferName.trim().split(' ')
  const lastName = rest.join('-') || 'unknown'
  return [sanitize(item), sanitize(firstName), sanitize(lastName), sanitize(event)].join('-') + '.' + ext
}

// Returns folder ID — finds existing or creates new
async function ensureEventFolder(drive, eventName) {
  const parentId = process.env.GOOGLE_DRIVE_FOLDER_ID
  const safeName = eventName.trim()

  const existing = await drive.files.list({
    q: `name='${safeName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  })

  if (existing.data.files.length > 0) return existing.data.files[0].id

  const { data } = await drive.files.create({
    requestBody: {
      name: safeName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  })

  return data.id
}

export async function listEventFolders() {
  const drive = getDrive()
  const parentId = process.env.GOOGLE_DRIVE_FOLDER_ID

  const { data } = await drive.files.list({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    orderBy: 'name',
  })

  return data.files.map((f) => f.name)
}

export async function uploadReceiptToDrive(file, { item, etransferName, event }) {
  if (!(file instanceof File) || file.size === 0) return ''

  const drive = getDrive()
  const folderId = await ensureEventFolder(drive, event)
  const filename = buildReceiptFilename(item, etransferName, event, file.name)

  const buffer = Buffer.from(await file.arrayBuffer())
  const stream = Readable.from(buffer)

  const { data } = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
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
