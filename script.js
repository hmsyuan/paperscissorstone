const meId = getOrCreateClientId();
let appState = null;
let darkSelected = null;

const el = {
  nick: document.getElementById('nickname'),
  save: document.getElementById('save-profile'),
  leave: document.getElementById('leave-game'),
  status: document.getElementById('status'),
  gameList: document.getElementById('game-list'),
  room: document.getElementById('game-room'),
  gameTitle: document.getElementById('game-title'),
  participants: document.getElementById('participants'),
  gameUi: document.getElementById('game-ui'),
  claimHost: document.getElementById('claim-host'),
  releaseHost: document.getElementById('release-host'),
  chatList: document.getElementById('chat-list'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),
};

const gameMeta = {
  rps: { name: '剪刀石頭布', icon: '✊' },
  blackwhite: { name: '黑白猜', icon: '⚫' },
  dice: { name: '擲骰子比大小', icon: '🎲' },
  gomoku: { name: '五子棋', icon: '⚪' },
  othello: { name: '黑白棋', icon: '⚫' },
  darkchess: { name: '暗棋', icon: '🀫' },
};

el.save.onclick = async () => {
  const r = await api('/api/set-profile', { clientId: meId, nickname: el.nick.value.trim() });
  if (!r.ok) return setStatus(r.error);
  appState = withGames(r.state);
  setStatus('暱稱已更新');
  render();
};

el.leave.onclick = async () => {
  const r = await api('/api/leave-game', { clientId: meId });
  if (!r.ok) return setStatus(r.error);
  appState = withGames(r.state);
  darkSelected = null;
  render();
};

el.claimHost.onclick = async () => hostToggle(true);
el.releaseHost.onclick = async () => hostToggle(false);

async function hostToggle(claim) {
  const endpoint = claim ? '/api/claim-host' : '/api/release-host';
  const r = await api(endpoint, { clientId: meId });
  if (!r.ok) return setStatus(r.error);
  appState = withGames(r.state);
  setStatus(claim ? '已取得主持權' : '已放棄主持權');
  render();
}

el.chatForm.onsubmit = async (e) => {
  e.preventDefault();
  const text = el.chatInput.value.trim();
  if (!text) return;
  const r = await api('/api/chat', { clientId: meId, text });
  if (!r.ok) return setStatus(r.error);
  el.chatInput.value = '';
  appState = withGames(r.state);
  render();
};

function withGames(state) {
  return { ...state, stateGames: state.games };
}

function setStatus(msg) {
  el.status.textContent = msg;
}

function getOrCreateClientId() {
  const key = 'orphan-client-id';
  const v = localStorage.getItem(key);
  if (v) return v;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

async function api(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function fetchState() {
  const res = await fetch(`/api/state?clientId=${encodeURIComponent(meId)}`);
  const json = await res.json();
  if (!json.ok) return;
  appState = withGames(json.state);
  render();
}

function currentGame() {
  if (!appState?.me?.currentGame) return null;
  return appState.stateGames[appState.me.currentGame] || null;
}

function render() {
  if (!appState) return;
  const me = appState.me || {};
  el.nick.value = me.nickname || '';

  renderLobby();

  const gameKey = me.currentGame;
  const game = currentGame();
  el.room.hidden = !game;
  if (!game) return;

  el.gameTitle.textContent = `${gameMeta[gameKey].icon} ${gameMeta[gameKey].name}`;
  renderParticipants(game, gameKey);
  renderGame(gameKey, game);
  renderChat(game);
}

function renderLobby() {
  el.gameList.innerHTML = '';
  for (const [key, meta] of Object.entries(gameMeta)) {
    const g = appState.stateGames[key];
    const card = document.createElement('button');
    card.className = 'game-card';
    card.innerHTML = `<span class="game-icon">${meta.icon}</span><strong>${meta.name}</strong><small>${g.participants.length} 人在線</small>`;
    card.onclick = async () => {
      const r = await api('/api/join-game', { clientId: meId, gameType: key });
      if (!r.ok) return setStatus(r.error);
      appState = withGames(r.state);
      darkSelected = null;
      render();
    };
    el.gameList.appendChild(card);
  }
}

function renderParticipants(game, gameKey) {
  el.participants.innerHTML = '<h3>對戰席位</h3>';
  const isHost = game.hostClientId === meId;
  for (const p of game.participants) {
    const row = document.createElement('div');
    row.className = 'p-row';
    row.innerHTML = `<span>${p.nickname}${p.clientId === game.hostClientId ? ' 👑' : ''}${p.clientId === meId ? '（你）' : ''}</span>`;
    if (isHost && p.clientId !== meId) {
      const kick = document.createElement('button');
      kick.className = 'kick';
      kick.textContent = '踢出';
      kick.onclick = async () => {
        const r = await api('/api/kick', { clientId: meId, targetClientId: p.clientId, gameType: gameKey });
        if (!r.ok) return setStatus(r.error);
        appState = withGames(r.state);
        render();
      };
      row.appendChild(kick);
    }
    el.participants.appendChild(row);
  }
}

async function doAct(payload) {
  const r = await api('/api/act', { clientId: meId, ...payload });
  if (!r.ok) return setStatus(r.error);
  appState = withGames(r.state);
  render();
}

function renderGame(type, game) {
  darkSelected = type === 'darkchess' ? darkSelected : null;
  if (type === 'rps') return renderRps(game);
  if (type === 'blackwhite') return renderBlackWhite(game);
  if (type === 'dice') return renderDice(game);
  if (type === 'gomoku') return renderGomoku(game);
  if (type === 'othello') return renderOthello(game);
  return renderDarkChess(game);
}

function renderRps(game) {
  const myPick = game.data.choices[meId];
  const result = game.data.result?.text || '等待所有玩家出拳';
  el.gameUi.innerHTML = `
    <div class="arena rps-arena">
      <div class="rps-table">${result}</div>
      <div class="rps-actions"></div>
      <div class="note">你目前出拳：${myPick || '尚未出拳'}</div>
    </div>`;

  const actions = el.gameUi.querySelector('.rps-actions');
  const opts = [['rock', '✊ 石頭'], ['paper', '✋ 布'], ['scissors', '✌️ 剪刀']];
  for (const [value, label] of opts) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => doAct({ action: 'pick', value });
    actions.appendChild(b);
  }
  const next = document.createElement('button');
  next.textContent = '下一輪';
  next.onclick = () => doAct({ action: 'next' });
  actions.appendChild(next);
}

function renderBlackWhite(game) {
  const reveal = game.data.reveal;
  const winners = reveal?.winners?.map((id) => findName(game, id)).join('、') || '';
  el.gameUi.innerHTML = `
    <div class="arena bw-arena">
      <div class="bw-coins"><span>⚫</span><span>⚪</span></div>
      <div class="bw-result">${reveal ? `開獎：${reveal.out === 'black' ? '⚫ 黑' : '⚪ 白'}，勝者：${winners || '無'}` : '等待主持人開獎'}</div>
      <div class="rps-actions"></div>
    </div>`;
  const actions = el.gameUi.querySelector('.rps-actions');
  [['black', '選黑 ⚫'], ['white', '選白 ⚪']].forEach(([value, text]) => {
    const b = document.createElement('button'); b.textContent = text; b.onclick = () => doAct({ action: 'pick', value }); actions.appendChild(b);
  });
  const open = document.createElement('button'); open.textContent = '主持人開獎'; open.onclick = () => doAct({ action: 'reveal' }); actions.appendChild(open);
  const next = document.createElement('button'); next.textContent = '下一輪'; next.onclick = () => doAct({ action: 'next' }); actions.appendChild(next);
}

function renderDice(game) {
  const lines = game.participants.map((p) => `${p.nickname}: ${game.data.rolls[p.clientId] || '-'}`).join(' ｜ ');
  const result = game.data.result ? `🎯 最高點 ${game.data.result.max}，勝者：${game.data.result.winners.map((id) => findName(game, id)).join('、')}` : '等待擲骰';
  el.gameUi.innerHTML = `
    <div class="arena dice-arena">
      <div class="dice-cup">🥤</div>
      <div class="dice-bowl">🎲 🎲</div>
      <div>${lines}</div>
      <div>${result}</div>
      <div class="rps-actions"></div>
    </div>`;
  const actions = el.gameUi.querySelector('.rps-actions');
  const roll = document.createElement('button'); roll.textContent = '擲骰'; roll.onclick = () => doAct({ action: 'roll' }); actions.appendChild(roll);
  const next = document.createElement('button'); next.textContent = '下一輪'; next.onclick = () => doAct({ action: 'next' }); actions.appendChild(next);
}

function renderGomoku(game) {
  const board = document.createElement('div');
  board.className = 'board15 board-wood';
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      const cell = document.createElement('button');
      cell.className = 'cell stone';
      const v = game.data.board[y][x];
      cell.textContent = v === 'B' ? '⚫' : v === 'W' ? '⚪' : '';
      cell.onclick = () => doAct({ action: 'place', x, y });
      board.appendChild(cell);
    }
  }
  el.gameUi.innerHTML = `<div class="arena"><div>五子棋 ${game.data.winner ? `🏁 勝者：${findName(game, game.data.winner)}` : ''}</div></div>`;
  el.gameUi.firstElementChild.appendChild(board);
  const reset = document.createElement('button'); reset.textContent = '重開棋局'; reset.onclick = () => doAct({ action: 'reset' }); el.gameUi.appendChild(reset);
}

function renderOthello(game) {
  const board = document.createElement('div');
  board.className = 'board8 board-green';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const cell = document.createElement('button');
      cell.className = 'cell';
      const v = game.data.board[y][x];
      cell.textContent = v === 'B' ? '⚫' : v === 'W' ? '⚪' : '';
      cell.onclick = () => doAct({ action: 'place', x, y });
      board.appendChild(cell);
    }
  }
  const winnerText = game.data.winner ? `🏁 結果：${game.data.winner}` : `輪到：${game.data.turn || '-'}`;
  el.gameUi.innerHTML = `<div class="arena"><div>${winnerText}</div></div>`;
  el.gameUi.firstElementChild.appendChild(board);
  const reset = document.createElement('button'); reset.textContent = '重開棋局'; reset.onclick = () => doAct({ action: 'reset' }); el.gameUi.appendChild(reset);
}

function pieceText(p) {
  if (!p) return '';
  if (!p.revealed) return '🀫';
  const map = { k: '將', g: '士', m: '象', r: '車', n: '馬', c: '炮', p: '卒' };
  return `${p.color}${map[p.kind] || p.kind}`;
}

function renderDarkChess(game) {
  const board = document.createElement('div');
  board.className = 'boardDark board-red';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      const cell = document.createElement('button');
      cell.className = 'cell dark-cell';
      const p = game.data.board[y][x];
      cell.textContent = pieceText(p);
      if (darkSelected && darkSelected.x === x && darkSelected.y === y) cell.classList.add('selected');
      cell.onclick = async () => {
        const piece = game.data.board[y][x];
        if (piece && !piece.revealed) return doAct({ action: 'flip', x, y });
        if (!darkSelected) {
          darkSelected = { x, y };
          return render();
        }
        if (darkSelected.x === x && darkSelected.y === y) {
          darkSelected = null;
          return render();
        }
        await doAct({ action: 'move', from: darkSelected, to: { x, y } });
        darkSelected = null;
      };
      board.appendChild(cell);
    }
  }
  el.gameUi.innerHTML = `<div class="arena"><div>暗棋 ${game.data.turnColor ? `輪到：${game.data.turnColor}` : '先翻子決定先手'}</div></div>`;
  el.gameUi.firstElementChild.appendChild(board);
  const reset = document.createElement('button'); reset.textContent = '重開棋局'; reset.onclick = () => doAct({ action: 'reset' }); el.gameUi.appendChild(reset);
}

function renderChat(game) {
  const prev = el.chatList.scrollTop;
  const dist = el.chatList.scrollHeight - (el.chatList.scrollTop + el.chatList.clientHeight);
  const stickBottom = dist < 16;

  el.chatList.innerHTML = '';
  const tip = document.createElement('div');
  tip.className = 'sys';
  tip.textContent = `系統：閒置 ${appState.idleMinutes} 分鐘會自動斷線`;
  el.chatList.appendChild(tip);

  (game.chat || []).forEach((m) => {
    const row = document.createElement('div');
    row.className = 'msg';
    row.innerHTML = `<b>${m.sender}</b>：${m.text}`;
    el.chatList.appendChild(row);
  });

  if (stickBottom) el.chatList.scrollTop = el.chatList.scrollHeight;
  else el.chatList.scrollTop = prev;
}

function findName(game, id) {
  return game.participants.find((p) => p.clientId === id)?.nickname || '玩家';
}

setInterval(fetchState, 1500);
fetchState();
