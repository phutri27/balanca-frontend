// frontend/components/setup.js
// Xử lý màn hình Setup — kết nối với backend API để tạo giải đấu

import { api } from '../services/api.js';
import { generateSchedule, gcdSetup } from './schedule-gen.js';

// ── State cục bộ ──
const MODE_CONFIG = {
  '3court':   { courts: 3, min: 14, max: 16 },
  '4court18': { courts: 4, min: 18, max: 18 },
  '4court':   { courts: 4, min: 20, max: 20 },
};

let currentMode     = '3court';
let selectedRounds  = 0;

// ── Helpers ──
function getNPlayers() {
  const cfg = MODE_CONFIG[currentMode];
  const raw = +document.getElementById('inp-players').value || cfg.max;
  return Math.min(cfg.max, Math.max(cfg.min, raw));
}

function getValidRounds(n, numCourts) {
  const effectiveCourts = Math.min(numCourts, Math.floor(n / 4));
  const slots    = effectiveCourts * 4;
  const cycleLen = n / gcdSetup(n, slots);
  const opts     = [];
  for (let m = 1; opts.length < 6; m++) {
    const r = cycleLen * m;
    if (r > 60) break;
    opts.push(r);
  }
  return { cycleLen, opts, effectiveCourts, slots };
}

// ── Render ──
function renderValidRounds() {
  const n   = getNPlayers();
  const cfg = MODE_CONFIG[currentMode];
  const { opts, cycleLen, slots } = getValidRounds(n, cfg.courts);
  const byePerRound   = n - slots;
  const gamesPerCycle = (slots * cycleLen) / n;
  const byesPerCycle  = (byePerRound * cycleLen) / n;

  const wrap = document.getElementById('valid-rounds-btns');
  wrap.innerHTML = '';
  document.getElementById('rounds-hint').textContent = `cycle=${cycleLen} · ${gamesPerCycle}G ${byesPerCycle}R`;

  opts.forEach(r => {
    const totalGames = (slots * r) / n;
    const totalByes  = (byePerRound * r) / n;
    const btn = document.createElement('button');
    btn.className = 'round-opt' + (r === selectedRounds ? ' active' : '');
    btn.innerHTML = `${r}<span class="opt-sub">${totalGames}G · ${totalByes}R</span>`;
    btn.title     = `${r} rounds: mỗi người chơi ${totalGames} trận, nghỉ ${totalByes} vòng`;
    btn.onclick   = () => {
      selectedRounds = r;
      wrap.querySelectorAll('.round-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
    wrap.appendChild(btn);
  });

  if (!opts.includes(selectedRounds)) selectedRounds = opts[1] || opts[0];
  wrap.querySelectorAll('.round-opt').forEach(b => {
    b.classList.toggle('active', parseInt(b.textContent) === selectedRounds);
  });
}

function renderPlayerInputs() {
  const n    = getNPlayers();
  const grid = document.getElementById('players-grid');
  grid.innerHTML = '';
  for (let i = 1; i <= n; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'player-input-wrap';
    wrap.innerHTML = `<span class="player-num">${i}</span>
      <input type="text" class="text-input" placeholder="Player ${i}" id="pname-${i}">`;
    grid.appendChild(wrap);
  }
}

// ── Mode selection ──
window.selectMode = function(mode) {
  const cfg = MODE_CONFIG[mode] || MODE_CONFIG['3court'];
  currentMode = mode;

  document.querySelectorAll('.seg-btn[data-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });

  const playersField = document.getElementById('players-field');
  const courtsField  = document.getElementById('courts-field');
  const inpPlayers   = document.getElementById('inp-players');

  if (cfg.min === cfg.max) {
    playersField.style.display = 'none';
    courtsField.style.display  = '';
    document.getElementById('courts-fixed-label').textContent = String(cfg.courts);
    inpPlayers.min = cfg.min; inpPlayers.max = cfg.max; inpPlayers.value = cfg.max;
  } else {
    playersField.style.display = '';
    courtsField.style.display  = 'none';
    inpPlayers.min = cfg.min; inpPlayers.max = cfg.max;
    if (+inpPlayers.value < cfg.min || +inpPlayers.value > cfg.max) inpPlayers.value = cfg.max;
  }

  renderPlayerInputs();
  renderValidRounds();
};

// ── Status helpers ──
function setStatus(msg, type = 'info') {
  const el = document.getElementById('api-status');
  el.style.display = 'block';
  el.textContent = msg;
  const colors = {
    info:    { bg: 'rgba(184,231,234,.2)',  color: '#1A8C95',  border: 'rgba(184,231,234,.4)' },
    error:   { bg: 'rgba(183,67,43,.1)',    color: '#B7432B',  border: 'rgba(183,67,43,.3)'  },
    success: { bg: 'rgba(22,163,74,.1)',    color: '#16A34A',  border: 'rgba(22,163,74,.3)'  },
    loading: { bg: 'rgba(33,36,77,.06)',    color: '#4A4D6E',  border: 'rgba(33,36,77,.1)'   },
  };
  const c = colors[type] || colors.info;
  el.style.background  = c.bg;
  el.style.color       = c.color;
  el.style.border      = `1px solid ${c.border}`;
}
function hideStatus() { document.getElementById('api-status').style.display = 'none'; }

// ── Start tournament ──
window.startTournament = async function() {
  const n = getNPlayers();
  const cfg = MODE_CONFIG[currentMode];
  const rounds = selectedRounds || 8;

  // Lấy tên người chơi
  const players = [];
  for (let i = 1; i <= n; i++) {
    const v = document.getElementById(`pname-${i}`)?.value?.trim();
    players.push(v || `P${i}`);
  }

  // Validate tên trùng
  const unique = new Set(players);
  if (unique.size !== players.length) {
    setStatus('⚠ Có tên người chơi bị trùng. Vui lòng kiểm tra lại.', 'error');
    return;
  }

  const btn = document.getElementById('btn-start');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Đang tạo giải đấu...';
  setStatus('⏳ Đang lưu giải đấu lên Firebase...', 'loading');

  try {
    // 1. Tạo tournament trên Firebase
    const tournament = await api.createTournament({
      name:        `Balanca Tournament ${new Date().toLocaleDateString('vi-VN')}`,
      mode:        currentMode,
      numCourts:   cfg.courts,
      totalRounds: rounds,
      players,
    });

    setStatus('⏳ Đang tạo lịch đấu...', 'loading');

    // 2. Generate lịch đấu (client-side algorithm)
    const schedule = generateSchedule(players, cfg.courts, rounds);

    // 3. Lưu schedule lên Firebase
    await api.saveSchedule(tournament.id, schedule);

    // 4. Khởi tạo kết quả rỗng
    await api.initResults(tournament.id, schedule);

    // 5. Khởi tạo player stats
    await api.initPlayers(tournament.id, players.map(name => ({
      name, wins: 0, losses: 0, games: 0, pts: 0,
    })));

    setStatus('✓ Đã tạo xong! Đang chuyển sang màn hình thi đấu...', 'success');

    // Lưu tournamentId vào sessionStorage để dùng ở tournament.html
    sessionStorage.setItem('activeTournamentId', tournament.id);
    sessionStorage.setItem('tournamentData', JSON.stringify({ ...tournament, schedule }));

    setTimeout(() => {
      window.location.href = 'tournament.html';
    }, 800);

  } catch (err) {
    console.error(err);
    setStatus(`❌ Lỗi: ${err.message}`, 'error');
    btn.disabled = false;
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><use href="#ico-play"/></svg> Start Tournament`;
  }
};

// ── Init ──
document.getElementById('inp-players').addEventListener('input', () => {
  renderPlayerInputs();
  renderValidRounds();
});

renderPlayerInputs();
renderValidRounds();

// Kiểm tra xem có giải đấu đang dở từ API không
(async function checkActiveTournament() {
  const savedId = sessionStorage.getItem('activeTournamentId');
  if (!savedId) return;

  try {
    const t = await api.getTournament(savedId);
    if (t && t.status === 'active') {
      const msg = `Tìm thấy giải đấu chưa hoàn thành (${t.players.length} người, vòng ${t.currentRound + 1}/${t.totalRounds}).\n\nTiếp tục giải đấu này?`;
      if (window.confirm(msg)) {
        window.location.href = 'tournament.html';
      } else {
        sessionStorage.removeItem('activeTournamentId');
        sessionStorage.removeItem('tournamentData');
      }
    }
  } catch (err) {
    // Tournament không còn tồn tại hoặc lỗi mạng — bỏ qua
    sessionStorage.removeItem('activeTournamentId');
  }
})();
