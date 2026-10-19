'use strict';
import {catalogCards} from './catalog-view.mjs';
const colors = ['white','blue','green','red','black','gold'];
const names = ['白钻','蓝宝石','祖母绿','红宝石','黑玛瑙','黄金'];
const symbols = ['◇','◆','⬡','◈','⬟','✦'];
const $ = id => document.getElementById(id);
const isDuel=document.body.dataset.mode==='duel';
if(isDuel){
  const replayLink=document.createElement('a');replayLink.className='outline';
  replayLink.href='./replay.html';replayLink.target='_blank';replayLink.rel='noopener';
  replayLink.textContent='逐步回放';document.querySelector('nav').prepend(replayLink);
}
let humanSeat=0;
let game = null, info = null, version = 0, viewer = null, actions = [], busy = false;
let picked = [0,0,0,0,0], discarded = [0,0,0,0,0,0], selectedCard = null, selectedTier = null, paymentIndex = 0;
let toastTimer;
let catalogData = null, catalogMode = 'all', catalogTier = 0;
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gem = (i,n,extra='') => `<span class="gem ${colors[i]} ${extra}" title="${names[i]} ${n}" aria-label="${names[i]} ${n}"><span class="gem-symbol" aria-hidden="true">${symbols[i]}</span>${n}</span>`;
const gems = (values, all=false, extra='') => `<span class="cost-row">${values.map((n,i) => n || all ? gem(i,n,extra) : '').join('')}</span>`;
const tokenText = values => values.map((n,i) => n ? `${names[i]} ${n}` : '').filter(Boolean).join(' · ') || '免费';
const canAct = () => viewer !== null && game && viewer === game.current_player && game.phase !== 'finished';
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const has = action => actions.some(a => same(a,action));
const selected = () => game ? [...game.market.flat().filter(Boolean), ...(game.players[viewer]?.reserved || [])].find(c => c.id === selectedCard) : null;
const buyOptions = () => actions.filter(a => a.type === 'buy' && a.card_id === selectedCard);

async function api(path, body) {
  const response = await fetch(path, {method:body === undefined ? 'GET':'POST', headers:body === undefined ? {} : {'Content-Type':'application/json'}, body:body === undefined ? undefined : JSON.stringify(body), cache:'no-store'});
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : '请求失败，请刷新后重试');
  return result;
}
function accept(result) {
  game=result.state; info=result.info; version=result.version;
  if(isDuel && result.human_seat!==undefined) {
    humanSeat=result.human_seat;
    const aiSeats=game.players.map((_,i)=>i).filter(i=>i!==humanSeat).map(i=>i+1).join('、');
    $('duel-status').textContent=`你是玩家 ${humanSeat+1} · AI 席位 ${aiSeats} · 本局固定模型：${result.model_name} · 所有玩家动作自动保存，可在右上角导出`;
  }
}
async function loadDuelChoices() {
  if(!isDuel) return;
  try {
    const data=await api('/api/checkpoints');
    const selected=$('duel-checkpoint').value;
    $('duel-checkpoint').innerHTML='<option value="best.pt">当前最佳模型（开局时固定）</option>'+[...data.checkpoints].reverse().map(x=>`<option value="${esc(x.path)}">第 ${x.round} 轮 · 智能体 ${esc(x.agent)}</option>`).join('');
    if([...$('duel-checkpoint').options].some(o=>o.value===selected)) $('duel-checkpoint').value=selected;
  } catch(e) { showError(e.message); }
}
function resetSelection() { picked=[0,0,0,0,0]; discarded=[0,0,0,0,0,0]; selectedCard=null; selectedTier=null; paymentIndex=0; }
function clearPrivate() {
  viewer=null; actions=[];
  if(game) for(const p of game.players) delete p.reserved;
  resetSelection();
}
function setBusy(value) { busy=value; document.body.classList.toggle('busy',value); document.body.setAttribute('aria-busy',String(value)); }
function showError(message) { $('error').textContent=message; $('error').hidden=false; }
function clearError() { $('error').hidden=true; }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent=message; $('toast').hidden=false; toastTimer=setTimeout(()=>{$('toast').hidden=true;},2500); }
async function recover(error) {
  clearPrivate();
  try { accept(await api('/api/state')); } catch (_) { /* Keep last public board if disconnected. */ }
  render(); showError(error.message || '无法连接本地服务，请确认服务仍在运行');
}
async function loadPrivate(player) {
  const state = await api(`/api/state?player_id=${player}`);
  const moves = await api(`/api/actions?player_id=${player}`);
  if(state.version !== moves.version || state.state.current_player !== player) throw new Error('对局已更新，请重新接手回合');
  accept(state); actions=moves.actions; viewer=player;
}
async function claimTurn() {
  if(busy || !game) return;
  setBusy(true); clearError();
  try { await loadPrivate(game.current_player); resetSelection(); render(); }
  catch(e) { await recover(e); }
  finally { setBusy(false); }
}
async function submit(action) {
  if(busy || !canAct() || !has(action)) return;
  const player=viewer, expected=version;
  setBusy(true); clearError(); clearPrivate(); render();
  try {
    accept(await api('/api/action',{version:expected,player_id:player,action}));
    if(game.phase !== 'finished' && game.current_player === player) await loadPrivate(player);
    render();
    if(game.phase==='finished') toast('对局结束，查看最终排名');
    else if(game.current_player!==player) toast(`回合完成 · 请交给玩家 ${game.current_player+1}`);
  } catch(e) { await recover(e); }
  finally { setBusy(false); }
}

function renderNobles() {
  $('nobles').innerHTML=game.nobles.map(n=>{
    const eligible=canAct() && has({type:'noble',noble_id:n.id});
    return `<button class="noble ${eligible?'eligible':''}" data-cmd="noble" data-id="${n.id}" ${eligible?'':'disabled'} aria-label="贵族 ${n.id}，3 分，要求 ${tokenText(n.cost)}"><span class="noble-portrait">♜</span><div><div class="noble-id">${n.id} · 贵族</div>${gems(n.cost)}</div><span class="noble-points">3<small>✦</small></span></button>`;
  }).join('');
}
function cardHTML(card, reference=false) {
  if(!card) return '<div class="empty-card">牌堆已空</div>';
  const affordable=!reference && canAct() && actions.some(a=>a.type==='buy'&&a.card_id===card.id);
  const tag=reference?'article':'button';
  return `<${tag} class="card ${colors[card.bonus]} tier-${card.tier} ${!reference&&selectedCard===card.id?'selected':''}" ${reference?'':'data-cmd="card"'} data-id="${card.id}" aria-label="${card.id}，${names[card.bonus]}折扣，${card.points}分，费用 ${tokenText(card.cost)}"><div class="card-art"><span class="facet"></span></div><div class="card-top"><span class="card-points">${card.points || '·'}${card.points?'<small>✦</small>':''}</span><span class="bonus-gem" title="${names[card.bonus]}永久折扣">${symbols[card.bonus]}</span></div>${affordable?'<span class="card-ready">可购买 ↗</span>':''}<div class="card-bottom">${gems(card.cost)}<span class="card-id">${card.id}</span></div></${tag}>`;
}
function renderMarket() {
  $('market').innerHTML=[2,1,0].map(t=>`<div class="market-row"><button class="deck" data-cmd="deck" data-tier="${t+1}" aria-label="预览 ${t+1} 级牌库，剩余 ${game.deck_counts[t]} 张"><span class="deck-name">${['一','二','三'][t]}级</span><span class="deck-glyph">${['◇','♧','♜'][t]}</span><span class="deck-count">${game.deck_counts[t]} 张 · 预览</span></button>${game.market[t].map(c=>cardHTML(c)).join('')}</div>`).join('');
}
async function openCatalog(tier=0) {
  catalogMode=tier?'deck':'all'; catalogTier=tier;
  $('catalog-tier').value=String(tier); $('catalog-tier').disabled=Boolean(tier);
  $('catalog-bonus').value='-1';
  $('catalog-title').textContent=tier?`${['','一','二','三'][tier]}级牌库 · 可能出现的牌`:'全卡牌图鉴';
  $('catalog-note').textContent='正在读取公开牌表…';
  $('catalog-grid').innerHTML=''; $('catalog-count').textContent='';
  $('catalog-reserve').hidden=true; $('catalog-footer-note').textContent='';
  $('catalog-dialog').showModal();
  try {
    if(!catalogData) catalogData=await api('./catalog.json');
    if($('catalog-dialog').open) renderCatalog();
  } catch(e) { $('catalog-note').textContent=`图鉴加载失败：${e.message}。关闭后可重新打开。`; }
}
function renderCatalog() {
  if(!catalogData) return;
  const tier=$('catalog-tier').value, bonus=Number($('catalog-bonus').value);
  const nobles=tier==='nobles';
  const all=catalogMode==='all';
  const entries=nobles?catalogData.nobles.filter(n=>bonus<0||n.cost[bonus]>0):catalogCards(catalogData.cards,game,{mode:catalogMode,tier:Number(tier),bonus});
  $('catalog-count').textContent=`${entries.length} ${nobles?'位贵族':'张发展卡'}`;
  $('catalog-note').textContent=all?'完整基础版牌表，不随本局抽牌减少。发展卡显示永久折扣、声望和原始费用；贵族显示来访所需折扣。':`实际牌堆剩余 ${game.deck_counts[catalogTier-1]} 张。以下为当前视角的候选：排除公开市场、已购牌、公开预留和你已知的私人预留；不揭示牌序或对手盲抽，因此候选数可能多于实际剩余数。`;
  $('catalog-grid').innerHTML=entries.length?entries.map(c=>nobles?`<article class="catalog-noble"><span class="noble-portrait">♜</span><h3>${c.id} · 贵族</h3><span class="catalog-noble-points">3 ✦</span>${gems(c.cost)}<p>所需永久折扣</p></article>`:`<div class="catalog-entry">${cardHTML(c,true)}<div class="catalog-caption"><b>${c.id}</b><span>${c.tier} 级 · ${names[c.bonus]} · ${c.points} 分</span></div></div>`).join(''):'<p class="catalog-empty">当前筛选下没有卡牌。</p>';
  const reserve= !all && canAct() && game.phase==='main' && has({type:'reserve',tier:catalogTier});
  $('catalog-reserve').hidden=all; $('catalog-reserve').disabled=!reserve;
  $('catalog-footer-note').textContent=all?'图鉴仅供查阅，不会执行购牌或预留。':reserve?'浏览不消耗回合。盲抽仍由实际牌堆顶决定。':!canAct()?'接手当前回合后可盲抽预留。':game.deck_counts[catalogTier-1]===0?'此等级牌堆已空。':game.phase!=='main'?'请先完成弃币或贵族选择。':'预留已满，最多持有 3 张。';
}
function renderBank() {
  const active=canAct() && game.phase==='main';
  $('bank').innerHTML=game.bank.map((n,i)=>`<button class="bank-item ${colors[i]} ${picked[i]?'selected':''}" data-cmd="token" data-color="${i}" ${!active||i===5||n===0?'disabled':''} aria-label="拿取${names[i]}，银行剩余 ${n}" title="${i===5?'预留卡牌时自动获得黄金':'点击循环选择 0 / 1 / 2 枚'}"><span class="chip">${symbols[i]}</span><span class="bank-amount">${n}</span><span class="bank-name">${names[i]}</span>${picked[i]?`<span class="picked">已选 ${picked[i]}</span>`:''}</button>`).join('');
  $('bank-hint').textContent=game.phase==='discard'?'筹码超过 10 枚，请在右侧选择归还':'取 1–3 色，或库存 ≥4 时取同色 2 枚';
}
function renderPlayers() {
  $('players').style.gridTemplateColumns=game.players.length===3 && window.innerWidth>1150?'repeat(3,minmax(0,1fr))':'';
  $('players').innerHTML=game.players.map((p,i)=>`<article class="player-panel ${i===game.current_player&&game.phase!=='finished'?'current':''}"><div class="player-panel-top"><div class="player-name"><span class="avatar">${String(i+1).padStart(2,'0')}</span>玩家 ${i+1}${i===game.current_player&&game.phase!=='finished'?'<span class="active-tag">当前回合</span>':''}</div><span class="score">${p.points}<small>/ 15 声望</small></span></div><div class="asset-line"><span class="asset-label">持有筹码</span>${gems(p.tokens,true)}<span class="asset-total">${p.tokens.reduce((a,b)=>a+b,0)} / 10</span></div><div class="asset-line"><span class="asset-label">永久折扣</span>${gems(p.bonuses,true,'bonus-square')}<span class="asset-total">${p.purchased.length} 张牌</span></div><div class="reserve-strip"><span class="reserve-label">预留 ${p.reserved_count}/3</span>${p.reserved? p.reserved.map(c=>`<button class="reserved-card" data-cmd="card" data-id="${c.id}" aria-label="查看预留牌 ${c.id}">${gem(c.bonus,c.points)} ${c.id} ↗</button>`).join('') || '<span class="locked-copy">尚未预留</span>' : Array.from({length:p.reserved_count},()=>'<span class="reserved-back">◇</span>').join('') + `<span class="locked-copy">${p.reserved_count?'私有牌已隐藏':'尚未预留'}</span>`}</div>${p.purchased.length||p.nobles.length?`<details class="purchase-detail"><summary>查看已购买牌与贵族</summary><div class="cost-row">${p.purchased.map(c=>`<span title="${c.id} · ${names[c.bonus]}折扣 · ${c.points} 分">${gem(c.bonus,c.points)} <small>${c.id}</small></span>`).join('')}${p.nobles.map(n=>`<span>♜ ${n.id} · 3 分</span>`).join('')}</div></details>`:''}</article>`).join('');
}
function actionHeader() {
  const player=game.players[game.current_player];
  return `<div class="turn-label"><span>${game.final_round?'最后一轮':'轮到你了'}</span><span>TURN ${String(game.round).padStart(2,'0')}</span></div><div class="player-heading"><span class="avatar">${String(game.current_player+1).padStart(2,'0')}</span><div><h3>玩家 ${game.current_player+1}</h3><p>${player.points} 声望 · ${player.purchased.length} 张发展卡</p></div></div><div class="action-divider"></div>`;
}
function renderAction() {
  const panel=$('action-panel');
  if(game.phase==='finished') {
    panel.innerHTML=`<div class="eyebrow">A LEGACY OF BRILLIANCE</div><div class="handoff-art">♜</div><h3 class="finished-title">${game.winners.map(i=>`玩家 ${i+1}`).join(' & ')}<br>${game.winners.length>1?'共同获胜':'赢得荣耀'}</h3><p class="action-copy">先比较声望，再比较已购买发展卡数量（越少越优）。</p>${game.players.map((p,i)=>`<div class="ranking"><span>玩家 ${i+1} ${game.winners.includes(i)?'✦':''}</span><b>${p.points} 分 · ${p.purchased.length} 张</b></div>`).join('')}<div class="action-divider"></div><button class="primary full" data-cmd="new">再来一局 →</button>`;
    return;
  }
  let content=actionHeader();
  if(info?.termination_reason==='no_legal_actions') {
    content+='<h3 class="action-title">当前没有合法动作</h3><div class="blocked-note">银行没有可拿筹码，且无法预留或购买。此状态不判定胜负、不自动跳过；可重新开局检验另一局。</div><button class="primary full" data-cmd="new">重新开局</button>';
  } else if(!canAct()) {
    content+=`<div class="handoff-art">◇</div><h3 class="action-title">请交给玩家 ${game.current_player+1}</h3><p class="action-copy">公共棋盘始终可见。准备好后接手回合，查看自己的预留牌。</p><button class="primary full" data-cmd="claim">开始我的回合 →</button>`;
  } else if(game.phase==='discard') {
    const p=game.players[viewer], need=p.tokens.reduce((a,b)=>a+b,0)-10;
    const action={type:'discard',tokens:discarded};
    content+=`<h3 class="action-title">归还 ${need} 枚筹码</h3><p class="action-copy">回合结束最多持有 10 枚。可以归还刚拿到的筹码，也可以归还黄金。</p><div class="discard-grid">${p.tokens.map((n,i)=>`<div class="discard-item">${gem(i,n)}<div class="adjust"><button data-cmd="discard-minus" data-color="${i}" aria-label="少还一枚${names[i]}" ${discarded[i]?'':'disabled'}>−</button><span>${discarded[i]}</span><button data-cmd="discard-plus" data-color="${i}" aria-label="多还一枚${names[i]}" ${discarded[i]<n?'':'disabled'}>＋</button></div></div>`).join('')}</div><button class="primary full" data-cmd="discard-confirm" ${has(action)?'':'disabled'}>确认归还 ${discarded.reduce((a,b)=>a+b,0)} / ${need} 枚</button>`;
  } else if(game.phase==='noble') {
    content+='<h3 class="action-title">贵族正在等候</h3><p class="action-copy">你的产业获得了多位贵族的青睐。选择其中一位来访，获得 3 点声望。</p><div class="action-stack">'+actions.map(a=>`<button class="secondary" data-cmd="noble" data-id="${a.noble_id}">♜ 邀请贵族 ${a.noble_id} · +3 分</button>`).join('')+'</div>';
  } else if(selectedCard && selected()) {
    const c=selected(), p=game.players[viewer], due=c.cost.map((n,i)=>Math.max(0,n-p.bonuses[i]));
    const opts=buyOptions(); paymentIndex=Math.min(paymentIndex,Math.max(0,opts.length-1));
    const missing=Math.max(0,due.reduce((sum,n,i)=>sum+Math.max(0,n-p.tokens[i]),0)-p.tokens[5]);
    const reserve=has({type:'reserve',card_id:c.id});
    content+=`<h3 class="action-title">${names[c.bonus]}产业 <span class="muted">${c.id}</span></h3><p class="action-copy">${c.tier} 级发展卡 · ${c.points} 声望 · 永久${names[c.bonus]}折扣 +1</p><div class="payment-block"><div class="payment-line"><span>原始费用</span>${gems(c.cost)}</div><div class="payment-line"><span>你的折扣</span>${gems(p.bonuses)}</div><div class="payment-line"><span>折后费用</span>${due.some(Boolean)?gems(due):'<span>免费</span>'}</div>${opts.length?`<label for="payment-select">支付组合${opts.length>1?' · 可选择黄金替代':''}</label><select id="payment-select">${opts.map((a,i)=>`<option value="${i}" ${i===paymentIndex?'selected':''}>${esc(tokenText(a.payment))}</option>`).join('')}</select>`:`<p class="missing">当前筹码不足，还缺 ${missing} 枚可支付筹码。</p>`}</div><div class="action-stack"><button class="primary full" data-cmd="buy" ${opts.length?'':'disabled'}>购买这张牌${opts.length?' →':''}</button><button class="secondary full" data-cmd="reserve" ${reserve?'':'disabled'}>${p.reserved.some(x=>x.id===c.id)?'这张牌已在你的预留中':p.reserved_count>=3?'预留已满（3/3）':`预留这张牌${game.bank[5]?' · 黄金 +1':' · 无黄金'}`}</button></div><button class="subtle-button" data-cmd="clear">取消选择</button>`;
  } else if(selectedTier) {
    const reserve=has({type:'reserve',tier:selectedTier});
    content+=`<h3 class="action-title">盲抽 ${selectedTier} 级发展卡</h3><p class="action-copy">从牌堆顶预留一张，仅你自己可见。${game.bank[5]?'同时获得 1 枚黄金。':'银行暂无黄金，仍可预留。'}<br>此牌堆剩余 ${game.deck_counts[selectedTier-1]} 张。</p><button class="primary full" data-cmd="reserve-deck" ${reserve?'':'disabled'}>${reserve?'确认盲抽预留 →':game.deck_counts[selectedTier-1]===0?'牌堆已空':'预留已满（3/3）'}</button><button class="subtle-button" data-cmd="clear">取消选择</button>`;
  } else {
    const amount=picked.reduce((a,b)=>a+b,0), action={type:'take',tokens:picked}, valid=has(action);
    content+=`<h3 class="action-title">${amount?'收集宝石':'你的下一步，会是什么？'}</h3><p class="action-copy">${amount?'确认本回合拿取的筹码，或再次点击筹码调整数量。':'点击银行筹码进行拿取；点击发展卡购买或预留，也可点击牌堆盲抽预留。'}</p>${amount?`<div class="selection-tokens">${picked.map((n,i)=>n?gem(i,n):'').join('')}</div>${!valid?'<p class="missing">请选择最多 3 种不同色各 1 枚，或库存至少 4 枚的同色 2 枚。</p>':''}`:'<div class="handoff-art">♧</div>'}<button class="primary full" data-cmd="take" ${valid?'':'disabled'}>${amount?`确认拿取 ${amount} 枚 →`:'先选择筹码或卡牌'}</button>${amount?'<button class="subtle-button" data-cmd="clear">清空选择</button>':''}<div class="action-divider"></div><p class="action-copy" style="margin:0">一回合，一个主动作。<br>你的产业，会让下一次购买更轻松。</p>`;
  }
  panel.innerHTML=content;
}
function render() {
  if(!game) { $('action-panel').innerHTML='<p class="loading-text">正在准备棋盘…</p>'; return; }
  $('round-status').innerHTML=`<span class="pill ${game.final_round?'final':''}">${game.phase==='finished'?'已结束':game.final_round?'最后一轮':`${game.players.length} 人对局`}</span><span class="round-number">${String(game.round).padStart(2,'0')}</span><span class="round-copy">当前轮次<br><b>${game.phase==='finished'?'对局完成':`玩家 ${game.current_player+1} 行动`}</b></span>`;
  renderNobles(); renderMarket(); renderBank(); renderPlayers(); renderAction();
  $('logs').innerHTML=game.log.length ? game.log.slice(-35).reverse().map(l=>`<div class="log-entry"><span class="log-round">R${String(l.round).padStart(2,'0')}</span><div><b>玩家 ${l.player+1}</b><p>${esc(l.text)}</p></div></div>`).join('') : '<p class="empty-log">牌桌已就绪。<br>第一笔交易，等你开启。</p>';
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-cmd]');
  if(!button || button.disabled || busy) return;
  const cmd=button.dataset.cmd, color=Number(button.dataset.color);
  if(cmd==='new') { $('num-players').value=String(game?.players.length||2); loadDuelChoices(); $('new-dialog').showModal(); return; }
  if(cmd==='close-new') { $('new-dialog').close(); return; }
  if(cmd==='rules') { $('rules-dialog').showModal(); return; }
  if(cmd==='close-rules') { $('rules-dialog').close(); return; }
  if(cmd==='catalog') { openCatalog(); return; }
  if(cmd==='deck') { openCatalog(Number(button.dataset.tier)); return; }
  if(cmd==='close-catalog') { $('catalog-dialog').close(); return; }
  if(cmd==='catalog-reserve') {
    if(canAct() && has({type:'reserve',tier:catalogTier})) {
      $('catalog-dialog').close(); resetSelection(); selectedTier=catalogTier; render();
    }
    return;
  }
  if(cmd==='claim') { claimTurn(); return; }
  if(!canAct()) { toast('请先点击“开始我的回合”接手操作'); return; }
  if(cmd==='noble') { submit({type:'noble',noble_id:button.dataset.id}); return; }
  if(cmd==='discard-plus') { discarded[color]=Math.min(game.players[viewer].tokens[color],discarded[color]+1); renderAction(); return; }
  if(cmd==='discard-minus') { discarded[color]=Math.max(0,discarded[color]-1); renderAction(); return; }
  if(cmd==='discard-confirm') { submit({type:'discard',tokens:discarded}); return; }
  if(game.phase!=='main') { toast('请先完成当前阶段的选择'); return; }
  if(cmd==='card') { resetSelection(); selectedCard=button.dataset.id; render(); }
  if(cmd==='token') { selectedCard=null; selectedTier=null; picked[color]=(picked[color]+1)%3; render(); }
  if(cmd==='clear') { resetSelection(); render(); }
  if(cmd==='take') submit({type:'take',tokens:picked});
  if(cmd==='buy') { const action=buyOptions()[paymentIndex]; if(action) submit(action); }
  if(cmd==='reserve') submit({type:'reserve',card_id:selectedCard});
  if(cmd==='reserve-deck') submit({type:'reserve',tier:selectedTier});
});
document.addEventListener('change',event=>{ if(event.target.id==='payment-select') paymentIndex=Number(event.target.value); });
$('catalog-tier').addEventListener('change',renderCatalog);
$('catalog-bonus').addEventListener('change',renderCatalog);
$('new-form').addEventListener('submit',async event=>{
  event.preventDefault(); if(busy) return;
  const value=$('seed').value.trim(), seed=value===''?null:Number(value);
  if(seed!==null && (!Number.isSafeInteger(seed)||seed<0)) { $('seed').setCustomValidity('请输入有效的非负整数种子'); $('seed').reportValidity(); return; }
  $('seed').setCustomValidity(''); setBusy(true); clearError();
  try {
    const body={version,num_players:Number($('num-players').value),seed};
    if(isDuel) Object.assign(body,{checkpoint:$('duel-checkpoint').value,human_seat:Number($('human-seat').value)});
    const result=await api('/api/new',body);
    clearPrivate(); accept(result);
    if(isDuel && game.phase!=='finished') await loadPrivate(humanSeat);
    $('new-dialog').close(); render(); toast('新对局已准备好');
  } catch(e) { $('new-dialog').close(); await recover(e); }
  finally { setBusy(false); }
});
$('seed').addEventListener('input',()=> $('seed').setCustomValidity(''));
window.addEventListener('resize',()=>{if(game) renderPlayers();});
window.addEventListener('pageshow',event=>{ if(event.persisted) location.reload(); });
async function boot() {
  setBusy(true);
  try {
    accept(await api('/api/state'));
    if(!game) accept(await api('/api/new',{version,num_players:2,seed:42}));
    clearPrivate();
    if(isDuel && game.phase!=='finished') await loadPrivate(humanSeat);
    render();
  } catch(e) { await recover(e); }
  finally { setBusy(false); }
}
boot();
