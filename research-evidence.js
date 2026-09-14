/* Public evidence, native reading surfaces, and period-aware research synthesis. */
let OPEN_RESEARCH_INDEX=[],OPEN_RESEARCH_MACRO=null;
const PUBLIC_RESEARCH_ROOT='https://raw.githubusercontent.com/lanqston/recovery-os/main/data/open-research/';
const EVIDENCE_ORIGINAL_LOAD=loadSeed,EVIDENCE_ORIGINAL_BUNDLE=researchBundle,EVIDENCE_ORIGINAL_READER=renderResearchReader;
const PUBLIC_BUNDLES=new Map();
RESEARCH_TOPICS.push(['filings','07','Filings','Original company records'],['macro','08','Macro','Rates, inflation & policy']);
async function publicResearchFile(name,{fresh=false}={}){
  if(!/^[A-Za-z0-9.\-]+\.json$/.test(name))throw new Error('Invalid research file');
  const local='data/open-research/'+name;
  const urls=fresh?[PUBLIC_RESEARCH_ROOT+name,local]:[local,PUBLIC_RESEARCH_ROOT+name];
  for(const url of urls)try{if(window.RecoveryRequests)return await window.RecoveryRequests.json(url,{refresh:fresh});const response=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(url.startsWith('https:')?3500:5000)});if(response.ok)return await response.json()}catch{}
  throw new Error('Public research snapshot is unavailable');
}
loadSeed=async function loadPublicSeed(){
  await EVIDENCE_ORIGINAL_LOAD();
  const results=await Promise.allSettled(['index.json','directory.json','macro.json'].map(name=>publicResearchFile(name)));
  OPEN_RESEARCH_INDEX=results[0].status==='fulfilled'?results[0].value.symbols||[]:[];
  OPEN_RESEARCH_MACRO=results[2].status==='fulfilled'?results[2].value:null;
  const directory=results[1].status==='fulfilled'?results[1].value.symbols||[]:[];
  const merged=new Map(directory.map(x=>[x.ticker,{...x,securityType:'SEC-listed security'}]));
  SYMBOLS.forEach(x=>merged.set(x.ticker,{...merged.get(x.ticker),...x}));
  OPEN_RESEARCH_INDEX.forEach(x=>{const prior=merged.get(x.ticker)||{};merged.set(x.ticker,{...prior,...x,name:prior.name&&prior.name!==x.ticker?prior.name:x.name,securityType:prior.securityType||'Common Stock',openResearch:true})});
  SYMBOLS=[...merged.values()];
  window.publicResearchReady=true;window.dispatchEvent(new CustomEvent('research-ready'));
}
researchBundle=async function publicResearchBundle(t,{refresh=false}={}){
  if(refresh)PUBLIC_BUNDLES.delete(t);
  if(PUBLIC_BUNDLES.has(t))return PUBLIC_BUNDLES.get(t);
  const promise=(async()=>{
    const base=await EVIDENCE_ORIGINAL_BUNDLE(t,{refresh});
    if(!OPEN_RESEARCH_INDEX.some(x=>x.ticker===t))return base;
    try{
      const enriched=await publicResearchFile(t+'.json',{fresh:refresh});
      const profile={...base.profile};for(const [k,v] of Object.entries(enriched.profile||{}))if(v!=null&&v!==''&&(k!=='name'||!profile.name||profile.name===t))profile[k]=v;
      const news=[...(enriched.news||[]),...(base.news||[])].filter((x,i,arr)=>arr.findIndex(y=>y.url===x.url)===i).sort((a,b)=>String(b.published).localeCompare(String(a.published))).slice(0,18);
      const bars=enriched.bars?.length&&String(enriched.bars.at(-1).date)>=String(base.bars?.at(-1)?.date||'')?enriched.bars:base.bars;
      const useNewBars=bars===enriched.bars;
      return {...base,profile,news,bars,quote:useNewBars?enriched.quote:base.quote,priceSource:useNewBars?enriched.priceSource:base.priceSource,
        financials:enriched.financials?.quarterly?.length?enriched.financials:base.financials,filings:enriched.filings||[],sourceHealth:enriched.health||[],health:enriched.health||[],lastAttemptAt:enriched.lastAttemptAt,publicRetrievedAt:enriched.retrievedAt,
        connectionState:'Public-source research · collected '+snapshotDate(enriched.retrievedAt),meta:{...base.meta,coverage:'SEC statements and filings, public market history and news. Each observation retains its date. Sources are collected outside the browser and served as native research.'}};
    }catch{return base}
  })();PUBLIC_BUNDLES.set(t,promise);return promise;
}
function evidenceMoney(v){return MODEL.finite(v)?fmtMoney(v,true):'Not supplied'}
function evidencePercent(v){return MODEL.finite(v)?fmtPct(v):'Not supplied'}
function evidenceSource(row,label='Original filing'){return row?.source?sourceLink(row.source,label,'research-citation'):''}
function evidenceChange(current,prior){return MODEL.finite(current)&&MODEL.finite(prior)&&prior!==0?(current/prior-1)*100:null}
function evidenceFacts(row,fields){return fields.filter(([key])=>MODEL.finite(row?.[key])).map(([key,label])=>`${label} ${key.endsWith('Pct')?evidencePercent(row[key]):evidenceMoney(row[key])}`).join('; ')}
function evidenceCard(index,title,body,source='',extra=''){return `<article class="evidence-chapter"><header><span>${String(index).padStart(2,'0')}</span><h4>${esc(title)}</h4></header>${body.map(x=>`<p>${esc(x)}</p>`).join('')}${extra}<div class="research-citation-row">${source}</div></article>`}
function evidenceChapters(b,a,tr){
  const f=a.fin.latest,py=a.fin.priorYear,cf=a.fund?null:b.financials?.cashFlowPeriod,annual=a.fund?null:b.financials?.annual?.[0],chapters=[];
  if(f){
    const opChange=py&&MODEL.finite(f.operatingMarginPct)&&MODEL.finite(py.operatingMarginPct)?f.operatingMarginPct-py.operatingMarginPct:null;
    chapters.push(evidenceCard(1,'The operating picture',[
      `${b.profile.name||a.ticker} has a quarterly record covering ${f.startDate} to ${f.endDate}.${MODEL.finite(f.revenue)?` Reported revenue was ${evidenceMoney(f.revenue)}.`:''} ${a.fin.yoy!=null?`That is ${Math.abs(a.fin.yoy).toFixed(1)}% ${a.fin.yoy>=0?'above':'below'} the matching year-earlier quarter (${evidenceMoney(py.revenue)}).`:'Use the linked operating statement to examine the revenue mix and compare compatible periods.'}`,
      `${evidenceFacts(f,[['operatingIncome','Operating income'],['operatingMarginPct','operating margin']])||'Read the original statement for the issuer’s operating-income presentation'}.${opChange!=null?` The margin ${opChange>=0?'expanded':'contracted'} ${Math.abs(opChange).toFixed(1)} percentage points from the year-earlier quarter.`:''} ${opChange!=null&&a.fin.yoy!=null?(a.fin.yoy>0&&opChange>0?'Sales growth and margin expansion are supporting the same direction. The next filing needs to show whether that improvement persists.':a.fin.yoy>0?'Revenue growth is not yet accompanied by stronger operating margins. Investigate the mix of costs, pricing and investment before attributing the growth to a stronger earnings engine.':'The data calls for a closer look at demand, pricing and costs. One period does not establish either a recovery or a lasting decline.'):'Evaluate revenue and margins together; their sources and periods are linked here.'}`
    ],evidenceSource(f,'Latest quarter')+evidenceSource(py,'Year-earlier quarter')));
    const netChange=py?evidenceChange(f.netIncome,py.netIncome):null,shareChange=py?evidenceChange(f.dilutedShares,py.dilutedShares):null,epsChange=py?evidenceChange(f.dilutedEPS,py.dilutedEPS):null;
    chapters.push(evidenceCard(2,'Earnings and the share count',[
      `${evidenceFacts(f,[['netIncome','Reported net income'],['netMarginPct','net margin']])||'Inspect the issuer’s earnings presentation in the attached filing'}. ${netChange!=null&&py.netIncome>0?`Compared with positive year-earlier earnings, net income changed ${evidencePercent(netChange)}.`:'Check the underlying filing for tax effects, non-operating items and any unusual gains or charges.'}`,
      MODEL.finite(f.dilutedEPS)?`Reported diluted EPS was ${fmtMoney(f.dilutedEPS)}${epsChange!=null&&py.dilutedEPS>0?`, a ${evidencePercent(epsChange)} change versus the matched quarter`:''}. ${MODEL.finite(f.dilutedShares)?`Weighted-average diluted shares were ${fmtNum(f.dilutedShares,0)}${shareChange!=null?`, ${Math.abs(shareChange).toFixed(2)}% ${shareChange>=0?'higher':'lower'} than the year-earlier period`:''}.`:''} A rising share count can offset business growth for each shareholder; a falling count can support EPS even when operating progress is weaker.`:'A reliable quarterly EPS/share-count pair is not attached. Annual weighted-average shares are not being substituted for a quarterly count.'
    ],evidenceSource(f)+evidenceSource(py,'Comparison period')));
  }
  if(cf){
    const duration=Math.round((Date.parse(cf.endDate)-Date.parse(cf.startDate))/86400000),months=Math.round(duration/30.4);
    const spend=cf.operatingCashFlow>0&&MODEL.finite(cf.capitalExpenditure)?cf.capitalExpenditure/cf.operatingCashFlow*100:null;
    chapters.push(evidenceCard(3,'Cash generation, with the period kept intact',[
      `${cf.scope}: ${cf.startDate} through ${cf.endDate} (approximately ${months} months). ${evidenceFacts(cf,[['operatingCashFlow','Operating cash flow'],['capitalExpenditure','capital expenditure on property, plant and equipment'],['freeCashFlow','calculated free cash flow']])}. Free cash flow is calculated only when operating cash flow and capital expenditure are both reported for the same period.`,
      spend!=null?`Capital expenditure used ${spend.toFixed(1)}% of positive operating cash flow in this period. ${cf.freeCashFlow>=0?'Cash remained after this reported investment spend. Its uses can include debt repayment, acquisitions, dividends or buybacks.':'Investment spend exceeded operating cash generation for the period. Check available cash, financing commitments and management’s explanation for the spending cycle.'} Free cash flow is a calculation here, and can differ from a company’s adjusted definition.`:'Use the original cash-flow statement to distinguish cash collected from customers, working-capital changes, investment spend and financing. A missing component is not treated as zero.'
    ],evidenceSource(cf,'Cash-flow statement')));
  }
  if(f)chapters.push(evidenceCard(4,'Balance-sheet room to maneuver',[
    `${evidenceFacts(f,[['cash','Cash and equivalents'],['currentAssets','current assets'],['currentLiabilities','current liabilities'],['assets','total assets'],['equity','shareholder equity']])||'The balance-sheet concepts in this snapshot do not cover every issuer-specific presentation. Open the original balance sheet to inspect liquid resources and obligations'}. These observations refer to ${f.endDate}.${MODEL.finite(f.currentRatio)?` The calculated current ratio was ${f.currentRatio.toFixed(2)}×.`:''}`,
    MODEL.finite(f.longTermDebt)?`The reported long-term-debt concept in this record is ${evidenceMoney(f.longTermDebt)}. This is not assumed to include every current borrowing, lease or off-balance-sheet commitment. Review debt maturity dates, interest costs and liquidity arrangements in the filing before judging financing risk.`:'A comparable long-term-debt concept is not attached. Do not interpret that as zero debt. The original balance sheet and footnotes are the next place to check maturities, leases and financing commitments.'
  ],evidenceSource(f,'Balance sheet and notes')));
  if(annual)chapters.push(evidenceCard(5,'Step back to the annual cycle',[
    `For ${annual.period}, ended ${annual.endDate}: ${evidenceFacts(annual,[['revenue','revenue'],['operatingIncome','operating income'],['netIncome','net income']])}. These annual observations provide context around the latest quarter without annualizing a short seasonal period.`,
    `${evidenceFacts(annual,[['operatingCashFlow','Annual operating cash flow'],['freeCashFlow','calculated free cash flow']])||'Follow the annual cash-flow statement to understand working capital, investing and financing'}. Compare the annual record with recent quarters to distinguish seasonal demand, a temporary expense shift and a longer operating trend. Use the financials destination for the underlying rows.`
  ],evidenceSource(annual,'Annual report')));
  if(a.tech){const x=a.tech,days=x.bars.length,dist20=x.sma20?(x.latest.close/x.sma20-1)*100:null,dist50=x.sma50?(x.latest.close/x.sma50-1)*100:null;
    chapters.push(evidenceCard(6,'Does market behavior support the story?',[
      `The saved price history contains ${days} daily bars through ${x.latest.date}. The close of ${fmtMoney(x.latest.close)} was ${dist20!=null?`${Math.abs(dist20).toFixed(1)}% ${dist20>=0?'above':'below'} the 20-session average`:'not accompanied by a complete 20-session average'}${dist50!=null?` and ${Math.abs(dist50).toFixed(1)}% ${dist50>=0?'above':'below'} the 50-session average`:''}. Recent 20-bar range: ${fmtMoney(x.support)} to ${fmtMoney(x.resistance)}.`,
      `Daily ATR 14 was ${fmtMoney(x.atr)}${x.atr!=null?`, approximately ${(x.atr/x.latest.close*100).toFixed(1)}% of the saved close`:''}. ${x.relativeVolume!=null?`The most recent volume was ${x.relativeVolume.toFixed(2)}× the preceding 20-session average.`:''} Trend, volatility and participation answer different questions. A reclaim with persistent participation is different evidence from a single wide-range session; neither changes the recovery tracker automatically.`
    ],b.priceSource?sourceLink(b.priceSource.url,'Daily price history','research-citation'):''));
  }
  const latestFiling=b.filings?.[0];if(latestFiling)chapters.push(evidenceCard(7,'What to investigate next',[
    `The newest attached filing is ${latestFiling.form}, ${latestFiling.filed?'filed '+latestFiling.filed:'with filing metadata available in the original record'}${latestFiling.reportDate?`, reporting an event or period dated ${latestFiling.reportDate}`:''}. The filing trail contains ${b.filings.length} selected company reports and event filings. A filing date is not a prediction of the next earnings date.`,
    tr?`For this recovery thesis, the decisive unresolved point remains: ${tr.blocker||'the saved entry checklist needs a fresh review.'} Read new company evidence against that original blocker before changing the thesis.`:'Read the latest quarterly or annual report for segment demand, competitive pressures, management guidance and risk factors. Then compare event filings and news headlines with those primary records. A published headline by itself does not verify a change in the company’s outlook.'
  ],sourceLink(latestFiling.url,'Newest company filing','research-citation')));
  return chapters.join('');
}
function renderEvidenceBrief(b,a,tr){
  const root=qs('#researchReader'),f=a.fin.latest;
  root.innerHTML=readerHeader('01 / RESEARCH DESK',`${a.ticker}. Follow the evidence.`,a.headline)+`<div class="evidence-worklog" aria-label="Research evidence assembled"><div><b>${a.fin.rows.length}</b><span>disclosed quarters</span></div><div><b>${b.filings?.length||0}</b><span>company filings</span></div><div><b>${a.tech?.bars.length||0}</b><span>daily price bars</span></div><div><b>${b.news?.length||0}</b><span>news records</span></div></div><div class="evidence-synthesis"><span class="research-label">SYNTHESIS · DATED PUBLIC EVIDENCE</span>${a.lead.map(p=>`<p>${esc(p)}</p>`).join('')}</div><div class="evidence-reading-path"><b>Choose the next question</b>${a.questions.map(([title,,section])=>`<button class="research-text-link" data-research-section="${section}">${esc(title)} ↗</button>`).join('')}</div>`+evidenceChapters(b,a,tr)+(!f&&!a.tech?`<div class="research-empty"><h4>Start with the original records.</h4><p>This listing is in the search directory, but its detailed snapshot has not been collected. The source workspace gives you direct company, SEC and public market paths.</p><button class="ex-btn" data-research-section="sources">Open source workspace ↗</button></div>`:'')+`<div class="research-citation-row"><button class="ex-btn" data-research-section="financials">Inspect the financials ↗</button><button class="ex-btn" data-research-section="filings">Follow the filing trail ↗</button></div>`;
  if(tr)root.insertAdjacentHTML('beforeend',`<div class="thesis-strip"><div><span>SAVED RECOVERY THESIS</span><b>${esc(tr.status)} · ${esc(tr.tier)}</b><small>Entry ${esc(tr.entryEligible)} · original tracker preserved</small></div><button class="ex-btn" type="button" id="readRecoveryRoom">Open recovery thesis ↗</button></div>`);
  qs('#readRecoveryRoom')?.addEventListener('click',()=>{const t=currentTicker;closeExplorer();openRoom(t)});
}
function renderEvidenceFilings(b){
  const list=b.filings||[];
  return readerHeader('07 / FILING TRAIL','Walk back to the original record.','Dates, document types and direct primary-source links. Open a filing to inspect its full statements and disclosures.')+`<div class="filing-path">${list.map((f,i)=>`<article><div class="filing-marker">${esc(f.form)}</div><div><small>${f.filed?esc(f.filed)+' · FILED':'ORIGINAL FILING'}${f.reportDate?' / PERIOD '+esc(f.reportDate):''}</small><h4>${sourceLink(f.url,f.title)}</h4><p>${esc(f.form==='8-K'?`Current report${f.items?' · items '+f.items:''}. Read the document to establish the event, its financial impact and any attached release.`:f.form==='10-Q'?'Quarterly statements, operating discussion and updated disclosures.':f.form==='10-K'?'Annual statements, business discussion, risks and footnotes.':'Company disclosure. Verify its purpose and scope in the original document.')}</p></div></article>`).join('')||'<p>No filing trail has been collected for this symbol yet. Use the SEC directory in Sources.</p>'}</div>`;
}
function renderEvidenceMacro(){
  const m=OPEN_RESEARCH_MACRO,treasury=m?.treasury?.observations?.at(-1),dff=m?.series?.DFF,unrate=m?.series?.UNRATE,cpi=m?.series?.CPIAUCSL;
  return readerHeader('08 / MACRO OBSERVATORY','The market around the company.','Official rates, inflation, employment and monetary-policy records. Observations retain their publication or reporting dates.')+`<div class="research-metrics">${researchMetric('10-year Treasury',treasury?.tenYear!=null?treasury.tenYear.toFixed(2)+'%':'Not collected',treasury?.date||'')}${researchMetric('2-year Treasury',treasury?.twoYear!=null?treasury.twoYear.toFixed(2)+'%':'Not collected',treasury?.date||'')}${researchMetric('Fed funds',dff?.observations?.length?dff.observations.at(-1).value.toFixed(2)+'%':'Not collected',dff?.observations?.at(-1)?.date||'')}${researchMetric('Unemployment',unrate?.observations?.length?unrate.observations.at(-1).value.toFixed(1)+'%':'Not collected',unrate?.observations?.at(-1)?.date||'')}</div><article class="research-prose"><h4>Connect the mechanism to the business</h4><p>Interest rates affect financing costs and the discount rate used for future cash flows. Inflation can change input costs, pricing power and consumer budgets. Employment helps frame demand. These are channels to investigate; the macro observations alone do not predict a stock’s return.</p>${treasury?.tenYear!=null&&treasury?.twoYear!=null?`<p>The saved 10-year minus 2-year Treasury spread was ${(treasury.tenYear-treasury.twoYear).toFixed(2)} percentage points on ${esc(treasury.date)}. A spread is one market observation, not a standalone recession or entry signal.</p>`:''}</article><div class="research-citation-row">${m?.treasury?sourceLink(m.treasury.source,'US Treasury curve','research-citation'):''}${Object.values(m?.series||{}).map(s=>sourceLink(s.source,s.name,'research-citation')).join('')}</div><div class="research-timeline">${(m?.releases||[]).sort((a,b)=>String(b.published).localeCompare(String(a.published))).map(x=>`<article><span class="timeline-point">↗</span><div><small>${esc(x.publisher)} · ${esc(snapshotDate(x.published))}</small><h4>${sourceLink(x.url,x.title)}</h4><p>Read the official release for the reported period, revisions and methodology.</p></div></article>`).join('')||'<p>Official macro releases will appear after a successful source collection.</p>'}</div>`;
}
renderResearchReader=function renderPublicReader(section,b,a,tr){
  EVIDENCE_ORIGINAL_READER(section,b,a,tr);
  if(section==='brief')renderEvidenceBrief(b,a,tr);
  if(section==='filings')qs('#researchReader').innerHTML=renderEvidenceFilings(b);
  if(section==='macro')qs('#researchReader').innerHTML=renderEvidenceMacro();
  if(section==='financials'){
    const cf=b.financials?.cashFlowPeriod;
    if(cf){const block=document.createElement('section');block.className='cash-evidence';block.innerHTML=`<div class="research-kicker">${esc(cf.scope.toUpperCase())} CASH FLOW · ${esc(cf.startDate)} → ${esc(cf.endDate)}</div><div class="research-metrics">${researchMetric('Operating cash flow',evidenceMoney(cf.operatingCashFlow),'Reported')}${researchMetric('Capital expenditure',evidenceMoney(cf.capitalExpenditure),'Property, plant & equipment')}${researchMetric('Free cash flow',evidenceMoney(cf.freeCashFlow),'Calculated · matched period')}</div><div class="research-citation-row">${evidenceSource(cf,'Verify cash-flow period')}</div>`;qs('#researchReader .research-metrics')?.after(block);}
    const extra=qs('#researchReader .additional-research');if(extra)extra.outerHTML=`<div class="research-citation-row"><button class="ex-btn" data-research-section="filings">Company filings & disclosures ↗</button><button class="ex-btn" data-research-section="macro">Explore market context ↗</button></div>`;
  }
  if(section==='sources'){
    qs('#researchReader .source-directory')?.insertAdjacentHTML('beforeend',`<div class="free-source-directory">${sourceLink(`https://finance.yahoo.com/quote/${encodeURIComponent(currentTicker)}/`,'Yahoo Finance','ex-btn')}${sourceLink(`https://www.nasdaq.com/market-activity/stocks/${encodeURIComponent(currentTicker.toLowerCase())}`,'Nasdaq company page','ex-btn')}${sourceLink(`https://www.google.com/finance/?q=${encodeURIComponent(currentTicker)}`,'Google Finance','ex-btn')}${sourceLink(`https://stockanalysis.com/stocks/${encodeURIComponent(currentTicker.toLowerCase())}/`,'Stock Analysis','ex-btn')}${b.profile?.investorRelations?sourceLink(b.profile.investorRelations,'Investor relations','ex-btn'):''}</div><p>Free public source paths. Access and coverage can differ by provider; native evidence above remains available.</p>`);
  }
  bindResearchNavigation();
}

marketWorkspace=function publicMarketWorkspace(kind,symbol){const t=parseResearchSymbol(symbol)?.ticker||currentTicker;return `<section class="market-workspace"><span class="research-kicker">CONTINUE THE RESEARCH</span><h4>Open a public market source.</h4><p>Native records stay here. These links open the provider’s own page for further coverage and the latest available session.</p><div class="public-source-links">${sourceLink(`https://finance.yahoo.com/quote/${encodeURIComponent(t)}/`,'Yahoo Finance','ex-btn')}${sourceLink(tradingViewUrl(symbol),'TradingView','ex-btn')}${sourceLink(`https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(t)}`,'SEC filings','ex-btn')}</div></section>`};
