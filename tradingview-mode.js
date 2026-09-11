/* Recovery OS TradingView Browser Mode — no paid market-data API or backend required. */
let currentTVSymbol = null;

function tvCleanTicker(v){
  return String(v||'').trim().replace(/^\$/,'').toUpperCase();
}
function tvExchangeCode(exchange){
  const x=String(exchange||'').toUpperCase();
  if(x.includes('NASDAQ')) return 'NASDAQ';
  if(x==='NYSE' || (x.includes('NEW YORK') && !x.includes('ARCA'))) return 'NYSE';
  if(x.includes('ARCA') || x.includes('AMEX') || x.includes('NYSEAMERICAN')) return 'AMEX';
  if(x.includes('OTC')) return 'OTC';
  return null;
}
function tvSymbolForInput(raw){
  const q=tvCleanTicker(raw);
  if(!q) return null;
  if(q.includes(':')){
    const [ex,...rest]=q.split(':');
    const tk=rest.join(':').trim();
    if(!ex || !tk) return null;
    return `${ex}:${tk}`;
  }
  if(!/^[A-Z0-9.\-]{1,16}$/.test(q)) return null;
  const local=SYMBOLS.find(x=>String(x.ticker||'').toUpperCase()===q);
  const ex=tvExchangeCode(local?.exchange);
  return `${ex||'BATS'}:${q}`;
}
function tvTickerOnly(symbol){return String(symbol||'').split(':').pop()||symbol}
function tvDisplayName(ticker){
  const local=SYMBOLS.find(x=>String(x.ticker||'').toUpperCase()===String(ticker||'').toUpperCase());
  return local?.name || tracked(String(ticker||'').toUpperCase())?.company || 'TradingView market symbol';
}

function setConn(){
  qsa('[data-ex-conn]').forEach(el=>{el.textContent='TRADINGVIEW MODE';el.classList.add('connected')});
}
function openResearchSettings(){toastEx('No API setup is required. Stock Explorer is powered by TradingView widgets.');}

async function searchSymbols(q){
  q=String(q||'').trim();
  if(!q)return[];
  const low=q.toLowerCase();
  const local=SYMBOLS.filter(x=>String(x.ticker||'').toLowerCase().includes(low)||String(x.name||'').toLowerCase().includes(low))
    .sort((a,b)=>(String(a.ticker).toLowerCase()===low?-1:0)-(String(b.ticker).toLowerCase()===low?-1:0))
    .slice(0,7)
    .map(x=>({...x,supported:true,tvSymbol:`${tvExchangeCode(x.exchange)||'BATS'}:${String(x.ticker).toUpperCase()}`}));
  const direct=tvSymbolForInput(q);
  if(direct){
    const tk=tvTickerOnly(direct);
    if(!local.some(x=>String(x.ticker).toUpperCase()===tk)){
      local.unshift({ticker:tk,name:'Open directly with TradingView',exchange:direct.split(':')[0],securityType:'MARKET SYMBOL',supported:true,tvSymbol:direct,direct:true});
    }
  }
  return local.slice(0,10);
}
async function renderSuggest(input,box){
  const q=input.value.trim();if(!q){box.classList.remove('show');return}
  box.innerHTML='<div class="search-empty">Resolving symbol…</div>';box.classList.add('show');
  const rows=await searchSymbols(q);
  if(!rows.length){
    box.innerHTML='<div class="search-empty"><b>Enter a ticker symbol</b><br>Examples: PLTR, KO, SPY, BRK.B, NASDAQ:NVDA, NYSE:V.</div><div class="search-source">TRADINGVIEW MODE · NO MARKET-DATA API REQUIRED</div>';
    return;
  }
  box.innerHTML=rows.map(x=>`<div class="search-item" data-search-ticker="${esc(x.tvSymbol||x.ticker)}"><b>${esc(x.ticker)}</b><span>${esc(x.name)}<br>${esc(x.exchange||'TradingView')}</span><em>${esc(x.securityType||'SYMBOL')}</em></div>`).join('')+
    '<div class="search-source">TRADINGVIEW WIDGET DATA · DELAYED WHERE REQUIRED BY EXCHANGE</div>';
  box.querySelectorAll('[data-search-ticker]').forEach(el=>el.onclick=()=>{box.classList.remove('show');input.value='';openResearch(el.dataset.searchTicker)});
}

function mountTVWidget(id,src,config){
  const host=qs('#'+id);if(!host)return;
  host.innerHTML='<div class="tradingview-widget-container" style="height:100%;width:100%"><div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div></div>';
  const wrap=host.firstElementChild;
  const script=document.createElement('script');
  script.type='text/javascript';script.src=src;script.async=true;script.text=JSON.stringify(config);
  wrap.appendChild(script);
}
function mountTVSuite(symbol){
  const common={colorTheme:'dark',isTransparent:true,locale:'en'};
  mountTVWidget('tvSymbolInfo','https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js',{symbol,width:'100%',...common});
  mountTVWidget('tvAdvancedChart','https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js',{
    autosize:true,symbol,interval:'D',timezone:'exchange',theme:'dark',style:'1',locale:'en',withdateranges:true,
    hide_side_toolbar:false,hide_top_toolbar:false,hide_legend:false,hide_volume:false,allow_symbol_change:true,
    save_image:false,details:true,hotlist:false,calendar:false,support_host:'https://www.tradingview.com'
  });
  mountTVWidget('tvCompanyProfile','https://s3.tradingview.com/external-embedding/embed-widget-symbol-profile.js',{symbol,width:'100%',height:'100%',...common});
  mountTVWidget('tvFundamentals','https://s3.tradingview.com/external-embedding/embed-widget-financials.js',{symbol,width:'100%',height:'100%',displayMode:'adaptive',...common});
  mountTVWidget('tvTechnicals','https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js',{symbol,width:'100%',height:'100%',interval:'1D',showIntervalTabs:true,displayMode:'single',...common});
  mountTVWidget('tvStories','https://s3.tradingview.com/external-embedding/embed-widget-timeline.js',{symbol,width:'100%',height:'100%',feedMode:'symbol',displayMode:'regular',...common});
}
function tvRecoveryBlock(ticker){
  const tr=tracked(ticker);
  if(!tr) return `<div class="recovery-assess"><h4>GENERAL RESEARCH · NOT RECOVERY-QUALIFIED</h4><div class="assessment-row"><b>TRACKER</b><span>This stock is not in the canonical Recovery OS tracker. Opening it here does not qualify or add it.</span></div><button class="queue-btn" id="tvQueueRecovery">SUBMIT TO RECOVERY RESEARCH QUEUE</button></div>`;
  return `<div class="recovery-assess"><h4>${esc(tr.status)} · ${esc(tr.tier)}</h4><div class="assessment-row"><b>SCORE</b><span>${tr.score??'N/A'} · setup progress ${tr.progress??'N/A'}%</span></div><div class="assessment-row"><b>ENTRY</b><span>${esc(tr.entryEligible||'UNKNOWN')} · ${esc(tr.blocker||'No blocker recorded')}</span></div><div class="assessment-row"><b>CRISIS</b><span>${esc(tr.crisis?.summary||'N/A')}</span></div><div class="assessment-row"><b>CATALYST</b><span>${esc(tr.catalyst?.summary||'N/A')}</span></div><div class="assessment-row"><b>INVALIDATION</b><span>${tr.setup?.invalidation==null?'N/A':fmtMoney(tr.setup.invalidation)}</span></div><button class="queue-btn" id="tvOpenRoom">OPEN CANONICAL RECOVERY ROOM</button></div>`;
}
function tvSymbolControls(symbol){
  const ticker=tvTickerOnly(symbol); const active=symbol.split(':')[0];
  const exchanges=['BATS','NASDAQ','NYSE','AMEX','OTC'];
  return `<div class="tv-symbol-controls"><span>DATA SYMBOL <b>${esc(symbol)}</b></span>${exchanges.map(ex=>`<button class="ex-btn ${active===ex?'on':''}" data-tv-exchange="${ex}">${ex}</button>`).join('')}<button class="ex-btn" id="tvExactSymbol">EXACT SYMBOL…</button></div><div class="source-note">Bare U.S. tickers default to BATS when Recovery OS does not already know the primary exchange. If a widget does not resolve, choose the exchange above or enter an exact TradingView symbol such as NYSE:V.</div>`;
}
function renderTradingViewStock(symbol){
  currentTVSymbol=symbol;
  const ticker=tvTickerOnly(symbol);currentTicker=ticker;
  const company=tvDisplayName(ticker);
  const html=`<div class="ex-page-head"><div><span class="ex-badge ok">TRADINGVIEW POWERED</span>${tracked(ticker)?'<span class="ex-badge model">RECOVERY TRACKED</span>':'<span class="ex-badge">GENERAL RESEARCH</span>'}<h2 style="margin-top:8px">${esc(ticker)}</h2><p>${esc(company)}</p></div><div class="ex-statusline">NO PAID API REQUIRED<br>TRADINGVIEW DATA · DELAYED WHERE REQUIRED</div></div>
  <div class="ex-grid tv-grid">
    <section class="ex-card full"><h3>SYMBOL / QUOTE SNAPSHOT</h3><div id="tvSymbolInfo" class="tv-widget tv-symbol"></div>${tvSymbolControls(symbol)}</section>
    <section class="ex-card full"><h3>INTERACTIVE TRADINGVIEW CHART <span class="hint">SYMBOL SEARCH + INDICATORS AVAILABLE INSIDE CHART</span></h3><div id="tvAdvancedChart" class="tv-widget tv-chart"></div><div class="source-note">TradingView widget data is displayed directly by TradingView. Recovery OS does not ingest or relabel it as proprietary live data.</div></section>
    <section class="ex-card half"><h3>COMPANY PROFILE</h3><div id="tvCompanyProfile" class="tv-widget tv-profile"></div></section>
    <section class="ex-card half"><h3>TECHNICAL ANALYSIS</h3><div id="tvTechnicals" class="tv-widget tv-detail"></div></section>
    <section class="ex-card half"><h3>FUNDAMENTAL DATA</h3><div id="tvFundamentals" class="tv-widget tv-detail"></div></section>
    <section class="ex-card half"><h3>TOP STORIES</h3><div id="tvStories" class="tv-widget tv-detail"></div></section>
    <section class="ex-card full"><h3>RECOVERY OS ASSESSMENT</h3>${tvRecoveryBlock(ticker)}</section>
    <section class="ex-card half"><h3>RESEARCH NOTES</h3><textarea class="note-area" id="tvResearchNote" placeholder="Your notes for ${esc(ticker)}…">${esc(user.notes[ticker]||'')}</textarea><div class="source-note">Saved locally on this device and kept separate from the canonical recovery tracker.</div></section>
    <section class="ex-card half"><h3>DATA MODE</h3><div class="matter"><span class="ex-badge ok">TRADINGVIEW</span>Chart, symbol info, profile, fundamentals, technical analysis and news widgets.</div><div class="matter"><span class="ex-badge model">RECOVERY OS</span>Tracker status, recovery thesis and your private notes.</div><div class="matter"><span class="ex-badge warn">LIMITATION</span>Embedded widget entitlements are separate from your personal TradingView subscription; delays may apply.</div></section>
  </div>`;
  qs('#stockContent').innerHTML=html;
  mountTVSuite(symbol);
  qsa('[data-tv-exchange]').forEach(b=>b.onclick=()=>openResearch(`${b.dataset.tvExchange}:${ticker}`));
  qs('#tvExactSymbol')?.addEventListener('click',()=>{const v=prompt('Enter exact TradingView symbol (example NASDAQ:PLTR or NYSE:KO):',symbol);if(v)openResearch(v)});
  qs('#tvResearchNote')?.addEventListener('input',e=>{user.notes[ticker]=e.target.value;saveUser()});
  qs('#tvQueueRecovery')?.addEventListener('click',()=>submitQueue(ticker));
  qs('#tvOpenRoom')?.addEventListener('click',()=>{if(typeof openRoom==='function'){closeExplorer();openRoom(ticker)}});
}
async function openResearch(raw){
  const symbol=tvSymbolForInput(raw);
  if(!symbol){openExplorer('stock');renderError('INVALID SYMBOL','Enter a ticker such as PLTR, KO, SPY, BRK.B or an exact TradingView symbol such as NASDAQ:NVDA.');return}
  const ticker=tvTickerOnly(symbol);
  const isNew=ticker!==currentTicker;if(isNew)viewScroll.stock=0;
  openExplorer('stock');currentTicker=ticker;currentTVSymbol=symbol;
  history.replaceState(null,'',`#research/${encodeURIComponent(symbol)}`);
  addRecent(ticker);renderTradingViewStock(symbol);
  requestAnimationFrame(()=>{const m=qs('.ex-main');if(m)m.scrollTop=viewScroll.stock||0});
}
