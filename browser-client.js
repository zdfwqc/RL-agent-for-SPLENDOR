/* Static-site adapter for the existing UI; only /api/* is handled locally. */
import {saveRecord,recordsFor} from './browser-storage.js';
const nativeFetch=window.fetch.bind(window);
const base=new URL('.',location.href).pathname;
const key='splendor:'+base;
const replay=location.pathname.endsWith('replay.html');
let lastRecord=null,history=[];
function loadStored(storage,k){try{return JSON.parse(storage.getItem(k)||'null');}catch{return null;}}
function note(text){const n=document.getElementById('browser-status');if(n)n.textContent=text;}
function download(record){
 if(!record){alert('尚无对局记录');return;}
 const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=(record.game_id||'splendor')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
let call;
if(!replay){
 const status=document.createElement('p');status.id='browser-status';status.setAttribute('role','status');
 status.style.cssText='padding:14px 24px;margin:0;background:#24382c;color:#e8ce91';document.body.prepend(status);
 const worker=new Worker(new URL('./browser-worker.js',import.meta.url));let id=0;const pending=new Map();
 call=(path,body=null,saved=null)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});worker.postMessage({id:n,path,body,saved});});
 worker.onmessage=async({data})=>{
  if(data.status){note(data.status);return;}
  const p=pending.get(data.id);if(!p)return;pending.delete(data.id);
  if(data.error){p.reject(Error(data.error));return;}
  if(data.save){lastRecord=data.save.record;try{await saveRecord(key,lastRecord);sessionStorage.setItem(key+':save',JSON.stringify(data.save));}catch{note('当前对局可继续，但浏览器存储不可用或已满，请及时导出记录。');}}
  p.resolve(data.result);
 };
 worker.onerror=e=>{const error=Error(e.message||'浏览器运行环境加载失败，请检查网络后刷新');note(error.message);for(const p of pending.values())p.reject(error);pending.clear();};
 const saved=loadStored(sessionStorage,key+':save');lastRecord=saved?.record;
 // Archive before restore: a new model must not overwrite the old game's only copy.
 const ready=(async()=>{if(saved?.record)await saveRecord(key,saved.record);return call('init',null,saved);})().then(r=>note(`浏览器本地运行 · 模型 ${r.model} · 对局不会上传服务器`)).catch(e=>{note('加载失败：'+e.message);throw e;});
 window.fetch=async(input,options)=>{
  const path=String(input);
  if(!path.startsWith('/api/'))return nativeFetch(input,options);
  try{await ready;const result=await call(path,options?.body?JSON.parse(options.body):null);return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});}
  catch(e){return new Response(JSON.stringify({detail:e.message}),{status:400,headers:{'Content-Type':'application/json'}});}
 };
}else{
 try{history=await recordsFor(key);}catch(e){note('读取历史失败：'+e.message);}
 const select=document.createElement('select');select.id='browser-history';select.setAttribute('aria-label','浏览器历史对局');
 for(const r of history){const o=document.createElement('option');o.value=r.game_id;o.textContent=`${r.game_id} · ${r.num_players}人 · ${r.events.length}步`;select.append(o);}
 const label=document.createElement('label');label.textContent='浏览器历史对局 ';label.append(select);document.querySelector('.tools').append(label);
 select.onchange=()=>document.getElementById('current').click();
 window.fetch=async(input,options)=>{
  if(String(input)!=='/api/record')return nativeFetch(input,options);
  const selected=select.value;history=await recordsFor(key);
  const record=history.find(r=>r.game_id===selected)||history[0]||loadStored(localStorage,key+':record');
  return new Response(JSON.stringify(record||{detail:'没有浏览器本地记录，请打开导出的 JSON'}),{status:record?200:404,headers:{'Content-Type':'application/json'}});
 };
}
document.addEventListener('click',async e=>{
 const a=e.target.closest('a[data-download-record]');if(!a)return;e.preventDefault();
 try{download(replay?(history.find(r=>r.game_id===document.getElementById('browser-history').value)||history[0]):await call('/api/record'));}catch(err){alert(err.message);}
});
await import(replay?'./replay.js':'./app.js');
