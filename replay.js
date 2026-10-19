import {names,tokens,cardText,actionCard,describeAction,validateRecord,frameAt} from './replay-model.mjs';
const $=id=>document.getElementById(id),colors=['#ede7d3','#82b6e4','#7ec697','#e8908c','#bbb4cf'];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let record,step=0,timer=null;
const ledger=document.createElement('section');
ledger.innerHTML='<h2>总动作清单</h2><p class="muted">本次载入记录的全部动作，按先后顺序排列；点击任意一条跳转回放。</p><div class="tools"><label>动作类型 <select id="action-type"><option value="all">全部动作</option><option value="take">拿宝石</option><option value="buy">买卡</option><option value="reserve">拿金扣牌／预留</option><option value="discard">归还宝石</option><option value="noble">选择贵族</option></select></label><label>玩家 <select id="action-player"><option value="all">全部玩家</option></select></label></div><p id="action-count" class="muted"></p><div id="action-ledger" aria-label="总动作清单"></div>';
document.querySelector('main > div').append(ledger);
const actionLabels={take:'拿宝石',buy:'买卡',reserve:'拿金扣牌／预留',discard:'归还宝石',noble:'选贵族'};
function renderLedger(){
 if(!record)return;
 const type=$('action-type').value,player=$('action-player').value;
 const rows=record.events.map((e,i)=>({e,i})).filter(({e})=>(type==='all'||e.action.type===type)&&(player==='all'||e.player===Number(player)));
 const counts={};for(const {e} of rows)counts[e.action.type]=(counts[e.action.type]||0)+1;
 $('action-count').textContent=`显示 ${rows.length} / ${record.events.length} 个动作`+(rows.length?' · '+Object.entries(counts).map(([k,n])=>`${actionLabels[k]||k} ${n} 次`).join(' · '):'');
 $('action-ledger').innerHTML=rows.map(({e,i})=>`<button class="event ${i+1===step?'active':''}" data-step="${i+1}" ${i+1===step?'aria-current="step"':''}><small>#${i+1} · 第${esc(e.round)}轮 · 玩家${e.player+1}（${e.controller==='human'?'你':'AI'}）</small><strong class="action-tag ${esc(e.action.type)}">${esc(actionLabels[e.action.type]||'其他')}</strong> ${esc(describeAction(e,frameAt(record,i)))}</button>`).join('')||'<p class="muted">没有符合筛选条件的动作。</p>';
}
function card(c){return c?`<article class="card" style="--gem:${colors[c.bonus]||'#ccc'}"><b>${esc(c.id)} · ${esc(c.points)} 分</b><span>${esc(names[c.bonus])}折扣 +1</span><p>费用：${esc(tokens(c.cost))}</p></article>`:'<div class="card muted">空位</div>';}
function shortCost(cost){return cost.map((n,i)=>n?`<span style="color:${colors[i]||'#ccc'};white-space:nowrap">${['白','蓝','绿','红','黑'][i]}${esc(n)}</span>`:'').filter(Boolean).join(' ')||'0';}
function pause(){clearInterval(timer);timer=null;$('play').textContent='播放';}
function render(){
 const s=frameAt(record,step),e=step?record.events[step-1]:null;
 $('position').textContent=`${step} / ${record.events.length} 步`;$('step').value=step;
 $('description').textContent=e?`第${step}步 · 第${e.round}轮 · 玩家${e.player+1}（${e.controller==='human'?'你':'AI'}）：${describeAction(e,frameAt(record,step-1))}`:'开局：尚未执行任何动作';
 if(s.phase==='finished')$('description').textContent+=` · 对局结束，获胜：${s.winners.map(i=>`玩家${i+1}`).join('、')}`;
 const c=e?actionCard(e,frameAt(record,step-1)):null;
 $('focus').innerHTML=c?card(c):e?.action.type==='reserve'?'盲抽预留：该时刻牌面未公开。':'本步无公开发展卡。';
 $('market').innerHTML=[2,1,0].map(t=>`<p>${t+1}级市场 · 牌库剩余 ${esc(s.deck_counts[t])} 张</p><div class="cards">${s.market[t].map(card).join('')}</div>`).join('');
 $('nobles').innerHTML=s.nobles.map(n=>`<div class="noble">贵族 ${esc(n.id)} · 3分<br>折扣要求：${esc(tokens(n.cost))}</div>`).join('');
 $('bank').textContent=`银行：${tokens(s.bank)}`;
 $('players').innerHTML=s.players.map((p,i)=>`<article class="player ${i===s.current_player?'active':''}"><b>玩家${i+1} · ${i===record.human_seat?'你':'AI'} · ${esc(p.points)}分</b><p>筹码：${esc(tokens(p.tokens))}</p><p>永久折扣：${esc(tokens(p.bonuses))}</p><p>预留 ${esc(p.reserved_count)} 张 · 贵族：${esc(p.nobles.map(n=>n.id).join('、')||'无')}</p><details><summary>已购 ${p.purchased.length} 张</summary>${p.purchased.map(c=>`<p>${esc(cardText(c))}<br><span class="muted">原价：</span>${shortCost(c.cost)}</p>`).join('')}</details></article>`).join('');
 $('first').disabled=$('prev').disabled=step===0;$('next').disabled=$('last').disabled=step===record.events.length;
 for(const b of $('timeline').querySelectorAll('button')){const active=Number(b.dataset.step)===step;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');}
 $('timeline').querySelector(`[data-step="${step}"]`)?.scrollIntoView({block:'nearest'});
 renderLedger();
}
function go(n){if(!record)return;step=Math.max(0,Math.min(record.events.length,n));render();}
function load(data){
 validateRecord(data);pause();record=data;step=0;
 $('action-type').value='all';
 $('action-player').innerHTML='<option value="all">全部玩家</option>'+record.initial_state.players.map((_,i)=>`<option value="${i}">玩家${i+1}${i===record.human_seat?'（你）':'（AI）'}</option>`).join('');
 $('error').textContent='';$('meta').textContent=`对局 ${record.game_id||'导入记录'} · ${record.initial_state.players.length} 人 · 模型 ${(record.checkpoint||'未知').split(/[\\/]/).at(-1)} · 已记录 ${record.events.length} 步`;
 $('timeline').innerHTML='<button class="event" data-step="0">开局</button>'+record.events.map((e,i)=>`<button class="event" data-step="${i+1}"><small>第${i+1}步 · 第${esc(e.round)}轮 · 玩家${e.player+1} ${e.controller==='human'?'你':'AI'}</small>${esc(describeAction(e,frameAt(record,i)))}</button>`).join('');
 $('step').max=record.events.length;$('step').disabled=false;$('play').disabled=record.events.length===0;render();
}
async function current(){pause();$('current').disabled=true;try{const r=await fetch('/api/record',{cache:'no-store'});if(!r.ok)throw Error('当前没有可读取的对局，请先创建对局，或打开历史 JSON。');load(await r.json());}catch(e){$('error').textContent=e.message;}finally{$('current').disabled=false;}}
$('current').onclick=current;
$('file').onchange=async e=>{pause();const f=e.target.files[0];if(!f)return;try{if(f.size>50*1024*1024)throw Error('记录文件超过50MB');load(JSON.parse(await f.text()));}catch(err){$('error').textContent=`导入失败：${err.message}`;}e.target.value='';};
$('first').onclick=()=>{pause();go(0);};$('last').onclick=()=>{pause();go(record.events.length);};
$('prev').onclick=()=>{pause();go(step-1);};$('next').onclick=()=>{pause();go(step+1);};
$('step').oninput=e=>{pause();go(Number(e.target.value));};
$('timeline').onclick=e=>{const b=e.target.closest('[data-step]');if(b){pause();go(Number(b.dataset.step));}};
$('action-type').onchange=renderLedger;$('action-player').onchange=renderLedger;
$('action-ledger').onclick=e=>{const b=e.target.closest('[data-step]');if(b){pause();go(Number(b.dataset.step));}};
$('play').onclick=()=>{if(timer){pause();return;}if(step===record.events.length)go(0);$('play').textContent='暂停';timer=setInterval(()=>{go(step+1);if(step===record.events.length)pause();},Number($('speed').value));};
$('speed').onchange=pause;window.addEventListener('pagehide',pause);current();
