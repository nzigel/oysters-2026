// Warkworth FC — Oysters · 2026 season tracker
// Loads data/season.json and renders each tab.

const TODAY = new Date();

async function init() {
  let data;
  try {
    const res = await fetch('data/season.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    document.querySelector('main').innerHTML =
      `<div class="card"><h2>Couldn't load season data</h2><p class="muted">${escapeHtml(e.message)}</p></div>`;
    return;
  }

  // Header
  document.getElementById('league-name').textContent = data.team.league;
  document.getElementById('season-name').textContent = `${data.team.season} season`;
  document.getElementById('league-link').href = data.team.leagueUrl;
  document.title = `${data.team.name} · ${data.team.season} Season`;

  setupTabs();

  renderOverview(data);
  renderFixtures(data);
  renderRecord(data);
  renderScorers(data);
  renderAppearances(data);
  renderSquad(data);

  // Load NRF live data (non-blocking)
  fetch('data/nrf.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null)
    .then(nrf => nrf && renderLeagueTable(nrf))
    .catch(() => {});
}

function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });
}

// ---------- helpers ----------

function isOurGoal(scorer, squadNames) {
  // We trust the scorers list to only contain our team's goal scorers.
  return true;
}

function isCompleted(f) {
  const r = f.result || {};
  return r.status === 'confirmed' && r.ourScore != null && r.theirScore != null;
}

function isUpcoming(f) {
  const d = new Date(f.date + 'T' + (f.time || '13:00') + ':00');
  return d >= startOfDay(TODAY) && !isCompleted(f);
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-NZ', { weekday: 'short', day: '2-digit', month: 'short' });
}

function fmtDateLong(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2,'0')} ${period}`;
}

function resultClass(f) {
  if (!isCompleted(f)) return '';
  const r = f.result;
  if (r.ourScore > r.theirScore) return 'win';
  if (r.ourScore < r.theirScore) return 'loss';
  return 'draw';
}

function timeHtml(f) {
  const current = fmtTime(f.time);
  if (f.originalTime && f.originalTime !== f.time) {
    return `<span class="changed-was">${escapeHtml(fmtTime(f.originalTime))}</span> ${escapeHtml(current)}`;
  }
  return escapeHtml(current);
}

function venueHtml(f) {
  if (f.originalVenue && f.originalVenue !== f.venue) {
    return `<span class="changed-was">${escapeHtml(f.originalVenue)}</span> ${escapeHtml(f.venue)}`;
  }
  return escapeHtml(f.venue);
}

function ourScoreFirst(f) {
  // Always show our score first regardless of home/away, with hyphen
  if (!isCompleted(f)) return null;
  return `${f.result.ourScore}–${f.result.theirScore}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function opponentName(f) {
  return f.isHome ? f.away : f.home;
}

// ---------- renderers ----------

function renderOverview(data) {
  const fixtures = data.fixtures.slice().sort((a,b) => a.date.localeCompare(b.date));
  const next = fixtures.find(isUpcoming);
  const last = fixtures.filter(isCompleted).slice(-1)[0];

  // Next match
  const nextEl = document.getElementById('next-match');
  if (next) {
    const opp = opponentName(next);
    nextEl.innerHTML = `
      <div class="match-summary">
        <div>
          <div class="team-line">vs ${escapeHtml(opp)} <span class="muted">(${escapeHtml(next.opponentClub)})</span></div>
          <div class="muted" style="margin-top:0.35rem;">${fmtDateLong(next.date)} · ${timeHtml(next)}</div>
          <div class="muted">${venueHtml(next)} · ${next.isHome ? 'Home' : 'Away'}</div>
        </div>
      </div>`;
  } else {
    nextEl.innerHTML = `<p class="muted">No upcoming fixtures.</p>`;
  }

  // Last result
  const lastEl = document.getElementById('last-result');
  if (last) {
    const opp = opponentName(last);
    const cls = resultClass(last);
    const label = cls === 'win' ? 'Win' : cls === 'loss' ? 'Loss' : 'Draw';
    lastEl.innerHTML = `
      <div class="match-summary">
        <div>
          <div class="team-line">vs ${escapeHtml(opp)} <span class="muted">(${last.isHome ? 'H' : 'A'})</span></div>
          <div style="margin-top:0.5rem;">
            <span class="score-pill ${cls}">${label} ${ourScoreFirst(last)}</span>
          </div>
          <div class="muted" style="margin-top:0.5rem;">${fmtDateLong(last.date)}</div>
          ${last.result.notes ? `<div class="muted" style="margin-top:0.35rem;">${escapeHtml(last.result.notes)}</div>` : ''}
        </div>
      </div>`;
  } else {
    lastEl.innerHTML = `<p class="muted">No completed matches yet.</p>`;
  }

  // Quick stats
  const completed = fixtures.filter(isCompleted);
  let w=0, d=0, l=0, gf=0, ga=0;
  completed.forEach(f => {
    gf += f.result.ourScore;
    ga += f.result.theirScore;
    if (f.result.ourScore > f.result.theirScore) w++;
    else if (f.result.ourScore < f.result.theirScore) l++;
    else d++;
  });
  const totalGoals = completed.reduce((s,f) => s + (f.result.scorers || []).reduce((x,sc) => x + (sc.goals || 1), 0), 0);
  document.getElementById('quick-stats').innerHTML = `
    <div class="stat" id="position-stat"><div class="stat-value">—</div><div class="stat-label">Position</div></div>
    ${stat(completed.length, 'Played')}
    ${stat(w, 'Won')}
    ${stat(d, 'Drawn')}
    ${stat(l, 'Lost')}
    ${stat(gf, 'Goals for')}
    ${stat(ga, 'Goals against')}
    ${stat(gf - ga >= 0 ? '+' + (gf - ga) : (gf - ga), 'Goal diff')}
    ${stat(w * 3 + d, 'Points')}
  `;
}

function stat(value, label) {
  return `<div class="stat"><div class="stat-value">${escapeHtml(value)}</div><div class="stat-label">${escapeHtml(label)}</div></div>`;
}

function renderFixtures(data) {
  const fixtures = data.fixtures.slice().sort((a,b) => a.date.localeCompare(b.date));
  const nextId = (fixtures.find(isUpcoming) || {}).id;
  const html = fixtures.map(f => fixtureRow(f, f.id === nextId)).join('');
  document.getElementById('fixtures-list').innerHTML = html;
}

function fixtureRow(f, isNext) {
  const cls = resultClass(f);
  const score = isCompleted(f)
    ? `<span class="score-pill ${cls}">${f.result.ourScore} – ${f.result.theirScore}</span>`
    : `<span class="muted">vs</span>`;
  const tag = isNext
    ? `<div class="next-tag upcoming">Next</div>`
    : isCompleted(f)
      ? `<div class="next-tag">Result</div>`
      : `<div class="next-tag">Upcoming</div>`;

  // Scorers/squad/ref/notes
  const r = f.result || {};
  const scorers = (r.scorers || []);
  const scorersHtml = scorers.length
    ? `<ul>${scorers.map(s => `<li>${escapeHtml(s.player)}${s.goals && s.goals > 1 ? ` <span class="muted">×${s.goals}</span>` : ''}${s.minutes ? ` <span class="muted">(${s.minutes.join(", ")}')</span>` : ''}</li>`).join('')}</ul>`
    : `<div class="empty">No goal scorers recorded.</div>`;

  const squad = (r.selectedSquad || []);
  const squadHtml = squad.length
    ? `<ul>${squad.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
    : `<div class="empty">Squad not yet selected.</div>`;

  const refHtml = r.referee
    ? `<div>${escapeHtml(r.referee)}</div>`
    : `<div class="empty">Not recorded.</div>`;

  const notesHtml = r.notes
    ? `<div>${escapeHtml(r.notes)}</div>`
    : '';

  return `
    <details class="fixture">
      <summary>
        <div class="match-date">${fmtDate(f.date)}<br><span class="muted">${timeHtml(f)}</span></div>
        <div class="team-home"><strong>${escapeHtml(f.home)}</strong>${f.isHome ? '' : ` <span class="muted">(${escapeHtml(f.opponentClub)})</span>`}</div>
        <div class="center-score">${score}</div>
        <div class="team-away"><strong>${escapeHtml(f.away)}</strong>${f.isHome ? ` <span class="muted">(${escapeHtml(f.opponentClub)})</span>` : ''}</div>
        ${tag}
      </summary>
      <div class="detail">
        <div class="detail-block">
          <h4>Venue</h4>
          <div>${venueHtml(f)} <span class="muted">· ${f.isHome ? 'Home' : 'Away'}</span></div>
          <h4 style="margin-top:1rem;">Goal scorers</h4>
          ${scorersHtml}
          <h4 style="margin-top:1rem;">Referee</h4>
          ${refHtml}
          ${notesHtml ? `<h4 style="margin-top:1rem;">Notes</h4>${notesHtml}` : ''}
        </div>
        <div class="detail-block">
          <h4>Selected squad (${squad.length})</h4>
          ${squadHtml}
        </div>
      </div>
    </details>
  `;
}

function renderRecord(data) {
  const completed = data.fixtures.filter(isCompleted);
  let w=0, d=0, l=0, gf=0, ga=0;
  completed.forEach(f => {
    gf += f.result.ourScore;
    ga += f.result.theirScore;
    if (f.result.ourScore > f.result.theirScore) w++;
    else if (f.result.ourScore < f.result.theirScore) l++;
    else d++;
  });
  const pts = w*3 + d;
  const gd = gf - ga;
  document.getElementById('our-record').innerHTML = `
    <table class="data">
      <thead>
        <tr>
          <th>Team</th>
          <th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th>
          <th class="num">GF</th><th class="num">GA</th><th class="num">GD</th><th class="num">Pts</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Oysters</strong></td>
          <td class="num">${completed.length}</td>
          <td class="num">${w}</td>
          <td class="num">${d}</td>
          <td class="num">${l}</td>
          <td class="num">${gf}</td>
          <td class="num">${ga}</td>
          <td class="num">${gd >= 0 ? '+' + gd : gd}</td>
          <td class="num"><strong>${pts}</strong></td>
        </tr>
      </tbody>
    </table>
  `;

  // By opponent
  const byOpp = {};
  data.fixtures.forEach(f => {
    const opp = opponentName(f);
    if (!byOpp[opp]) byOpp[opp] = { played: 0, w:0, d:0, l:0, gf:0, ga:0, club: f.opponentClub };
    if (isCompleted(f)) {
      byOpp[opp].played++;
      byOpp[opp].gf += f.result.ourScore;
      byOpp[opp].ga += f.result.theirScore;
      if (f.result.ourScore > f.result.theirScore) byOpp[opp].w++;
      else if (f.result.ourScore < f.result.theirScore) byOpp[opp].l++;
      else byOpp[opp].d++;
    }
  });
  const rows = Object.entries(byOpp)
    .sort((a,b) => a[0].localeCompare(b[0]))
    .map(([opp, r]) => `
      <tr>
        <td>${escapeHtml(opp)} <span class="muted">${escapeHtml(r.club)}</span></td>
        <td class="num">${r.played}</td>
        <td class="num">${r.w}</td>
        <td class="num">${r.d}</td>
        <td class="num">${r.l}</td>
        <td class="num">${r.gf}</td>
        <td class="num">${r.ga}</td>
      </tr>
    `).join('');
  document.getElementById('opponent-table').innerHTML = `
    <table class="data">
      <thead>
        <tr><th>Opponent</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GF</th><th class="num">GA</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderScorers(data) {
  const tally = {};
  data.fixtures.forEach(f => {
    if (!isCompleted(f)) return;
    (f.result.scorers || []).forEach(s => {
      const goals = s.goals || 1;
      tally[s.player] = (tally[s.player] || 0) + goals;
    });
  });
  const sorted = Object.entries(tally).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!sorted.length) {
    document.getElementById('scorers-list').innerHTML = `<p class="muted">No goal scorers recorded yet. Add them inside each fixture's <code>scorers</code> array in <code>data/season.json</code>.</p>`;
    return;
  }
  const rows = sorted.map(([p, g], i) => `
    <tr><td>${i+1}</td><td>${escapeHtml(p)}</td><td class="num"><strong>${g}</strong></td></tr>
  `).join('');
  document.getElementById('scorers-list').innerHTML = `
    <table class="data">
      <thead><tr><th>#</th><th>Player</th><th class="num">Goals</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderAppearances(data) {
  const tally = {};
  // Initialise with squad so 0-app players still appear
  data.squad.forEach(p => tally[p.name] = 0);
  let confirmedGames = 0;
  data.fixtures.forEach(f => {
    if (!isCompleted(f)) return;
    confirmedGames++;
    (f.result.selectedSquad || []).forEach(name => {
      tally[name] = (tally[name] || 0) + 1;
    });
  });
  const sorted = Object.entries(tally).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const rows = sorted.map(([p, g]) => `
    <tr><td>${escapeHtml(p)}</td><td class="num">${g}</td></tr>
  `).join('');
  document.getElementById('appearances-list').innerHTML = `
    <p class="muted">Across ${confirmedGames} completed game${confirmedGames === 1 ? '' : 's'}.</p>
    <table class="data">
      <thead><tr><th>Player</th><th class="num">Apps</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderSquad(data) {
  const html = data.squad.map(p => `
    <div class="player">
      <span class="num">${p.number}</span>
      <span>${escapeHtml(p.name)}</span>
    </div>
  `).join('');
  document.getElementById('squad-list').innerHTML = html;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function renderLeagueTable(nrf) {
  const updatedEl = document.getElementById('nrf-updated');
  const tableEl = document.getElementById('nrf-table');

  if (nrf.table && nrf.table.length) {
    const idx = nrf.table.findIndex(t =>
      t.team.toLowerCase().includes('oysters') || t.team.toLowerCase().includes('warkworth')
    );
    if (idx >= 0) {
      const posEl = document.querySelector('#position-stat .stat-value');
      if (posEl) posEl.textContent = ordinal(idx + 1);
    }
  }

  if (nrf.updated) {
    const d = new Date(nrf.updated);
    updatedEl.textContent = `Last updated: ${d.toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })}`;
  }

  if (nrf.error && (!nrf.table || nrf.table.length === 0)) {
    tableEl.innerHTML = `<p class="muted">League table not yet available. ${escapeHtml(nrf.error)}</p>
      <p class="muted">The scraper runs automatically — check back after the next scheduled update.</p>`;
    return;
  }

  if (!nrf.table || nrf.table.length === 0) {
    tableEl.innerHTML = `<p class="muted">League table not yet available — the scraper will populate this automatically.</p>`;
    return;
  }

  const rows = nrf.table.map((t, i) => {
    const isUs = t.team.toLowerCase().includes('oysters') || t.team.toLowerCase().includes('warkworth');
    const gd = t.gd != null ? t.gd : (t.gf - t.ga);
    return `
      <tr class="${isUs ? 'highlight-row' : ''}">
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(t.team)}${isUs ? ' <strong>★</strong>' : ''}</td>
        <td class="num">${t.played}</td>
        <td class="num">${t.won}</td>
        <td class="num">${t.drawn}</td>
        <td class="num">${t.lost}</td>
        <td class="num">${t.gf}</td>
        <td class="num">${t.ga}</td>
        <td class="num">${gd >= 0 ? '+' + gd : gd}</td>
        <td class="num"><strong>${t.points}</strong></td>
      </tr>`;
  }).join('');

  tableEl.innerHTML = `
    <table class="data">
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Team</th>
          <th class="num">P</th>
          <th class="num">W</th>
          <th class="num">D</th>
          <th class="num">L</th>
          <th class="num">GF</th>
          <th class="num">GA</th>
          <th class="num">GD</th>
          <th class="num">Pts</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${nrf.error ? `<p class="muted" style="margin-top:1rem;">⚠ ${escapeHtml(nrf.error)}</p>` : ''}
  `;
}

init();
