// Add new destinations here — no other code changes needed.
// Each key is a destination name used in API routes and forms.
export const DRIVE_FOLDERS = {
  reimbursements: process.env.GOOGLE_DRIVE_FOLDER_ID,
}

export const SPREADSHEETS = {
  finance: process.env.GOOGLE_SPREADSHEET_ID,
}

export function getDriveFolder(key) {
  const id = DRIVE_FOLDERS[key]
  if (!id) throw new Error(`No Drive folder configured for: ${key}`)
  return id
}

export function getSpreadsheet(key) {
  const id = SPREADSHEETS[key]
  if (!id) throw new Error(`No spreadsheet configured for: ${key}`)
  return id
}
