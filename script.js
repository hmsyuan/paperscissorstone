const meId = getOrCreateClientId();
let appState = null;

const el = {
  nick: document.getElementById('nickname'),
  save: document.getElementById('save-profile'),
  leave: document.getElementById('leave-game'),
  status: document.getElementById('status'),
  lobby: document.getElementById('lobby'),
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

const gameNames = {
  rps: '剪刀石頭布',
  blackwhite: '黑白猜',
  dice: '擲骰子比大小',
  gomoku: '五子棋',
  othello: '黑白棋',
  darkchess: '暗棋',
};

el.save.onclick = async () => {
  const r = await api('/api/set-profile', { clientId: meId, nickname: el.nick.value.trim() });
  if (!r.ok) return setStatus(r.error);
  setStatus('暱稱已更新');
  appState = r.state;
  render();
};

el.leave.onclick = async () => {
  const r = await api('/api/leave-game', { clientId: meId });
  if (!r.ok) return setStatus(r.error);
  appState = r.state;
  render();
};

el.claimHost.onclick = async () => hostToggle(true);
el.releaseHost.onclick = async () => hostToggle(false);

async function hostToggle(claim) {
  const endpoint = claim ? '/api/claim-host' : '/api/release-host';
  const r = await api(endpoint, { clientId: meId });
  if (!r.ok) return setStatus(r.error);
  appState = { ...r.state, stateGames: r.state.games };
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
  appState = { ...r.state, stateGames: r.state.games };
  render();
};

function setStatus(msg) { el.status.textContent = msg; }

function getOrCreateClientId() {
  const key = 'orphan-client-id';
  const v = localStorage.getItem(key);
  if (v) return v;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

async function api(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

async function fetchState() {
  const res = await fetch(`/api/state?clientId=${encodeURIComponent(meId)}`);
  const json = await res.json();
  if (json.ok) {
    appState = { ...json.state, stateGames: json.state.games };
    render();
  }
}

function render() {
  if (!appState) return;
  const me = appState.me || {};
  el.nick.value = me.nickname || '';

  el.gameList.innerHTML = '';
  for (const [key, name] of Object.entries(gameNames)) {
    const g = appState.stateGames[key];
    const btn = document.createElement('button');
    btn.className = 'game-btn';
    btn.textContent = `${name} (${g.participants.length}人)`;
    btn.onclick = async () => {
      const r = await api('/api/join-game', { clientId: meId, gameType: key });
      if (!r.ok) return setStatus(r.error);
      appState = { ...r.state, stateGames: r.state.games };
      render();
    };
    el.gameList.appendChild(btn);
  }

  const current = me.currentGame;
  el.room.hidden = !current;
  if (!current) return;

  const game = appState.stateGames[current];
  el.gameTitle.textContent = gameNames[current];

  el.participants.innerHTML = '<h3>參與者</h3>';
  game.participants.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'p-row';
    row.textContent = `${p.nickname}${p.clientId === game.hostClientId ? ' 👑' : ''}${p.clientId === meId ? '（你）' : ''}`;
    if (game.hostClientId === meId && p.clientId !== meId) {
      const kick = document.createElement('button');
      kick.textContent = '踢出';
      kick.onclick = async () => {
        const r = await api('/api/kick', { clientId: meId, targetClientId: p.clientId, gameType: current });
        if (!r.ok) return setStatus(r.error);
        appState = { ...r.state, stateGames: r.state.games };
        render();
      };
      row.appendChild(kick);
    }
    el.participants.appendChild(row);
  });

  renderGame(current, game, me);
  renderChat(game);
}

function renderChat(game) {
  const prev = el.chatList.scrollTop;
  const dist = el.chatList.scrollHeight - (el.chatList.scrollTop + el.chatList.clientHeight);
  const stick = dist < 16;

  el.chatList.innerHTML = '';
  const tip = document.createElement('div');
  tip.textContent = `閒置 ${appState.idleMinutes} 分鐘會被自動斷線。`;
  el.chatList.appendChild(tip);

  (game.chat || []).forEach((m) => {
    const row = document.createElement('div');
    row.textContent = `${m.sender}: ${m.text}`;
    el.chatList.appendChild(row);
  });

  if (stick) el.chatList.scrollTop = el.chatList.scrollHeight;
  else el.chatList.scrollTop = prev;
}

function renderGame(type, game, me) {
  el.gameUi.innerHTML = '';
  if (type === 'rps') return renderRps(game);
  if (type === 'blackwhite') return renderBw(game);
  if (type === 'dice') return renderDice(game);
  if (type === 'gomoku') return renderGomoku(game);
  if (type === 'othello') return renderOthello(game);
  return renderDark(game);
}

function action(payload) { return api('/api/act', { clientId: meId, ...payload }); }

function renderRps(game) {
  el.gameUi.innerHTML = `<h3>出拳</h3><div>${game.data.result?.text || ''}</div>`;
  ['rock', 'paper', 'scissors'].forEach((v) => {
    const b = document.createElement('button'); b.textContent = v; b.onclick = async () => { const r=await action({action:'pick', value:v}); if(r.ok){appState={...r.state,stateGames:r.state.games};render();}};
    el.gameUi.appendChild(b);
  });
  const n = document.createElement('button'); n.textContent='下一輪'; n.onclick=async()=>{const r=await action({action:'next'}); if(r.ok){appState={...r.state,stateGames:r.state.games};render();}}; el.gameUi.appendChild(n);
}

function renderBw(game) {
  el.gameUi.innerHTML = `<h3>黑白猜</h3><div>${game.data.reveal ? `結果: ${game.data.reveal.out}` : ''}</div>`;
  ['black','white'].forEach((v)=>{const b=document.createElement('button');b.textContent=v;b.onclick=async()=>{const r=await action({action:'pick',value:v}); if(r.ok){appState={...r.state,stateGames:r.state.games};render();}};el.gameUi.appendChild(b);});
  const rev=document.createElement('button'); rev.textContent='主持人開獎'; rev.onclick=async()=>{const r=await action({action:'reveal'}); if(r.ok){appState={...r.state,stateGames:r.state.games};render();} else setStatus(r.error);}; el.gameUi.appendChild(rev);
  const n=document.createElement('button'); n.textContent='下一輪'; n.onclick=async()=>{const r=await action({action:'next'}); if(r.ok){appState={...r.state,stateGames:r.state.games};render();}}; el.gameUi.appendChild(n);
}

function renderDice(game) {
  const lines = Object.entries(game.data.rolls).map(([id,v])=>`${findName(game,id)}: ${v}`).join('<br/>');
  el.gameUi.innerHTML = `<h3>擲骰子</h3><div>${lines}</div><div>${game.data.result ? `😄 ${game.data.result.winners.map((id)=>findName(game,id)).join('、')} 最大(${game.data.result.max})` : ''}</div>`;
  const r=document.createElement('button'); r.textContent='擲骰'; r.onclick=async()=>{const x=await action({action:'roll'}); if(x.ok){appState={...x.state,stateGames:x.state.games};render();}}; el.gameUi.appendChild(r);
  const n=document.createElement('button'); n.textContent='下一輪'; n.onclick=async()=>{const x=await action({action:'next'}); if(x.ok){appState={...x.state,stateGames:x.state.games};render();}}; el.gameUi.appendChild(n);
}

function renderGomoku(game) {
  const w=document.createElement('div'); w.className='board15';
  for(let y=0;y<15;y++) for(let x=0;x<15;x++) {
    const c=document.createElement('button'); c.className='cell'; c.textContent=game.data.board[y][x]||'';
    c.onclick=async()=>{const r=await action({action:'place',x,y}); if(r.ok){appState={...r.state,stateGames:r.state.games};render();} else setStatus(r.error);};
    w.appendChild(c);
  }
  el.gameUi.innerHTML=`<h3>五子棋 ${game.data.winner?`🏁 ${findName(game,game.data.winner)} 勝`:''}</h3>`;
  el.gameUi.appendChild(w);
  const reset=document.createElement('button'); reset.textContent='重開'; reset.onclick=async()=>{const r=await action({action:'reset'}); if(r.ok){appState={...r.state,stateGames:r.state.games};render();}}; el.gameUi.appendChild(reset);
}

function renderOthello(game) {
  const b=document.createElement('div'); b.className='board8';
  for(let y=0;y<8;y++) for(let x=0;x<8;x++) {
    const c=document.createElement('button'); c.className='cell'; c.textContent=game.data.board[y][x]||'';
    c.onclick=async()=>{const r=await action({action:'place',x,y}); if(r.ok){appState={...r.state,stateGames:r.state.games};render();} else setStatus(r.error);};
    b.appendChild(c);
  }
  el.gameUi.innerHTML=`<h3>黑白棋 ${game.data.winner?`🏁 ${game.data.winner}`:`輪到: ${game.data.turn}`}</h3>`;
  el.gameUi.appendChild(b);
  const reset=document.createElement('button'); reset.textContent='重開'; reset.onclick=async()=>{const r=await action({action:'reset'}); if(r.ok){appState={...r.state,stateGames:r.state.games};render();}}; el.gameUi.appendChild(reset);
}

function pieceTxt(p){ if(!p) return ''; return p.revealed?`${p.color}${p.kind}`:'🀫'; }
function renderDark(game){
  const b=document.createElement('div'); b.className='boardDark';
  for(let y=0;y<8;y++) for(let x=0;x<4;x++) {
    const c=document.createElement('button'); c.className='cell'; c.textContent=pieceTxt(game.data.board[y][x]);
    c.onclick=async()=>{const p=game.data.board[y][x]; if(p && !p.revealed){const r=await action({action:'flip',x,y}); if(r.ok){appState={...r.state,stateGames:r.state.games};render();} else setStatus(r.error);}};
    b.appendChild(c);
  }
  el.gameUi.innerHTML=`<h3>暗棋 ${game.data.turnColor?`輪到: ${game.data.turnColor}`:''}</h3><p>移動請用 API（簡化版）</p>`;
  el.gameUi.appendChild(b);
  const reset=document.createElement('button'); reset.textContent='重開'; reset.onclick=async()=>{const r=await action({action:'reset'}); if(r.ok){appState={...r.state,stateGames:r.state.games};render();}}; el.gameUi.appendChild(reset);
}

function findName(game, id){ return game.participants.find((p)=>p.clientId===id)?.nickname || '玩家'; }

setInterval(fetchState, 3000);
fetchState();
