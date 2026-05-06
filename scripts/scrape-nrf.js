/**
 * Scrape NRF Men Div. 8 Harbour (Section A) standings and fixtures.
 * Writes data/nrf.json for the static site to consume.
 *
 * Hits the JSON API that powers the Sporty/NRF competition widget — discovered
 * by inspecting network calls on https://www.nrf.org.nz/Competitions-1/Senior-Competitions/nrf-community-senior-men
 * No browser/headless Chromium needed.
 *
 * Endpoints (all POST, JSON in/out):
 *   /api/v2/competition/widget/standings/availablePhases   { CompIds }
 *   /api/v2/competition/widget/standings/Phase/Table       { GradeId, PhaseId }
 *   /api/v2/competition/widget/fixture/UpcomingFixtures    { CompIds, GradeIds, From?, To? }
 *   /api/v2/competition/widget/fixture/RecentResults       { CompIds, GradeIds, From?, To? }
 */

const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'data', 'nrf.json');
const BASE = 'https://www.nrf.org.nz/api/v2/competition/widget';
const COMP_ID = 12869;          // NRF Senior Community Men
const GRADE_ID = 721160;        // NRF Men Div. 8 Harbour
const SECTION_NAME = 'Section A';
const DIVISION = 'NRF Men Div. 8 Harbour (Section A)';

// Cover the whole 2026 NRF season generously
const SEASON_FROM = '2026-03-01T00:00:00';
const SEASON_TO = '2026-12-31T23:59:59';

async function post(endpoint, body) {
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'oysters-2026-scraper (https://github.com/nzigel/oysters-2026)',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${endpoint} -> HTTP ${res.status}`);
  return res.json();
}

function mapTable(apiTable) {
  // apiTable: array of grade-section blocks. Each block has Standings[].
  // Pick the Section A block (some grades have multiple sections).
  const block = apiTable.find(b => b.SectionName === SECTION_NAME) || apiTable[0];
  if (!block) return [];
  return (block.Standings || []).map(s => ({
    team: s.TeamName,
    played: s.Played,
    won: s.Win,
    drawn: s.Draw,
    lost: s.Loss,
    gf: s.For,
    ga: s.Against,
    gd: s.Differential,
    points: s.StandingsPoints,
  }));
}

function mapFixture(f, kind) {
  return {
    id: f.Id,
    kind, // 'upcoming' | 'result'
    date: f.From,
    section: f.SectionName,
    round: f.RoundName,
    home: { team: f.HomeTeamName, club: f.HomeOrgName },
    away: { team: f.AwayTeamName, club: f.AwayOrgName },
    venue: f.VenueName,
    venueAddress: f.VenueAddress,
    officials: f.Officials || null,
    homeScore: f.HomeScore != null ? Number(f.HomeScore) : null,
    awayScore: f.AwayScore != null ? Number(f.AwayScore) : null,
    statusName: f.StatusName,
    publicNotes: f.PublicNotes,
  };
}

async function run() {
  const out = {
    updated: new Date().toISOString(),
    source: 'NRF / Sporty.co.nz competition widget API',
    division: DIVISION,
    gradeId: GRADE_ID,
    phaseId: null,
    table: [],
    fixtures: [],
    error: null,
  };

  try {
    // 1. Discover the phase to query standings against.
    const phases = await post('standings/availablePhases', { CompIds: [COMP_ID] });
    const phase = (phases[String(COMP_ID)] || [])[0];
    if (!phase) throw new Error('No phases available for competition');
    out.phaseId = phase.Id;

    // 2. Fetch standings table for our grade in that phase.
    const apiTable = await post('standings/Phase/Table', {
      GradeId: GRADE_ID,
      PhaseId: phase.Id,
    });
    out.table = mapTable(apiTable);

    // 3. Fetch upcoming fixtures + recent results.
    const fixtureBody = {
      CompIds: [COMP_ID],
      GradeIds: [GRADE_ID],
      From: SEASON_FROM,
      To: SEASON_TO,
    };
    const [upcoming, recent] = await Promise.all([
      post('fixture/UpcomingFixtures', fixtureBody),
      post('fixture/RecentResults', fixtureBody),
    ]);

    const upFx = (upcoming.Fixtures || [])
      .filter(f => f.SectionName === SECTION_NAME)
      .map(f => mapFixture(f, 'upcoming'));
    const reFx = (recent.Fixtures || [])
      .filter(f => f.SectionName === SECTION_NAME)
      .map(f => mapFixture(f, 'result'));

    // Merge by id (recent + upcoming can overlap on a freshly-played round).
    const byId = new Map();
    for (const f of reFx) byId.set(f.id, f);
    for (const f of upFx) if (!byId.has(f.id)) byId.set(f.id, f);
    out.fixtures = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.error('Scrape error:', err.message);
    out.error = err.message;
  }

  // Don't overwrite a populated nrf.json with an empty one on a transient failure.
  if (out.table.length === 0 && out.fixtures.length === 0 && fs.existsSync(OUTPUT)) {
    const existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    if ((existing.table || []).length > 0 || (existing.fixtures || []).length > 0) {
      console.warn('No new data scraped — keeping existing nrf.json');
      out.table = existing.table;
      out.fixtures = existing.fixtures;
      out.phaseId = out.phaseId ?? existing.phaseId;
      out.error = out.error || 'No data returned — kept previous data';
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUTPUT} — ${out.table.length} table rows, ${out.fixtures.length} fixtures`);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
