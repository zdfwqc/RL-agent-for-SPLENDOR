// IndexedDB holds public replay archives; each deployment path has its own namespace.
let connection;
function db(){return connection??=new Promise((resolve,reject)=>{
 const r=indexedDB.open('splendor-browser-records',1);
 r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'key'});
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
});}
export async function saveRecord(site,record){
 if(!record)return;
 const database=await db();
 await new Promise((resolve,reject)=>{const tx=database.transaction('records','readwrite');
 tx.objectStore('records').put({key:site+':'+record.game_id,site,record});
 tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
export async function recordsFor(site){
 const database=await db();return new Promise((resolve,reject)=>{
 const r=database.transaction('records').objectStore('records').getAll();
 r.onsuccess=()=>resolve(r.result.filter(x=>x.site===site).map(x=>x.record).sort((a,b)=>b.game_id.localeCompare(a.game_id)));
 r.onerror=()=>reject(r.error);});
}
