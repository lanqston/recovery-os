/* Evidence-led movement explanations. Pure calculations; never writes the tracker. */
(function(root,factory){const F=typeof module==='object'&&module.exports?require('./information-model.js'):root.RecoveryInformation;const api=factory(F);root.RecoveryMovement=api;if(typeof module==='object'&&module.exports)module.exports=api})(typeof window==='object'?window:globalThis,F=>{
'use strict';
const DAY=F.DAY, PERIODS={today:'Today',week:'Past week',month:'Past month'};
const SECTORS={'Technology':'XLK','Information Technology':'XLK','Financial Services':'XLF','Financials':'XLF','Healthcare':'XLV','Health Care':'XLV','Energy':'XLE','Utilities':'XLU','Real Estate':'XLRE','Basic Materials':'XLB','Materials':'XLB','Industrials':'XLI','Consumer Cyclical':'XLY','Consumer Discretionary':'XLY','Consumer Defensive':'XLP','Consumer Staples':'XLP','Communication Services':'XLC'};
const etDay=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
function windowFor(period='today',cutoff=new Date().toISOString()){
 const end=F.date(cutoff);if(!end)throw Error('A valid dated cutoff is required');if(!PERIODS[period])throw Error('Unknown movement period');
 const endMs=Date.parse(end),day=etDay(endMs-1);
 // Start of the New York calendar date; DST-safe via the preceding date's dayEnd.
 const previous=new Date(Date.parse(day+'T12:00:00Z')-DAY).toISOString().slice(0,10);
 const start=period==='today'?F.dayEnd(previous):new Date(endMs-(period==='week'?7:30)*DAY).toISOString();
 return {period,label:PERIODS[period],start,end,day,days:period==='today'?1:period==='week'?7:30};
}
function eligible(e,w,mode){return !!e.publishedAt&&e.publishedAt>=w.start&&e.publishedAt<=w.end&&(mode!=='observed'||!!e.detectedAt&&e.detectedAt<=w.end)}
function series(d,w,mode){return (d.bars||[]).filter(b=>F.finite(b.close)&&b.close>0&&F.dayEnd(b.date)<=w.end&&(mode!=='observed'||!!(b.observedAt||d.priceMeta?.retrievedAt)&&F.date(b.observedAt||d.priceMeta.retrievedAt)<=w.end)).sort((a,b)=>a.date.localeCompare(b.date));}
function priceMove(d,w,mode='public',historical=false){
 const bars=series(d,w,mode),latest=bars.at(-1),q=d.metrics?.price,delta=d.metrics?.dailyChange;
 const qAt=q?.source?.effectiveAt,validQuote=q?.value>0&&qAt&&qAt<=w.end&&(!historical||mode!=='observed'||!!q.source.retrievedAt&&q.source.retrievedAt<=w.end);
 const source=q?.source||d.priceMeta||{},result={pct:null,from:null,to:null,price:validQuote?q.value:null,quoteAt:validQuote?qAt:null,source,method:null,points:bars.filter(b=>F.dayEnd(b.date)>=w.start).map(b=>({at:F.dayEnd(b.date),date:b.date,price:b.close,kind:'daily close',source:d.priceMeta})),reason:'No compatible price observations cover this period.'};
 // Report the provider's session percentage, without inventing its reference close or session.
 if(w.period==='today'&&validQuote&&etDay(qAt)===w.day&&F.finite(delta?.value)&&delta.source.effectiveAt===qAt&&F.safeURL(delta.source.url)){
  return {...result,pct:delta.value,to:qAt,source:delta.source,method:'Provider-reported daily change',basis:'reported',reason:'The provider did not supply the reference close time or session. This is a dated daily-change snapshot, not a measured start-to-now return.'};
 }
 const startMs=Date.parse(w.start),before=bars.filter(b=>Date.parse(F.dayEnd(b.date))<=startMs).at(-1);
 const fresh=latest&&Date.parse(w.end)-Date.parse(F.dayEnd(latest.date))<=4*DAY;
 const endInPeriod=latest&&F.dayEnd(latest.date)>=w.start;
 if(before&&latest&&before.date!==latest.date&&fresh&&endInPeriod&&startMs-Date.parse(F.dayEnd(before.date))<=4*DAY&&F.safeURL(d.priceMeta?.url)){
  return {...result,pct:(latest.close/before.close-1)*100,from:F.dayEnd(before.date),to:F.dayEnd(latest.date),price:latest.close,source:d.priceMeta,method:'(Last adjusted close ÷ baseline adjusted close − 1) × 100',basis:'closes',reason:'Close-to-close return, using the last available trading close at each boundary. Daily timestamps represent conservative end-of-day availability in New York; intraday timing and original adjustment vintages are unavailable.',baselinePrice:before.close,points:[{at:F.dayEnd(before.date),date:before.date,price:before.close,kind:'baseline close',source:d.priceMeta},...result.points]};
 }
 result.reason=latest?`Price history ends ${latest.date}; compatible start and end observations for ${w.label.toLowerCase()} are unavailable. A current quote cannot reconstruct the missing history.`:'No dated price history is connected for this security.';
 return result;
}
function canonicalURL(url){const safe=F.safeURL(url);if(!safe)return null;const u=new URL(safe);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/.test(k))u.searchParams.delete(k);return u.href.replace(/\/$/,'')}
function dedupe(events){const seen=new Set();return events.filter(e=>{const url=canonicalURL(e.evidence?.[0]?.url);if(!url)return false;const key=url+'|'+(e.category==='financials'?e.payload?.period||'':'');if(seen.has(key))return false;seen.add(key);return true})}
function mechanism(e){
 const t=e.title.toLowerCase();let kind='Company update',text='This announcement may change expectations about the business. The headline alone does not establish a financial impact.';
 if(/guidance|outlook|forecast/.test(t)){kind='Guidance';text='Changes in management’s outlook can change expected revenue or profit and the valuation investors are willing to pay.'}
 else if(/earnings|results|quarter|profit|revenue/.test(t)||e.category==='financials'){kind='Earnings';text='Reported sales, margins and earnings can change profit expectations. A beat or miss cannot be established without a comparable, dated consensus estimate.'}
 else if(/upgrade|downgrade|price target|analyst|rating/.test(t)){kind='Analyst change';text='A rating or target revision can influence investor expectations and positioning. It is an analyst opinion, not a change in reported company results.'}
 else if(/recall|lawsuit|investigat|fine\b|litigation/.test(t)){kind='Legal or operational risk';text='Legal costs, disrupted sales or regulatory restrictions could affect cash flow. The scale and outcome require the original disclosure.'}
 else if(/acquir|merger|takeover/.test(t)){kind='Transaction';text='A transaction can change expected growth, financing needs and dilution. Its effect depends on the terms and execution risk.'}
 else if(/buyback|repurchase|dividend/.test(t)){kind='Capital return';text='Capital returns can change cash available to shareholders and the share count. They do not by themselves establish improved operating performance.'}
 else if(/launch|introduc|showcase|unveil|available|product|partnership|agreement|contract/.test(t)){kind='Product or commercial announcement';text='New products or commercial agreements can change expectations for demand, revenue and costs. The headline does not quantify incremental sales or profit.'}
 else if(e.category==='macro'){kind='Economic context';text=/inflation|cpi|ppi|price index/.test(t)?'Inflation can affect input costs, customer spending and expectations for interest rates. This release alone does not establish the stock’s reaction.':/employment|payroll|jobs/.test(t)?'Labor data can affect demand expectations and interest-rate pricing. The company’s sensitivity and the market reaction need separate evidence.':'Interest-rate and monetary-policy news can affect financing costs and discount rates used to value future cash flows. Direction depends on the actual decision and prior expectations.'}
 else if(e.category==='filings'){kind='SEC filing';text='A filing makes disclosures available to investors. Its form or title alone does not establish a bullish or bearish surprise; inspect the linked filing.'}
 const positive=/(raises?|raised|increases?|boosts?)\b.{0,45}\b(guidance|outlook|forecast|dividend)|\b(upgraded|upgrade|record revenue|profit rises|earnings beat)\b/.test(t);
 const negative=/(cuts?|lowers?|reduced)\b.{0,45}\b(guidance|outlook|forecast|dividend)|\b(downgraded|downgrade|earnings miss|profit falls|recall)\b/.test(t);
 const reported=['PRIMARY_NEWS','SECONDARY_NEWS'].includes(e.sourceType)&&/\b(shares?|stock)\b.{0,45}\b(rise|rises|rose|rally|rallies|jump|jumps|fall|falls|fell|drop|drops|slump|slumps)\b.{0,40}\b(after|because|amid|on|as)\b/.test(t);
 return {kind,mechanism:text,direction:positive&&negative?'Mixed':positive?'Bullish factor':negative?'Bearish factor':'Direction unconfirmed',label:reported?'Reported explanation':'Possible contributor',factLabel:['ISSUER','REGULATORY','GOVERNMENT'].includes(e.sourceType)?'Confirmed fact: published disclosure':'Reported information',reported};
}
function timing(e,move){
 if(e.evidence?.[0]?.timestampPrecision==='DAY')return 'Publication time is date-only; intraday sequence cannot be determined.';
 const at=e.publishedAt;
 if(move.to&&at>move.to)return 'Published after the last price observation in this view; it cannot explain that earlier observed move.';
 if(move.from&&at<=move.from)return 'Published before the measured return interval; any continuing effect is unconfirmed.';
 const before=move.points.filter(p=>p.at<at).at(-1),after=move.points.find(p=>p.at>=at);
 if(before&&after)return `Publication falls between the ${before.date} and ${after.date} daily observations. Daily bars cannot establish when the reaction began or prove causation.`;
 return move.to?'Published before the latest price observation; the onset of the move is unknown without finer price data.':'There are not enough dated price observations to establish a before/after reaction.';
}
function compare(stock,other){
 if(!other||stock.pct==null||other.pct==null)return {comparable:false,excess:null,note:'A matching-period return is unavailable; no relative-performance inference is made.'};
 if(stock.basis!=='closes'||other.basis!=='closes'||stock.from!==other.from||stock.to!==other.to||!stock.source.currency||stock.source.currency!==other.source.currency)return {comparable:false,excess:null,note:'Dates, currency or session basis are not aligned. Values are shown separately; no relative return or causal claim is calculated.'};
 return {comparable:true,excess:stock.pct-other.pct,note:'Matched close dates and currency. Relative performance is descriptive, not causal attribution.'};
}
function buildCases(events,move,w){
 const candidates=dedupe(events.filter(e=>['news','announcements','filings','financials','analysts'].includes(e.category)&&e.publishedAt<=w.end&&(!move.to||e.publishedAt<=move.to))).map(e=>({...e,...mechanism(e),scope:e.publishedAt<w.start?'Earlier context · not a new catalyst in this period':'Published in selected period'}));
 const bullish=[],bearish=[];
 for(const e of candidates){
  const base={eventId:e.id,title:e.title,publishedAt:e.publishedAt,evidence:e.evidence,scope:e.scope,label:'Conditional interpretation',confirmation:'Check subsequent reported results, guidance and price reaction before treating this as the cause.'};
  if(e.direction==='Bullish factor'||e.direction==='Mixed')bullish.push({...base,reason:e.mechanism,confirmation:'Verify the size of the improvement against prior guidance and market expectations; then check whether the move followed publication.'});
  if(e.direction==='Bearish factor'||e.direction==='Mixed')bearish.push({...base,reason:e.mechanism,confirmation:'Verify the size of the deterioration and whether it was already expected; then check the post-publication reaction.'});
  if(e.kind==='Product or commercial announcement'){
   bullish.push({...base,reason:'The announced product, demonstration or commercial initiative creates a potential route to additional demand or revenue. This is a growth case, conditional on adoption and commercial scale—not evidence of realized sales.'});
   bearish.push({...base,label:'Counter-case · execution risk, not negative news',reason:'The same announcement does not establish incremental revenue, margins or returns on spending. If adoption or profitability falls short of expectations, the optimistic case would weaken.',confirmation:'Look for order values, delivery timing, adoption and margins in later issuer disclosures.'});
  }
 }
 const rank=e=>(e.scope.startsWith('Published')?100:0)+(['REGULATORY','ISSUER'].includes(e.evidence[0]?.sourceType)?20:0)+Date.parse(e.publishedAt)/1e13;
 return {bullish:bullish.sort((a,b)=>rank(b)-rank(a)).slice(0,3),bearish:bearish.sort((a,b)=>rank(b)-rank(a)).slice(0,3)};
}
function analyze(d,{period='today',cutoff=null,now=new Date().toISOString(),mode='public',benchmarks=[],macro=[]}={}){
 const w=windowFor(period,cutoff||now),move=priceMove(d,w,mode,!!cutoff);
 const company=dedupe((d.events||[]).filter(e=>['news','announcements','filings','financials','analysts'].includes(e.category)&&eligible(e,w,mode)));
 const macroEvents=macro.filter(e=>e.category==='macro'&&eligible(e,w,mode));
 const evidence=dedupe([...company,...macroEvents]).map(e=>{const detail=mechanism(e),after=!!move.to&&e.publishedAt>move.to,primary=['ISSUER','REGULATORY','GOVERNMENT'].includes(e.sourceType),direct=e.category!=='macro';const score=(primary?30:10)+(direct?30:0)+(detail.kind!=='Company update'?10:0)+(detail.reported?10:0)-(after?50:0);return {...e,...detail,eventAt:e.payload?.eventTimeKnown?e.effectiveAt:null,timing:timing(e,move),score,strength:after?'Outside observed move':primary&&direct?'Strong disclosure evidence':'Limited attribution evidence',rankingReason:after?'Published after the price endpoint.':`${primary?'Original public disclosure':'Secondary report'}; ${direct?'company-specific':'broad economic context'}; price causation unconfirmed.`}}).sort((a,b)=>b.score-a.score||b.publishedAt.localeCompare(a.publishedAt));
 const comparisons=benchmarks.map(b=>{const m=b.dossier?priceMove(b.dossier,w,mode,!!cutoff):null;return {ticker:b.ticker,role:b.role,move:m,...compare(move,m)}});
 const aligned=comparisons.filter(c=>c.comparable),sector=aligned.find(c=>c.role==='Sector proxy'),market=aligned.find(c=>c.role==='Market benchmark');
 let context='Company-specific versus broader-market attribution is unresolved without aligned stock, sector and benchmark returns.';
 if(market&&sector){const same=Math.sign(move.pct)===Math.sign(market.move.pct)&&Math.sign(move.pct)===Math.sign(sector.move.pct);context=same?'The stock, sector proxy and benchmark moved in the same direction over matching close dates. A broader trend is consistent with the observations, but does not prove the cause.':'The stock diverged from at least one comparison over matching close dates. Company-specific factors may matter; divergence alone does not identify a catalyst.'}
 const contextWindow={...w,start:new Date(Date.parse(w.start)-30*DAY).toISOString()};
 const caseEvents=(d.events||[]).filter(e=>eligible(e,contextWindow,mode));
 const cases=buildCases(caseEvents,move,w);
 const indicative=comparisons.filter(c=>c.move?.pct!=null&&move.pct!=null&&c.move.to&&move.to&&etDay(c.move.to)===etDay(move.to)&&Math.abs(Date.parse(c.move.to)-Date.parse(move.to))<=3600000);
 if(!aligned.length&&indicative.length)context='Dated daily snapshots: '+d.identity.ticker+' '+move.pct.toFixed(2)+'%; '+indicative.map(c=>c.ticker+' '+c.move.pct.toFixed(2)+'%').join('; ')+'. '+(indicative.every(c=>Math.sign(c.move.pct)===Math.sign(move.pct))?'The snapshots point in the same direction, which is consistent with shared market or sector participation.':'The snapshots differ in direction, so the observed stock move is not uniform across these proxies.')+' These snapshots are within one hour on the same New York date; session definitions remain unverified, so no exact excess return or causal attribution is inferred.';
 const relevant=evidence.filter(e=>e.strength!=='Outside observed move'),reported=relevant.filter(e=>e.reported),strong=relevant.filter(e=>e.category!=='macro').slice(0,2);
 const summary=reported.length?'Reporting links the move to the events below. These are reported explanations, not independently confirmed causation.':strong.length?`The strongest company evidence concerns ${[...new Set(strong.map(e=>e.kind.toLowerCase()))].join(' and ')}. ${strong[0].mechanism} Available timing does not confirm that this caused the stock’s move.`:'No company-specific catalyst is established by the available evidence in this period. Broader context, when available, is shown separately.';
 const timeline=[...move.points.map(p=>({at:p.at,type:'price',title:`${p.date} · ${p.kind}`,price:p.price,source:p.source})),...evidence.map(e=>({at:e.publishedAt,type:'event',title:e.title,event:e}))];
 if(move.quoteAt&&move.quoteAt>=w.start&&move.price!=null)timeline.push({at:move.quoteAt,type:'quote',title:'Dated quote · session not verified',price:move.price,source:move.source});
 timeline.sort((a,b)=>a.at.localeCompare(b.at));
 return {ticker:d.identity.ticker,window:w,historical:!!cutoff,mode,move,evidence,comparisons,context,summary,cases,verdict:'No confirmed catalyst found',timeline,lastSourceCheck:d.health?.map(h=>F.iso(h.lastAttemptAt)).filter(Boolean).sort().at(-1)||d.sourceRetrievedAt||null,limitations:['Evidence strength ranks source authority and company relevance; it is not a probability of causation.','Headlines are research leads; full article text and a complete news archive are not available.','No verified catalyst is inferred from price direction or a same-day headline.',...(cutoff?['Only publications available by the cutoff are included. Date-only disclosures are withheld until the end of their New York publication day. Current sector labels are navigation aids; historical membership is not verified.']:[])]};
}
return {PERIODS,SECTORS,etDay,windowFor,priceMove,canonicalURL,dedupe,mechanism,compare,buildCases,analyze};
});
