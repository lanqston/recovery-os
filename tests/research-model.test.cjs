const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),context={window:{},URL,Intl,console};
vm.createContext(context);
for(const file of ['research-model.js','research-chart.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const m=context.window.RecoveryResearch,ind=context.window.RecoveryIndicators;
const tracker=JSON.parse(fs.readFileSync(path.join(root,'data/recovery-os.json'))),before=JSON.stringify(tracker);
const files=fs.readdirSync(path.join(root,'data/research')).filter(f=>f.endsWith('.json')&&f!=='index.json');
for(const file of files){const b=JSON.parse(fs.readFileSync(path.join(root,'data/research',file))),tr=tracker.stocks.find(x=>x.ticker===b.profile.ticker),a=m.analyze(b,tr);assert(a.lead.length);assert(!JSON.stringify(a).includes('NaN'));assert(a.sources.every(s=>/^https?:/.test(s.url)));assert.equal(a.tech?.bars.length,b.bars.length);assert(a.fin.rows.every(r=>r.freeCashFlow==null));}
assert.equal(JSON.stringify(tracker),before,'Research must not mutate canonical tracker records');
const empty=m.analyze({profile:{ticker:'UNKNOWN'},bars:[],financials:{quarterly:[]}},null);
assert.equal(empty.hasEvidence,false);assert.equal(empty.tech,null);assert.equal(empty.fin.yoy,null);
assert.equal(m.safeURL('javascript:alert(1)'),null);assert.equal(m.safeURL('https://user:secret@example.com'),null);
const sample={financials:{quarterly:[{period:'Q2 FY2026',fiscalPeriod:'Q2',fiscalYear:2026,currency:'USD',revenue:120,endDate:'2026-06-30',startDate:'2026-04-01'},{period:'Q2 FY2025',fiscalPeriod:'Q2',fiscalYear:2025,currency:'USD',revenue:100,endDate:'2025-06-30',startDate:'2025-04-01'}]}};
assert(Math.abs(m.financials(sample).yoy-20)<1e-8);
sample.financials.quarterly[1].currency='EUR';assert.equal(m.financials(sample).yoy,null,'Do not compare different currencies');
const flat=Array(40).fill(100);assert.equal(ind.rsi(flat).at(-1),50,'Flat prices have neutral RSI');
assert(ind.macd(flat).signal.slice(0,33).every(x=>x==null),'MACD signal needs nine valid MACD samples');
const bars=Array.from({length:40},(_,i)=>({date:`2026-08-${String(i+1).padStart(2,'0')}`,open:100+i,high:102+i,low:99+i,close:101+i,volume:i===39?200:100}));
assert.equal(m.technical(bars).relativeVolume,2,'Relative volume excludes the current bar');
assert.equal(ind.atr(bars).at(-1),3,'ATR uses Wilder smoothing');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(x=>x[1].split('?')[0]);
for(const file of scripts)new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
new vm.Script(scripts.map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n'),'combined.js');
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){const href=match[1].split('?')[0];if(!/^https?:/.test(href))assert(fs.existsSync(path.join(root,href)),`Missing ${href}`)}
console.log(`PASS: ${files.length} research snapshots; null handling; source URLs; matching-period growth; RSI, ATR, MACD and volume; tracker immutability; script/asset integrity.`);
