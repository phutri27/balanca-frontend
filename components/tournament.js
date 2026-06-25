// frontend/components/tournament.js
// Điều hành màn hình thi đấu — kết nối Firebase qua REST API

import { api } from '../services/api.js';

// ── State ──
let T = null;       // tournament doc
let schedule = [];  // array of round objects
let results  = [];  // array of result objects
let timers   = {};  // { courtIdx: { interval, seconds } }

// ── Toast ──
function toast(msg, ms = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

// ── Init ──
async function init() {
  const tid = sessionStorage.getItem('activeTournamentId');
  if (!tid) {
    window.location.href = 'setup.html';
    return;
  }

  try {
    [T, schedule, results] = await Promise.all([
      api.getTournament(tid),
      api.getSchedule(tid),
      api.getResults(tid),
    ]);

    // Rebuild history
    for (let r = 0; r < T.currentRound; r++) addHistoryEntry(r);

    document.getElementById('tournament-screen').style.display = 'block';
    document.getElementById('loading-overlay').style.display   = 'none';
    renderRound();
    renderLeaderboard();
    updateHeaderMeta();
  } catch (err) {
    console.error(err);
    alert('Lỗi tải giải đấu: ' + err.message);
    window.location.href = 'setup.html';
  }
}

// ── Header meta ──
function updateHeaderMeta() {
  document.getElementById('header-meta').textContent =
    `${T.players.length}p · ${T.numCourts}c · ${T.totalRounds}r`;
}

// ── Render current round ──
function renderRound() {
  const r     = T.currentRound;
  const round = schedule[r];
  const res   = results[r];
  if (!round) return;

  document.getElementById('round-badge').textContent  = `R${r + 1}`;
  document.getElementById('section-label').innerHTML  =
    `<span class="dot"></span> Round ${r + 1} / ${T.totalRounds} · Enter scores and confirm`;

  // Stats chips
  const confirmed = res.confirmed.filter(Boolean).length;
  document.getElementById('stats-row').innerHTML = `
    <div class="stat-chip"><span class="val">${T.players.length}</span> Players</div>
    <div class="stat-chip"><span class="val">${T.numCourts}</span> Courts</div>
    <div class="stat-chip"><span class="val">${confirmed}/${round.matches.length}</span> Done</div>
  `;

  // Byes
  const byeSec = document.getElementById('bye-section');
  const byeDiv = document.getElementById('bye-players');
  if (round.byes && round.byes.length > 0) {
    byeSec.style.display = 'flex';
    byeDiv.innerHTML = round.byes.map(p =>
      `<span class="rest-chip"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><use href="#ico-rest"/></svg> ${p}</span>`
    ).join('');
  } else {
    byeSec.style.display = 'none';
  }

  // Courts
  const grid = document.getElementById('courts-grid');
  grid.innerHTML = '';
  round.matches.forEach((match, idx) => {
    const [a, b, c, d]  = match;
    const score         = res.scores[idx];
    const isConfirmed   = res.confirmed[idx];
    const card          = document.createElement('div');
    card.className      = `court-card ${isConfirmed ? '' : 'active-match'}`;
    card.id             = `court-card-${idx}`;
    card.style.setProperty('--ci', idx);
    card.innerHTML = `
      <div class="court-header">
        <div class="court-name">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.8"><use href="#ico-court"/></svg>
          Court ${idx + 1}
        </div>
        <div class="court-status ${isConfirmed ? 'status-done' : 'status-playing'}">
          ${isConfirmed ? '✓ Done' : '● Playing'}
        </div>
      </div>
      <div class="court-body">
        <div class="match-team">
          <div class="team-info">
            <div class="team-name-1">${a}</div>
            <div class="team-name-2">${b}</div>
          </div>
          <div class="score-wrap">
            <input class="score-input" type="number" min="0" max="99"
              value="${score.t1s}" id="s-${r}-${idx}-1"
              ${isConfirmed ? 'disabled' : ''}
              oninput="onScoreInput(${r},${idx})">
          </div>
        </div>
        <div class="vs-divider">VS</div>
        <div class="match-team">
          <div class="team-info">
            <div class="team-name-1">${c}</div>
            <div class="team-name-2">${d}</div>
          </div>
          <div class="score-wrap">
            <input class="score-input" type="number" min="0" max="99"
              value="${score.t2s}" id="s-${r}-${idx}-2"
              ${isConfirmed ? 'disabled' : ''}
              oninput="onScoreInput(${r},${idx})">
          </div>
        </div>
        <div class="timer-row">
          <div class="timer-display" id="timer-${idx}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><use href="#ico-timer"/></svg>
            15:00
          </div>
          <div class="timer-btns">
            <button class="timer-btn" onclick="startTimer(${idx})" title="Start">▶</button>
            <button class="timer-btn" onclick="resetTimer(${idx})" title="Reset">↺</button>
          </div>
        </div>
        <button class="btn-confirm ${isConfirmed ? 'confirmed' : ''}"
          id="btn-confirm-${idx}"
          onclick="onConfirmMatch(${r},${idx},'${a}','${b}','${c}','${d}')"
          ${isConfirmed ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><use href="#ico-check"/></svg>
          ${isConfirmed ? 'Confirmed ✓' : 'Confirm Result'}
        </button>
        ${isConfirmed ? `<button class="btn-edit" onclick="onEditMatch(${r},${idx})">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><use href="#ico-edit"/></svg>
          Edit Score
        </button>` : ''}
      </div>
    `;
    grid.appendChild(card);
  });

  // Rounds info
  const remaining = T.totalRounds - r - 1;
  document.getElementById('rounds-info').innerHTML =
    `<strong>Round ${r + 1}</strong> of ${T.totalRounds} · <strong>${remaining}</strong> round${remaining !== 1 ? 's' : ''} remaining · ${T.players.length} players · ${T.numCourts} courts`;

  // Next round button
  const allConfirmed = res.confirmed.every(Boolean);
  const btnNext = document.getElementById('btn-next');
  btnNext.disabled = !allConfirmed;
  if (r >= T.totalRounds - 1) {
    btnNext.textContent = '🏆 Finish Tournament';
    btnNext.onclick = finishTournament;
  } else {
    btnNext.innerHTML = `Next Round <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><use href="#ico-arrow-r"/></svg>`;
    btnNext.onclick = nextRound;
  }
}

// ── Score input ──
window.onScoreInput = async function(round, courtIdx) {
  const t1 = document.getElementById(`s-${round}-${courtIdx}-1`).value;
  const t2 = document.getElementById(`s-${round}-${courtIdx}-2`).value;

  // Debounce update to API
  clearTimeout(window._scoreDebounce);
  window._scoreDebounce = setTimeout(async () => {
    try {
      const updated = await api.updateScore(T.id, round, courtIdx, { t1s: t1, t2s: t2 });
      results[round].scores = updated.scores;
    } catch (err) {
      console.warn('Score update error:', err.message);
    }
  }, 600);
};

// ── Confirm match ──
window.onConfirmMatch = async function(round, courtIdx, a, b, c, d) {
  const t1s = document.getElementById(`s-${round}-${courtIdx}-1`).value;
  const t2s = document.getElementById(`s-${round}-${courtIdx}-2`).value;

  if (t1s === '' || t2s === '') {
    toast('⚠ Nhập điểm cho cả 2 đội trước khi xác nhận'); return;
  }
  const s1 = parseInt(t1s), s2 = parseInt(t2s);
  if (isNaN(s1) || isNaN(s2)) { toast('⚠ Điểm số không hợp lệ'); return; }
  if (s1 === s2) { toast('⚠ Không được phép hoà'); return; }

  const btn = document.getElementById(`btn-confirm-${courtIdx}`);
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div>';

  try {
    const updated = await api.confirmMatch(T.id, round, courtIdx, {
      t1s, t2s,
      team1: [a, b],
      team2: [c, d],
    });
    results[round].scores    = updated.scores;
    results[round].confirmed = updated.confirmed;

    // Check all confirmed → enable next round
    const allDone = updated.confirmed.every(Boolean);
    document.getElementById('btn-next').disabled = !allDone;
    if (allDone) toast('✓ Vòng hoàn thành! Nhấn Next Round để tiếp tục.');

    renderRound();
    await refreshLeaderboard();
    toast(`✓ Trận Court ${courtIdx + 1} đã xác nhận`);
  } catch (err) {
    toast('❌ ' + err.message);
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><use href="#ico-check"/></svg> Confirm Result`;
  }
};

// ── Edit match ──
window.onEditMatch = async function(round, courtIdx) {
  try {
    const updated = await api.editMatch(T.id, round, courtIdx);
    results[round].confirmed = updated.confirmed;
    renderRound();
  } catch (err) {
    toast('❌ ' + err.message);
  }
};

// ── Next round ──
window.nextRound = async function() {
  if (T.currentRound >= T.totalRounds - 1) { finishTournament(); return; }

  addHistoryEntry(T.currentRound);

  try {
    // Stop all timers
    Object.values(timers).forEach(t => { if (t.interval) clearInterval(t.interval); });
    timers = {};

    T.currentRound++;
    await api.updateTournament(T.id, { currentRound: T.currentRound });
    renderRound();
    renderLeaderboard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    T.currentRound--;
    toast('❌ Lỗi chuyển vòng: ' + err.message);
  }
};

// ── Finish tournament ──
async function finishTournament() {
  addHistoryEntry(T.currentRound);

  try {
    const lb = await api.syncLeaderboard(T.id);
    const winner = lb[0];
    await api.finishTournament(T.id, winner);

    // Show end screen
    document.getElementById('tournament-screen').style.display = 'none';
    document.getElementById('end-screen').style.display        = 'block';
    document.getElementById('champion-name').textContent        = winner?.name || '—';

    const finalTable = document.getElementById('final-table');
    finalTable.innerHTML = `
      <div class="lb-col-hdr-row">
        <div></div><div></div>
        <div class="lb-col-hdr" style="color:var(--primary)">PTS</div>
        <div class="lb-col-hdr" style="color:var(--win)">W</div>
        <div class="lb-col-hdr" style="color:var(--loss)">L</div>
      </div>
      <div class="lb-body">
        ${lb.map((p, i) => `
          <div class="lb-row ${i === 0 ? 'rank1' : ''}">
            <div class="lb-rank">${i === 0 ? '👑' : i + 1}</div>
            <div class="lb-name">${p.name}</div>
            <div class="lb-val pts">${p.pts}</div>
            <div class="lb-val win">${p.wins}</div>
            <div class="lb-val loss">${p.losses}</div>
          </div>
        `).join('')}
      </div>
    `;

    sessionStorage.removeItem('activeTournamentId');
  } catch (err) {
    toast('❌ Lỗi kết thúc giải: ' + err.message);
  }
}

// ── Leaderboard ──
async function refreshLeaderboard() {
  try {
    const lb = await api.getLeaderboard(T.id);
    renderLeaderboardData(lb);
  } catch (err) {
    console.warn('Leaderboard error:', err);
  }
}

function renderLeaderboard() { refreshLeaderboard(); }

function renderLeaderboardData(lb) {
  document.getElementById('lb-body').innerHTML = lb.map((p, i) => `
    <div class="lb-row ${i === 0 ? 'rank1' : ''}">
      <div class="lb-rank">${i === 0 ? '👑' : i + 1}</div>
      <div class="lb-name">${p.name}</div>
      <div class="lb-val pts">${p.pts}</div>
      <div class="lb-val win">${p.wins}</div>
      <div class="lb-val loss">${p.losses}</div>
    </div>
  `).join('');
}

// ── History ──
function addHistoryEntry(round) {
  const roundData = schedule[round];
  const res       = results[round];
  if (!roundData) return;

  const body = document.getElementById('history-body');
  const div  = document.createElement('div');
  div.className = 'hist-round';
  div.innerHTML = `<div class="hist-round-label">Round ${round + 1}</div>` +
    roundData.matches.map((match, idx) => {
      const [a, b, c, d] = match;
      const sc = res?.scores?.[idx];
      if (!sc?.winner) return '';
      const w  = sc.winner === 1 ? `${a} & ${b}` : `${c} & ${d}`;
      return `<div class="hist-match">
        <span class="winner">🏆 ${w}</span>
        <span class="hist-score">${sc.t1s} – ${sc.t2s}</span>
      </div>`;
    }).join('');
  body.prepend(div);
}

window.toggleHistory = function() {
  const body = document.getElementById('history-body');
  const chev = document.getElementById('hist-chevron');
  const open = body.classList.toggle('open');
  chev.classList.toggle('open', open);
};

// ── Schedule panel ──
let schedView = 'rounds';
window.toggleSchedulePanel = function() {
  const body = document.getElementById('schedule-panel-body');
  const chev = document.getElementById('sched-chevron');
  const open = body.classList.toggle('open');
  chev.classList.toggle('open', open);
  if (open) renderScheduleView();
};
window.switchSchedView = function(view) {
  schedView = view;
  ['rounds', 'players'].forEach(v => {
    document.getElementById(`sched-view-${v}`).classList.toggle('active', v === view);
    document.getElementById(`sched-content-${v}`).classList.toggle('active', v === view);
  });
  renderScheduleView();
};
function renderScheduleView() {
  if (schedView === 'rounds') renderSchedByRounds();
  else renderSchedByPlayers();
}
function renderSchedByRounds() {
  const el  = document.getElementById('sched-content-rounds');
  const cur = T.currentRound, total = T.totalRounds;
  let html  = '<div class="sched-round-tabs">';
  for (let r = 0; r < total; r++) {
    const cls = r === cur ? 'sched-rtab cur active' : (r < cur ? 'sched-rtab done' : 'sched-rtab');
    html += `<button class="${cls}" onclick="showRoundTab(${r})" id="rtab-${r}">${r === cur ? '▶ ' : ''}R${r + 1}</button>`;
  }
  html += '</div><div id="round-tab-body"></div>';
  el.innerHTML = html;
  showRoundTab(cur);
}
window.showRoundTab = function(r) {
  document.querySelectorAll('[id^="rtab-"]').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById(`rtab-${r}`);
  if (tab) tab.classList.add('active');
  const round = schedule[r];
  const res   = results[r];
  const isDone = r < T.currentRound, isCur = r === T.currentRound;
  let html = '<div class="sched-match-grid">';
  round.matches.forEach(([a, b, c, d], idx) => {
    let resHtml = '';
    if ((isDone || (isCur && res.confirmed[idx])) && res.scores[idx]?.winner) {
      const sc = res.scores[idx];
      resHtml = `<div class="sched-match-result">${sc.winner===1?'🏆 ':''}<b>${sc.t1s}</b> – <b>${sc.t2s}</b>${sc.winner===2?' 🏆':''}</div>`;
    }
    html += `<div class="sched-match-card">
      <div class="sched-match-card-label"><svg width="11" height="11" viewBox="0 0 24 24" fill="none"><use href="#ico-court"/></svg> Court ${idx + 1}</div>
      <div class="sched-match-line">🟠 ${a} & ${b}</div>
      <div style="font-size:10px;color:var(--muted);padding:2px 0;font-weight:600">vs</div>
      <div class="sched-match-line">🔵 ${c} & ${d}</div>
      ${resHtml}
    </div>`;
  });
  if (round.byes?.length > 0)
    html += `<div class="sched-rest-card"><div class="sched-rest-label">Resting</div>${round.byes.map(p => `<div class="sched-match-line" style="color:var(--muted);font-size:12px">🪑 ${p}</div>`).join('')}</div>`;
  html += '</div>';
  document.getElementById('round-tab-body').innerHTML = html;
};
function renderSchedByPlayers() {
  const el      = document.getElementById('sched-content-players');
  const players = T.players, total = T.totalRounds, cur = T.currentRound;
  const pRounds = {};
  players.forEach(p => { pRounds[p] = []; });
  schedule.forEach((round, r) => {
    round.byes?.forEach(p => { pRounds[p][r] = { type: 'bye' }; });
    round.matches.forEach(([a, b, c, d], courtIdx) => {
      [[a, b], [c, d]].forEach((team, ti) => {
        team.forEach(p => {
          pRounds[p][r] = { type: 'play', court: courtIdx + 1, partner: team.find(x => x !== p), opps: ti === 0 ? [c, d] : [a, b], teamIdx: ti + 1, result: results[r]?.scores?.[courtIdx] };
        });
      });
    });
  });
  let html = `<div class="sched-matrix-wrap"><div style="display:grid;grid-template-columns:100px repeat(${total},minmax(38px,1fr));gap:3px;min-width:${100 + total * 42}px">`;
  html += `<div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--muted);align-self:end;padding-bottom:4px">Player</div>`;
  for (let r = 0; r < total; r++) html += `<div style="text-align:center;font-size:9px;font-weight:800;color:${r === cur ? 'var(--warn)' : 'var(--muted)'};padding-bottom:4px">R${r + 1}</div>`;
  players.forEach(p => {
    html += `<div class="sched-player-name">${p}</div>`;
    for (let r = 0; r < total; r++) {
      const info = pRounds[p][r];
      if (!info || info.type === 'bye') {
        html += `<div class="sched-cell bye ${r === cur ? 'current' : ''}">🪑</div>`;
      } else {
        let cls = 'play', label = `C${info.court}`;
        if (info.result?.winner) { const won = info.result.winner === info.teamIdx; cls = won ? 'done-win' : 'done-loss'; label = won ? 'W' : 'L'; }
        html += `<div class="sched-cell ${cls} ${r === cur ? 'current' : ''}" title="R${r+1}: C${info.court} w/${info.partner}">${label}</div>`;
      }
    }
  });
  html += '</div></div>';
  html += `<div class="sched-legend">
    <span><span class="sched-cell play" style="display:inline-block;padding:2px 6px;border-radius:4px">C#</span> Playing</span>
    <span><span class="sched-cell done-win" style="display:inline-block;padding:2px 6px;border-radius:4px">W</span> Win</span>
    <span><span class="sched-cell done-loss" style="display:inline-block;padding:2px 6px;border-radius:4px">L</span> Loss</span>
    <span><span class="sched-cell bye" style="display:inline-block;padding:2px 6px;border-radius:4px">🪑</span> Rest</span>
  </div>`;
  el.innerHTML = html;
}

// ── Timers ──
window.startTimer = function(idx) {
  if (timers[idx]?.interval) return;
  if (!timers[idx]) timers[idx] = { seconds: 900 };
  timers[idx].interval = setInterval(() => {
    timers[idx].seconds--;
    if (timers[idx].seconds < 0) timers[idx].seconds = 0;
    const m = Math.floor(timers[idx].seconds / 60).toString().padStart(2, '0');
    const s = (timers[idx].seconds % 60).toString().padStart(2, '0');
    const el = document.getElementById(`timer-${idx}`);
    if (el) el.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><use href="#ico-timer"/></svg> ${m}:${s}`;
    if (timers[idx].seconds === 0) clearInterval(timers[idx].interval);
  }, 1000);
};
window.resetTimer = function(idx) {
  if (timers[idx]?.interval) clearInterval(timers[idx].interval);
  timers[idx] = { seconds: 900 };
  const el = document.getElementById(`timer-${idx}`);
  if (el) el.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><use href="#ico-timer"/></svg> 15:00`;
};

// ── Reset modal ──
window.confirmResetTournament = function() {
  document.getElementById('reset-modal').classList.add('open');
};
window.closeResetModal = function() {
  document.getElementById('reset-modal').classList.remove('open');
};
window.doResetTournament = async function() {
  closeResetModal();
  try {
    // Re-init results
    await api.initResults(T.id, schedule);
    // Re-init player stats
    await api.initPlayers(T.id, T.players.map(name => ({
      name, wins: 0, losses: 0, games: 0, pts: 0,
    })));
    await api.updateTournament(T.id, { currentRound: 0 });

    // Reload
    results = await api.getResults(T.id);
    T.currentRound = 0;
    document.getElementById('history-body').innerHTML = '';
    Object.values(timers).forEach(t => { if (t.interval) clearInterval(t.interval); });
    timers = {};
    renderRound();
    await refreshLeaderboard();
    toast('✓ Tournament reset!');
  } catch (err) {
    toast('❌ Lỗi reset: ' + err.message);
  }
};

window.confirmLeave = function() {
  return window.confirm('Rời khỏi màn hình thi đấu? Giải đấu vẫn được lưu trên Firebase.');
};

// ── Boot ──
init();
