/* All game state and inference live in this worker, never on a remote server. */
let pyodide, game, queue=Promise.resolve();
async function init(saved){
 const manifest=await (await fetch('./manifest.json')).json();
 postMessage({status:'正在下载浏览器运行环境（首次打开可能需要较长时间）…'});
 importScripts(manifest.pyodide+'pyodide.js');
 pyodide=await loadPyodide({indexURL:manifest.pyodide});
 postMessage({status:'正在加载 NumPy 与游戏规则…'});
 await pyodide.loadPackage('numpy');
 await Promise.all(manifest.python.map(async path=>{
  const response=await fetch('./python/'+path);if(!response.ok)throw Error('规则文件加载失败：'+path);
  const target='/home/pyodide/'+path;pyodide.FS.mkdirTree(target.slice(0,target.lastIndexOf('/')));
  pyodide.FS.writeFile(target,await response.text());
 }));
 const model=await (await fetch('./model.json')).text();
 pyodide.globals.set('model_json',model);
 pyodide.runPython('import json\nfrom splendor.browser_runtime import BrowserGame\ngame = BrowserGame(json.loads(model_json))');
 if(saved){
  try{pyodide.globals.set('saved_json',JSON.stringify(saved));pyodide.runPython('game.restore(json.loads(saved_json))');}
  catch(e){postMessage({status:'旧对局无法恢复：'+e.message+'。将开启新局。'});}
 }
 return {ready:true,model:JSON.parse(model).model_name};
}
self.onmessage=event=>{
 const {id,path,body,saved}=event.data;
 queue=queue.then(async()=>{
  try{
   if(path==='init'){postMessage({id,result:await init(saved)});return;}
   pyodide.globals.set('request_json',JSON.stringify({path,body}));
   const result=JSON.parse(pyodide.runPython("req=json.loads(request_json)\njson.dumps(game.request(req['path'],req['body']),ensure_ascii=False)"));
   const save=body!==null&&body!==undefined?JSON.parse(pyodide.runPython('json.dumps(game.save(),ensure_ascii=False)')):null;
   postMessage({id,result,save});
  }catch(e){postMessage({id,error:e.message});}
 });
};
