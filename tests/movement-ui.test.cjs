const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const F=require('../information-model.js'),M=require('../movement-model.js');
test('day/week/month controls clear old results, redraw distinct dates, and manual refresh reloads',async()=>{
 const d=F.normalize(JSON.parse(fs.readFileSync('data/open-research/AMD.json'))),calls=[];
 const result={innerHTML:'',replaceChildren(){this.innerHTML=''}},controls={period:{},benchmark:{},refresh:{},status:{}};
 const host={isConnected:true,innerHTML:'',querySelector:s=>({'[data-movement-refresh]':controls.refresh,'.movement-status':controls.status,'.movement-result':result,'[data-movement-period]':controls.period,'[data-movement-benchmark]':controls.benchmark}[s])};
 const document={querySelector:s=>s==='#movementDialogHost'?host:null,addEventListener(){}};
 const U={escape:x=>String(x??'').replace(/</g,'&lt;'),sourceHTML:()=>'',bind(){},modal(){},load:async(t,o)=>{calls.push({t,...o});return {...d,identity:{...d.identity,ticker:t}}}};
 const window={RecoveryMovement:M,RecoveryInformation:F,RecoveryFabric:U,RecoveryHistory:{current:new Map()},RecoveryRequests:{json:async()=>({releases:[]})},addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('movement-ui.js','utf8'),{window,document,renderResearchReader(){},console,Intl,Date,Map,WeakMap,Set,Promise});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 window.RecoveryMovementUI.open('AMD');await settle();assert.match(result.innerHTML,/Overall stock assessment/);
 controls.period.onchange({target:{value:'week'}});assert.equal(result.innerHTML,'');await settle();assert.match(result.innerHTML,/Last verified 7-day interval/);const week=result.innerHTML;
 controls.period.onchange({target:{value:'month'}});assert.equal(result.innerHTML,'');await settle();assert.match(result.innerHTML,/Last verified 30-day interval/);assert.notEqual(result.innerHTML,week);
 const count=calls.length;await controls.refresh.onclick();assert.ok(calls.length>count);assert.ok(calls.slice(count).every(x=>x.refresh));assert.equal(controls.refresh.disabled,false);
});
