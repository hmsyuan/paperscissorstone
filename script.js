const meId = getOrCreateClientId();
let appState = null;
let darkSelected = null;
let darkFlipMark = null;
let diceRollingUntil = 0;

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
  const activeIds = game.participants
    .map((p) => p.clientId)
    .filter((id) => !game.data.stats?.[id]?.eliminated);
  const allPicked = activeIds.length >= 2 && activeIds.every((id) => game.data.choices[id]);
  const countDownLeft = game.data.phase === 'countdown'
    ? Math.max(0, 3 - Math.floor((Date.now() - game.data.countdownStartAt) / 1000))
    : 0;
  const result = game.data.phase === 'finished'
    ? `🏆 最終勝者：${findName(game, game.data.finalResult?.champion)}`
    : game.data.phase === 'revealed'
      ? describeRpsRound(game)
      : game.data.phase === 'countdown'
        ? `<span class="rps-countdown">${countDownLeft || '開獎'}</span>`
        : `第 ${game.data.round} 輪：等待所有存活玩家出拳`;
  el.gameUi.innerHTML = `
    <div class="arena rps-arena table-theme">
      <div class="rps-seat-ring" id="rps-seat-ring"></div>
      <div class="rps-table-center">
        <div class="rps-table">${result}</div>
      </div>
      <div class="note">你目前出拳：${myPick || '尚未出拳'}</div>
    </div>`;

  const seatRing = el.gameUi.querySelector('#rps-seat-ring');
  const total = game.participants.length || 1;
  game.participants.forEach((p, index) => {
    const ready = Boolean(game.data.choices[p.clientId]);
    const card = document.createElement('div');
    card.className = `rps-seat ${ready ? 'ready' : ''}`;
    const angle = (-90 + (360 / total) * index) * (Math.PI / 180);
    const x = 50 + Math.cos(angle) * 40;
    const y = 50 + Math.sin(angle) * 34;
    card.style.left = `${x}%`;
    card.style.top = `${y}%`;
    card.dataset.clientId = p.clientId;
    card.innerHTML = `
      <div class="rps-seat-name">${p.nickname}${p.clientId === meId ? '（你）' : ''}</div>
      <div class="rps-seat-status">${rpsSeatStatus(game, p.clientId, ready)}</div>
    `;
    if (p.clientId === meId && !game.data.stats?.[p.clientId]?.eliminated && game.data.phase === 'picking') {
      const mine = document.createElement('div');
      mine.className = 'rps-seat-actions';
      [['rock', '✊'], ['paper', '✋'], ['scissors', '✌️']].forEach(([value, label]) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.className = 'mini-pick';
        if (myPick === value) b.classList.add('active');
        b.onclick = () => doAct({ action: 'pick', value });
        mine.appendChild(b);
      });
      card.appendChild(mine);
    }
    seatRing.appendChild(card);
  });

  if (game.hostClientId === meId && (game.data.phase === 'revealed' || game.data.phase === 'finished')) {
    const hostSeat = [...seatRing.querySelectorAll('.rps-seat')].find((n) => n.dataset.clientId === meId);
    if (hostSeat) {
      const next = document.createElement('button');
      next.textContent = game.data.phase === 'finished' ? '主持人開新局' : '下一輪';
      next.className = 'host-next-btn';
      next.onclick = () => doAct({ action: 'next' });
      hostSeat.appendChild(next);
    }
  }
  if (allPicked && game.data.phase === 'countdown') setTimeout(render, 250);
}

function rpsSeatStatus(game, clientId, ready) {
  const stat = game.data.stats?.[clientId];
  if (stat?.eliminated) return '💀 已淘汰';
  if (game.data.phase === 'revealed' || game.data.phase === 'finished') {
    if (game.data.roundResult?.draw) return '😐 平手';
    if (game.data.roundResult?.winners?.includes(clientId)) return '😄 本輪勝';
    if (game.data.roundResult?.losers?.includes(clientId)) return '😭 本輪敗';
  }
  return ready ? '✅ 已出拳' : '⌛ 未出拳';
}

function describeRpsRound(game) {
  if (game.data.roundResult?.draw) return `第 ${game.data.round} 輪：平手 😐`;
  const winners = (game.data.roundResult?.winners || []).map((id) => findName(game, id)).join('、');
  const losers = (game.data.roundResult?.losers || []).map((id) => findName(game, id)).join('、');
  return `第 ${game.data.round} 輪：😄 ${winners || '無'} ｜ 😭 ${losers || '無'}`;
}


function diceFace(value) {
  return ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][Math.max(1, Math.min(6, value)) - 1];
}

function renderBowlDice(opt, rolling, myRoll) {
  const count = opt.diceCount || 1;
  const values = myRoll?.values || [];
  return Array.from({ length: count }, (_, i) => {
    const v = rolling ? ((i + Math.floor(Date.now() / 130)) % 6) + 1 : (values[i] || 1);
    return `<span class="bowl-die ${rolling ? 'rolling' : ''}" style="--i:${i}">${diceFace(v)}</span>`;
  }).join('');
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
  const opt = game.data.options || { diceCount: 1, compare: 'high' };
  const isHost = game.hostClientId === meId;
  const rolling = Date.now() < diceRollingUntil;
  const lines = game.participants.map((p) => {
    const rolled = game.data.rolls[p.clientId];
    const text = rolling ? '🎲 轉動中...' : (rolled ? `${rolled.values.join(', ')}（合計 ${rolled.total}）` : '-');
    return `${p.nickname}: ${text}`;
  }).join(' ｜ ');
  const result = game.data.result
    ? `🎯 ${game.data.result.compare === 'low' ? '最小點數' : '最大點數'} ${game.data.result.target}，勝者：${game.data.result.winners.map((id) => findName(game, id)).join('、')}`
    : '等待擲骰';
  const configHint = `本輪設定：${opt.diceCount} 顆骰子・${opt.compare === 'high' ? '比大' : '比小'}`;
  const myRoll = game.data.rolls[meId];
  el.gameUi.innerHTML = `
    <div class="arena dice-arena">
      <div class="dice-bowl-wrap">
        <div class="dice-bowl ${rolling ? 'rolling' : ''}">
          <div class="bowl-rim"></div>
          <div class="bowl-inner">${renderBowlDice(opt, rolling, myRoll)}</div>
          <div class="bowl-shadow"></div>
        </div>
      </div>
      <div class="dice-config">${configHint}</div>
      <div>${lines}</div>
      <div>${result}</div>
      <div class="rps-actions" id="dice-actions"></div>
      <div id="dice-host-config" class="dice-host-config"></div>
    </div>`;

  const actions = el.gameUi.querySelector('#dice-actions');
  const roll = document.createElement('button');
  roll.textContent = '擲骰';
  roll.onclick = async () => {
    diceRollingUntil = Date.now() + 1300;
    render();
    await doAct({ action: 'roll' });
  };
  actions.appendChild(roll);
  const next = document.createElement('button');
  next.textContent = '下一輪';
  next.onclick = () => doAct({ action: 'next' });
  actions.appendChild(next);

  if (rolling) setTimeout(render, 200);

  const hostBox = el.gameUi.querySelector('#dice-host-config');
  if (isHost && !game.data.started) {
    hostBox.innerHTML = '<b>主持人設定（開擲前）</b>';
    const row = document.createElement('div');
    row.className = 'dice-host-row';
    const count = document.createElement('select');
    [1, 2, 3].forEach((n) => {
      const opn = document.createElement('option');
      opn.value = String(n);
      opn.textContent = `${n} 顆`;
      if (opt.diceCount === n) opn.selected = true;
      count.appendChild(opn);
    });
    const compare = document.createElement('select');
    [['high', '比大'], ['low', '比小']].forEach(([v, t]) => {
      const opn = document.createElement('option');
      opn.value = v;
      opn.textContent = t;
      if (opt.compare === v) opn.selected = true;
      compare.appendChild(opn);
    });
    const save = document.createElement('button');
    save.textContent = '套用規則';
    save.onclick = () => doAct({ action: 'set-config', diceCount: Number(count.value), compare: compare.value });
    row.appendChild(count);
    row.appendChild(compare);
    row.appendChild(save);
    hostBox.appendChild(row);
  }
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
  const map = { k: '帥', g: '仕', m: '相', r: '俥', n: '傌', c: '炮', p: '兵' };
  const blackMap = { k: '將', g: '士', m: '象', r: '車', n: '馬', c: '砲', p: '卒' };
  return p.color === 'R' ? (map[p.kind] || p.kind) : (blackMap[p.kind] || p.kind);
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
      if (p?.revealed) cell.classList.add(p.color === 'R' ? 'piece-red' : 'piece-black');
      if (darkFlipMark && darkFlipMark.x === x && darkFlipMark.y === y) cell.classList.add('flip-in');
      if (darkSelected && darkSelected.x === x && darkSelected.y === y) cell.classList.add('selected');
      cell.onclick = async () => {
        const piece = game.data.board[y][x];
        if (piece && !piece.revealed) {
          darkFlipMark = { x, y };
          setTimeout(() => { darkFlipMark = null; render(); }, 520);
          return doAct({ action: 'flip', x, y });
        }
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
  const firstText = game.data.firstPlayerClientId ? `丟銅板先手：${findName(game, game.data.firstPlayerClientId)}` : '等待丟銅板決定先手';
  const turnText = game.data.turnClientId ? `輪到：${findName(game, game.data.turnClientId)}` : '';
  const colorMap = game.participants
    .map((p, idx) => `${p.nickname}：${idx === 0 ? '🔴 紅方' : '⚫ 黑方'}`)
    .join(' ｜ ');
  el.gameUi.innerHTML = `<div class="arena"><div>暗棋 ${firstText}${turnText ? ` ｜ ${turnText}` : ''}</div><div class="dark-roles">${colorMap}</div><div id="dark-variants" class="dark-variants"></div><div id="dark-captures" class="dark-captures"></div></div>`;
  el.gameUi.firstElementChild.appendChild(board);
  renderDarkVariants(game);
  renderDarkCaptures(game);
  const reset = document.createElement('button'); reset.textContent = '重開棋局'; reset.onclick = () => doAct({ action: 'reset' }); el.gameUi.appendChild(reset);
}



function renderDarkVariants(game) {
  const box = el.gameUi.querySelector('#dark-variants');
  if (!box) return;
  const states = game.data.variantState || [];
  const canSet = game.participants.some((p) => p.clientId === meId) && !game.data.started;
  box.innerHTML = '<div class="dark-variant-title">特殊玩法（開局前雙方勾選）</div>';
  states.forEach((v) => {
    const row = document.createElement('label');
    row.className = 'dark-variant-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(v.myChecked);
    input.disabled = !canSet;
    input.onchange = () => doAct({ action: 'set-variant', key: v.key, value: input.checked });
    const text = document.createElement('span');
    text.textContent = `${v.label} ${v.enabled ? '✅ 啟用' : '⛔ 未啟用'}`;
    row.appendChild(input);
    row.appendChild(text);
    box.appendChild(row);
  });
}

function renderDarkCaptures(game) {
  const box = el.gameUi.querySelector('#dark-captures');
  if (!box) return;
  const view = game.data.captureView || [];
  box.innerHTML = '';
  for (const row of view) {
    const who = findName(game, row.playerId);
    const item = document.createElement('div');
    item.className = 'dark-cap-item';
    if (row.playerId === meId) {
      const mine = (row.pieces || []).map((p) => pieceText({ ...p, revealed: true })).join(' ');
      item.innerHTML = `<b>${who} 吃掉</b>：${mine || '（尚無）'} <small>共 ${row.count} 子</small>`;
    } else {
      item.innerHTML = `<b>${who} 吃掉</b>：❓❓❓ <small>共 ${row.count} 子</small>`;
    }
    box.appendChild(item);
  }
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
