#!/usr/bin/env node
// Batch-ingests all PDFs from public/ET-data/et/ into MongoDB.
// Matches each PDF to a slackUsername via the stored linkedinUrl, then:
//   1. Sends the PDF to Claude to extract structured profile data
//   2. Saves extracted fields + raw PDF bytes to MongoDB
//
// Run: node scripts/batch-ingest.js
// Requirements: ANTHROPIC_API_KEY and MONGODB_URI must be set in .env.local

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// Load .env.local manually (no dotenv dependency)
const envPath = path.join(root, '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1].trim()] ??= match[2].trim().replace(/^"|"$/g, '')
}

const { MongoClient } = await import(
  path.join(root, 'node_modules/.pnpm/mongodb@7.2.0/node_modules/mongodb/lib/index.js')
)
const Anthropic = (await import(
  path.join(root, 'node_modules/.pnpm/@anthropic-ai+sdk@0.100.1_zod@4.4.3/node_modules/@anthropic-ai/sdk/index.mjs')
)).default

const PDF_DIR = path.join(root, 'public/ET-data/et')
const MONGODB_URI = process.env.MONGODB_URI
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

const EXTRACT_PROMPT = `Extract this LinkedIn profile into JSON with exactly this shape:
{
  "name": string,
  "headline": string,
  "summary": string,
  "positions": [{ "title": string, "company": string, "description": string, "startDate": string, "endDate": string }],
  "education": [{ "school": string, "degree": string, "field": string, "startDate": string, "endDate": string }],
  "skills": [string]
}
Return only the raw JSON, no markdown, no explanation.`

function extractJSON(raw) {
  return JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim())
}

function slugFromFilename(filename) {
  return filename.replace(/\.pdf$/i, '')
}

function slugFromUrl(url) {
  return url.replace(/\/$/, '').split('/').pop().toLowerCase().replace(/-+$/, '')
}

async function extractProfile(anthropic, pdfBuffer) {
  const base64 = pdfBuffer.toString('base64')
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: EXTRACT_PROMPT },
        ],
      },
    ],
  })
  return extractJSON(message.content[0].text)
}

async function main() {
  if (!MONGODB_URI) { console.error('Missing MONGODB_URI'); process.exit(1) }
  if (!ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1) }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  const client = await MongoClient.connect(MONGODB_URI)
  const db = client.db()
  const profiles = db.collection('profiles')

  // Build slug → slackUsername map from stored linkedinUrls
  const allProfiles = await profiles.find(
    { linkedinUrl: { $exists: true } },
    { projection: { slackUsername: 1, linkedinUrl: 1, name: 1 } }
  ).toArray()

  const slugMap = {}
  for (const p of allProfiles) {
    const slug = slugFromUrl(p.linkedinUrl)
    slugMap[slug] = p.slackUsername
  }

  // List PDFs, skip -2 duplicates
  const pdfs = fs.readdirSync(PDF_DIR)
    .filter(f => f.endsWith('.pdf') && !f.endsWith('-2.pdf'))
    .sort()

  console.log(`Found ${pdfs.length} PDFs to process\n`)

  let ok = 0, skipped = 0, failed = 0

  for (let i = 0; i < pdfs.length; i++) {
    const filename = pdfs[i]
    const slug = slugFromFilename(filename)
    const slackUsername = slugMap[slug]

    if (!slackUsername) {
      console.log(`[${i + 1}/${pdfs.length}] ${filename} — no matching slackUsername, skipping`)
      skipped++
      continue
    }

    // Skip if already has real profile data (name !== slackUsername means already ingested)
    const existing = allProfiles.find(p => p.slackUsername === slackUsername)
    if (existing?.name && existing.name !== slackUsername) {
      console.log(`[${i + 1}/${pdfs.length}] ${filename} — already ingested (${existing.name}), skipping`)
      skipped++
      continue
    }

    process.stdout.write(`[${i + 1}/${pdfs.length}] ${filename} (@${slackUsername}) … `)

    try {
      const pdfBuffer = fs.readFileSync(path.join(PDF_DIR, filename))
      const parsed = await extractProfile(anthropic, pdfBuffer)

      await profiles.updateOne(
        { slackUsername },
        {
          $set: {
            name: parsed.name,
            headline: parsed.headline ?? '',
            summary: parsed.summary ?? '',
            positions: parsed.positions ?? [],
            education: parsed.education ?? [],
            skills: parsed.skills ?? [],
            pdfData: pdfBuffer,
          },
        },
        { upsert: true }
      )

      console.log(`✓ ${parsed.name}`)
      ok++
    } catch (e) {
      console.log(`✗ ${e.message}`)
      failed++
    }

    // Small delay to avoid Anthropic rate limits
    if (i < pdfs.length - 1) await new Promise(r => setTimeout(r, 500))
  }

  await client.close()
  console.log(`\nDone. ${ok} ingested, ${skipped} skipped, ${failed} failed.`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
