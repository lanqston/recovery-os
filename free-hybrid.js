/* Recovery OS Free Hybrid Research Layer
 * No paid market-data API required for general stock research.
 * TradingView widgets are visual research surfaces; SEC directory data powers symbol/CIK lookup.
 */
(()=>{
'use strict';
const originalLoadSeed=loadSeed;
const originalFetchBundle=fetchBundle;
const EXCHANGE_MAP={
  'NASDAQ':'NASDAQ','Nasdaq':'NASDAQ','NYSE':'NYSE','NYSE American':'AMEX','NYSE Arca':'AMEX','Cboe':'CBOE'
};
const FALLBACK_EXCHANGE={
  PLTR:'NASDAQ',AAPL:'NASDAQ',MSFT:'NASDAQ',NVDA:'NASDAQ',AMZN:'NASDAQ',GOOGL:'NASDAQ',GOOG:'NASDAQ',META:'NASDAQ',TSLA:'NASDAQ',AMD:'NASDAQ',INTC:'NASDAQ',PYPL:'NASDAQ',ADBE:'NASDAQ',ASML:'NASDAQ',QQQ:'NASDAQ',
  STZ:'NYSE',DECK:'NYSE',NKE:'NYSE',ZTS:'NYSE',BABA:'NYSE',TSM:'NYSE',NVO:'NYSE',JPM:'NYSE',XOM:'NYSE',
  SPY:'AMEX',IWM:'AMEX',DIA:'AMEX',VTI:'AMEX',XLK:'AMEX',XLF:'AMEX',XLE:'AMEX',XLV:'AMEX',XLY:'AMEX',XLP:'AMEX'
};
let secDirectory=[];
function normalizeSymbol(x){
  if(!x)return null;
  return {ticker:String(x.ticker||'').toUpperCase(),name:x.name||x.company||x.ticker,exchange:x.exchange||'AUTO',securityType:x.securityType||'SEC registrant',cik:x.cik??null};
}
async function freeLoadSeed(){
  await originalLoadSeed();
  try{
    const r=await fetch('data/sec-symbols.json',{cache:'no-store'});
    if(r.ok){const j=await r.json();secDirectory=(j.symbols||[]).map(normalizeSymbol).filter(Boolean);}
  }catch(e){console.info('SEC symbol directory not cached yet; direct ticker mode remains available.');}
  const seen=new Set();
  SYMBOLS=[...SYMBOLS.map(normalizeSymbol),...secDirectory].filter(x=>x&&x.ticker&&!seen.has(x.ticker)&&(seen.add(x.ticker),true));
}
function symbolRecord(t){
  t=String(t||'').toUpperCase();
  return SYMBOLS.find(x=>String(x.ticker||'').toUpperCase()===t)||{ticker:t,name:t,exchange:'AUTO',securityType:'TradingView direct',cik:null};
}
function tvExchange(sym){return EXCHANGE_MAP[sym?.exchange]||FALLBACK_EXCHANGE[sym?.ticker]||'';}
function tvSymbol(sym){const ex=tvExchange(sym);return ex?`${ex}:${sym.ticker}`:sym.ticker;}
function tvChartUrl(sym){return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol(sym))}`;}
function secCompanyUrl(sym){const key=sym.cik||sym.ticker;return `https://www.sec.gov/edgar/browse/?CIK=${encodeURIComponent(key)}&owner=exclude&action=getcompany`;}
function directBundle(t){const s=symbolRecord(t);return {freeHybrid:true,profile:{ticker:s.ticker,name:s.name,exchange:s.exchange,securityType:s.securityType,cik:s.cik},quote:null,bars:[],news:[],recoveryAssessment:{tracked:false,headline:'GENERAL RESEARCH ONLY — NOT QUALIFIED',classification:'NOT ASSESSED'}};}
function addTVWidget(id,scriptName,config){
  const host=qs(`#${id}`);if(!host)return;
  host.innerHTML='';
  const wrap=document.createElement('div');wrap.className='tradingview-widget-container';wrap.style.height='100%';wrap.style.width='100%';
  const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';widget.style.height='100%';widget.style.width='100%';wrap.appendChild(widget);
  const script=document.createElement('script');script.type='text/javascript';script.src=`https://s3.tradingview.com/external-embedding/${scriptName}`;script.async=true;script.textContent=JSON.stringify(config);wrap.appendChild(script);host.appendChild(wrap);
}
function mountFreeWidgets(sym){
  const symbol=tvSymbol(sym);
  const base={symbol,colorTheme:'dark',isTransparent:true,locale:'en'};
  addTVWidget('tvSymbolInfo','embed-widget-symbol-info.js',{...base,width:'100%'});
  addTVWidget('tvAdvanced','embed-widget-advanced-chart.js',{...base,autosize:true,interval:'D',timezone:'America/New_York',style:'1',withdateranges:true,allow_symbol_change:true,save_image:false,calendar:false,hide_side_toolbar:false,support_host:'https://www.tradingview.com'});
  addTVWidget('tvTechnical','embed-widget-technical-analysis.js',{...base,interval:'1D',width:'100%',height:'100%',showIntervalTabs:true,displayMode:'single'});
  addTVWidget('tvProfile','embed-widget-symbol-profile.js',{...base,width:'100%',height:'100%'});
  addTVWidget('tvFundamentals','embed-widget-financials.js',{...base,width:'100%',height:'100%',displayMode:'regular'});
  addTVWidget('tvNews','embed-widget-timeline.js',{...base,feedMode:'symbol',market:'stock',width:'100%',height:'100%'});
}
async function freeSearchSymbols(q){
  q=String(q||'').trim();if(!q)return[];
  const low=q.toLowerCase(),upper=q.toUpperCase();
  let rows=SYMBOLS.filter(x=>String(x.ticker||'').toLowerCase().includes(low)||String(x.name||'').toLowerCase().includes(low)).sort((a,b)=>{
    const at=String(a.ticker||'').toUpperCase(),bt=String(b.ticker||'').toUpperCase();
    const rank=t=>t===upper?0:t.startsWith(upper)?1:2;return rank(at)-rank(bt)||at.localeCompare(bt);
  }).slice(0,12).map(x=>({...x,supported:true}));
  if(apiBase())try{
    const r=await api('/api/search?q='+encodeURIComponent(q));
    const remote=(r.results||[]).map(x=>({ticker:String(x.ticker||'').toUpperCase(),name:x.name||x.ticker,exchange:x.exchange||x.primary_exchange||'AUTO',securityType:x.type||x.securityType||'Security',supported:x.supported!==false,remote:true}));
    const seen=new Set();rows=[...remote,...rows].filter(x=>x.ticker&&!seen.has(x.ticker)&&(seen.add(x.ticker),true)).slice(0,12);
  }catch(e){console.info('Optional research API search unavailable; using free symbol directory.');}
  if(!rows.length&&/^[A-Z0-9.\-]{1,12}$/.test(upper))rows=[{ticker:upper,name:`Open ${upper} in free TradingView mode`,exchange:'AUTO',securityType:'DIRECT TICKER',supported:true,direct:true}];
  return rows;
}
async function freeRenderSuggest(input,box){
  const q=input.value.trim();if(!q){box.classList.remove('show');return;}
  box.innerHTML='<div class="search-empty">Searching free symbol directory…</div>';box.classList.add('show');
  const rows=await freeSearchSymbols(q);
  if(!rows.length){box.innerHTML='<div class="search-empty"><b>No company-name match yet</b><br>Type the ticker symbol and press Return. Direct TradingView research still works without an API.</div><div class="search-source">FREE HYBRID · SEC DIRECTORY + TRADINGVIEW</div>';return;}
  box.innerHTML=rows.map(x=>`<div class="search-item" data-search-ticker="${esc(x.ticker)}" data-supported="true"><b>${esc(x.ticker)}</b><span>${esc(x.name)}<br>${esc(x.exchange||'AUTO')}</span><em>${esc(x.securityType||'SEC REGISTRANT')}${x.direct?' · FREE':''}</em></div>`).join('')+`<div class="search-source">${apiBase()?'OPTIONAL API + FREE HYBRID':'NO PAID API REQUIRED · SEC + TRADINGVIEW'}</div>`;
  box.querySelectorAll('[data-search-ticker]').forEach(el=>el.onclick=()=>{box.classList.remove('show');input.value='';freeOpenResearch(el.dataset.searchTicker);});
}
async function freeFetchBundle(t){
  try{const b=await originalFetchBundle(t);if(b)return b;}catch(e){/* fall through */}
  return directBundle(t);
}
function recoveryAssessmentHtml(tr){
  if(tr)return `<div class="assessment-row"><b>CANONICAL STATE</b><span>${esc(tr.status)} · ${esc(tr.tier)}</span></div><div class="assessment-row"><b>ENTRY</b><span>${esc(tr.entryEligible||'UNKNOWN')} · ${esc(tr.blocker||'No blocker recorded')}</span></div><div class="assessment-row"><b>SCORE / PROGRESS</b><span>${tr.score??'N/A'} · ${tr.progress??'N/A'}%</span></div><div class="assessment-row"><b>BOUNDARY</b><span>Read-only canonical Recovery OS record. Free stock research does not change qualification.</span></div>`;
  return `<div class="assessment-row"><b>CLASSIFICATION</b><span>GENERAL RESEARCH ONLY — NOT QUALIFIED</span></div><div class="assessment-row"><b>TRACKER EFFECT</b><span>Searching this ticker does not add it to the Crisis-to-Recovery tracker.</span></div><div class="assessment-row"><b>NEXT STEP</b><span>Use “Submit to recovery research queue” if you want a formal rules-based recovery review.</span></div>`;
}
function renderFreeStock(bundle){
  const p=bundle.profile||{},t=String(p.ticker||currentTicker).toUpperCase(),sym={...symbolRecord(t),...p,ticker:t},tr=tracked(t),tv=tvSymbol(sym),sec=secCompanyUrl(sym);
  const identity=`${esc(sym.name||t)} · ${esc(sym.exchange||'EXCHANGE AUTO-DETECT')} · ${esc(sym.securityType||'Security')}`;
  qs('#stockContent').innerHTML=`<div class="ex-page-head"><div><span class="ex-badge ok">FREE HYBRID</span><span class="ex-badge">TRADINGVIEW + SEC</span>${tr?'<span class="ex-badge model">RECOVERY TRACKED</span>':'<span class="ex-badge">GENERAL RESEARCH</span>'}</div><div class="ex-statusline">NO PAID API REQUIRED<br>WIDGET DATA MAY BE DELAYED</div></div>
  <div class="ex-grid">
    <section class="ex-card full"><div class="stock-identity"><div><div class="stock-symbol"><div class="mark">${esc(t)}</div><div><h2>${esc(t)}</h2><small>${identity}</small></div></div><div class="stock-description">Free research mode uses TradingView’s embedded research widgets plus SEC filing lookup. Your Recovery OS tracker remains separate and unchanged.</div></div></div><div id="stockActions" style="margin-top:13px;display:flex;gap:7px;flex-wrap:wrap"></div><div class="free-link-row"><a class="ex-btn ex-linkbtn" href="${tvChartUrl(sym)}" target="_blank" rel="noopener">OPEN IN TRADINGVIEW ↗</a><a class="ex-btn ex-linkbtn" href="${sec}" target="_blank" rel="noopener">SEC FILINGS ↗</a></div><div class="free-source-strip"><span>TRADINGVIEW SYMBOL: ${esc(tv)}</span><span>SEC LOOKUP: ${esc(String(sym.cik||t))}</span><span>RECOVERY TRACKER: ${tr?'READ ONLY':'UNCHANGED'}</span></div></section>
    <section class="ex-card full"><h3>TRADINGVIEW SYMBOL SNAPSHOT <span class="hint">EMBEDDED MARKET DATA</span></h3><div class="tv-widget tv-symbol" id="tvSymbolInfo"></div></section>
    <section class="ex-card full"><h3>ADVANCED CHART <span class="hint">OPEN IN TRADINGVIEW FOR YOUR ACCOUNT / SUBSCRIPTION</span></h3><div class="tv-widget tv-chart" id="tvAdvanced"></div><div class="chart-help">The embedded widget uses TradingView’s website-widget feed. For the exact entitlements and layout in your TradingView subscription, use <b>OPEN IN TRADINGVIEW</b>.</div></section>
    <section class="ex-card half"><h3>TECHNICAL ANALYSIS</h3><div class="tv-widget tv-medium" id="tvTechnical"></div></section>
    <section class="ex-card half"><h3>COMPANY PROFILE</h3><div class="tv-widget tv-medium" id="tvProfile"></div></section>
    <section class="ex-card half"><h3>FUNDAMENTAL DATA</h3><div class="tv-widget tv-tall" id="tvFundamentals"></div></section>
    <section class="ex-card half"><h3>TOP STORIES</h3><div class="tv-widget tv-tall" id="tvNews"></div></section>
    <section class="ex-card full recovery-assess"><h3>RECOVERY OS ASSESSMENT</h3>${recoveryAssessmentHtml(tr)}<button class="queue-btn" id="queueRecovery">${tr?'OPEN CANONICAL RECOVERY ROOM':'SUBMIT TO RECOVERY RESEARCH QUEUE'}</button></section>
    <section class="ex-card half"><h3>SEC / FILINGS</h3><p>${sym.cik?`SEC directory CIK: <b>${esc(sym.cik)}</b>.`:'Recovery OS will attach a CIK automatically when the SEC symbol directory resolves this ticker.'} SEC filings are primary-source evidence and remain separate from TradingView market widgets.</p><div class="free-link-row compact"><a class="ex-btn ex-linkbtn" href="${sec}" target="_blank" rel="noopener">OPEN EDGAR ↗</a></div></section>
    <section class="ex-card half"><h3>DATA BOUNDARIES</h3><p><b>TradingView widgets:</b> visual chart, technical, company, financial and news research. <b>SEC:</b> public filing lookup. <b>Recovery OS:</b> your own tracker, notes and formal recovery assessment. Missing raw API fields are not invented.</p></section>
    <section class="ex-card full"><h3>RESEARCH NOTES</h3><textarea class="note-area" id="researchNote" placeholder="Your notes for ${esc(t)}…">${esc(user.notes[t]||'')}</textarea><div class="source-note">Stored locally on this device unless optional cross-device state is configured.</div></section>
  </div>`;
  renderStockActions();
  qs('#researchNote')?.addEventListener('input',e=>{user.notes[t]=e.target.value;saveUser();});
  qs('#queueRecovery').onclick=()=>{if(tr&&typeof openRoom==='function'){closeExplorer();openRoom(t);}else submitQueue(t);};
  mountFreeWidgets(sym);
}
async function freeOpenResearch(t){
  t=String(t||'').trim().toUpperCase();const isNew=t!==currentTicker;if(isNew)viewScroll.stock=0;
  if(!/^[A-Z0-9.\-]{1,12}$/.test(t)){openExplorer('stock');renderError('INVALID SYMBOL','Use a valid ticker such as AAPL, PLTR, SPY or BRK.B.');return;}
  openExplorer('stock');currentTicker=t;history.replaceState(null,'',`#research/${encodeURIComponent(t)}`);qs('#stockContent').innerHTML='<div class="empty-panel"><strong>LOADING RESEARCH</strong>Checking cached research, SEC directory and free TradingView mode…</div>';
  let b=await freeFetchBundle(t);currentBundle=b;addRecent(t);
  if(b?.freeHybrid||(!b?.quote&&!b?.bars?.length&&!seedBundle(t)))renderFreeStock(b||directBundle(t));else renderStock(b);
  requestAnimationFrame(()=>{const m=qs('.ex-main');if(m)m.scrollTop=viewScroll.stock||0;});
}
function freeSetConn(){qsa('[data-ex-conn]').forEach(el=>{el.textContent=apiBase()?'API + FREE HYBRID':'FREE HYBRID';el.classList.add('connected');});}
function patchLabels(){
  const title=qs('.ex-title small');if(title)title.textContent='RESEARCH PORTAL // FREE HYBRID';
  const home=qs('#ex-explore .ex-page-head');if(home){const p=home.querySelector('p');if(p)p.textContent='Search U.S. tickers with free TradingView research and SEC filing lookup. No paid market-data API is required for normal symbol research.';const badge=home.querySelector('.ex-badge');if(badge){badge.textContent='NO PAID API REQUIRED';badge.classList.remove('warn');badge.classList.add('ok');}}
  const h=qs('#exHomeSearch');if(h)h.placeholder='Try PLTR, AAPL, SPY, Adobe, Nike…';
  const settingsP=qs('#researchSettings p');if(settingsP)settingsP.textContent='No paid API is required for normal Stock Explorer research. TradingView widgets and SEC lookup power free-hybrid mode. A server-side API is optional for raw programmatic datasets, market-wide numeric screens, cross-device state and automated watches.';
  const screenNote=qs('#ex-screener .source-note');if(screenNote)screenNote.textContent='Ticker research works without a paid API. Market-wide numeric screening still needs raw programmatic data because embedded TradingView widgets do not expose their values to Recovery OS calculations.';
}
loadSeed=freeLoadSeed;
searchSymbols=freeSearchSymbols;
renderSuggest=freeRenderSuggest;
fetchBundle=freeFetchBundle;
openResearch=freeOpenResearch;
setConn=freeSetConn;
if(window.RecoveryExplorer)window.RecoveryExplorer.openResearch=freeOpenResearch;
document.addEventListener('DOMContentLoaded',()=>{patchLabels();freeSetConn();if(window.RecoveryExplorer)window.RecoveryExplorer.openResearch=freeOpenResearch;});
})();
