/* Research is derived only from the loaded evidence. No fabricated prices or qualification. */
(()=>{
  'use strict';
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const num=(v,d=1)=>finite(v)?v.toLocaleString('en-US',{maximumFractionDigits:d}):'Not available';
  const money=(v,compact=false)=>finite(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:compact?'compact':'standard',maximumFractionDigits:2}).format(v):'Not available';
  const pct=v=>finite(v)?`${v>0?'+':''}${v.toFixed(1)}%`:'Not available';
  const url=v=>{try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}};
  const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
  const duration=r=>(Date.parse(r.endDate)-Date.parse(r.startDate))/86400000;
  function technical(bars){
    const b=(bars||[]).filter(x=>['open','high','low','close'].every(k=>finite(x[k]))).slice().sort((x,y)=>String(x.date).localeCompare(String(y.date)));
    if(!b.length)return null;
    const latest=b.at(-1),prior=b.slice(-21,-1),sample=b.slice(-20),closes=b.map(x=>x.close);
    const avgVolume=mean(prior.map(x=>x.volume).filter(finite));
    let atr=null;
    const tr=b.map((x,i)=>i?Math.max(x.high-x.low,Math.abs(x.high-b[i-1].close),Math.abs(x.low-b[i-1].close)):x.high-x.low);
    if(tr.length>=14){atr=mean(tr.slice(0,14));for(let i=14;i<tr.length;i++)atr=(atr*13+tr[i])/14}
    const sma20=closes.length>=20?mean(closes.slice(-20)):null;
    const sma50=closes.length>=50?mean(closes.slice(-50)):null;
    return {bars:b,latest,sma20,sma50,atr,support:Math.min(...sample.map(x=>x.low)),resistance:Math.max(...sample.map(x=>x.high)),sample:sample.length,averageVolume:avgVolume,relativeVolume:avgVolume>0&&finite(latest.volume)?latest.volume/avgVolume:null,trend:sma20==null?'Insufficient bars':latest.close>sma20?'Above its 20-day average':latest.close<sma20?'Below its 20-day average':'At its 20-day average',fromSampleHigh:(latest.close/Math.max(...b.map(x=>x.high))-1)*100};
  }
  function financials(bundle){
    const rows=(bundle.financials?.quarterly||[]).slice().sort((a,b)=>String(b.endDate).localeCompare(String(a.endDate)));
    const latest=rows[0]||null;
    if(!latest)return {rows,latest:null,yoy:null,priorYear:null};
    const period=latest.fiscalPeriod||latest.period?.match(/Q[1-4]/)?.[0];
    const fy=latest.fiscalYear||Number(latest.period?.match(/FY(\d{4})/)?.[1]);
    const priorYear=rows.find(x=>(x.fiscalPeriod||x.period?.match(/Q[1-4]/)?.[0])===period&&(x.fiscalYear||Number(x.period?.match(/FY(\d{4})/)?.[1]))===fy-1&&x.currency===latest.currency&&(!Number.isFinite(duration(x))||!Number.isFinite(duration(latest))||Math.abs(duration(x)-duration(latest))<=15));
    const yoy=priorYear?.revenue>0&&finite(latest.revenue)?(latest.revenue/priorYear.revenue-1)*100:null;
    return {rows,latest,priorYear,yoy};
  }
  function sources(b,tr){
    const items=[],seen=new Set();
    const add=x=>{const u=url(x.url);if(!u||seen.has(u))return;seen.add(u);items.push({...x,url:u,id:'S'+(items.length+1)})};
    (tr?.evidence||[]).forEach(e=>add({type:e.sourceType==='OFFICIAL'?'Official':'News',title:e.title,url:e.url,date:null,publisher:e.sourceType==='OFFICIAL'?'Company / official source':'Source in tracker',context:e.claim||'Evidence attached to the saved recovery thesis.'}));
    [...(b.financials?.quarterly||[]),...(b.financials?.annual||[])].forEach(f=>add({type:'Official',title:`${f.period} financial filing`,url:f.source,date:f.filingDate,publisher:'SEC EDGAR',context:`Fiscal period ended ${f.endDate||'date unavailable'}. Figures are normalized from the filing; margins are calculated.`}));
    if(b.profile?.homepage)add({type:'Official',title:b.profile.name+' company website',url:b.profile.homepage,date:null,publisher:'Company website',context:'Business information and access to investor relations. This is a source directory entry, not a newly verified event.'});
    if(b.profile?.cik)add({type:'Official',title:'SEC filing history',url:`https://www.sec.gov/edgar/browse/?CIK=${encodeURIComponent(b.profile.cik)}&owner=exclude`,date:null,publisher:'SEC EDGAR',context:'Browse quarterly, annual, current-event and ownership filings.'});
    if(b.bars?.length)add({type:'Market data',title:'Historical daily price data',url:'https://massive.com/docs/rest/stocks/aggregates/custom-bars',date:b.bars.at(-1)?.date,publisher:'Massive',context:`${b.bars.length} saved daily bars, ${b.bars[0]?.date} through ${b.bars.at(-1)?.date}. This link documents the provider; the dated snapshot powers the local chart.`});
    (b.news||[]).forEach(n=>add({type:n.sourceType==='OFFICIAL'?'Official':'News',title:n.title,url:n.url,date:n.published,publisher:n.publisher||'Publisher not supplied',context:n.why||'Read the original report and verify claims before changing the thesis.',tickers:n.tickers||[],topics:n.topics||[],eventDate:n.eventDate||null}));
    return items;
  }
  function analyze(b,tr){
    const t=b.profile?.ticker||'',fund=b.profile?.typeCode==='ETF'||/ETF/i.test(b.profile?.securityType||''),tech=technical(b.bars),fin=financials(b),q=b.quote||{},f=fin.latest,refs=sources(b,tr);
    const lead=[];
    if(tr){
      lead.push(`${t} is marked ${tr.status} in the saved recovery thesis. ${tr.crisis?.summary||''} The proposed recovery depends on ${String(tr.catalyst?.summary||'further verified progress').replace(/\.$/,'')}.`);
      lead.push(`${tr.entryEligible==='YES'?'The saved tracker marks entry eligible.':'The saved tracker does not confirm an entry.'} ${tr.blocker||''} ${tr.setup?.invalidation!=null?`The saved technical invalidation is ${money(tr.setup.invalidation)}; ${String(tr.setup.invalidationBasis||'a break would require reviewing the thesis').replace(/\.$/,'')}.`:''}`);
    }else if(fund){
      lead.push(`${t} is an exchange-traded fund. Its research starts with the index or mandate, holdings, concentration, fees and trading liquidity. Corporate revenue and earnings are not fund-level operating results.`);
    }else if(f){
      lead.push(`${b.profile.name||t} reported ${money(f.revenue,true)} in revenue and ${money(f.netIncome,true)} in net income for ${f.period}, ended ${f.endDate}.${fin.yoy!=null?` Revenue ${fin.yoy>=0?'grew':'fell'} ${Math.abs(fin.yoy).toFixed(1)}% against the matching prior-year quarter.`:' A compatible prior-year quarter is not loaded, so year-over-year growth is not inferred.'}`);
      lead.push(`${finite(f.operatingMarginPct)?`The calculated operating margin was ${f.operatingMarginPct.toFixed(1)}%. `:''}${finite(f.operatingCashFlow)?`Reported operating cash flow was ${money(f.operatingCashFlow,true)} for this period. `:''}These figures establish operating performance; the investment case still needs the latest guidance, valuation, competitive position and risks from the original filing.`);
    }else{
      lead.push(`A full company brief for ${t} is not available in the loaded snapshot. Use the source workspace to investigate the business, filings and market context. A valid ticker format alone does not verify a listing.`);
    }
    if(tech)lead.push(`In the ${tech.latest.date} price snapshot, ${t} closed at ${money(tech.latest.close)} and was ${tech.trend.toLowerCase()}.${finite(tech.relativeVolume)?` Volume was ${tech.relativeVolume.toFixed(2)}× the average of the preceding ${Math.min(20,tech.bars.length-1)} sessions.`:''} The most recent ${tech.sample}-bar range was ${money(tech.support)}–${money(tech.resistance)}. Those are observed levels, not a forecast or an entry trigger.`);
    const headline=tr?(tr.entryEligible==='YES'?'A confirmed setup in the saved thesis':'The thesis is developing. Confirmation still matters.'):fund?'Follow the fund through its underlying exposures.':f?(fin.yoy==null?'Separate the business results from the price narrative.':fin.yoy>=0?'Growth is visible. Test the durability behind it.':'Revenue is under pressure. Look for evidence of a turn.'):'Start with the evidence. Build the thesis from there.';
    const questions=tr?[['Is the original problem improving?',tr.crisis?.state||'No saved crisis-state assessment.','catalysts'],['What is still missing?',tr.blocker||'No entry blocker has been recorded.','risks'],['What would change the view?',tr.setup?.fundamentalInvalidation||'Recheck company guidance, liquidity and the original crisis evidence.','risks']]:fund?[['What am I exposed to?','Inspect the mandate, largest holdings and sector concentration before treating this fund as a proxy for a theme.','financials'],['How does it trade?','Compare spreads, volume, tracking behavior and the relevant benchmark.','price'],['What could change the outcome?','Check concentration, index changes, fees and distribution policy at the issuer.','sources']]:[['Are results improving?',fin.yoy==null?'A matching year-ago quarter is needed to establish revenue growth.':`Matching-quarter revenue growth is ${pct(fin.yoy)}. Check whether margins and cash generation support the change.`,'financials'],['Does price confirm the story?',tech?`${tech.trend}. Check subsequent closes and relative strength before treating a bounce as confirmation.`:'No verified bars are loaded. Open the market workspace to inspect price and volume.','price'],['What could break the thesis?','Test demand, margin pressure, liquidity, dilution and the assumptions in management guidance.','risks']];
    const scenarios=tr?[
      {name:'Strengthening',tone:'positive',text:`${tr.catalyst?.summary||'The catalyst advances.'} Then verify ${tr.blocker?tr.blocker.toLowerCase():'the remaining setup requirements'}`,note:'Conditional path · not confirmed by this brief'},
      {name:'Still waiting',tone:'neutral',text:`The crisis state remains ${String(tr.crisis?.state||'unresolved').toLowerCase()}. Until the entry checks are met, the saved thesis remains a watch rather than a new signal.`,note:'Use the current tracker review date'},
      {name:'Deteriorating',tone:'negative',text:`${tr.setup?.fundamentalInvalidation||'The original recovery assumptions fail.'}${tr.setup?.invalidation!=null?` A break of the saved ${money(tr.setup.invalidation)} invalidation also requires a review.`:''}`,note:'Reassess the evidence and the saved setup'}
    ]:[
      {name:'Strengthening',tone:'positive',text:fund?'Holdings and the benchmark support the intended exposure, with acceptable liquidity and tracking.':'Operating progress persists, cash supports reported profit, and price confirms improving demand.',note:'Research conditions · no assigned probability'},
      {name:'Still waiting',tone:'neutral',text:fund?'The fund still matches the mandate, but the expected market move has not developed.':'Results or price remain mixed. More source evidence is needed before upgrading the thesis.',note:'A lack of confirmation is useful information'},
      {name:'Deteriorating',tone:'negative',text:fund?'Concentration, tracking, liquidity or the underlying market moves against the intended exposure.':'Demand, margins or liquidity weaken, or the price structure breaks while the business case deteriorates.',note:'Test this path against the latest filing'}
    ];
    return {ticker:t,fund,tech,fin,headline,lead,questions,scenarios,sources:refs,hasEvidence:!!(tr||f||tech||b.news?.length),quote:q};
  }
  window.RecoveryResearch={analyze,technical,financials,sources,finite,num,money,pct,safeURL:url};
})();
