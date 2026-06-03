#!/usr/bin/env node
// Scrapes LinkedIn profiles using your real Chrome session.
// Run: node scripts/scrape-linkedin.js
// Requires: npm install -g playwright && npx playwright install chromium

import { chromium } from 'playwright'
import path from 'path'
import os from 'os'

const API_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

// Your Chrome user data dir — already logged into LinkedIn
const USER_DATA_DIR = path.join(os.homedir(), 'Library/Application Support/Google/Chrome')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function scrollToLoad(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3))
  await sleep(800)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.66))
  await sleep(800)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await sleep(1000)
}

async function main() {
  const res = await fetch(`${API_URL}/api/profiles/url`)
  const members = await res.json()

  if (members.length === 0) {
    console.log('No LinkedIn URLs found. Add them on /profiles first.')
    process.exit(0)
  }

  console.log(`Found ${members.length} profile(s) to scrape.\n`)

  const browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'chrome',
    headless: false,
    args: ['--start-maximized'],
  })

  const page = await browser.newPage()

  for (const { slackUsername, linkedinUrl } of members) {
    console.log(`→ ${slackUsername} — ${linkedinUrl}`)

    try {
      await page.goto(linkedinUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await sleep(2500)
      await scrollToLoad(page)

      const text = await page.evaluate(() => document.body.innerText)

      const ingestRes = await fetch(`${API_URL}/api/profiles/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slackUsername, text }),
      })
      const data = await ingestRes.json()

      if (data.ok) {
        console.log(`  ✓ Saved: ${data.name}`)
      } else {
        console.log(`  ✗ Error: ${data.error}`)
      }
    } catch (err) {
      console.log(`  ✗ Failed: ${err.message}`)
    }

    // Natural delay between profiles (2–4s)
    const delay = 2000 + Math.random() * 2000
    console.log(`  Waiting ${(delay / 1000).toFixed(1)}s...\n`)
    await sleep(delay)
  }

  await browser.close()
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
