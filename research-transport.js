/* Shared public GET transport. No private-state token is sent with research reads. */
(()=>{'use strict';
 let generation=0;
 const pending=new Map(),cache=new Map(),blocked=new Map(),log=new Map();
 function bound(map,max=80){while(map.size>max)map.delete(map.keys().next().value)}
 async function json(url,{ttl=300000,refresh=false,timeout=6000,validate=x=>x&&typeof x==='object'}={}){
  const epoch=generation,key=String(url),cached=cache.get(key),time=Date.now();
  if(cached&&!refresh&&time-cached.at<ttl)return cached.value;
  if(pending.has(key))return pending.get(key);
  if((blocked.get(key)||0)>time){if(cached)return cached.value;throw Object.assign(new Error('Request is cooling down'),{code:'REQUEST_COOLDOWN'})}
  const task=(async()=>{let failure;
   for(let attempt=0;attempt<2;attempt++)try{
    const response=await fetch(key,{cache:'no-cache',signal:AbortSignal.timeout(timeout)});
    if(!response.ok){const error=Object.assign(new Error('HTTP '+response.status),{status:response.status});if(response.status>=500&&attempt===0)continue;const seconds=Number(response.headers.get('Retry-After'));blocked.set(key,Date.now()+(response.status===429&&seconds>0?Math.min(seconds,3600)*1000:[401,403,404].includes(response.status)?300000:30000));throw error}
    const value=await response.json();if(!validate(value))throw Object.assign(new Error('Response schema changed'),{code:'INVALID_RESPONSE'});
    if(epoch===generation){cache.delete(key);cache.set(key,{value,at:Date.now()});bound(cache);blocked.delete(key)}log.set(key,{status:'Current',lastSuccessAt:new Date().toISOString(),lastAttemptAt:new Date().toISOString()});bound(log);return value;
   }catch(e){failure=e;if(e.status||e.code==='INVALID_RESPONSE'||attempt===1)break}
   blocked.set(key,Math.max(blocked.get(key)||0,Date.now()+30000));log.set(key,{...log.get(key),status:cached?'Cached fallback':'Unavailable',lastAttemptAt:new Date().toISOString(),error:failure?.code||failure?.status||'NETWORK_ERROR'});
   bound(blocked);bound(log);if(cached)return cached.value;throw failure||new Error('Research request unavailable');
  })();pending.set(key,task);try{return await task}finally{if(pending.get(key)===task)pending.delete(key)}
 }
 const originalAPI=api;
 async function requestAPI(path,opts={}){
  const base=apiBase();if(!base)throw Object.assign(new Error('Research API not configured'),{code:'NO_API'});
  if(!/^\/api\/[a-z0-9/?=_.:%&+-]+$/i.test(path))throw new Error('Invalid API path');
  const method=(opts.method||'GET').toUpperCase();
  if(method!=='GET'||/^\/api\/(state|watch)(?:[/?]|$)/.test(path))return originalAPI(path,opts);
  const health=path==='/api/health'?null:await json(base+'/api/health',{ttl:300000,timeout:3500,validate:x=>x?.ok===true});
  if(health&&!health.freeResearch)throw Object.assign(new Error('Configured backend needs the free-source API update; saved research remains available.'),{code:'FREE_BACKEND_UPDATE_REQUIRED'});
  return json(base+path,{ttl:60000,refresh:!!opts.refresh,timeout:7000,validate:x=>x&&typeof x==='object'&&!x.error});
 }
 api=requestAPI;
 window.RecoveryRequests={json,api:requestAPI,invalidate:()=>{generation++;cache.clear();pending.clear()},status:()=>[...log].map(([url,state])=>({url:url.replace(/\?.*$/,''),...state}))};
})();
