const form = document.getElementById('add-player-form');
const nicknameInput = document.getElementById('nickname-input');
const setupMessage = document.getElementById('setup-message');
const playerList = document.getElementById('player-list');
const countdownEl = document.getElementById('countdown');
const roundResultEl = document.getElementById('round-result');
const nextRoundBtn = document.getElementById('next-round-btn');
const playerTemplate = document.getElementById('player-card-template');
const centerCountdownEl = document.getElementById('center-countdown');
const revealBoardEl = document.getElementById('reveal-board');
const claimHostBtn = document.getElementById('claim-host-btn');
const chatListEl = document.getElementById('chat-list');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

const clientId = getOrCreateClientId();
let state = {
  players: [],
  roundActive: true,
  countdown: null,
  result: null,
  hostClientId: null,
  chatMessages: [],
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const nickname = nicknameInput.value.trim();
  if (!nickname) return;

  const response = await postJson('/api/join', { clientId, nickname });
  if (!response.ok) return showError(response.error);

  setupMessage.textContent = `${nickname} 已加入牌桌。`;
  nicknameInput.value = '';
  state = response.state;
  render();
});

claimHostBtn.addEventListener('click', async () => {
  const endpoint = state.hostClientId === clientId ? '/api/release-host' : '/api/claim-host';
  const response = await postJson(endpoint, { clientId });
  if (!response.ok) return showError(response.error);

  state = response.state;
  setupMessage.textContent =
    endpoint === '/api/claim-host' ? '你已取得主持權。' : '你已放棄主持權。';
  render();
});

nextRoundBtn.addEventListener('click', async () => {
  const response = await postJson('/api/next-round', { clientId });
  if (!response.ok) return showError(response.error);

  state = response.state;
  render();
});

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  const response = await postJson('/api/chat', { clientId, text });
  if (!response.ok) return showError(response.error);

  chatInput.value = '';
  state = response.state;
  render();
});

async function choose(choice) {
  const response = await postJson('/api/choose', { clientId, choice });
  if (!response.ok) return showError(response.error);

  state = response.state;
  render();
}

async function kickPlayer(targetClientId) {
  const response = await postJson('/api/kick', { clientId, targetClientId });
  if (!response.ok) return showError(response.error);

  state = response.state;
  render();
}

function getMyPlayer() {
  return state.players.find((player) => player.clientId === clientId) || null;
}

function toLabel(choice) {
  if (choice === 'rock') return '✊ 石頭';
  if (choice === 'paper') return '✋ 布';
  return '✌️ 剪刀';
}

function toIcon(choice) {
  if (choice === 'rock') return '✊';
  if (choice === 'paper') return '✋';
  return '✌️';
}

function placeSeat(node, index, total) {
  if (total === 1) {
    node.style.left = '50%';
    node.style.top = '12%';
    node.style.transform = 'translate(-50%, 0)';
    return;
  }

  const angle = (-90 + (360 / total) * index) * (Math.PI / 180);
  const radiusX = 47;
  const radiusY = 41;
  const x = 50 + Math.cos(angle) * radiusX;
  const y = 50 + Math.sin(angle) * radiusY;

  node.style.left = `${x}%`;
  node.style.top = `${y}%`;
  node.style.transform = 'translate(-50%, -50%)';
}

function renderRevealBoard(myPlayer) {
  revealBoardEl.innerHTML = '';
  if (!state.result) return;

  state.players.forEach((player) => {
    const item = document.createElement('div');
    item.className = 'reveal-item';
    if (state.result.winners.includes(player.id)) item.classList.add('winner');
    if (state.result.losers.includes(player.id)) item.classList.add('loser');

    const isMe = myPlayer && myPlayer.id === player.id;
    item.innerHTML = `
      <div class="reveal-name">${isMe ? `${player.nickname}（你）` : player.nickname}</div>
      <div class="reveal-icon">${toIcon(player.choice)}</div>
      <div class="reveal-label">${toLabel(player.choice)}</div>
    `;
    revealBoardEl.appendChild(item);
  });
}

function renderChat(myPlayer) {
  chatListEl.innerHTML = '';
  state.chatMessages.forEach((msg) => {
    const row = document.createElement('div');
    row.className = 'chat-item';

    const mine = msg.clientId && myPlayer && msg.clientId === myPlayer.clientId;
    if (mine) row.classList.add('mine');
    if (msg.sender === 'system') row.classList.add('system');

    const sender = msg.sender === 'system' ? '系統' : msg.sender;
    row.innerHTML = `<span class="chat-sender">${sender}</span><span class="chat-text">${msg.text}</span>`;
    chatListEl.appendChild(row);
  });
  chatListEl.scrollTop = chatListEl.scrollHeight;
}

function showError(message) {
  setupMessage.textContent = message || '發生錯誤';
}

function render() {
  const myPlayer = getMyPlayer();
  const isHost = state.hostClientId === clientId;

  playerList.innerHTML = '';
  nextRoundBtn.disabled = state.roundActive;

  claimHostBtn.disabled = !myPlayer || (Boolean(state.hostClientId) && !isHost);
  if (isHost) {
    claimHostBtn.textContent = '放棄主持權';
  } else if (state.hostClientId) {
    claimHostBtn.textContent = '主持權已有人';
  } else {
    claimHostBtn.textContent = '搶主持權';
  }

  if (state.countdown) {
    countdownEl.textContent = '全員就緒，準備開獎...';
    centerCountdownEl.hidden = false;
    centerCountdownEl.textContent = String(state.countdown);
  } else {
    centerCountdownEl.hidden = true;
    if (state.players.length < 2) countdownEl.textContent = '等待至少 2 位玩家出拳';
    else if (state.roundActive) countdownEl.textContent = '等待玩家出拳';
    else countdownEl.textContent = '開獎完成！';
  }

  if (state.result) roundResultEl.textContent = state.result.roundResultText;
  else if (state.players.length === 0) roundResultEl.textContent = '目前沒有玩家，請先加入。';
  else roundResultEl.textContent = isHost ? '你是主持人，可踢人與控場。' : '';

  renderRevealBoard(myPlayer);
  renderChat(myPlayer);

  state.players.forEach((player, index) => {
    const node = playerTemplate.content.firstElementChild.cloneNode(true);
    const nameEl = node.querySelector('.player-name');
    const statusEl = node.querySelector('.player-status');
    const buttons = node.querySelectorAll('.choices button');
    const kickBtn = node.querySelector('.kick-btn');

    const isMe = myPlayer && myPlayer.id === player.id;
    const isHostPlayer = player.clientId === state.hostClientId;
    nameEl.textContent = `${isMe ? `${player.nickname}（你）` : player.nickname}${
      isHostPlayer ? ' 👑' : ''
    }`;

    if (player.choice) {
      statusEl.textContent = state.roundActive ? '已就緒，等待其他玩家...' : `本輪：${toLabel(player.choice)}`;
      node.classList.add('locked');
    }

    if (state.result?.winners.includes(player.id)) node.classList.add('winner');
    if (state.result?.losers.includes(player.id)) node.classList.add('loser');

    buttons.forEach((btn) => {
      btn.disabled = !isMe || !state.roundActive || Boolean(state.countdown);
      btn.addEventListener('click', () => choose(btn.dataset.choice));
    });

    const canKick = isHost && !isMe;
    kickBtn.hidden = !canKick;
    if (canKick) kickBtn.addEventListener('click', () => kickPlayer(player.clientId));

    placeSeat(node, index, state.players.length);
    playerList.appendChild(node);
  });
}

function getOrCreateClientId() {
  const key = 'rps-client-id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const newId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  localStorage.setItem(key, newId);
  return newId;
}

async function postJson(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return response.json();
}

async function refreshState() {
  try {
    const response = await fetch('/api/state');
    state = await response.json();
    render();
  } catch {
    showError('與伺服器連線中斷，稍後重試。');
  }
}

setInterval(refreshState, 500);
refreshState();
