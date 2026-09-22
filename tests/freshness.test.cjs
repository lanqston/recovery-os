const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../data-freshness.js'),F=require('../information-model.js');
test('a newly downloaded older quote cannot replace a later market observation',()=>{
  const old={quote:{price:5,timestamp:'2026-09-11 daily close'},priceSource:{retrievedAt:'2026-09-22T23:00:00Z'}},fresh={quote:{price:7,timestamp:'2026-09-22T20:00:00Z'}};
  assert(D.quoteStamp(fresh)>D.quoteStamp(old));assert.equal(D.effective(old),'2026-09-11 daily close');
  const context={window:{RecoveryFreshness:D},MODEL:{finite:Number.isFinite},loadSeed(){},researchBundle(){},renderResearchReader(){}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('market-atlas.js','utf8'),context);
  assert.equal(context.newestPriceBundle(fresh,old).quote.price,7);
  assert.equal(typeof context.quoteStamp,'undefined','atlas must not overwrite the tracker date helper');
});
test('quotes, chart statistics, and historical replay retain separate dates and sources',()=>{
  const bars=Array.from({length:55},(_,i)=>({date:new Date(Date.UTC(2026,6,i+1)).toISOString().slice(0,10),open:9,high:11,low:8,close:10,volume:20}));
  const b={profile:{ticker:'TEST'},quote:{price:14,timestamp:'2026-09-22T20:00:00Z',dataState:'DATED MARKET SNAPSHOT',currency:'USD'},priceSource:{publisher:'Quotes',url:'https://example.com/quotes',date:'2026-09-22T20:00:00Z',retrievedAt:'2026-09-22T21:00:00Z'},barSource:{publisher:'History',url:'https://example.com/history',retrievedAt:'2026-08-27T21:00:00Z'},bars};
  const d=F.normalize(b);assert.equal(d.metrics.price.value,14);assert(d.metrics.price.source.effectiveAt.startsWith('2026-09-22'));
  assert.equal(d.metrics.volume.source.effectiveAt,F.dayEnd(bars.at(-1).date));assert.equal(d.metrics.sma50.source.inputs[0].source,'https://example.com/history');
  const past=F.replay(d,'2026-08-25');assert.equal(past.metrics.price.value,10);assert.equal(past.metrics.price.source.url,'https://example.com/history');
});
