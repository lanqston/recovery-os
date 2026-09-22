const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 let manifest={revision:'one',completedAt:new Date().toISOString(),components:[],status:'Partial'},loads=0,renders=0;
 const vectors=()=>({value:[1,2,3],clone(){return {value:[...this.value]}},copy(other){this.value=[...other.value]}});
 const world={locationKind:'stock',camera:{position:vectors()},target:vectors(),cameraTarget:vectors(),distance:10,yaw:1,pitch:2};
 const fabric={world,replayState:null,refreshData:async()=>{}};
 const context={window:{RecoveryFabric:fabric,RecoveryRequests:{invalidate(){}},RecoveryQuality:{invalidate(){}},addEventListener(){},dispatchEvent(){}},document:{hidden:false,querySelector:()=>null,addEventListener(){}},fetch:async()=>Response.json(manifest),AbortSignal,Date,Map,Promise,CustomEvent:class{},console,toast(){},setInterval:()=>1,clearInterval(){},researchLoads:new Map(),PUBLIC_BUNDLES:new Map(),ATLAS_BUNDLES:new Map(),ATLAS_SHARDS:new Map(),loadSeed:async()=>{loads++},loadState:async()=>{},refreshTrackerObservations:async()=>{},currentBundle:{profile:{ticker:'AAPL'},researchSymbol:'AAPL'},currentTicker:'AAPL',researchSection:'brief',researchBundle:async()=>({profile:{ticker:'AAPL'},quote:{price:20}}),renderResearchWorld:()=>{renders++;world.camera.position.value=[9,9,9]}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('refresh-controller.js','utf8'),context);
 return {api:context.window.RecoveryRefresh,context,world,fabric,loads:()=>loads,renders:()=>renders,setRevision:r=>manifest={...manifest,revision:r}};
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
