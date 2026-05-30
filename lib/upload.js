import { put } from '@vercel/blob'

function uniqueKey(filename) {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`
}

// Upload multiple files in parallel. Returns { urls, errors } — one failed
// upload does not abort the others.
export async function uploadFiles(files) {
  const validFiles = files.filter((f) => f instanceof File && f.size > 0)
  const results = await Promise.allSettled(
    validFiles.map((f) => put(uniqueKey(f.name), f, { access: 'public' }))
  )

  const urls = []
  const errors = []
  for (const result of results) {
    if (result.status === 'fulfilled') urls.push(result.value.url)
    else errors.push(result.reason?.message ?? 'Upload failed')
  }

  return { urls, errors }
}

// Upload a single file. Returns the blob URL or '' if no file.
export async function uploadFile(file) {
  if (!(file instanceof File) || file.size === 0) return ''
  const blob = await put(uniqueKey(file.name), file, { access: 'public' })
  return blob.url
}
