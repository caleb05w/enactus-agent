import { google } from 'googleapis'
import { Readable } from 'stream'
import { getDriveFolder } from './destinations.js'

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

function getExtension(filename) {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex === -1 || dotIndex === 0) return ''
  return filename.slice(dotIndex + 1)
}

function buildReceiptFilename(item, etransferName, event, originalFilename) {
  const ext = getExtension(originalFilename)
  const [firstName = '', ...rest] = etransferName.trim().split(' ')
  const lastName = rest.join('-') || 'unknown'
  const base = [sanitize(item), sanitize(firstName), sanitize(lastName), sanitize(event)].join('-')
  return ext ? `${base}.${ext}` : base
}

// Returns folder ID — finds existing or creates new
async function ensureEventFolder(drive, eventName, destination = 'reimbursements') {
  const parentId = getDriveFolder(destination)
  const safeName = eventName.trim()
  // Escape single quotes for Drive query syntax
  const escapedName = safeName.replace(/'/g, "\\'")

  const existing = await drive.files.list({
    q: `name='${escapedName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  if (existing.data.files.length > 0) return existing.data.files[0].id

  const { data } = await drive.files.create({
    requestBody: {
      name: safeName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })

  return data.id
}

// Existing event folders = events we've already filed finances against.
// Returns [{ name, date }] where date is the folder's last-modified day.
export async function listEventFolders(destination = 'reimbursements') {
  const drive = getDrive()
  const parentId = getDriveFolder(destination)

  const { data } = await drive.files.list({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  return data.files.map((f) => ({ name: f.name, date: f.modifiedTime?.slice(0, 10) || '', source: 'custom' }))
}

export async function uploadReceiptToDrive(file, { item, etransferName, event, destination = 'reimbursements' }) {
  if (!(file instanceof File) || file.size === 0) return ''

  const drive = getDrive()
  const folderId = await ensureEventFolder(drive, event, destination)
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
    supportsAllDrives: true,
  })

  // Make viewable by anyone with the link — non-fatal if this fails
  try {
    await drive.permissions.create({
      fileId: data.id,
      requestBody: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    })
  } catch (err) {
    console.warn('[drive] permissions.create failed, file will be private:', err?.message)
  }

  return data.webViewLink
}
