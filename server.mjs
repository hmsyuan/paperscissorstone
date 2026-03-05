import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 8080);
const root = process.cwd();
const IDLE_MS = 15 * 60 * 1000;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

const sessions = new Map();
const gameKeys = ['rps', 'blackwhite', 'dice', 'gomoku', 'othello', 'darkchess'];

const state = {
  games: Object.fromEntries(gameKeys.map((k) => [k, createGameState(k)])),
};

function createGameState(type) {
  return {
    type,
    hostClientId: null,
    participants: [],
    status: '',
    data: defaultGameData(type),
    chat: [],
  };
}

function defaultGameData(type) {
  if (type === 'rps') return initRps();
  if (type === 'blackwhite') return { choices: {}, reveal: null };
  if (type === 'dice') return { rolls: {}, result: null };
  if (type === 'gomoku') return { board: Array.from({ length: 15 }, () => Array(15).fill(null)), turn: null, winner: null };
  if (type === 'othello') return initOthello();
  return initDarkChess();
}

function initRps() {
  return {
    choices: {},
    phase: 'picking',
    countdownStartAt: null,
    roundResult: null,
    round: 1,
    stats: {},
    finalResult: null,
  };
}

function ensureRpsStats(game) {
  for (const id of game.participants) {
    if (!game.data.stats[id]) game.data.stats[id] = { wins: 0, losses: 0, eliminated: false };
  }
}

function activeRpsPlayers(game) {
  ensureRpsStats(game);
  return game.participants.filter((id) => !game.data.stats[id].eliminated);
}

function settleRpsRound(game) {
  const active = activeRpsPlayers(game);
  const uniq = [...new Set(active.map((p) => game.data.choices[p]))];
  if (uniq.length === 1 || uniq.length === 3) {
    game.data.roundResult = { text: '本輪平手 😐', winners: [], losers: [], draw: true };
    return;
  }
  const beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  const winChoice = beats[uniq[0]] === uniq[1] ? uniq[0] : uniq[1];
  const winners = active.filter((p) => game.data.choices[p] === winChoice);
  const losers = active.filter((p) => game.data.choices[p] !== winChoice);
  for (const id of winners) game.data.stats[id].wins += 1;
  for (const id of losers) {
    game.data.stats[id].losses += 1;
    game.data.stats[id].eliminated = true;
  }
  game.data.roundResult = { winners, losers, draw: false, winChoice };
  const survivors = activeRpsPlayers(game);
  if (survivors.length <= 1) {
    game.data.phase = 'finished';
    game.data.finalResult = { champion: survivors[0] || null, losers: game.participants.filter((id) => id !== survivors[0]) };
  }
}

function processRpsTimers() {
  for (const game of Object.values(state.games)) {
    if (game.type !== 'rps') continue;
    if (game.data.phase !== 'countdown' || !game.data.countdownStartAt) continue;
    if (Date.now() - game.data.countdownStartAt < 3000) continue;
    game.data.phase = game.data.finalResult ? 'finished' : 'revealed';
  }
}

function initOthello() {
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  b[3][3] = 'W'; b[3][4] = 'B'; b[4][3] = 'B'; b[4][4] = 'W';
  return { board: b, turn: 'B', winner: null };
}

function initDarkChess() {
  const pieces = [];
  const defs = [
    ['k', 1], ['g', 2], ['m', 2], ['r', 2], ['n', 2], ['c', 2], ['p', 5],
  ];
  for (const color of ['R', 'B']) {
    for (const [kind, count] of defs) {
      for (let i = 0; i < count; i++) pieces.push({ color, kind, revealed: false });
    }
  }
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  const board = Array.from({ length: 8 }, () => Array(4).fill(null));
  let idx = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) board[y][x] = pieces[idx++];
  return { board, turnColor: null, winner: null, turnClientId: null, firstPlayerClientId: null, captures: {}, started: false, variantVotes: {} };
}


function ensureDarkCoinFlip(game) {
  if (game.type !== 'darkchess') return;
  if (game.participants.length < 2) {
    game.data.turnClientId = null;
    game.data.firstPlayerClientId = null;
    game.data.turnColor = null;
    return;
  }
  if (game.data.turnClientId && game.participants.includes(game.data.turnClientId)) return;
  const pick = game.participants[Math.floor(Math.random() * 2)];
  game.data.firstPlayerClientId = pick;
  game.data.turnClientId = pick;
  game.data.turnColor = game.participants[0] === pick ? 'R' : 'B';
}

function switchDarkTurn(game, currentId) {
  const next = game.participants.find((id) => id !== currentId) || currentId;
  game.data.turnClientId = next;
  game.data.turnColor = game.participants[0] === next ? 'R' : 'B';
}


const darkVariantDefs = [
  { key: 'generalCanCaptureSoldier', label: '帥可吃兵（特殊玩法）', defaultEnabled: false },
  { key: 'cannonSlideMove', label: '炮可直線平移多格（特殊玩法）', defaultEnabled: false },
];

function resolveDarkVariants(game) {
  const out = {};
  for (const def of darkVariantDefs) {
    const votes = game.data.variantVotes?.[def.key] || {};
    const enabledByAll = game.participants.length >= 2 && game.participants.every((id) => votes[id]);
    out[def.key] = def.defaultEnabled || enabledByAll;
  }
  out.cannonLongCapture = true;
  return out;
}

function darkVariantState(game, viewerId) {
  return darkVariantDefs.map((def) => {
    const votes = game.data.variantVotes?.[def.key] || {};
    const checkedByAll = game.participants.length >= 2 && game.participants.every((id) => votes[id]);
    return {
      key: def.key,
      label: def.label,
      myChecked: Boolean(votes[viewerId]),
      enabled: def.defaultEnabled || checkedByAll,
    };
  });
}

function darkPieceCanCapture(attacker, defender, variants) {
  if (attacker.kind === 'c') return true;
  const rank = { k: 7, g: 6, m: 5, r: 4, n: 3, c: 2, p: 1 };
  if (attacker.kind === 'k' && defender.kind === 'p' && !variants.generalCanCaptureSoldier) return false;
  if (attacker.kind === 'p' && defender.kind === 'k') return true;
  return rank[attacker.kind] >= rank[defender.kind];
}

function darkPathIntervening(board, from, to) {
  if (from.x !== to.x && from.y !== to.y) return null;
  const points = [];
  if (from.x === to.x) {
    const minY = Math.min(from.y, to.y);
    const maxY = Math.max(from.y, to.y);
    for (let y = minY + 1; y < maxY; y++) points.push(board[y]?.[from.x]);
  } else {
    const minX = Math.min(from.x, to.x);
    const maxX = Math.max(from.x, to.x);
    for (let x = minX + 1; x < maxX; x++) points.push(board[from.y]?.[x]);
  }
  return points;
}
function sendJson(res, code, payload) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

function upsertSession(clientId, nickname = null) {
  const now = Date.now();
  const s = sessions.get(clientId) || { clientId, nickname: '', currentGame: null, lastSeen: now };
  if (nickname !== null) s.nickname = String(nickname).trim().slice(0, 20);
  s.lastSeen = now;
  sessions.set(clientId, s);
  return s;
}

function pruneIdle() {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.lastSeen < IDLE_MS) continue;
    for (const g of Object.values(state.games)) {
      g.participants = g.participants.filter((p) => p !== id);
      if (g.hostClientId === id) g.hostClientId = g.participants[0] || null;
      cleanupGameData(g, id);
    }
    sessions.delete(id);
  }
}

function cleanupGameData(game, clientId) {
  if (game.type === 'rps') delete game.data.choices[clientId];
  if (game.type === 'rps' && game.data.stats) delete game.data.stats[clientId];
  if (game.type === 'blackwhite') delete game.data.choices[clientId];
  if (game.type === 'dice') delete game.data.rolls[clientId];
}


function publicDarkData(game, viewerId) {
  const captures = game.data.captures || {};
  const captureView = game.participants.map((id) => {
    const list = captures[id] || [];
    if (id === viewerId) return { playerId: id, count: list.length, pieces: list };
    return { playerId: id, count: list.length, pieces: null };
  });
  return { ...game.data, captureView, variantState: darkVariantState(game, viewerId), resolvedVariants: resolveDarkVariants(game) };
}

function publicState(clientId) {
  pruneIdle();
  processRpsTimers();
  for (const g of Object.values(state.games)) if (g.type === 'darkchess') ensureDarkCoinFlip(g);
  if (clientId && sessions.has(clientId)) upsertSession(clientId);
  const me = clientId ? sessions.get(clientId) : null;
  const games = Object.fromEntries(gameKeys.map((k) => {
    const g = state.games[k];
    const participants = g.participants.map((id) => ({ clientId: id, nickname: sessions.get(id)?.nickname || '玩家' }));
    const data = g.type === 'darkchess' ? publicDarkData(g, clientId) : g.data;
    return [k, { ...g, data, participants }];
  }));
  return {
    me,
    idleMinutes: 15,
    games,
  };
}

function joinGame(clientId, gameType) {
  if (!sessions.has(clientId)) return { ok: false, error: '請先設定暱稱。' };
  if (!state.games[gameType]) return { ok: false, error: '未知遊戲。' };

  for (const g of Object.values(state.games)) g.participants = g.participants.filter((p) => p !== clientId);

  const game = state.games[gameType];
  game.participants.push(clientId);
  if (!game.hostClientId) game.hostClientId = clientId;

  const s = sessions.get(clientId);
  s.currentGame = gameType;
  s.lastSeen = Date.now();

  if (game.type === 'gomoku' && !game.data.turn && game.participants.length >= 2) game.data.turn = game.participants[0];
  if (game.type === 'rps') ensureRpsStats(game);
  if (game.type === 'darkchess') ensureDarkCoinFlip(game);
  return { ok: true };
}

function leaveGame(clientId) {
  const s = sessions.get(clientId);
  if (!s || !s.currentGame) return { ok: true };
  const g = state.games[s.currentGame];
  g.participants = g.participants.filter((p) => p !== clientId);
  if (g.hostClientId === clientId) g.hostClientId = g.participants[0] || null;
  cleanupGameData(g, clientId);
  if (g.type === 'darkchess') ensureDarkCoinFlip(g);
  s.currentGame = null;
  return { ok: true };
}



function sendChat(clientId, text) {
  const s = sessions.get(clientId);
  if (!s || !s.currentGame) return { ok: false, error: '請先加入遊戲。' };
  const g = state.games[s.currentGame];
  const t = String(text || '').trim().slice(0, 120);
  if (!t) return { ok: false, error: '訊息不可空白。' };
  g.chat.push({ sender: s.nickname || '玩家', text: t, clientId, at: Date.now() });
  if (g.chat.length > 200) g.chat.shift();
  return { ok: true };
}

function claimHost(clientId) {
  const s = sessions.get(clientId);
  if (!s || !s.currentGame) return { ok: false, error: '請先加入遊戲。' };
  const g = state.games[s.currentGame];
  if (g.hostClientId && g.hostClientId !== clientId) return { ok: false, error: '主持權已有人。' };
  g.hostClientId = clientId;
  return { ok: true };
}

function releaseHost(clientId) {
  const s = sessions.get(clientId);
  if (!s || !s.currentGame) return { ok: false, error: '請先加入遊戲。' };
  const g = state.games[s.currentGame];
  if (g.hostClientId !== clientId) return { ok: false, error: '只有主持人可放棄。' };
  g.hostClientId = null;
  return { ok: true };
}

function kick(hostId, targetId, gameType) {
  const g = state.games[gameType];
  if (!g || g.hostClientId !== hostId) return { ok: false, error: '只有主持人可踢人。' };
  g.participants = g.participants.filter((p) => p !== targetId);
  if (g.hostClientId === targetId) g.hostClientId = g.participants[0] || null;
  const s = sessions.get(targetId);
  if (s && s.currentGame === gameType) s.currentGame = null;
  cleanupGameData(g, targetId);
  if (g.type === 'darkchess') ensureDarkCoinFlip(g);
  return { ok: true };
}

function act(clientId, payload) {
  const s = sessions.get(clientId);
  if (!s || !s.currentGame) return { ok: false, error: '請先加入遊戲。' };
  const g = state.games[s.currentGame];
  if (!g.participants.includes(clientId)) return { ok: false, error: '你不在此遊戲中。' };

  if (g.type === 'rps') {
    if (payload.action === 'pick') {
      if (g.data.phase !== 'picking') return { ok: false, error: '請等待本輪結算。' };
      if (!['rock', 'paper', 'scissors'].includes(payload.value)) return { ok: false, error: '無效出拳。' };
      const active = activeRpsPlayers(g);
      if (!active.includes(clientId)) return { ok: false, error: '你已淘汰，本輪不可出拳。' };
      g.data.choices[clientId] = payload.value;
      const all = active.every((p) => g.data.choices[p]);
      if (all && active.length >= 2) {
        settleRpsRound(g);
        g.data.phase = 'countdown';
        g.data.countdownStartAt = Date.now();
      }
      return { ok: true };
    }
    if (payload.action === 'next') {
      if (g.hostClientId !== clientId) return { ok: false, error: '僅主持人可控制下一輪。' };
      if (g.data.phase === 'finished') {
        g.data = initRps();
        ensureRpsStats(g);
        return { ok: true };
      }
      if (g.data.phase !== 'revealed') return { ok: false, error: '請等待本輪揭曉。' };
      g.data.round += 1;
      g.data.phase = 'picking';
      g.data.choices = {};
      g.data.roundResult = null;
      g.data.countdownStartAt = null;
      return { ok: true };
    }
  }

  if (g.type === 'blackwhite') {
    if (payload.action === 'pick') {
      if (!['black', 'white'].includes(payload.value)) return { ok: false, error: '無效選項。' };
      g.data.choices[clientId] = payload.value;
      return { ok: true };
    }
    if (payload.action === 'reveal') {
      if (g.hostClientId !== clientId) return { ok: false, error: '主持人才能開獎。' };
      const out = Math.random() > 0.5 ? 'black' : 'white';
      const winners = g.participants.filter((p) => g.data.choices[p] === out);
      g.data.reveal = { out, winners };
      return { ok: true };
    }
    if (payload.action === 'next') {
      g.data = defaultGameData('blackwhite');
      return { ok: true };
    }
  }

  if (g.type === 'dice') {
    if (payload.action === 'roll') {
      if (g.data.rolls[clientId]) return { ok: true };
      g.data.rolls[clientId] = 1 + Math.floor(Math.random() * 6);
      const all = g.participants.every((p) => g.data.rolls[p]);
      if (all && g.participants.length >= 2) {
        const max = Math.max(...Object.values(g.data.rolls));
        const winners = g.participants.filter((p) => g.data.rolls[p] === max);
        g.data.result = { max, winners };
      }
      return { ok: true };
    }
    if (payload.action === 'next') {
      g.data = defaultGameData('dice');
      return { ok: true };
    }
  }

  if (g.type === 'gomoku') return gomokuAct(g, clientId, payload);
  if (g.type === 'othello') return othelloAct(g, clientId, payload);
  return darkAct(g, clientId, payload);
}

function gomokuAct(g, clientId, payload) {
  if (payload.action === 'reset') {
    g.data = defaultGameData('gomoku');
    if (g.participants.length >= 2) g.data.turn = g.participants[0];
    return { ok: true };
  }
  if (payload.action !== 'place') return { ok: false, error: '無效動作。' };
  if (g.participants.length < 2) return { ok: false, error: '需至少兩人。' };
  if (g.data.winner) return { ok: false, error: '已結束。' };
  if (g.data.turn !== clientId) return { ok: false, error: '尚未輪到你。' };
  const { x, y } = payload;
  if (x < 0 || y < 0 || x >= 15 || y >= 15) return { ok: false, error: '座標錯誤。' };
  if (g.data.board[y][x]) return { ok: false, error: '此格已有棋子。' };
  const symbol = g.participants[0] === clientId ? 'B' : 'W';
  g.data.board[y][x] = symbol;
  if (five(g.data.board, x, y, symbol)) g.data.winner = clientId;
  else g.data.turn = g.participants.find((p) => p !== clientId) || clientId;
  return { ok: true };
}

function five(b, x, y, s) {
  const dirs = [[1,0],[0,1],[1,1],[1,-1]];
  for (const [dx,dy] of dirs) {
    let c = 1;
    for (const k of [1,-1]) {
      let nx=x+dx*k, ny=y+dy*k;
      while (b[ny]?.[nx]===s) { c++; nx+=dx*k; ny+=dy*k; }
    }
    if (c>=5) return true;
  }
  return false;
}

function othelloAct(g, clientId, payload) {
  if (payload.action === 'reset') { g.data = initOthello(); return { ok: true }; }
  if (payload.action !== 'place') return { ok: false, error: '無效動作。' };
  if (g.participants.length < 2) return { ok: false, error: '需至少兩人。' };
  const myColor = g.participants[0] === clientId ? 'B' : 'W';
  if (g.data.turn !== myColor) return { ok: false, error: '尚未輪到你。' };
  const { x, y } = payload;
  if (!validOthello(g.data.board, x, y, myColor).length) return { ok: false, error: '不能下在這。' };
  const flips = validOthello(g.data.board, x, y, myColor);
  g.data.board[y][x] = myColor;
  for (const [fx,fy] of flips) g.data.board[fy][fx] = myColor;
  const op = myColor === 'B' ? 'W' : 'B';
  g.data.turn = hasAny(g.data.board, op) ? op : myColor;
  if (!hasAny(g.data.board, 'B') && !hasAny(g.data.board, 'W')) {
    g.data.winner = score(g.data.board);
  }
  return { ok: true };
}

function validOthello(b,x,y,c){
  if (x<0||y<0||x>=8||y>=8||b[y][x]) return [];
  const op = c==='B'?'W':'B'; const out=[];
  for (const dx of [-1,0,1]) for (const dy of [-1,0,1]) {
    if(!dx&&!dy) continue; let nx=x+dx, ny=y+dy, line=[];
    while(b[ny]?.[nx]===op){ line.push([nx,ny]); nx+=dx; ny+=dy; }
    if(line.length && b[ny]?.[nx]===c) out.push(...line);
  }
  return out;
}
function hasAny(b,c){ for(let y=0;y<8;y++)for(let x=0;x<8;x++) if(validOthello(b,x,y,c).length) return true; return false; }
function score(b){ let B=0,W=0; for(const r of b)for(const v of r){ if(v==='B')B++; if(v==='W')W++; } return B===W?'draw':(B>W?'B':'W'); }

function darkAct(g, clientId, payload) {
  if (payload.action === 'reset') {
    g.data = initDarkChess();
    ensureDarkCoinFlip(g);
    return { ok: true };
  }
  if (g.participants.length < 2) return { ok: false, error: '需至少兩人。' };
  ensureDarkCoinFlip(g);

  if (payload.action === 'set-variant') {
    if (g.data.started) return { ok: false, error: '開局後不可變更特殊玩法。' };
    const def = darkVariantDefs.find((v) => v.key === payload.key);
    if (!def) return { ok: false, error: '未知特殊玩法。' };
    if (!g.data.variantVotes[payload.key]) g.data.variantVotes[payload.key] = {};
    g.data.variantVotes[payload.key][clientId] = Boolean(payload.value);
    return { ok: true };
  }

  if (g.data.turnClientId !== clientId) return { ok: false, error: '尚未輪到你。' };
  const variants = resolveDarkVariants(g);

  if (payload.action === 'flip') {
    const { x, y } = payload; const p = g.data.board[y]?.[x];
    if (!p || p.revealed) return { ok: false, error: '不可翻。' };
    p.revealed = true;
    g.data.started = true;
    switchDarkTurn(g, clientId);
    return { ok: true };
  }

  if (payload.action === 'move') {
    const { from, to } = payload;
    const a = g.data.board[from.y]?.[from.x];
    const b = g.data.board[to.y]?.[to.x];
    if (!a || !a.revealed) return { ok: false, error: '起點無效。' };
    const myColor = g.participants[0] === clientId ? 'R' : 'B';
    if (a.color !== myColor) return { ok: false, error: '不可操作對手棋子。' };

    if (a.kind === 'c') {
      if (!b) {
        if (variants.cannonSlideMove) {
          const line = darkPathIntervening(g.data.board, from, to);
          if (!line) return { ok: false, error: '炮只能直線移動。' };
          if (line.some(Boolean)) return { ok: false, error: '炮移動路徑不可有棋子。' };
        } else if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) !== 1) {
          return { ok: false, error: '炮未開啟特殊玩法時只能走一步。' };
        }
      } else {
        if (!b.revealed || b.color === a.color) return { ok: false, error: '不可吃子。' };
        const line = darkPathIntervening(g.data.board, from, to);
        if (!line) return { ok: false, error: '炮只能直線吃子。' };
        const blockers = line.filter(Boolean).length;
        if (blockers !== 1) return { ok: false, error: '炮吃子必須隔一子。' };
      }
    } else {
      if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) !== 1) return { ok: false, error: '只能走一步。' };
      if (b) {
        if (!b.revealed || b.color === a.color) return { ok: false, error: '不可吃子。' };
        if (!darkPieceCanCapture(a, b, variants)) return { ok: false, error: '此棋子無法吃掉目標。' };
      }
    }

    if (b) {
      if (!g.data.captures[clientId]) g.data.captures[clientId] = [];
      g.data.captures[clientId].push({ color: b.color, kind: b.kind });
    }
    g.data.board[to.y][to.x] = a;
    g.data.board[from.y][from.x] = null;
    g.data.started = true;
    switchDarkTurn(g, clientId);
    return { ok: true };
  }
  return { ok: false, error: '無效動作。' };
}

createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/state') {
    const clientId = url.searchParams.get('clientId') || '';
    return sendJson(res, 200, { ok: true, state: publicState(clientId) });
  }

  if (req.method === 'POST' && path.startsWith('/api/')) {
    try {
      const body = await readJson(req);
      const { clientId } = body;
      if (clientId) upsertSession(clientId);

      let result = { ok: false, error: '未知 API' };
      if (path === '/api/set-profile') {
        const s = upsertSession(clientId, body.nickname || '');
        if (!s.nickname) result = { ok: false, error: '暱稱不可空白。' };
        else result = { ok: true };
      }
      if (path === '/api/join-game') result = joinGame(clientId, body.gameType);
      if (path === '/api/leave-game') result = leaveGame(clientId);
      if (path === '/api/claim-host') result = claimHost(clientId);
      if (path === '/api/release-host') result = releaseHost(clientId);
      if (path === '/api/chat') result = sendChat(clientId, body.text);
      if (path === '/api/kick') result = kick(clientId, body.targetClientId, body.gameType);
      if (path === '/api/act') result = act(clientId, body);

      if (!result.ok) return sendJson(res, 400, result);
      return sendJson(res, 200, { ok: true, state: publicState(clientId) });
    } catch {
      return sendJson(res, 400, { ok: false, error: '請求格式錯誤。' });
    }
  }

  const safePath = normalize(path).replace(/^\.\.(\/|\\|$)/, '');
  const filePath = join(root, safePath === '/' ? 'index.html' : safePath);
  if (!existsSync(filePath)) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', contentTypes[extname(filePath)] || 'application/octet-stream');
  createReadStream(filePath).pipe(res);
}).listen(port, '0.0.0.0', () => {
  console.log(`Server listening on ${port}`);
});
