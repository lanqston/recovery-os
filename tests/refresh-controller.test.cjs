const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const timers=[],classes=new Set();
 let manifest={revision:'one',completedAt:new Date().toISOString(),components:[],status:'Partial'},loads=0,renders=0;
 const vectors=()=>({value:[1,2,3],clone(){return {value:[...this.value]}},copy(other){this.value=[...other.value]}});
 const world={locationKind:'stock',camera:{position:vectors()},target:vectors(),cameraTarget:vectors(),distance:10,yaw:1,pitch:2};
 const fabric={world,replayState:null,refreshData:async()=>{}};
 const context={window:{RecoveryFabric:fabric,RecoveryRequests:{invalidate(){}},RecoveryQuality:{invalidate(){}},addEventListener(){},dispatchEvent(){}},document:{body:{classList:{contains:x=>classes.has(x)}},hidden:false,querySelector:()=>null,addEventListener(){}},fetch:async()=>Response.json(manifest),AbortSignal,Date,Map,Promise,CustomEvent:class{},console,toast(){},setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearInterval(){},researchLoads:new Map(),PUBLIC_BUNDLES:new Map(),ATLAS_BUNDLES:new Map(),ATLAS_SHARDS:new Map(),loadSeed:async()=>{loads++},loadState:async()=>{},refreshTrackerObservations:async()=>{},currentBundle:{profile:{ticker:'AAPL'},researchSymbol:'AAPL'},currentTicker:'AAPL',researchRequest:1,researchSection:'brief',researchBundle:async()=>({profile:{ticker:'AAPL'},quote:{price:20}}),renderResearchWorld:()=>{renders++;world.camera.position.value=[9,9,9]}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('refresh-controller.js','utf8'),context);
 return {timers,classes,api:context.window.RecoveryRefresh,context,world,fabric,loads:()=>loads,renders:()=>renders,setRevision:r=>manifest={...manifest,revision:r}};
}
test('a research revision refreshes even when the canonical thesis revision is unchanged',async()=>{
 const c=setup();await c.api.refresh();assert.equal(c.loads(),1);await c.api.refresh();assert.equal(c.loads(),1);
 c.setRevision('two');await c.api.refresh();assert.equal(c.loads(),2);assert.equal(c.api.status.revision,'two');
 await c.api.refresh(true);assert.equal(c.loads(),3);assert.deepEqual(c.world.camera.position.value,[1,2,3]);
});
test('background refresh does not advance historical replay or rerender its current stock',async()=>{
 const c=setup();c.fabric.replayState={cutoff:'2026-08-01'};await c.api.refresh();assert.equal(c.loads(),1);assert.equal(c.renders(),0);assert.equal(c.fabric.replayState.cutoff,'2026-08-01');
});
test('concurrent triggers share a refresh; hidden pages wait until resumed',async()=>{
 const c=setup();c.context.document.hidden=true;await c.api.refresh();assert.equal(c.loads(),0);c.context.document.hidden=false;
 await Promise.all([c.api.refresh(),c.api.refresh(),c.api.refresh()]);assert.equal(c.loads(),1);
});

test('publication checks repeat once per minute without reloading unchanged data',async()=>{
 const c=setup(),timer=c.timers.find(t=>t.ms===60000);assert.ok(timer);
 await c.api.refresh();timer.fn();await c.api.refresh();assert.equal(c.loads(),1);
 c.setRevision('two');timer.fn();await c.api.refresh();assert.equal(c.loads(),2);
});
test('background publication preserves the current reader state and latest section',async()=>{
 const c=setup(),state={open:true,reading:true,scroll:700};let restored,section;
 c.world.captureReader=()=>state;c.world.restoreReader=x=>restored=x;
 c.context.researchBundle=async()=>{c.context.researchSection='financials';return {profile:{ticker:'AAPL'}}};
 c.context.renderResearchWorld=(b,s)=>{section=s};await c.api.refresh();
 assert.equal(restored,state);assert.equal(section,'financials');
});
test('a completed fetch cannot overwrite a newer navigation or information panel',async()=>{
 const c=setup();c.context.researchBundle=async()=>{c.context.researchRequest++;return {profile:{ticker:'AAPL'}}};
 await c.api.refresh();assert.equal(c.renders(),0);
 const panel=setup();panel.classes.add('information-open');await panel.api.refresh();assert.equal(panel.renders(),0);
});
