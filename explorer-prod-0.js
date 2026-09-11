'use strict';
const qs=(s,r=document)=>r.querySelector(s), qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const fmtMoney=(v,compact=false)=>v==null?'N/A':compact?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(v):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
const fmtNum=(v,d=1)=>v==null?'N/A':Number(v).toLocaleString(undefined,{maximumFractionDigits:d});
const fmtPct=(v,d=1)=>v==null?'N/A':`${v>0?'+':''}${Number(v).toFixed(d)}%`;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const ago=iso=>{if(!iso)return'UNKNOWN';try{return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(iso))}catch{return iso}};
const LS='recoveryResearchStateV1', API_KEY='recoveryResearchApiV1', TOKEN_KEY='recoveryResearchTokenV1';
let SEED=null,SYMBOLS=[],CAPS=null,MARKET_STATUS=null,currentTicker=null,currentBundle=null,chart=null,searchTimer=null,activeView='explore';
let user=loadUser(),viewScroll={explore:0,stock:0,screener:0,compare:0,lists:0};
const DEFINITIONS={
 'Relative volume':'Current volume divided by a reference average. It shows unusual activity, not direction or quality.',
 'RSI':'Relative Strength Index. A 0–100 momentum oscillator; extreme readings can persist and are not automatic reversal signals.',
 'MACD':'A trend/momentum calculation from exponential moving averages. Crossovers lag price and need context.',
 'ATR':'Average True Range. A volatility measure in price units; it does not predict direction.',
 'VWAP':'Volume-weighted average price for the represented period. Here it comes from provider aggregate bars.',
 'Market cap':'Share price times shares outstanding. It is not the same as enterprise value.',
 'Free cash flow':'Operating cash flow minus capital expenditures. Company definitions can differ, so source filings matter.',
 'Short interest':'Shares sold short and still open at a reporting date. Reporting is periodic, not a live directional signal.',
 'Open interest':'Options contracts still open at the end of the reporting cycle. It is not the same as today’s volume.'
};
function loadUser(){try{return Object.assign({recent:[],favorites:[],lists:{Research:[]},notes:{},bookmarks:{},queueRequests:[],compare:[],watches:[],savedScreens:{},assessmentSnapshots:{}},JSON.parse(localStorage.getItem(LS)||'{}'))}catch{return{recent:[],favorites:[],lists:{Research:[]},notes:{},bookmarks:{},queueRequests:[],compare:[],watches:[],savedScreens:{},assessmentSnapshots:{}}}}
function saveUser(){localStorage.setItem(LS,JSON.stringify(user));scheduleRemoteStatePush()}
let remotePushTimer=null;function scheduleRemoteStatePush(){clearTimeout(remotePushTimer);remotePushTimer=setTimeout(pushRemoteState,700)}
function apiBase(){return (localStorage.getItem(API_KEY)||'').replace(/\/$/,'')}
function authHeaders(){const t=localStorage.getItem(TOKEN_KEY)||'';return t?{'Authorization':'Bearer '+t}:{}}
async function api(path,opts={}){const base=apiBase();if(!base)throw Object.assign(new Error('Research API not connected'),{code:'NO_API'});const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),12000);try{const r=await fetch(base+path,{...opts,headers:{'Content-Type':'application/json',...authHeaders(),...(opts.headers||{})},signal:ctrl.signal});let body=null;try{body=await r.json()}catch{}if(!r.ok)throw Object.assign(new Error(body?.error||`HTTP ${r.status}`),{status:r.status,body});return body}finally{clearTimeout(tm)}}
async function loadSeed(){const embedded=window.__EMBEDDED_RESEARCH__;try{const [a,b,c,d]=await Promise.all([fetch('data/research-seed.json').then(r=>r.json()),fetch('data/symbols-seed.json').then(r=>r.json()),fetch('data/provider-capabilities.json').then(r=>r.json()),fetch('data/research-seed-aapl-extra.json').then(r=>r.json())]);if(a.stocks?.AAPL)Object.assign(a.stocks.AAPL,d);SEED=a;SYMBOLS=b.symbols||[];CAPS=c;MARKET_STATUS=a.meta?.marketStatusSnapshot||null}catch(e){if(embedded){SEED=embedded.seed;SYMBOLS=embedded.symbols||[];CAPS=embedded.capabilities||{capabilities:[]};MARKET_STATUS=SEED.meta?.marketStatusSnapshot||null}else console.warn('Explorer seed unavailable',e)}}
function recoveryState(){try{return typeof STATE!=='undefined'?STATE:null}catch{return null}}
function tracked(t){return recoveryState()?.stocks?.find(x=>x.ticker===t)||null}
function seedBundle(t){return SEED?.stocks?.[t]||null}
async function refreshMarketStatus(){try{MARKET_STATUS=await api('/api/market-status');const el=qs('#exMarketNow');if(el)el.textContent=`MARKET ${String(MARKET_STATUS.market||'UNKNOWN').toUpperCase()} · ${ago(MARKET_STATUS.serverTime)}`}catch(e){console.warn('market status',e)}}
function setConn(){const els=qsa('[data-ex-conn]');els.forEach(el=>{el.textContent=apiBase()?'API CONFIGURED':'CACHED MODE';el.classList.toggle('connected',!!apiBase())})}
function toastEx(msg){if(typeof toast==='function')toast(msg);else console.log(msg)}
function openExplorer(view='explore'){qs('#explorer')?.classList.add('show');if(apiBase())refreshMarketStatus();document.body.style.overflow='hidden';showView(view);setConn();if(view==='explore')setTimeout(()=>qs('#exHomeSearch')?.focus(),80)}
function closeExplorer(){qs('#explorer')?.classList.remove('show');document.body.style.overflow='';history.replaceState(null,'',location.pathname+location.search+(location.hash.startsWith('#research/')?'':location.hash))}
function showView(id){const main=qs('.ex-main');if(main)viewScroll[activeView]=main.scrollTop;activeView=id;qsa('.ex-view').forEach(v=>v.classList.toggle('active',v.id===`ex-${id}`));qsa('[data-ex-view]').forEach(b=>b.classList.toggle('active',b.dataset.exView===id));if(id==='explore')renderExplore();if(id==='screener')renderScreener();if(id==='compare')renderCompare();if(id==='lists')renderLists();requestAnimationFrame(()=>{if(main)main.scrollTop=viewScroll[id]||0})}
function addRecent(t){user.recent=[t,...user.recent.filter(x=>x!==t)].slice(0,12);saveUser()}
function toggleFavorite(t){user.favorites=user.favorites.includes(t)?user.favorites.filter(x=>x!==t):[t,...user.favorites];saveUser();renderStockActions();renderLists()}
function addCompare(t){if(!user.compare.includes(t))user.compare=[...user.compare,t].slice(-4);saveUser();renderStockActions();toastEx(`${t} added to compare`)}
function getSym(t){return SYMBOLS.find(x=>x.ticker===t)||{ticker:t,name:seedBundle(t)?.profile?.name||tracked(t)?.company||t,exchange:seedBundle(t)?.profile?.exchange||'—',securityType:seedBundle(t)?.profile?.securityType||'—'}}
