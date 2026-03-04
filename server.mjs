import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 8080);
const root = process.cwd();

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

const game = {
  players: [],
  nextPlayerId: 1,
  roundActive: true,
  countdownStartAt: null,
  result: null,
};

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('payload_too_large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function toLabel(choice) {
  if (choice === 'rock') return '✊ 石頭';
  if (choice === 'paper') return '✋ 布';
  return '✌️ 剪刀';
}

function calculateRound(choices) {
  const uniqueChoices = [...new Set(choices)];
  if (uniqueChoices.length === 1) return { type: 'draw', reason: '所有人都出一樣，這輪平手。' };
  if (uniqueChoices.length === 3) return { type: 'draw', reason: '三種手勢都出現，這輪平手。' };

  const [a, b] = uniqueChoices;
  return { type: 'win', winningChoice: beats[a] === b ? a : b };
}

function buildResult() {
  const result = calculateRound(game.players.map((p) => p.choice));
  if (result.type === 'draw') {
    return {
      type: 'draw',
      reason: result.reason,
      roundResultText: result.reason,
      winners: [],
      losers: [],
      winningChoice: null,
    };
  }

  const winners = game.players.filter((p) => p.choice === result.winningChoice).map((p) => p.id);
  const losers = game.players.filter((p) => p.choice !== result.winningChoice).map((p) => p.id);

  return {
    type: 'win',
    reason: '',
    roundResultText: `勝利手勢：${toLabel(result.winningChoice)}；贏家：${game.players
      .filter((p) => winners.includes(p.id))
      .map((p) => p.nickname)
      .join('、')}`,
    winners,
    losers,
    winningChoice: result.winningChoice,
  };
}

function syncGame() {
  if (!game.roundActive) return;
  if (game.players.length < 2) {
    game.countdownStartAt = null;
    return;
  }

  const allChosen = game.players.every((p) => p.choice);
  if (!allChosen) {
    game.countdownStartAt = null;
    return;
  }

  if (!game.countdownStartAt) {
    game.countdownStartAt = Date.now();
    return;
  }

  const elapsed = Date.now() - game.countdownStartAt;
  if (elapsed >= 3000) {
    game.roundActive = false;
    game.result = buildResult();
  }
}

function getPublicState() {
  syncGame();

  let countdown = null;
  if (game.roundActive && game.countdownStartAt) {
    const elapsedSeconds = Math.floor((Date.now() - game.countdownStartAt) / 1000);
    countdown = Math.max(1, 3 - elapsedSeconds);
  }

  return {
    players: game.players,
    roundActive: game.roundActive,
    countdown,
    result: game.result,
  };
}

function handleJoin({ clientId, nickname }) {
  const cleanNickname = String(nickname || '').trim().slice(0, 20);
  if (!clientId || !cleanNickname) return { ok: false, error: '缺少 clientId 或暱稱。' };

  const duplicate = game.players.find((p) => p.nickname === cleanNickname && p.clientId !== clientId);
  if (duplicate) return { ok: false, error: '暱稱重複，請使用其他名稱。' };

  const mine = game.players.find((p) => p.clientId === clientId);
  if (mine) {
    mine.nickname = cleanNickname;
    return { ok: true };
  }

  game.players.push({ id: game.nextPlayerId++, clientId, nickname: cleanNickname, choice: null });
  return { ok: true };
}

function handleChoose({ clientId, choice }) {
  syncGame();
  if (!game.roundActive || game.countdownStartAt) return { ok: false, error: '目前無法出拳。' };
  if (!['rock', 'paper', 'scissors'].includes(choice)) return { ok: false, error: '無效的出拳。' };

  const mine = game.players.find((p) => p.clientId === clientId);
  if (!mine) return { ok: false, error: '請先加入牌桌。' };

  mine.choice = choice;
  syncGame();
  return { ok: true };
}

function handleNextRound() {
  game.players = game.players.map((p) => ({ ...p, choice: null }));
  game.roundActive = true;
  game.countdownStartAt = null;
  game.result = null;
  return { ok: true };
}

createServer(async (req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (req.method === 'GET' && urlPath === '/api/state') {
    sendJson(res, 200, getPublicState());
    return;
  }

  if (req.method === 'POST' && ['/api/join', '/api/choose', '/api/next-round'].includes(urlPath)) {
    try {
      const payload = await readJson(req);
      let result;
      if (urlPath === '/api/join') result = handleJoin(payload);
      if (urlPath === '/api/choose') result = handleChoose(payload);
      if (urlPath === '/api/next-round') result = handleNextRound(payload);

      if (!result.ok) {
        sendJson(res, 400, result);
        return;
      }

      sendJson(res, 200, { ok: true, state: getPublicState() });
      return;
    } catch (error) {
      sendJson(res, 400, { ok: false, error: '請求格式錯誤。' });
      return;
    }
  }

  const safePath = normalize(urlPath).replace(/^\.\.(\/|\\|$)/, '');
  const filePath = join(root, safePath === '/' ? 'index.html' : safePath);

  if (!existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const type = contentTypes[extname(filePath)] || 'application/octet-stream';
  res.setHeader('Content-Type', type);
  createReadStream(filePath).pipe(res);
}).listen(port, '0.0.0.0', () => {
  console.log(`Server listening on ${port}`);
});
