export const names=['白钻','蓝宝石','祖母绿','红宝石','黑玛瑙','黄金'];
export function tokens(values=[]){return values.map((n,i)=>n?`${names[i]} ×${n}`:'').filter(Boolean).join('、')||'无';}
export function cardText(c){return c?`${c.id}（${c.tier}级，${names[c.bonus]}折扣，${c.points}分）`:'';}
export function actionCard(event,before){
 const id=event.action.card_id;
 if(!id)return null;
 return before.market.flat().find(c=>c?.id===id)||event.public_state.players[event.player].purchased.find(c=>c.id===id)||null;
}
export function describeAction(event,before){
 const a=event.action,c=actionCard(event,before),label=cardText(c)||a.card_id;
 let text;
 switch(a.type){
 case 'take':text=`拿取 ${tokens(a.tokens)}`;break;
 case 'buy':text=`购买 ${label}；支付 ${tokens(a.payment)}`;break;
 case 'reserve':{
  const gold=event.public_state.players[event.player].tokens[5]-before.players[event.player].tokens[5];
  text=(a.card_id?`预留（扣下）${label}`:`从牌库盲抽预留 ${a.tier} 级卡（牌面隐藏）`)+`；${gold>0?`获得黄金 ×${gold}`:'未获得黄金'}`;break;
 }
 case 'discard':text=`归还 ${tokens(a.tokens)}（手牌筹码上限10枚）`;break;
 case 'noble':text=`选择贵族 ${a.noble_id}，获得3分`;break;
 default:text='未知动作';
 }
 if(a.type!=='noble'){
  const old=new Set(before.players[event.player].nobles.map(n=>n.id));
  const added=event.public_state.players[event.player].nobles.filter(n=>!old.has(n.id));
  if(added.length)text+=`；贵族 ${added.map(n=>n.id).join('、')} 来访`;
 }
 return text;
}
export function validateRecord(record){
 if(!record?.initial_state||!Array.isArray(record.events)||record.events.length>10000)throw Error('请选择本项目导出的对战 JSON 记录');
 for(const s of [record.initial_state,...record.events.map(e=>e.public_state)]){
  if(!Array.isArray(s?.players)||!Array.isArray(s.market)||!Array.isArray(s.bank)||!Array.isArray(s.nobles)||!Array.isArray(s.deck_counts))throw Error('记录缺少完整棋盘状态');
  for(const p of s.players)if(!Array.isArray(p.tokens)||!Array.isArray(p.bonuses)||!Array.isArray(p.purchased)||!Array.isArray(p.nobles))throw Error('玩家状态不完整');
 }
 for(const e of record.events)if(!e.action||!Number.isInteger(e.player)||e.player<0||e.player>=e.public_state.players.length)throw Error('动作记录格式错误');
 return record;
}
export function frameAt(record,step){
 if(!Number.isInteger(step)||step<0||step>record.events.length)throw Error('回放步数越界');
 return step===0?record.initial_state:record.events[step-1].public_state;
}
