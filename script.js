const form = document.getElementById('add-player-form');
const nicknameInput = document.getElementById('nickname-input');
const setupMessage = document.getElementById('setup-message');
const playerList = document.getElementById('player-list');
const countdownEl = document.getElementById('countdown');
const roundResultEl = document.getElementById('round-result');
const nextRoundBtn = document.getElementById('next-round-btn');
const playerTemplate = document.getElementById('player-card-template');

const beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

/** @type {{id:number,nickname:string,choice:null|'rock'|'paper'|'scissors'}[]} */
let players = [];
let playerId = 1;
let roundActive = true;
let countdownRunning = false;

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const nickname = nicknameInput.value.trim();

  if (!nickname) return;
  if (players.some((p) => p.nickname === nickname)) {
    setupMessage.textContent = '暱稱重複，請使用其他名稱。';
    return;
  }

  players.push({ id: playerId++, nickname, choice: null });
  setupMessage.textContent = `${nickname} 已加入牌桌。`;
  nicknameInput.value = '';
  render();
});

nextRoundBtn.addEventListener('click', () => {
  players = players.map((player) => ({ ...player, choice: null }));
  roundActive = true;
  countdownRunning = false;
  nextRoundBtn.disabled = true;
  countdownEl.textContent = players.length >= 2 ? '等待玩家出拳' : '等待至少 2 位玩家出拳';
  roundResultEl.textContent = '';
  render();
});

function setChoice(playerIdToUpdate, choice) {
  if (!roundActive || countdownRunning) return;

  players = players.map((player) =>
    player.id === playerIdToUpdate ? { ...player, choice } : player,
  );

  render();
  maybeStartCountdown();
}

function maybeStartCountdown() {
  if (players.length < 2) {
    countdownEl.textContent = '等待至少 2 位玩家出拳';
    return;
  }

  const allChosen = players.every((player) => player.choice);
  if (!allChosen || countdownRunning) return;

  countdownRunning = true;
  runCountdown(3);
}

function runCountdown(seconds) {
  countdownEl.textContent = `${seconds}`;

  if (seconds === 0) {
    revealRound();
    return;
  }

  setTimeout(() => runCountdown(seconds - 1), 1000);
}

function revealRound() {
  const result = calculateRound(players.map((player) => player.choice));
  roundActive = false;
  nextRoundBtn.disabled = false;

  if (result.type === 'draw') {
    countdownEl.textContent = '開獎：平手！';
    roundResultEl.textContent = result.reason;
    render({ winners: [], losers: [] });
    return;
  }

  const winners = players
    .filter((player) => player.choice === result.winningChoice)
    .map((player) => player.id);
  const losers = players
    .filter((player) => player.choice !== result.winningChoice)
    .map((player) => player.id);

  countdownEl.textContent = '開獎完成！';
  roundResultEl.textContent = `勝利手勢：${toLabel(result.winningChoice)}；贏家：${players
    .filter((p) => winners.includes(p.id))
    .map((p) => p.nickname)
    .join('、')}`;
  render({ winners, losers });
}

function calculateRound(choices) {
  const uniqueChoices = [...new Set(choices)];

  if (uniqueChoices.length === 1) {
    return { type: 'draw', reason: '所有人都出一樣，這輪平手。' };
  }

  if (uniqueChoices.length === 3) {
    return { type: 'draw', reason: '三種手勢都出現，這輪平手。' };
  }

  const [a, b] = uniqueChoices;
  return { type: 'win', winningChoice: beats[a] === b ? a : b };
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

function render(highlight = { winners: [], losers: [] }) {
  playerList.innerHTML = '';

  if (players.length === 0) {
    countdownEl.textContent = '等待至少 2 位玩家出拳';
    roundResultEl.textContent = '目前沒有玩家，請先加入。';
    return;
  }

  if (roundActive && !countdownRunning) {
    roundResultEl.textContent = '';
  }

  players.forEach((player, index) => {
    const node = playerTemplate.content.firstElementChild.cloneNode(true);
    const nameEl = node.querySelector('.player-name');
    const statusEl = node.querySelector('.player-status');
    const buttons = node.querySelectorAll('button');

    nameEl.textContent = player.nickname;

    if (player.choice) {
      statusEl.textContent = roundActive
        ? '已就緒，等待其他玩家...'
        : `本輪：${toLabel(player.choice)}`;
      node.classList.add('locked');
    }

    if (highlight.winners.includes(player.id)) node.classList.add('winner');
    if (highlight.losers.includes(player.id)) node.classList.add('loser');

    buttons.forEach((btn) => {
      btn.disabled = !roundActive || countdownRunning;
      btn.addEventListener('click', () => setChoice(player.id, btn.dataset.choice));
    });

    placeSeat(node, index, players.length);
    playerList.appendChild(node);
  });
}

render();
