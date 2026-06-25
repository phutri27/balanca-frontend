// frontend/components/schedule-gen.js
// Thuật toán sinh lịch đấu — tách ra module độc lập, dùng chung cho setup và tournament

export function gcdSetup(a, b) { return b === 0 ? a : gcdSetup(b, a % b); }

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateSchedule(players, numCourts, totalRounds) {
  const n      = players.length;
  const courts = Math.min(numCourts, Math.floor(n / 4));
  const slots  = courts * 4;
  const byePerRound = n - slots;

  const byeCount      = {};
  const gamesCount    = {};
  const partnerCount  = {};
  const oppCount      = {};
  const oppPairsSeen  = {};

  players.forEach(p => {
    byeCount[p] = 0; gamesCount[p] = 0;
    partnerCount[p] = {}; oppCount[p] = {};
    players.forEach(q => { partnerCount[p][q] = 0; oppCount[p][q] = 0; });
    oppPairsSeen[p] = new Set();
  });

  const pairKey = (x, y) => [x, y].sort().join('|');
  const schedule = [];

  for (let r = 0; r < totalRounds; r++) {
    let playing, byes;
    if (byePerRound <= 0) {
      playing = [...players]; byes = [];
    } else {
      const ordered = shuffle([...players]).sort((a, b) => byeCount[a] - byeCount[b]);
      byes    = ordered.slice(0, byePerRound);
      playing = ordered.slice(byePerRound);
      byes.forEach(p => { byeCount[p]++; });
    }
    playing.forEach(p => { gamesCount[p]++; });

    const matches = formRoundMatches(playing, partnerCount, oppCount, oppPairsSeen, pairKey);

    matches.forEach(([a, b, c, d]) => {
      partnerCount[a][b]++; partnerCount[b][a]++;
      partnerCount[c][d]++; partnerCount[d][c]++;
      [a, b].forEach(x => [c, d].forEach(y => { oppCount[x][y]++; oppCount[y][x]++; }));
      oppPairsSeen[a].add(pairKey(c, d)); oppPairsSeen[b].add(pairKey(c, d));
      oppPairsSeen[c].add(pairKey(a, b)); oppPairsSeen[d].add(pairKey(a, b));
    });

    const courtAssignment = shuffle(matches);
    schedule.push({ round: r, matches: courtAssignment, byes });
  }
  return schedule;
}

function formRoundMatches(playing, partnerCount, oppCount, oppPairsSeen, pairKey) {
  const ATTEMPTS = playing.length >= 16 ? 150 : 60;
  let best = null, bestCost = Infinity;

  const totalOppFamiliarity = {};
  playing.forEach(p => {
    totalOppFamiliarity[p] = playing.reduce((sum, q) => sum + (q === p ? 0 : (oppCount[p][q] || 0)), 0);
  });

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let order;
    if (attempt % 2 === 0) {
      order = shuffle(playing);
    } else {
      order = shuffle(playing).sort((x, y) => totalOppFamiliarity[y] - totalOppFamiliarity[x]);
    }
    const result = buildMatchesGreedy(order, partnerCount, oppCount, oppPairsSeen, pairKey);
    if (!result) continue;
    const refined = localSearchRefine(result, partnerCount, oppCount, oppPairsSeen, pairKey);
    const cost = scoreMatches(refined, partnerCount, oppCount, oppPairsSeen, pairKey);
    if (cost < bestCost) {
      bestCost = cost; best = refined;
      if (cost === 0) break;
    }
  }

  if (!best) {
    // Fallback: allow any partner
    const order = shuffle(playing);
    best = buildMatchesGreedy(order, partnerCount, oppCount, oppPairsSeen, pairKey, true) || [];
  }
  return best;
}

function buildMatchesGreedy(order, partnerCount, oppCount, oppPairsSeen, pairKey, allowAnyFallback) {
  const remaining = [...order];
  const matches = [];

  while (remaining.length >= 4) {
    const a = remaining.shift();
    const familiarityOf = (cand) => remaining.reduce((sum, q) => q === cand ? sum : sum + (oppCount[cand][q] || 0), 0);
    const partnerCandidates = remaining.slice().sort((x, y) => {
      const px = partnerCount[a][x] || 0, py = partnerCount[a][y] || 0;
      if (px !== py) return px - py;
      return familiarityOf(x) - familiarityOf(y);
    });
    let b = null;
    for (const cand of partnerCandidates) {
      if ((partnerCount[a][cand] || 0) === 0) { b = cand; break; }
    }
    if (b === null && allowAnyFallback) b = partnerCandidates[0];
    if (b === null) return null;
    remaining.splice(remaining.indexOf(b), 1);

    const oppOptions = [];
    for (let x = 0; x < remaining.length; x++) {
      for (let y = x + 1; y < remaining.length; y++) {
        const c = remaining[x], d = remaining[y];
        oppOptions.push({
          c, d,
          pairAlreadyFaced:  oppPairsSeen[a].has(pairKey(c, d)) || oppPairsSeen[b].has(pairKey(c, d)),
          teamPartnerRepeat: (partnerCount[c][d] || 0) > 0 ? 1 : 0,
          oppFamiliarity:    (oppCount[a][c]||0)+(oppCount[a][d]||0)+(oppCount[b][c]||0)+(oppCount[b][d]||0),
        });
      }
    }
    if (oppOptions.length === 0) return null;
    oppOptions.sort((p, q) => {
      if (p.pairAlreadyFaced !== q.pairAlreadyFaced) return p.pairAlreadyFaced - q.pairAlreadyFaced;
      if (p.teamPartnerRepeat !== q.teamPartnerRepeat) return p.teamPartnerRepeat - q.teamPartnerRepeat;
      return p.oppFamiliarity - q.oppFamiliarity;
    });
    const final = oppOptions[0].pairAlreadyFaced
      ? (oppOptions.find(o => !o.pairAlreadyFaced) || oppOptions[0])
      : oppOptions[0];

    remaining.splice(remaining.indexOf(final.c), 1);
    remaining.splice(remaining.indexOf(final.d), 1);
    matches.push([a, b, final.c, final.d]);
  }
  return matches;
}

function localSearchRefine(matches, partnerCount, oppCount, oppPairsSeen, pairKey) {
  let best = matches.map(m => [...m]);
  let bestCost = scoreMatches(best, partnerCount, oppCount, oppPairsSeen, pairKey);

  for (let i = 0; i < best.length; i++) {
    for (let j = i + 1; j < best.length; j++) {
      // Swap team2 of match i with team1 of match j
      const candidate = best.map(m => [...m]);
      [candidate[i][2], candidate[i][3], candidate[j][0], candidate[j][1]] =
      [candidate[j][0], candidate[j][1], candidate[i][2], candidate[i][3]];
      const c = scoreMatches(candidate, partnerCount, oppCount, oppPairsSeen, pairKey);
      if (c < bestCost) { bestCost = c; best = candidate; }
    }
  }
  return best;
}

function scoreMatches(matches, partnerCount, oppCount, oppPairsSeen, pairKey) {
  let cost = 0;
  matches.forEach(([a, b, c, d]) => {
    if ((partnerCount[a][b] || 0) > 0) cost += 1000;
    if ((partnerCount[c][d] || 0) > 0) cost += 1000;
    if (oppPairsSeen[a].has(pairKey(c, d))) cost += 100;
    if (oppPairsSeen[b].has(pairKey(c, d))) cost += 100;
    cost += (oppCount[a][c]||0)+(oppCount[a][d]||0)+(oppCount[b][c]||0)+(oppCount[b][d]||0);
  });
  return cost;
}
