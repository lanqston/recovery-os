const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const c={window:{},document:{readyState:'loading',addEventListener(){}},URL,Intl,console,setTimeout,clearTimeout,AbortSignal,CustomEvent:class{},SYMBOLS:[]};
vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(root,'research-model.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(root,'free-hybrid.js'),'utf8'),c);
c.esc=x=>String(x??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
c.fmtMoney=(v,compact)=>v==null?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:compact?'compact':'standard'}).format(v);
c.fmtNum=(v,d=0)=>v==null?'Unavailable':Number(v).toLocaleString('en-US',{maximumFractionDigits:d});c.fmtPct=(v,d=1)=>v==null?'Unavailable':Number(v).toFixed(d)+'%';c.ago=v=>v;
c.loadSeed=async()=>{};c.window.dispatchEvent=()=>{};
const old={profile:{ticker:'AAPL',name:'Apple Inc.'},bars:[],financials:{quarterly:[]},news:[],meta:{}};
c.researchBundle=async()=>JSON.parse(JSON.stringify(old));
const requests=[];
c.fetch=async url=>{requests.push(url);if(url.startsWith('https:'))throw new Error('Provider unavailable');return {ok:true,json:async()=>read(url)}};
vm.runInContext(fs.readFileSync(path.join(root,'research-evidence.js'),'utf8'),c);
const model=c.window.RecoveryResearch,tracker=read('data/recovery-os.json'),before=JSON.stringify(tracker),index=read('data/open-research/index.json');
for(const item of index.symbols){
 const b=read('data/open-research/'+item.ticker+'.json'),a=model.analyze(b,tracker.stocks.find(x=>x.ticker===item.ticker));
 assert(Array.isArray(b.bars));if(!b.bars.length)assert(b.health.some(h=>h.provider==='Yahoo daily history'&&h.status==='unavailable'),'An uncollected history needs an explicit source status');if(b.bars.length)assert.equal(a.tech.bars.length,b.bars.length);else assert.equal(a.tech,null,'Indicators must stay unavailable without price history');
 for(let i=0;i<b.bars.length;i++){const x=b.bars[i];assert(x.high>=Math.max(x.open,x.close));assert(x.low<=Math.min(x.open,x.close));if(i)assert(x.date>b.bars[i-1].date)}
 for(const r of [...(b.financials?.quarterly||[]),...(b.financials?.annual||[])]){
   assert.equal(r.currency,'USD');assert(!r.dilutedShares||r.dilutedShares>0);
   if(r.freeCashFlow!=null){assert.equal(r.freeCashFlow,r.operatingCashFlow-r.capitalExpenditure);assert.equal(r.provenance.operatingCashFlow.end,r.provenance.capitalExpenditure.end);assert.equal(r.provenance.operatingCashFlow.start,r.provenance.capitalExpenditure.start)}
 }
 const text=c.evidenceChapters(b,a,null);assert(!/NaN|undefined|Infinity/.test(text),item.ticker+' has invalid narrative output');
 assert(a.sources.every(x=>model.safeURL(x.url)));assert(b.filings.every(x=>model.safeURL(x.url)));
 if(a.fund)assert.equal(a.fin.rows.length,0,'Fund investment results must not be presented as corporate operating statements');
 else if(b.financials?.quarterly?.length)assert(b.financials.quarterly[0].endDate>'2025-09-01',item.ticker+' unexpectedly uses old financial concepts');
}
assert.equal(JSON.stringify(tracker),before);
(async()=>{
 await c.loadSeed();const b=await c.researchBundle('AAPL',{refresh:true});
 assert.equal(b.profile.name,'Apple Inc.');assert.equal(b.financials.quarterly.length,9);assert.equal(b.bars.length,420);assert(b.financials.cashFlowPeriod.freeCashFlow>0);
 assert(requests.some(x=>x.startsWith('https:'))&&requests.some(x=>x==='data/open-research/AAPL.json'),'A blocked fresh source must fall back to the local snapshot');
 const count=requests.length;await c.researchBundle('AAPL');assert.equal(requests.length,count,'Repeated navigation should reuse the stock bundle');
 await c.researchBundle('AAPL',{refresh:true});assert(requests.length>count,'Refresh must refetch evidence');
 console.log(`PASS: ${index.symbols.length} public records; OHLC integrity; financial scope; source URLs; complete narratives; provider fallback; bundle caching and refresh; canonical tracker unchanged.`);
})().catch(e=>{console.error(e);process.exitCode=1});
