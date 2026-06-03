#!/usr/bin/env node
// Scrapes LinkedIn profiles using your real Chrome session.
//
// Setup (once):
//   npm install playwright
//   npx playwright install chromium
//
// Run:
//   node scripts/scrape-linkedin.js
//
// Requirements:
//   - Chrome must be CLOSED before running (profile lock)
//   - Must be logged into LinkedIn in Chrome
//   - Dev server running at localhost:3000 (or set NEXT_PUBLIC_APP_URL)

import { chromium } from 'playwright'
import path from 'path'
import os from 'os'
import fs from 'fs'

const API_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const RESULTS_FILE = path.join(process.cwd(), 'scripts', 'scrape-results.json')
const CHROME_USER_DATA = path.join(os.homedir(), 'Library/Application Support/Google/Chrome')
const RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 4000

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function randomDelay() {
  // 3–6 seconds between profiles to look natural
  return 3000 + Math.random() * 3000
}

async function scrollToLoad(page) {
  for (const pct of [0.3, 0.6, 1.0]) {
    await page.evaluate((p) => window.scrollTo(0, document.body.scrollHeight * p), pct)
    await sleep(900)
  }
  // Scroll back up — sometimes triggers lazy sections
  await page.evaluate(() => window.scrollTo(0, 0))
  await sleep(500)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await sleep(800)
}

async function scrapePage(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 25000 })

  const currentUrl = page.url()
  if (
    currentUrl.includes('/login') ||
    currentUrl.includes('/authwall') ||
    currentUrl.includes('/checkpoint')
  ) {
    throw new Error(`Auth wall detected (redirected to ${currentUrl}) — make sure Chrome is logged into LinkedIn`)
  }

  // Wait for the profile name — proves the profile actually loaded
  try {
    await page.waitForSelector('h1', { timeout: 12000 })
  } catch {
    throw new Error('Profile h1 never appeared — page may not have loaded or URL is wrong')
  }

  await scrollToLoad(page)

  return page.evaluate(() => document.body.innerText)
}

async function ingestProfile(slackUsername, text) {
  const res = await fetch(`${API_URL}/api/profiles/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slackUsername, text }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data
}

async function withRetry(label, fn) {
  let lastErr
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < RETRY_ATTEMPTS) {
        console.log(`  ⚠ Attempt ${attempt} failed: ${err.message}`)
        console.log(`  Retrying in ${RETRY_DELAY_MS / 1000}s...`)
        await sleep(RETRY_DELAY_MS)
      }
    }
  }
  throw lastErr
}

function loadResults() {
  try {
    return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveResults(results) {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2))
}

async function main() {
  // Fetch pending URLs
  let members
  try {
    const res = await fetch(`${API_URL}/api/profiles/url`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    members = await res.json()
  } catch (err) {
    console.error(`✗ Could not reach API at ${API_URL}: ${err.message}`)
    console.error('  Make sure the dev server is running.')
    process.exit(1)
  }

  if (members.length === 0) {
    console.log('No LinkedIn URLs found. Add them on /profiles first.')
    process.exit(0)
  }

  // Load prior results to skip already-succeeded profiles
  const results = loadResults()
  const pending = members.filter((m) => results[m.slackUsername]?.status !== 'ok')

  console.log(`${members.length} total · ${pending.length} pending · ${members.length - pending.length} already done\n`)

  if (pending.length === 0) {
    console.log('All profiles already scraped. Delete scripts/scrape-results.json to re-run.')
    process.exit(0)
  }

  // Launch Chrome with real session
  let browser
  try {
    browser = await chromium.launchPersistentContext(CHROME_USER_DATA, {
      channel: 'chrome',
      headless: false,
    })
  } catch (err) {
    if (err.message.includes('already in use') || err.message.includes('lock')) {
      console.error('✗ Chrome is already open. Close Chrome completely and try again.')
    } else {
      console.error(`✗ Failed to launch Chrome: ${err.message}`)
    }
    process.exit(1)
  }

  const page = await browser.newPage()
  let succeeded = 0
  let failed = 0

  for (let i = 0; i < pending.length; i++) {
    const { slackUsername, linkedinUrl } = pending[i]
    console.log(`[${i + 1}/${pending.length}] ${slackUsername} — ${linkedinUrl}`)

    try {
      const data = await withRetry(slackUsername, async () => {
        const text = await scrapePage(page, linkedinUrl)
        return ingestProfile(slackUsername, text)
      })

      console.log(`  ✓ Saved: ${data.name}`)
      results[slackUsername] = { status: 'ok', name: data.name, at: new Date().toISOString() }
      succeeded++
    } catch (err) {
      console.log(`  ✗ Failed after ${RETRY_ATTEMPTS} attempts: ${err.message}`)
      results[slackUsername] = { status: 'error', error: err.message, at: new Date().toISOString() }
      failed++
    }

    saveResults(results)

    if (i < pending.length - 1) {
      const delay = randomDelay()
      console.log(`  Waiting ${(delay / 1000).toFixed(1)}s...\n`)
      await sleep(delay)
    }
  }

  await browser.close()

  console.log(`\n─────────────────────────`)
  console.log(`Done. ${succeeded} succeeded, ${failed} failed.`)
  if (failed > 0) {
    console.log(`Failed profiles saved to scripts/scrape-results.json — fix URLs and re-run to retry.`)
  }
}

main().catch((err) => {
  console.error(`\nUnexpected error: ${err.message}`)
  process.exit(1)
})
