/* Broad public evidence, loaded by small ticker shards. */
let ATLAS_INDEX=[],ATLAS_META=null,ATLAS_SYMBOLS=new Map();
const ATLAS_SHARDS=new Map(),ATLAS_BUNDLES=new Map();
const ATLAS_BASE_LOAD=loadSeed,ATLAS_BASE_BUNDLE=researchBundle,ATLAS_BASE_READER=renderResearchReader;
function atlasShard(t){let h=0;for(const c of t)h=(Math.imul(h,31)+c.charCodeAt(0))>>>0;return(h%64).toString(16).padStart(2,'0')}
async function atlasFile(path,fresh=false){
  if(!/^(index|collection|shards\/[0-9a-f]{2})\.json$/.test(path))throw new Error('Invalid atlas path');
  const local='data/market-atlas/'+path,remote='https://raw.githubusercontent.com/lanqston/recovery-os/main/'+local;
  for(const url of (fresh?[remote,local]:[local,remote]))try{if(window.RecoveryRequests)return await window.RecoveryRequests.json(url,{refresh:fresh,validate:x=>path.startsWith('shards/')?!!x.stocks:path==='index.json'?Array.isArray(x.rows):!!x});const r=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(url===remote?3500:6000)});if(r.ok)return await r.json()}catch{}
  return null;
}
loadSeed=async function loadMarketAtlas(){
  const atlas=atlasFile('index.json');await ATLAS_BASE_LOAD();ATLAS_META=await atlas;
  ATLAS_INDEX=(ATLAS_META?.rows||[]).map(row=>Object.fromEntries(ATLAS_META.columns.map((key,i)=>[key,row[i]])));
  ATLAS_SYMBOLS=new Map(ATLAS_INDEX.map(x=>[x.ticker,x]));
  const all=new Map(SYMBOLS.map(x=>[x.ticker,x]));for(const x of ATLAS_INDEX){const prior=all.get(x.ticker)||{};all.set(x.ticker,{...x,...prior,sector:x.sector,marketCap:x.marketCap,price:x.price,changePct:x.changePct,financialPeriods:x.financialPeriods,name:prior.name&&prior.name!==x.ticker?prior.name:x.name,exchange:prior.exchange||x.exchange,securityType:/ETF/.test(prior.securityType||'')?'ETF':x.securityType})}SYMBOLS=[...all.values()];
  window.marketAtlasReady=true;window.dispatchEvent(new CustomEvent('market-atlas-ready'));
};
function quoteStamp(bundle){
  const values=[bundle?.quote?.collectedAt,bundle?.quote?.timestamp,bundle?.priceSource?.retrievedAt,bundle?.priceSource?.date,bundle?.retrievedAt];let best=-Infinity;
  for(const value of values){if(!value)continue;const raw=String(value),match=raw.match(/\\d{4}-\\d{2}-\\d{2}(?:[T ][0-9:.+-Z]+)?/);if(!match)continue;const normalized=match[0].length===10?match[0]+'T23:59:59Z':match[0].replace(' ','T').replace(/ET$/,'');const stamp=Date.parse(normalized);if(Number.isFinite(stamp)&&stamp>best)best=stamp}
  return best;
}
function newestPriceBundle(...bundles){const candidates=bundles.filter(x=>MODEL.finite(x?.quote?.price));if(!candidates.length)return null;if(candidates.length===1)return candidates[0];return candidates.sort((a,b)=>quoteStamp(a)-quoteStamp(b)).at(-1)}
function trackerPriceBundle(t){const tr=tracked(t);if(!MODEL.finite(tr?.latestPrice))return null;const series=tr.priceSeries||[],prior=series.length>1?series.at(-2)?.close:null,change=MODEL.finite(prior)&&prior!==0?(tr.latestPrice/prior-1)*100:null,meta=tr.marketData||{};return{quote:{price:tr.latestPrice,changePct:change,volume:meta.volume??null,timestamp:tr.quoteAsOf||meta.regularCloseDate,source:'Recovery OS canonical tracker market refresh',dataState:'TRACKER MARKET REFRESH',currency:'USD',collectedAt:meta.retrievedAt||null},priceSource:{title:'Recovery OS tracked market refresh',publisher:meta.source||'Recovery OS',date:meta.regularCloseDate||String(tr.quoteAsOf||'').slice(0,10),retrievedAt:meta.retrievedAt||null,sourceType:meta.sourceType||'MARKET_DATA'},retrievedAt:meta.retrievedAt||null}}
function mergeFinancialEvidence(base,extra){
  const old=base?.quarterly||[],more=extra?.quarterly||[],byEnd=new Map(more.map(x=>[x.endDate,x]));
  for(const row of old){
    const other=byEnd.get(row.endDate);
    if(!other||other.startDate!==row.startDate||other.currency!==row.currency){byEnd.set(row.endDate,row);continue}
    const merged={...other,...Object.fromEntries(Object.entries(row).filter(([,v])=>v!=null)),metricSources:{...other.metricSources,...row.metricSources}};
    for(const [key,value]of Object.entries(merged))if(MODEL.finite(value)&&!['fiscalYear','fiscalQuarter','comparisonYear','comparisonQuarter'].includes(key)){
      const owner=MODEL.finite(row[key])?row:other,source=owner.metricSources?.[key]||owner.source;
      if(source)merged.metricSources[key]=source;
    }
    for(const [key,numerator,denominator,scale]of [['operatingMarginPct','operatingIncome','revenue',100],['netMarginPct','netIncome','revenue',100],['currentRatio','currentAssets','currentLiabilities',1]]){
      if(MODEL.finite(merged[numerator])&&MODEL.finite(merged[denominator]))merged[key]=merged[denominator]!==0?merged[numerator]/merged[denominator]*scale:null;
    }
    byEnd.set(row.endDate,merged);
  }
  return {...extra,...base,quarterly:[...byEnd.values()].sort((a,b)=>b.endDate.localeCompare(a.endDate)).slice(0,12),annual:base?.annual?.length?base.annual:extra?.annual||[]};
}
researchBundle=async function loadAtlasCompany(t,options={}){
  if(options.refresh){ATLAS_BUNDLES.delete(t);ATLAS_SHARDS.delete(atlasShard(t))}
  if(ATLAS_BUNDLES.has(t))return ATLAS_BUNDLES.get(t);
  const promise=(async()=>{
    const key=atlasShard(t);if(!ATLAS_SHARDS.has(key)&&ATLAS_SYMBOLS.has(t))ATLAS_SHARDS.set(key,atlasFile('shards/'+key+'.json',!!options.refresh));
    const [base,shard]=await Promise.all([ATLAS_BASE_BUNDLE(t,options),ATLAS_SHARDS.get(key)]),extra=shard?.stocks?.[t],tracker=trackerPriceBundle(t);
    if(!extra){const priceBundle=newestPriceBundle(base,tracker);return priceBundle&&priceBundle!==base?{...base,quote:priceBundle.quote,priceSource:priceBundle.priceSource,trackerPriceAsOf:tracker?.priceSource?.date||null}:base}
    const evidenceConflicts=window.RecoveryQuality?.findConflicts(base.financials,extra.financials)||[];
    const profile={...extra.profile,...Object.fromEntries(Object.entries(base.profile||{}).filter(([,v])=>v!=null&&v!==''))};
    for(const k of ['sector','industry','country','marketCap'])if(extra.profile[k]!=null&&extra.profile[k]!=='')profile[k]=extra.profile[k];
    profile.directoryVerified=true;
    const refs=[...(base.filings||[]),...(extra.filings||[])].filter((x,i,a)=>a.findIndex(y=>y.url===x.url)===i),priceBundle=newestPriceBundle(base,extra,tracker);
    return {...extra,...base,evidenceConflicts:[...(base.evidenceConflicts||[]),...evidenceConflicts],profile,quote:priceBundle?.quote||null,priceSource:priceBundle?.priceSource||null,
      financials:mergeFinancialEvidence(base.financials,extra.financials),filings:refs,atlasRetrievedAt:extra.retrievedAt,coverage:extra.coverage,
      connectionState:'Public company atlas · collected '+snapshotDate(extra.retrievedAt),meta:{...base.meta,coverage:'Public Nasdaq market snapshots, SEC statements and original filings. Exact reporting dates are retained; additional history is loaded where collected.'}};
  })();ATLAS_BUNDLES.set(t,promise);return promise;
};
function atlasLinks(b){const t=encodeURIComponent(b.profile?.ticker||currentTicker),cik=b.profile?.cik;return [
 [cik?`https://www.sec.gov/edgar/browse/?CIK=${encodeURIComponent(cik)}&owner=exclude`:`https://www.sec.gov/edgar/search/#/q=${t}`,'SEC company archive','Annual, quarterly, ownership and event filings'],
 [`https://finance.yahoo.com/quote/${t}/`,'Yahoo Finance','Market quote, company profile and historical prices'],
 [`https://www.nasdaq.com/market-activity/${MODEL.analyze(b,null).fund?'etf':'stocks'}/${t.toLowerCase()}`,'Nasdaq','Listing, market activity and company coverage'],
 [`https://news.google.com/search?q=${encodeURIComponent((b.profile?.name||t)+' stock')}&hl=en-US&gl=US&ceid=US%3Aen`,'News search','Find current coverage, then verify against the issuer'],
 [b.profile?.investorRelations||b.profile?.homepage,'Company investor relations','Original releases, presentations and reports'],
 [tradingViewUrl(b.researchSymbol||currentTicker),'TradingView','Interactive market chart and community research']
 ].filter(x=>MODEL.safeURL(x[0]));}
function atlasSourceCards(b){return `<div class="atlas-source-cards">${atlasLinks(b).map(([url,title,description])=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span>↗</span><strong>${esc(title)}</strong><p>${esc(description)}</p></a>`).join('')}</div>`}
function atlasStat(label,value,note){return researchMetric(label,value,note||'Public evidence')}
function atlasKnownStats(b,a){const f=a.fin.latest||{},items=[];if(MODEL.finite(b.profile.marketCap))items.push(atlasStat('Market cap',evidenceMoney(b.profile.marketCap),'Nasdaq snapshot · '+snapshotDate(b.atlasRetrievedAt||ATLAS_META?.retrievedAt)));if(MODEL.finite(f.revenue))items.push(atlasStat('Revenue',evidenceMoney(f.revenue),f.period));if(MODEL.finite(a.fin.yoy))items.push(atlasStat('Revenue change',evidencePercent(a.fin.yoy),'Matched year-earlier period'));if(MODEL.finite(f.netIncome))items.push(atlasStat('Net income',evidenceMoney(f.netIncome),f.period));if(MODEL.finite(f.operatingMarginPct))items.push(atlasStat('Operating margin',evidencePercent(f.operatingMarginPct),'Calculated · matched period'));if(MODEL.finite(f.cash))items.push(atlasStat('Cash & equivalents',evidenceMoney(f.cash),f.endDate));if(MODEL.finite(f.assets))items.push(atlasStat('Total assets',evidenceMoney(f.assets),f.endDate));if(MODEL.finite(f.dilutedEPS))items.push(atlasStat('Diluted EPS',fmtMoney(f.dilutedEPS),f.period));return items.join('')}
function atlasBusiness(b){const p=b.profile||{},t=p.ticker;return `<article class="atlas-business"><div class="research-kicker">COMPANY IDENTITY</div><h4>${esc(p.name||t)}</h4><p>${esc(p.description||[p.name&&p.name!==t?`${p.name} is listed in the public securities directory.`:`Research the listing identity for ${t} before using a quote.`,p.industry?`The provider classifies its industry as ${p.industry}.`:p.sector&&p.sector!=='Market frontier'?`The listed sector is ${p.sector}.`:'Its original issuer records are linked below.',p.country?`Country classification: ${p.country}.`:''].filter(Boolean).join(' '))}</p><div class="atlas-identity-tags">${[p.sector,p.exchange,p.cik?'SEC '+p.cik:null].filter(Boolean).map(v=>`<span>${esc(v)}</span>`).join('')}</div></article>`}
function atlasFinancialTable(rows,b){
  const metrics=[['revenue','Revenue'],['netIncome','Net income'],['operatingIncome','Operating income'],['operatingMarginPct','Operating margin'],['dilutedEPS','Diluted EPS'],['cash','Cash'],['assets','Assets'],['currentRatio','Current ratio'],['longTermDebt','Long-term debt']].filter(([key])=>rows.some(r=>MODEL.finite(r[key])));
  if(!rows.length)return '';
  return `<div class="data-table-wrap"><table class="data-table atlas-financial-table"><thead><tr><th>Period</th>${metrics.map(([,label])=>`<th>${label}</th>`).join('')}<th>Record</th></tr></thead><tbody>${rows.map(r=>`<tr><th>${esc(r.endDate)}<small>${esc(r.period)}</small></th>${metrics.map(([key])=>`<td>${MODEL.finite(r[key])?(key.endsWith('Pct')?evidencePercent(r[key]):key==='currentRatio'?r[key].toFixed(2)+'×':key==='dilutedEPS'?fmtMoney(r[key]):evidenceMoney(r[key])):sourceLink(r.metricSources?.[key]||r.source||atlasLinks(b)[0][0],'See filing')}</td>`).join('')}<td>${sourceLink(r.source,'Open')}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderAtlasFinancials(b,a){const f=a.fin.latest,cf=b.financials?.cashFlowPeriod;return readerHeader('FINANCIAL ENGINE',a.fund?'Understand the exposure.':'The business, in reported numbers.',a.fund?'Fund documents explain the mandate, holdings, fees and concentration. Corporate operating statements do not describe fund returns.':'Reported values and calculated margins, with exact period dates and original filing links.')+atlasBusiness(b)+(a.fund?`<article class="research-prose"><h4>Build the fund picture</h4><p>Start with the prospectus and the latest holdings disclosure. Check the benchmark or mandate, largest positions, expense ratio, distribution policy and tracking behavior. Compare the fund with its intended exposure, using matching dates.</p></article>`:`<div class="research-metrics">${atlasKnownStats(b,a)}</div>${f?atlasFinancialTable(a.fin.rows,b):'<article class="research-prose"><h4>Go directly to the issuer record</h4><p>This security does not have a compatible standardized quarterly statement in the current atlas. Its company archive provides the actual disclosures, including annual and foreign-issuer reports.</p></article>'}${cf?`<section class="cash-evidence"><div class="research-kicker">${esc(cf.scope)} CASH FLOW · ${esc(cf.startDate)} → ${esc(cf.endDate)}</div><div class="research-metrics">${[['operatingCashFlow','Operating cash flow'],['capitalExpenditure','Capital expenditure'],['freeCashFlow','Free cash flow']].filter(([k])=>MODEL.finite(cf[k])).map(([k,label])=>atlasStat(label,evidenceMoney(cf[k]),k==='freeCashFlow'?'Calculated · matched period':'Reported')).join('')}</div>${evidenceSource(cf,'Cash-flow statement')}</section>`:''}${b.financials?.annual?.length?`<details class="atlas-detail"><summary>Explore ${b.financials.annual.length} annual reports</summary>${atlasFinancialTable(b.financials.annual,b)}</details>`:''}<p class="source-note">A “See filing” link means that field is not disclosed in a compatible form in the loaded record. Zero is shown only when the source reports zero. ${f?.normalizedFrom==='SEC XBRL frames'?'Calendar cohorts are used to find records; the actual company start and end dates are preserved.':''}</p>`)+atlasSourceCards(b)}
function atlasPriceStats(b,a){const bars=a.tech?.bars;if(!bars?.length)return '';const last=bars.at(-1).close,returns=[];for(const [days,label]of [[21,'1-month change'],[63,'3-month change'],[126,'6-month change'],[252,'1-year change']])if(bars.length>days)returns.push(atlasStat(label,fmtPct((last/bars.at(-days-1).close-1)*100),'Close-to-close · '+bars.at(-1).date));const logs=bars.slice(-64).map((r,i,arr)=>i&&r.close>0&&arr[i-1].close>0?Math.log(r.close/arr[i-1].close):null).filter(MODEL.finite);if(logs.length>=20){const mean=logs.reduce((x,y)=>x+y,0)/logs.length,sd=Math.sqrt(logs.reduce((x,y)=>x+(y-mean)**2,0)/(logs.length-1));returns.push(atlasStat('Realized volatility',fmtPct(sd*Math.sqrt(252)*100),'Annualized · last '+logs.length+' returns'))}return `<section class="atlas-price-stats"><div class="research-kicker">MORE MARKET CONTEXT</div><div class="research-metrics">${returns.join('')}</div><p class="source-note">Returns use the loaded close series and exclude distributions. Volatility describes past movement.</p></section>`}
renderResearchReader=function renderAtlasReader(section,b,a,tr){
  ATLAS_BASE_READER(section,b,a,tr);const root=qs('#researchReader');
  if(section==='financials')root.innerHTML=renderAtlasFinancials(b,a);
  if(section==='brief'){
    root.querySelector('.evidence-synthesis')?.insertAdjacentHTML('afterend',atlasBusiness(b)+`<div class="research-metrics">${atlasKnownStats(b,a)}</div>`);
    root.querySelector('.research-empty')?.remove();root.insertAdjacentHTML('beforeend',`<section class="atlas-next-sources"><div class="research-kicker">KEEP INVESTIGATING</div><h4>Every question has a next source.</h4>${atlasSourceCards(b)}</section>`);
  }
  if(section==='price'){
    if(a.tech)root.insertAdjacentHTML('beforeend',atlasPriceStats(b,a));
    else root.innerHTML=readerHeader('PRICE OBSERVATORY','Follow the market record.',b.quote?.sessionNote||'Use the provider’s original chart to inspect the latest available session and history.')+(MODEL.finite(b.quote?.price)?`<div class="research-metrics">${atlasStat('Provider price',fmtMoney(b.quote.price),b.quote.timestamp)}${MODEL.finite(b.quote.changePct)?atlasStat('Provider change',fmtPct(b.quote.changePct),'Change reported by the source'):''}${MODEL.finite(b.quote.volume)?atlasStat('Reported volume',fmtNum(b.quote.volume,0),'Source snapshot'):''}</div>`:'')+`<article class="research-prose"><h4>Open the full price history</h4><p>A multi-session price series has not been collected for this symbol. Use the original market chart below to inspect trend, liquidity, gaps and volatility. A single quote is never drawn as a historical chart.</p></article>`+atlasSourceCards(b);
  }
  if(section==='filings'&&!b.filings?.length)root.innerHTML=readerHeader('FILING TRAIL','Start at the original archive.','Company, fund and foreign-issuer disclosures remain accessible through the public source paths.')+atlasSourceCards(b);
  if(section==='catalysts'&&!b.news?.length)root.insertAdjacentHTML('beforeend',`<section class="atlas-next-sources"><h4>Find the next company update</h4><p>Check the issuer’s releases, event filings and current coverage. A linked search is a research path, not a verified catalyst.</p>${atlasSourceCards(b)}</section>`);
  if(section==='sources')root.insertAdjacentHTML('beforeend',atlasSourceCards(b));
  bindResearchNavigation();
};
