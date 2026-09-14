/* Free public research API. Reads the published archive; no paid adapter or D1 dependency. */
import '../../information-model.js';
const F=globalThis.RecoveryInformation;
const ROOT='https://raw.githubusercontent.com/lanqston/recovery-os/main/';
const FILE=/^data\/(?:open-research\/(?:index|directory|macro|[A-Z][A-Z0-9.-]{0,11})\.json|market-atlas\/(?:index|collection|shards\/[0-9a-f]{2})\.json|information\/(?:connectors|coverage|health|providers)\.json)$/;
const ticker=raw=>{const t=String(raw).trim().toUpperCase().replace(/^\$/,'');if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(t))throw Object.assign(new Error('INVALID_SYMBOL'),{status:400});return t};
function shard(t){let h=0;for(const c of t)h=(Math.imul(h,31)+c.charCodeAt(0))>>>0;return(h%64).toString(16).padStart(2,'0')}
export function createArchiveClient({fetcher=fetch,clock=()=>Date.now(),cacheStorage=null}={}){
 const values=new Map(),pending=new Map(),failures=new Map();
 function remember(path,value){values.delete(path);values.set(path,{value,expires:clock()+300000});while(values.size>16)values.delete(values.keys().next().value)}
 return async function archive(path){
  if(!FILE.test(path))throw Object.assign(new Error('ARCHIVE_PATH_NOT_ALLOWED'),{status:400});
  const prior=values.get(path);if(prior&&prior.expires>clock())return prior.value;
  if(pending.has(path))return pending.get(path);
  if((failures.get(path)||0)>clock()){if(prior)return prior.value;throw Object.assign(new Error('ARCHIVE_COOLDOWN'),{status:503})}
  const task=(async()=>{
   const url=ROOT+path,key=new Request(url);
   try{const edge=cacheStorage?await cacheStorage.match(key):null;if(edge){const value=await edge.json();if(value&&typeof value==='object'&&!value.error){remember(path,value);return value}}}catch{}
   try{
    const r=await fetcher(url,{signal:AbortSignal.timeout(6000),redirect:'error',headers:{Accept:'application/json'}});
    if(!r.ok)throw Object.assign(new Error(r.status===404?'ARCHIVE_NOT_FOUND':'ARCHIVE_UNAVAILABLE'),{status:r.status});
    if(Number(r.headers.get('Content-Length'))>4e6)throw Object.assign(new Error('ARCHIVE_TOO_LARGE'),{status:502});
    const text=await r.text();if(text.length>4e6)throw Object.assign(new Error('ARCHIVE_TOO_LARGE'),{status:502});
    const value=JSON.parse(text);if(!value||typeof value!=='object'||value.error)throw Object.assign(new Error('ARCHIVE_SCHEMA_CHANGED'),{status:502});
    remember(path,value);failures.delete(path);
    if(cacheStorage)try{await cacheStorage.put(key,new Response(text,{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=300'}}))}catch{}
    return value;
   }catch(e){failures.set(path,clock()+60000);while(failures.size>80)failures.delete(failures.keys().next().value);if(prior)return prior.value;throw Object.assign(new Error(e.status?e.message:'ARCHIVE_UNAVAILABLE'),{status:e.status||503})}
  })();pending.set(path,task);try{return await task}finally{pending.delete(path)}
 };
}
const archive=createArchiveClient({cacheStorage:typeof caches!=='undefined'?caches.default:null});
async function indexRows(read){const i=await read('data/market-atlas/index.json');if(!Array.isArray(i.rows)||!Array.isArray(i.columns))throw Object.assign(new Error('DIRECTORY_SCHEMA_CHANGED'),{status:502});return{index:i,rows:i.rows.map(row=>Object.fromEntries(i.columns.map((key,n)=>[key,row[n]])))}}
export async function archiveCompany(raw,read=archive){const t=ticker(raw),{rows}=await indexRows(read);const row=rows.find(x=>x.ticker===t)||rows.find(x=>x.ticker.replaceAll('.','-')===t.replaceAll('.','-'));if(!row)throw Object.assign(new Error('SECURITY_NOT_IN_DIRECTORY'),{status:404});return{...row,directoryVerified:true}}
function financials(base={},extra={}){
 const rows=new Map((extra.quarterly||[]).map(r=>[[r.startDate,r.endDate,r.currency].join('|'),r]));
 for(const r of base.quarterly||[]){const key=[r.startDate,r.endDate,r.currency].join('|'),other=rows.get(key)||{},row={...other,...Object.fromEntries(Object.entries(r).filter(([,v])=>v!=null)),metricSources:{...other.metricSources,...r.metricSources},provenance:{...other.provenance,...r.provenance}};
  for(const [k,v]of Object.entries(other))if(F.finite(v)&&r[k]==null&&other.source!==r.source)row.metricSources[k]=other.metricSources?.[k]||other.source;
  for(const [key,income]of [['operatingMarginPct','operatingIncome'],['netMarginPct','netIncome']])row[key]=F.finite(row[income])&&row.revenue>0?row[income]/row.revenue*100:null;
  rows.set(key,row);
 }
 return{...extra,...base,quarterly:[...rows.values()].sort((a,b)=>b.endDate.localeCompare(a.endDate)).slice(0,20),annual:base.annual?.length?base.annual:extra.annual||[]};
}
export async function archiveBundle(raw,read=archive){
 const p=await archiveCompany(raw,read),t=p.ticker,prepared=await read('data/open-research/index.json').catch(()=>({symbols:[]}));
 const [broad,detail]=await Promise.all([read('data/market-atlas/shards/'+shard(t)+'.json').then(x=>x.stocks?.[t]).catch(()=>null),prepared.symbols?.some(x=>x.ticker===t)?read('data/open-research/'+t+'.json').catch(()=>null):null]);
 if(!broad&&!detail)throw Object.assign(new Error('ARCHIVE_COMPANY_UNAVAILABLE'),{status:503});
 if(broad&&broad.profile?.ticker!==t||detail&&detail.profile?.ticker!==t||broad?.profile?.cik&&detail?.profile?.cik&&String(broad.profile.cik).padStart(10,'0')!==String(detail.profile.cik).padStart(10,'0'))throw Object.assign(new Error('ARCHIVE_ISSUER_MISMATCH'),{status:502});
 const d=detail||{},b=broad||{},profile={...p,...b.profile,...d.profile,ticker:t,directoryVerified:true};
 for(const k of ['sector','marketCap','country'])if(b.profile?.[k]!=null)profile[k]=b.profile[k];
 return{...b,...d,profile,quote:d.quote?.price>0?d.quote:b.quote||null,priceSource:d.quote?.price>0?d.priceSource:b.priceSource,bars:d.bars||[],financials:financials(d.financials,b.financials),news:d.news||[],filings:[...new Map([...(d.filings||[]),...(b.filings||[])].map(f=>[f.accession||f.url,f])).values()],health:d.health||[],retrievedAt:d.retrievedAt||b.retrievedAt,snapshotOnly:true,connectionState:'Free public archive · dated evidence',provenance:{mode:'PUBLIC_ARCHIVE',cost:'FREE',source:'SEC, official macro records and retained market snapshots',verifiedAt:new Date().toISOString(),freshness:'Original observation timestamps are preserved.'}};
}
const routes=/^\/api\/(?:health|market-status|search|screener|(?:stock|bars|profile|financials|news|filings|analyst|earnings|positioning|options|fund)\/[^/]+|information\/(?:health|stock\/[^/]+))$/;
export async function freeRoute(request,env={},read=archive){
 const u=new URL(request.url);if(!routes.test(u.pathname))return null;
 const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGIN||'https://lanqston.github.io').split(',').map(x=>x.trim()),headers={'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
 if(origin&&allowed.includes(origin))headers['Access-Control-Allow-Origin']=origin;
 const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!allowed.includes(origin))return respond({error:'ORIGIN_NOT_ALLOWED'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}});
 if(request.method!=='GET')return respond({error:'READ_ONLY_RESEARCH_API'},405);
 try{
  const p=u.pathname;
  if(p==='/api/health')return respond({ok:true,service:'Recovery OS free research API',version:2,freeResearch:true,mode:'PUBLIC_ARCHIVE',paidRequests:false,storage:!!env.DB,watchMonitoring:false,time:new Date().toISOString()});
  if(p==='/api/information/health'){const c=await read('data/information/connectors.json').catch(()=>null);return respond({ok:true,freeResearch:true,mode:'PUBLIC_ARCHIVE',asOf:c?.generatedAt||null,providers:c?.providers||[],historyDatabaseConfigured:!!env.DB,trackerAccess:'READ_ONLY',releaseEnabled:false})}
  if(p==='/api/search'||p==='/api/screener'){
   const {index,rows}=await indexRows(read),q=(u.searchParams.get('q')||'').trim().toUpperCase();let selected=rows.filter(x=>!q||(x.ticker+' '+x.name).toUpperCase().includes(q));
   if(p.endsWith('screener'))for(const [param,key]of [['minPrice','price'],['minMarketCap','marketCap']]){const v=u.searchParams.get(param);if(v!==null&&v!==''&&Number.isFinite(+v))selected=selected.filter(x=>F.finite(x[key])&&x[key]>=+v)}
   selected.sort((a,b)=>(a.ticker===q?-1:b.ticker===q?1:0)||(b.marketCap||0)-(a.marketCap||0));
   const unsupported=['minAvgVolume','maxPE','minROE','maxDebtToEquity'].filter(k=>u.searchParams.get(k));
   return respond({results:unsupported.length?[]:selected.slice(0,p.endsWith('search')?24:200),total:selected.length,coverage:'Free public directory and dated atlas',asOf:index.retrievedAt,unsupportedFilters:unsupported,limitation:unsupported.length?'These filters require fields absent from the broad atlas; they were not silently ignored.':null});
  }
  if(p==='/api/market-status')return respond({market:null,dataState:'UNAVAILABLE',freeResearch:true,reason:'The archive does not supply a live exchange-session endpoint. Use the dated quote in each company world.'});
  const t=decodeURIComponent(p.split('/').at(-1)),b=await archiveBundle(t,read),section=p.split('/').at(-2);
  if(section==='stock')return respond({stock:b,...(p.includes('/information/')?{dossier:F.normalize(b)}:{})});
  if(section==='profile')return respond(b.profile);
  if(section==='financials')return respond(b.financials);
  if(section==='earnings')return respond({status:'REPORTED SEC RESULTS · estimates unavailable',next:null,history:/ETF/.test(b.profile.typeCode||b.profile.securityType||'')?[]:b.financials.quarterly.map(r=>({date:r.filingDate||null,fiscal_period:r.period,periodEnd:r.endDate,eps:r.dilutedEPS??null,revenue:r.revenue??null,eps_estimate:null,revenue_estimate:null,source:r.source,currency:r.currency,reportingBasis:'As disclosed in the SEC filing'}))});
  if(section==='positioning')return respond({status:'OFFICIAL FILING DISCOVERY · transaction totals not parsed',float:null,shortInterest:null,institutionalOwnership:null,insiders:[],filings:b.filings.filter(f=>/^(4|4\/A|SC 13[DG](\/A)?)$/.test(f.form)),reason:'Open the original ownership disclosures; filings are not aggregate ownership or short-interest data.'});
  if(section==='filings')return respond({items:b.filings});
  if(section==='news')return respond(b.news);
  if(section==='bars'){
   const interval=u.searchParams.get('interval')||'1d';
   if(interval!=='1d')return respond({bars:[],status:'UNAVAILABLE',requestedInterval:interval,availableIntervals:b.bars.length?['1d']:[],limitation:'The free archive contains daily bars. Intraday or weekly bars were not substituted.'});
   return respond({bars:b.bars,dataState:'DATED DAILY HISTORY',interval:'1d',asOf:b.bars.at(-1)?.date||null,source:b.priceSource,limitation:b.bars.length?null:'No daily series has been collected for this security.'});
  }
  const sources=[{title:'SEC issuer archive',url:b.profile.cik?'https://www.sec.gov/edgar/browse/?CIK='+b.profile.cik:'https://www.sec.gov/edgar/search/'},{title:'Original market record',url:b.priceSource?.url}].filter(x=>x.url);
  return respond({status:'UNAVAILABLE',mode:'FREE_SOURCES_ONLY',category:section,ticker:b.profile.ticker,reason:'No compatible free '+section+' record is connected. This endpoint makes no paid-provider request.',sources,contracts:[],history:[],ratings:[],holdings:[],insiders:[],consensus:null,next:null,priceTarget:null});
 }catch(e){return respond({error:e.status?e.message:'FREE_RESEARCH_UNAVAILABLE',mode:'PUBLIC_ARCHIVE',fallback:'Use the last saved company research and its original source links.'},e.status||503)}
}
