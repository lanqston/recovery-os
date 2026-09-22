/* Observation time wins over retrieval time. Shared by every quote consumer. */
((root)=>{'use strict';
  function stamp(value){
    const match=String(value||'').match(/\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/);
    if(!match)return -Infinity;
    const raw=match[0],zoned=/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
    const n=Date.parse(zoned?raw.replace(' ','T'):raw.slice(0,10)+'T12:00:00Z');
    return Number.isFinite(n)?n:-Infinity;
  }
  function effective(bundle){
    const q=bundle?.quote||{},source=bundle?.priceSource||{};
    for(const v of [q.asOf,q.timestamp,source.date,bundle?.bars?.at(-1)?.date,q.collectedAt])if(Number.isFinite(stamp(v)))return v;
    return null;
  }
  function quoteStamp(bundle){return stamp(effective(bundle))}
  root.RecoveryFreshness={stamp,effective,quoteStamp};
  if(typeof module!=='undefined')module.exports=root.RecoveryFreshness;
})(typeof window==='undefined'?globalThis:window);
