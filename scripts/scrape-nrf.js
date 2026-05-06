/**
 * Scrape NRF Men Div. 8 Harbour (Section A) fixtures and table from the NRF website.
 * Writes data/nrf.json for the static site to consume.
 *
 * NOTE: Selectors are best-effort — verify/update with Playwright MCP once available.
 * The NRF site is powered by Sporty.co.nz (Wix-based). The filter UI is JS-rendered.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'data', 'nrf.json');
const NRF_URL = 'https://www.nrf.org.nz/Competitions-1/Senior-Competitions/nrf-community-senior-men';
const DIVISION = 'NRF Men Div. 8 Harbour (Section A)';
const TEAM_NAME = 'Oysters';

// Keywords to identify the correct division filter/tab
const DIVISION_KEYWORDS = ['Div. 8', 'Division 8', 'Harbour', 'Section A'];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const result = {
    updated: new Date().toISOString(),
    source: 'NRF / Sporty.co.nz',
    division: DIVISION,
    table: [],
    fixtures: [],
    error: null,
  };

  try {
    console.log(`Navigating to ${NRF_URL}`);
    await page.goto(NRF_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Check for iframes (Sporty often embeds competition data in iframes)
    const frames = page.frames();
    console.log(`Found ${frames.length} frame(s)`);

    // Try to find and click a filter/tab for our division
    const divisionFound = await trySelectDivision(page);
    if (!divisionFound) {
      console.warn('Could not find division filter — scraping full page');
    }

    // Wait a moment for any JS-rendered content to settle
    await page.waitForTimeout(2000);

    // Extract league table
    result.table = await extractTable(page);
    console.log(`Extracted ${result.table.length} table rows`);

    // Extract fixtures
    result.fixtures = await extractFixtures(page);
    console.log(`Extracted ${result.fixtures.length} fixtures`);

    // If nothing found, try iframes
    if (result.table.length === 0 && result.fixtures.length === 0) {
      console.log('No data on main page — checking iframes');
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        const frameUrl = frame.url();
        console.log(`Checking frame: ${frameUrl}`);
        result.table = await extractTable(frame);
        result.fixtures = await extractFixtures(frame);
        if (result.table.length > 0 || result.fixtures.length > 0) {
          console.log(`Found data in frame: ${frameUrl}`);
          break;
        }
      }
    }

  } catch (err) {
    console.error('Scrape error:', err.message);
    result.error = err.message;
  } finally {
    await browser.close();
  }

  // Preserve existing data if we got nothing (don't overwrite with empty)
  if (result.table.length === 0 && result.fixtures.length === 0 && fs.existsSync(OUTPUT)) {
    const existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    if ((existing.table || []).length > 0 || (existing.fixtures || []).length > 0) {
      console.warn('No new data scraped — keeping existing nrf.json');
      result.table = existing.table;
      result.fixtures = existing.fixtures;
      result.error = result.error || 'No data found on page — kept previous data';
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(`Written to ${OUTPUT}`);
}

async function trySelectDivision(context) {
  for (const keyword of DIVISION_KEYWORDS) {
    try {
      // Look for buttons, tabs, links, or selects containing the keyword
      const el = await context.locator(`text="${keyword}"`).first();
      if (await el.isVisible({ timeout: 2000 })) {
        await el.click();
        await context.waitForTimeout(1500);
        console.log(`Clicked division filter: "${keyword}"`);
        return true;
      }
    } catch {}

    try {
      // Try partial text match on interactive elements
      const el = await context.locator(`button:has-text("${keyword}"), a:has-text("${keyword}"), [role="tab"]:has-text("${keyword}")`).first();
      if (await el.isVisible({ timeout: 1000 })) {
        await el.click();
        await context.waitForTimeout(1500);
        console.log(`Clicked filter element for: "${keyword}"`);
        return true;
      }
    } catch {}
  }
  return false;
}

async function extractTable(context) {
  const rows = [];
  try {
    // Look for HTML tables on the page
    const tables = await context.locator('table').all();
    for (const table of tables) {
      const text = await table.innerText();
      // Check if this looks like a standings table (has pts/points column or team standings data)
      if (!/pts|points|played|GD/i.test(text)) continue;

      const tableRows = await table.locator('tbody tr').all();
      for (const row of tableRows) {
        const cells = await row.locator('td').allInnerTexts();
        if (cells.length < 5) continue;

        // Try to parse: Pos, Team, P, W, D, L, GF, GA, GD, Pts (or subset)
        const parsed = parseTableRow(cells);
        if (parsed) rows.push(parsed);
      }
      if (rows.length > 0) break;
    }
  } catch (err) {
    console.warn('extractTable error:', err.message);
  }
  return rows;
}

function parseTableRow(cells) {
  // Flexible parser — handles tables with or without position column
  // Typical format: [Pos?, Team, P, W, D, L, GF, GA, GD, Pts]
  const nums = cells.map(c => parseInt(c.trim(), 10));
  const teamIdx = cells.findIndex(c => isNaN(parseInt(c, 10)) && c.trim().length > 0);
  if (teamIdx < 0) return null;

  const numCells = cells.filter((_, i) => i !== teamIdx).map(c => parseInt(c.trim(), 10));
  if (numCells.length < 4) return null;

  const [p, w, d, l, gf, ga, gd, pts] = numCells;
  return {
    team: cells[teamIdx].trim(),
    played: p || 0,
    won: w || 0,
    drawn: d || 0,
    lost: l || 0,
    gf: gf || 0,
    ga: ga || 0,
    gd: gd != null ? gd : ((gf || 0) - (ga || 0)),
    points: pts || (w * 3 + d) || 0,
  };
}

async function extractFixtures(context) {
  const fixtures = [];
  try {
    // Look for fixture rows — often in a list or table with date + team names + score
    const rows = await context.locator('tr, .fixture, .match, .game').all();
    for (const row of rows) {
      const text = (await row.innerText()).trim();
      if (!text) continue;

      // Skip header rows
      if (/date|home|away|kick.?off/i.test(text) && !/vs|\d–\d/i.test(text)) continue;

      const fixture = parseFixtureRow(text, row);
      if (fixture) fixtures.push(fixture);
    }
  } catch (err) {
    console.warn('extractFixtures error:', err.message);
  }
  return fixtures;
}

function parseFixtureRow(text) {
  // Look for patterns like: "11 Apr" "Oysters" "5-2" "Opponent" or similar
  const dateMatch = text.match(/(\d{1,2}[\s\/]\w+[\s\/]?\d{0,4}|\d{4}-\d{2}-\d{2})/);
  const scoreMatch = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  const timeMatch = text.match(/\b(\d{1,2}:\d{2})\b/);

  if (!dateMatch && !scoreMatch) return null;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  return {
    raw: text.replace(/\s+/g, ' ').trim(),
    date: dateMatch ? dateMatch[1] : null,
    time: timeMatch ? timeMatch[1] : null,
    homeScore: scoreMatch ? parseInt(scoreMatch[1], 10) : null,
    awayScore: scoreMatch ? parseInt(scoreMatch[2], 10) : null,
    status: scoreMatch ? 'completed' : 'scheduled',
    teams: lines.filter(l => isNaN(parseInt(l, 10)) && !l.match(/^\d{1,2}[\s\/]/) && l.length > 2),
  };
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
