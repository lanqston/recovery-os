const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const c={window:{},URL,Intl,console,loadSeed:async()=>{},researchBundle:async()=>{},renderResearchReader(){}};
vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'research-model.js'),'utf8'),c);
c.MODEL=c.window.RecoveryResearch;vm.runInContext(fs.readFileSync(path.join(root,'market-atlas.js'),'utf8'),c);
const index=read('data/market-atlas/index.json'),records={};
for(let n=0;n<64;n++){
 const shard=n.toString(16).padStart(2,'0'),data=read('data/market-atlas/shards/'+shard+'.json');
 for(const [t,b]of Object.entries(data.stocks)){assert.equal(c.atlasShard(t),shard);assert(!records[t]);assert.equal(b.profile.ticker,t);records[t]=b;}
}
assert.equal(index.counts.symbols,Object.keys(records).length);assert.equal(index.rows.length,index.counts.symbols);
assert.equal(index.counts.quotes,Object.values(records).filter(b=>Number.isFinite(b.quote?.price)).length);
assert.equal(index.counts.financials,Object.values(records).filter(b=>b.financials.quarterly.length).length);
assert(index.counts.symbols>10000);assert(index.counts.quotes>6000);assert(index.counts.financials>6000);
for(const [t,b]of Object.entries(records)){
 if(b.quote){assert(b.quote.price>0,t);assert(b.quote.timestamp);assert(c.MODEL.safeURL(b.priceSource.url));if(b.quote.source==='Nasdaq public stock screener'){assert.match(b.quote.timestamp,/Provider snapshot/);assert(b.quote.collectedAt);assert.match(b.quote.sessionNote,/does not supply an exchange timestamp/);}}
 for(const r of b.financials.quarterly){
  const days=(Date.parse(r.endDate)-Date.parse(r.startDate))/86400000;assert(days>=65&&days<=110,t);assert.equal(r.currency,'USD');assert(c.MODEL.safeURL(r.source));
  for(const href of Object.values(r.metricSources||{}))assert(c.MODEL.safeURL(href));
  for(const [key,income]of [['operatingMarginPct','operatingIncome'],['netMarginPct','netIncome']])if(r[key]!=null)assert(Math.abs(r[key]-r[income]/r.revenue*100)<1e-8,t+' mismatched margin');
 }
 const a=c.MODEL.analyze(b,null);assert(!/\bNaN\b|\bundefined\b|\bNot available\b|[$+−-]Infinity/.test(a.lead.join(' ')),t+' narrative');
 if(a.fund)assert.equal(a.fin.rows.length,0);
}
const base={startDate:'2026-04-01',endDate:'2026-06-30',currency:'USD',revenue:0,netIncome:null};
let merged=c.mergeFinancialEvidence({quarterly:[base]},{quarterly:[{...base,revenue:100,netIncome:20}]});
assert.equal(merged.quarterly[0].revenue,0,'Reported zero is preserved');assert.equal(merged.quarterly[0].netIncome,20,'Compatible missing fields can be filled');
merged=c.mergeFinancialEvidence({quarterly:[base]},{quarterly:[{...base,startDate:'2026-01-01',assets:700}]});assert.equal(merged.quarterly[0].assets,undefined,'A YTD row must not fill a quarterly row');
merged=c.mergeFinancialEvidence({quarterly:[base]},{quarterly:[{...base,currency:'CNY',netIncome:25}]});assert.equal(merged.quarterly[0].netIncome,null,'Currencies must not mix');
merged=c.mergeFinancialEvidence({quarterly:[{...base,revenue:200,source:'https://www.sec.gov/base'}]},{quarterly:[{...base,revenue:100,netIncome:20,netMarginPct:20,source:'https://www.sec.gov/extra'}]});
assert.equal(merged.quarterly[0].netMarginPct,10,'A filled field recalculates the ratio using the retained revenue');
assert.equal(merged.quarterly[0].metricSources.revenue,'https://www.sec.gov/base','Retained values retain their filing');
assert.equal(merged.quarterly[0].metricSources.netIncome,'https://www.sec.gov/extra','Filled values retain their own filing');
for(const file of ['market-world.js','market-world.css','market-atlas.js','world-renderer.js'])assert(fs.existsSync(path.join(root,file)));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(html.includes('market-world-app'));assert(html.includes('src="market-world.js?'));assert(html.indexOf('src="market-atlas.js?')<html.indexOf('src="market-world.js?'));
console.log(`PASS: ${index.counts.symbols} atlas symbols; 64 shards; ${index.counts.quotes} dated quotes; ${index.counts.financials} financial records; safe sources; meaningful narratives; exact-period/currency merges; fund separation; world asset loading.`);
