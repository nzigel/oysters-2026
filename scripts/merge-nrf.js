/**
 * Merge confirmed scores from data/nrf.json into data/season.json.
 *
 * Rule: NRF is the source of truth for scores. If NRF has a confirmed
 * result for a fixture, set season.fixtures[i].result.ourScore /
 * theirScore / status='confirmed' to match. Leaves scorers, squad,
 * referee, notes, and goalkeeper untouched.
 *
 * Matching: by opponent team name (case-insensitive). If date differs
 * from the season fixture (rescheduled), the NRF date is logged but
 * NOT auto-applied — schedule changes are flagged so a human can decide.
 */

const fs = require('fs');
const path = require('path');

const SEASON_PATH = path.join(__dirname, '..', 'data', 'season.json');
const NRF_PATH = path.join(__dirname, '..', 'data', 'nrf.json');

const OYSTERS_PATTERNS = [/oyster/i, /warkworth/i];

function isOysters(name) {
  return OYSTERS_PATTERNS.some(re => re.test(name || ''));
}

function findSeasonFixture(season, opponentName) {
  const norm = s => (s || '').toLowerCase().trim();
  return season.fixtures.find(sf => {
    const opp = sf.isHome ? sf.away : sf.home;
    return norm(opp) === norm(opponentName);
  });
}

function run() {
  const season = JSON.parse(fs.readFileSync(SEASON_PATH, 'utf8'));
  const nrf = JSON.parse(fs.readFileSync(NRF_PATH, 'utf8'));

  const changes = [];
  const warnings = [];

  for (const f of nrf.fixtures) {
    const homeIsUs = isOysters(f.home.team);
    const awayIsUs = isOysters(f.away.team);
    if (!homeIsUs && !awayIsUs) continue;

    const opponent = homeIsUs ? f.away.team : f.home.team;
    const sf = findSeasonFixture(season, opponent);
    if (!sf) {
      warnings.push(`No season fixture for opponent "${opponent}" (NRF ${f.date.slice(0, 10)})`);
      continue;
    }

    const nrfDate = f.date.slice(0, 10);
    if (nrfDate !== sf.date) {
      warnings.push(`Schedule change: ${opponent} season=${sf.date} nrf=${nrfDate} (not auto-applied)`);
    }

    if (f.kind !== 'result' || f.homeScore == null || f.awayScore == null) continue;

    const ourScore = homeIsUs ? f.homeScore : f.awayScore;
    const theirScore = homeIsUs ? f.awayScore : f.homeScore;

    sf.result = sf.result || {};
    const before = {
      status: sf.result.status,
      ourScore: sf.result.ourScore,
      theirScore: sf.result.theirScore,
    };
    const changed =
      before.status !== 'confirmed' ||
      before.ourScore !== ourScore ||
      before.theirScore !== theirScore;

    if (changed) {
      sf.result.status = 'confirmed';
      sf.result.ourScore = ourScore;
      sf.result.theirScore = theirScore;
      changes.push(
        `${sf.date} vs ${opponent}: ${before.ourScore ?? '-'}-${before.theirScore ?? '-'} (${before.status ?? 'none'}) → ${ourScore}-${theirScore} (confirmed)`
      );
    }
  }

  if (changes.length === 0) {
    console.log('merge-nrf: no score changes');
  } else {
    fs.writeFileSync(SEASON_PATH, JSON.stringify(season, null, 2) + '\n');
    console.log(`merge-nrf: applied ${changes.length} change(s) to season.json`);
    for (const c of changes) console.log(`  • ${c}`);
  }

  for (const w of warnings) console.log(`  ! ${w}`);
}

run();
