/* Evidence-only watchlist calculations, shared with regression tests. */
(function(root,factory){const api=factory();root.WatchlistModel=api;if(typeof module==='object'&&module.exports)module.exports=api})(globalThis,()=>{
const DAY=86400000,finite=Number.isFinite,time=v=>Date.parse(v)||0;
function activity(d,changes=[],now=Date.now()){
 const recent=v=>time(v)>now-7*DAY&&time(v)<=now;
 const events=[...new Map((d.events||[]).filter(e=>recent(e.publishedAt)&&e.evidence?.some(s=>/^https?:/.test(s.url||''))).map(e=>[e.id||e.title,e])).values()];
 const weights={Critical:4,High:3,Medium:2,Informational:1};
 const revisions=changes.filter(c=>c.ticker===d.identity.ticker&&recent(c.detectedAt)&&c.before!=null&&c.evidence?.some(s=>/^https?:/.test(s.url||'')));
 const score=events.reduce((n,e)=>n+(/10-K|10-Q|8-K/.test(e.title)?3:e.category==='financials'?3:1),0)+revisions.reduce((n,c)=>n+(weights[c.materiality]||1),0);
 return {score,count:events.length+revisions.length,newest:Math.max(0,...(d.events||[]).map(e=>time(e.publishedAt))),events,revisions};
}
function risks(d,now=Date.now()){
 const categories=[['Earnings',/earnings|financial results|quarter.{0,12}results/i],['Debt & liquidity',/debt|liquidity|default|covenant|going concern|bankrupt/i],['Dilution',/dilut|share offering|equity offering|at-the-market|convertible notes/i],['Legal & regulatory',/lawsuit|litigation|investigation|settlement|regulatory action|recall/i],['Guidance',/guidance|outlook|forecast/i],['Macro exposure',/tariff|interest rate|inflation|currency|foreign exchange|supply chain|geopolitic/i]];
 const rows=[];
 for(const e of d.events||[]){const published=time(e.publishedAt);if(!published||published>now||published<now-180*DAY)continue;const source=e.evidence?.find(s=>/^https?:/.test(s.url||''));if(!source)continue;const cat=categories.find(([,re])=>re.test(e.title));if(cat)rows.push({category:cat[0],title:e.title,date:e.publishedAt,url:source.url,provider:source.provider,ticker:d.identity.ticker,note:'Source mentions this topic; review the report for its impact.'});}
 const catalyst=d.tracker?.catalyst;const url=d.tracker?.evidence?.find(e=>/^https?:/.test(e.url||''))?.url;
 if(catalyst?.nextDate&&time(catalyst.nextDate)>=now&&url)rows.push({category:'Upcoming event',title:catalyst.summary||'Saved company event',date:catalyst.nextDate,url,ticker:d.identity.ticker,note:'Date from the saved assessment. Confirm with the issuer.'});
 return [...new Map(rows.map(r=>[r.url+'|'+r.category,r])).values()].sort((a,b)=>time(b.date)-time(a.date));
}
function range(b,now=Date.now()){
 const q=b.quote||{},at=time(q.asOf||q.timestamp);if(!finite(q.price)||!at)return null;
 const from=at-364*DAY;const all=[...new Map((b.bars||[]).filter(r=>finite(r.low)&&finite(r.high)&&time(r.date)<=at).map(r=>[r.date,r])).values()].sort((a,b)=>time(a.date)-time(b.date));
 const rows=all.filter(r=>time(r.date)>=from);if(rows.length<200||!all.some(r=>time(r.date)<=from+5*DAY)||at-time(rows.at(-1)?.date)>5*DAY)return null;
 const low=Math.min(...rows.map(r=>r.low)),high=Math.max(...rows.map(r=>r.high));if(high<=low)return null;
 return{low,high,price:q.price,position:Math.max(0,Math.min(100,(q.price-low)/(high-low)*100)),asOf:q.asOf||q.timestamp,from:rows[0].date,to:rows.at(-1).date,outside:q.price<low||q.price>high};
}
function profitability(b){const quarterly=b.financials?.quarterly||[],annual=b.financials?.annual||[];const rows=quarterly.length?quarterly:annual;const latest=rows.slice().sort((a,b)=>time(b.endDate)-time(a.endDate))[0];if(!latest||!finite(latest.netIncome)||!latest.endDate)return null;return{label:latest.netIncome>0?'Profitable':latest.netIncome<0?'Currently unprofitable':'Break-even',period:latest.period||latest.endDate,end:latest.endDate,url:latest.provenance?.netIncome?.source||latest.source,value:latest.netIncome};}
function sort(rows,key){return rows.slice().sort((a,b)=>{const val=r=>key==='changed'?r.activity.score:key==='event'?r.activity.newest:key==='progress'?r.d.tracker?.progress:key==='volume'?r.d.metrics?.volume?.value:r.d.metrics?.dailyChange?.value;const av=val(a),bv=val(b);return (finite(bv)?bv:-Infinity)-(finite(av)?av:-Infinity)||a.ticker.localeCompare(b.ticker)})}
return{activity,risks,range,profitability,sort};
});
