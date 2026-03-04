const form = document.getElementById('add-player-form');
const nicknameInput = document.getElementById('nickname-input');
const setupMessage = document.getElementById('setup-message');
const playerList = document.getElementById('player-list');
const countdownEl = document.getElementById('countdown');
const roundResultEl = document.getElementById('round-result');
const nextRoundBtn = document.getElementById('next-round-btn');
const playerTemplate = document.getElementById('player-card-template');
const centerCountdownEl = document.getElementById('center-countdown');

const clientId = getOrCreateClientId();
let state = { players: [], roundActive: true, countdown: null, result: null };

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const nickname = nicknameInput.value.trim();
  if (!nickname) return;

  const response = await postJson('/api/join', { clientId, nickname });
  if (!response.ok) {
    setupMessage.textContent = response.error;
    return;
  }

  setupMessage.textContent = `${nickname} 已加入牌桌。`;
  nicknameInput.value = '';
  state = response.state;
  render();
});

nextRoundBtn.addEventListener('click', async () => {
  const response = await postJson('/api/next-round', { clientId });
  if (!response.ok) {
    setupMessage.textContent = response.error;
    return;
  }

  state = response.state;
  render();
});

async function choose(choice) {
  const response = await postJson('/api/choose', { clientId, choice });
  if (!response.ok) {
    setupMessage.textContent = response.error;
    return;
  }

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

function placeSeat(node, index, total) {
  if (total === 1) {
    node.style.left = '50%';
    node.style.top = '12%';
    node.style.transform = 'translate(-50%, 0)';
    return;
  }

  const angle = (-90 + (360 / total) * index) * (Math.PI / 180);
  const radiusX = 40;
  const radiusY = 34;
  const x = 50 + Math.cos(angle) * radiusX;
  const y = 50 + Math.sin(angle) * radiusY;

  node.style.left = `${x}%`;
  node.style.top = `${y}%`;
  node.style.transform = 'translate(-50%, -50%)';
}

function render() {
  const myPlayer = getMyPlayer();

  playerList.innerHTML = '';
  nextRoundBtn.disabled = state.roundActive;

  if (state.countdown) {
    countdownEl.textContent = '全員就緒，準備開獎...';
    centerCountdownEl.hidden = false;
    centerCountdownEl.textContent = String(state.countdown);
  } else {
    centerCountdownEl.hidden = true;
    if (state.players.length < 2) {
      countdownEl.textContent = '等待至少 2 位玩家出拳';
    } else if (state.roundActive) {
      countdownEl.textContent = '等待玩家出拳';
    } else {
      countdownEl.textContent = '開獎完成！';
    }
  }

  if (state.result) {
    roundResultEl.textContent = state.result.roundResultText;
  } else if (state.players.length === 0) {
    roundResultEl.textContent = '目前沒有玩家，請先加入。';
  } else {
    roundResultEl.textContent = '';
  }

  state.players.forEach((player, index) => {
    const node = playerTemplate.content.firstElementChild.cloneNode(true);
    const nameEl = node.querySelector('.player-name');
    const statusEl = node.querySelector('.player-status');
    const buttons = node.querySelectorAll('button');

    const isMe = myPlayer && myPlayer.id === player.id;
    nameEl.textContent = isMe ? `${player.nickname}（你）` : player.nickname;

    if (player.choice) {
      statusEl.textContent = state.roundActive ? '已就緒，等待其他玩家...' : `本輪：${toLabel(player.choice)}`;
      node.classList.add('locked');
    }

    if (state.result?.winners.includes(player.id)) node.classList.add('winner');
    if (state.result?.losers.includes(player.id)) node.classList.add('loser');

    buttons.forEach((btn) => {
      const disabled = !isMe || !state.roundActive || Boolean(state.countdown);
      btn.disabled = disabled;
      btn.addEventListener('click', () => choose(btn.dataset.choice));
    });

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
    setupMessage.textContent = '與伺服器連線中斷，稍後重試。';
  }
}

setInterval(refreshState, 500);
refreshState();
