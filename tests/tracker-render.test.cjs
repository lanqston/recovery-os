const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('tracker renders and binds every row without aborting the site-wide refresh',()=>{
 const src=fs.readFileSync('app.js','utf8');const fn=src.slice(src.indexOf('function renderTracker(){'),src.indexOf('\nfunction renderResearch'));
 const state=JSON.parse(fs.readFileSync('data/recovery-os.json')),before=JSON.stringify(state),host={innerHTML:''},rows=state.stocks.map(x=>({dataset:{ticker:x.ticker}})),opened=[];
 const context={STATE:state,$:s=>s==='#trackerRows'?host:rows[0],$$:s=>s==='#trackerRows tr'?rows:[],latestQuote:x=>({price:x.latestPrice}),money:String,pct:String,safe:String,latestSinceAdded:()=>0,quoteLabel:()=>'',openRoom:t=>opened.push(t)};
 vm.runInNewContext(fn+';renderTracker();',context);assert.match(host.innerHTML,/<tr/);assert.ok(rows.every(x=>typeof x.onclick==='function'));rows.forEach(x=>x.onclick());assert.deepEqual(opened,state.stocks.map(x=>x.ticker));assert.equal(JSON.stringify(state),before);
});
