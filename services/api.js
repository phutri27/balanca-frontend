// frontend/services/api.js
// ─────────────────────────────────────────────────────────────────────────────
// Toàn bộ giao tiếp với backend API tập trung ở đây.
// Sửa BASE_URL khi deploy lên server thực tế.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://balanca-backend.vercel.app/api';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Tournaments ──────────────────────────────────────────────────────────────
export const api = {

  // Tạo giải đấu mới
  createTournament: (payload) =>
    request('POST', '/tournaments', payload),

  // Lấy danh sách giải đấu
  listTournaments: () =>
    request('GET', '/tournaments'),

  // Chi tiết 1 giải
  getTournament: (id) =>
    request('GET', `/tournaments/${id}`),

  // Cập nhật giải (currentRound, status…)
  updateTournament: (id, updates) =>
    request('PATCH', `/tournaments/${id}`, updates),

  // Kết thúc giải
  finishTournament: (id, winner) =>
    request('POST', `/tournaments/${id}/finish`, { winner }),

  // Xóa giải
  deleteTournament: (id) =>
    request('DELETE', `/tournaments/${id}`),

  // ── Players ────────────────────────────────────────────────────────────────
  // Lấy danh sách người chơi + stats
  getPlayers: (tournamentId) =>
    request('GET', `/players/${tournamentId}`),

  // Khởi tạo players
  initPlayers: (tournamentId, players) =>
    request('POST', `/players/${tournamentId}`, { players }),

  // Cập nhật stats 1 người
  updatePlayerStats: (tournamentId, playerName, stats) =>
    request('PATCH', `/players/${tournamentId}/${encodeURIComponent(playerName)}`, stats),

  // ── Schedule ───────────────────────────────────────────────────────────────
  // Lưu lịch đấu
  saveSchedule: (tournamentId, schedule) =>
    request('POST', `/schedule/${tournamentId}`, { schedule }),

  // Lấy toàn bộ lịch
  getSchedule: (tournamentId) =>
    request('GET', `/schedule/${tournamentId}`),

  // Lấy 1 vòng
  getRound: (tournamentId, round) =>
    request('GET', `/schedule/${tournamentId}/${round}`),

  // ── Results ────────────────────────────────────────────────────────────────
  // Khởi tạo kết quả
  initResults: (tournamentId, schedule) =>
    request('POST', `/results/${tournamentId}`, { schedule }),

  // Lấy tất cả kết quả
  getResults: (tournamentId) =>
    request('GET', `/results/${tournamentId}`),

  // Lấy kết quả 1 vòng
  getRoundResults: (tournamentId, round) =>
    request('GET', `/results/${tournamentId}/${round}`),

  // Cập nhật điểm 1 trận (chưa xác nhận)
  updateScore: (tournamentId, round, courtIdx, { t1s, t2s }) =>
    request('PATCH', `/results/${tournamentId}/${round}/${courtIdx}`, { t1s, t2s }),

  // Xác nhận kết quả trận
  confirmMatch: (tournamentId, round, courtIdx, { t1s, t2s, team1, team2 }) =>
    request('POST', `/results/${tournamentId}/${round}/${courtIdx}/confirm`, { t1s, t2s, team1, team2 }),

  // Huỷ xác nhận để sửa
  editMatch: (tournamentId, round, courtIdx) =>
    request('POST', `/results/${tournamentId}/${round}/${courtIdx}/edit`),

  // ── Leaderboard ────────────────────────────────────────────────────────────
  // Lấy bảng xếp hạng
  getLeaderboard: (tournamentId) =>
    request('GET', `/leaderboard/${tournamentId}`),

  // Đồng bộ lại stats từ kết quả
  syncLeaderboard: (tournamentId) =>
    request('POST', `/leaderboard/${tournamentId}/sync`),
};
