/* One publication revision invalidates every research layer, independently of thesis revision. */
(()=>{'use strict';
  let status=null,pending=null,lastApplied=0;
  const esc=x=>String(x??'Unknown').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const display=x=>x?window.RecoveryInformation?.display(x)||x:'No successful observation';
  function draw(){
    const host=document.querySelector('#atlasTape');if(!host)return;
    let button=document.querySelector('#recoveryRefreshStatus');
    if(!button){button=document.createElement('button');button.id='recoveryRefreshStatus';host.append(button);button.onclick=openStatus}
    const late=!status||Date.now()-Date.parse(status.completedAt)>36*3600000;
    button.textContent=status?`Daily refresh · ${late?'Overdue':status.status}`:'Refresh status unavailable';
    button.title=status?`Collection completed ${display(status.completedAt)}. Open component dates.`:'Open refresh details';
    button.setAttribute('aria-label',button.textContent+'. Open component freshness');
  }
  function openStatus(){
    const fabric=window.RecoveryFabric;if(!fabric)return;
    const labels={quotes:'Stock & ETF quotes',priceHistory:'Historical chart bars',news:'Company news',filings:'SEC filings',financials:'Financial statements',directory:'Symbol directory',macro:'Macro releases',atlas:'Broad market atlas',recoveryThesis:'Recovery thesis review'};
    fabric.active='refresh';
    fabric.panel('Daily refresh',`<h2>Daily refresh</h2><p>${esc(status?.schedule||'The refresh report could not be loaded. Try again when connected.')}</p><p>Last completed collection: ${esc(display(status?.completedAt))}</p><p>A completed collection can contain unavailable sources. Each observation keeps its own date.</p><button id="refreshAllNow">Check for updates</button><div class="info-coverage-grid">${(status?.components||[]).map(c=>`<article class="info-metric"><h3>${esc(labels[c.id]||c.id)}</h3><strong>${esc(c.status)}</strong>${c.current!=null?`<p>${c.current} current · ${c.stale} older · ${c.unavailable} unavailable / ${c.total}</p>`:''}<p>Latest observation: ${esc(display(c.latestObservationAt))}</p>${c.lastSuccessfulRetrieval?`<p>Source checked: ${esc(display(c.lastSuccessfulRetrieval))}</p>`:''}${c.note?`<p>${esc(c.note)}</p>`:''}</article>`).join('')}</div>`);
    document.querySelector('#refreshAllNow').onclick=async()=>{await refresh(true);openStatus()};
  }
  function invalidate(){
    window.RecoveryRequests?.invalidate();window.RecoveryQuality?.invalidate();
    researchLoads.clear();PUBLIC_BUNDLES.clear();ATLAS_BUNDLES.clear();ATLAS_SHARDS.clear();
  }
  async function apply(next){
    invalidate();
    await loadSeed({refresh:true});
    await loadState(false);
    await refreshTrackerObservations();
    const fabric=window.RecoveryFabric,world=fabric?.world;
    if(currentBundle&&currentTicker&&!fabric?.replayState&&world?.locationKind==='stock'){
      const ticker=currentTicker,section=researchSection;
      const bundle=await researchBundle(ticker,{refresh:true});
      // Do not replace a new navigation with an older request's result.
      if(currentTicker===ticker&&world.locationKind==='stock'&&!fabric?.replayState){
        const camera={position:world.camera.position.clone(),target:world.target.clone(),cameraTarget:world.cameraTarget.clone(),distance:world.distance,yaw:world.yaw,pitch:world.pitch};
        bundle.researchSymbol=currentBundle.researchSymbol;currentBundle=bundle;
        renderResearchWorld(bundle,section);world.bundle=bundle;
        world.camera.position.copy(camera.position);world.target.copy(camera.target);world.cameraTarget.copy(camera.cameraTarget);
        Object.assign(world,{distance:camera.distance,yaw:camera.yaw,pitch:camera.pitch,flight:null});world.changed=true;
      }
    }
    await fabric?.refreshData();
    status=next;lastApplied=Date.now();draw();
    window.dispatchEvent(new CustomEvent('recovery-data-updated',{detail:next}));
  }
  async function refresh(manual=false){
    if(pending)return pending;
    if(document.hidden&&!manual)return;
    pending=(async()=>{
      try{
        const response=await fetch('data/refresh-status.json?check='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error('Refresh report HTTP '+response.status);
        const next=await response.json();if(!next.revision||!Array.isArray(next.components))throw new Error('Refresh report invalid');
        const changed=status?.revision!==next.revision;
        if(manual||changed||Date.now()-lastApplied>300000)await apply(next);else{status=next;draw()}
        if(manual)toast('Latest available evidence loaded · '+next.status.toLowerCase()+' coverage');
      }catch(e){draw();if(manual)toast('Could not refresh · saved evidence remains available');console.warn('Daily refresh',e)}
      finally{pending=null}
    })();return pending;
  }
  window.RecoveryRefresh={refresh,openStatus,invalidate,get status(){return status}};
  const resume=()=>{if(!document.hidden)refresh()};
  document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);window.addEventListener('pageshow',resume);
  // Seed loading is owned by the existing app. Wait for its world before refreshing it.
  let bootTries=0;const boot=setInterval(()=>{if(window.RecoveryFabric?.world){clearInterval(boot);refresh()}else if(++bootTries>60)clearInterval(boot)},1000);
})();
