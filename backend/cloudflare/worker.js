import {informationRoute,scheduledInformation,client as reliableClient} from './information.mjs';
import {freeRoute} from './free-api.mjs';
/** Recovery OS Research API — Cloudflare Worker reference implementation.
 * Public reads need no key. Optional private state: RECOVERY_CLIENT_TOKEN.
 * Optional binding: DB (D1). Canonical recovery tracker is NEVER written here.
 */
const MASSIVE='https://api.massive.com';
const ALLOWED_ORIGIN='https://lanqston.github.io';
const CACHE_TTL={search:86400,profile:86400,bars:300,financials:21600,news:300,filings:1800,positioning:3600,options:60,screener:300};
export default {
 async fetch(request,env,ctx){return await freeRoute(request,env)||await informationRoute(request,env)||handle(request,env,ctx)},
 async scheduled(event,env,ctx){ctx.waitUntil(scheduledInformation(env))}
};
function cors(request,env){const origin=request.headers.get('Origin')||'';const allowed=(env.ALLOWED_ORIGIN||ALLOWED_ORIGIN).split(',').map(x=>x.trim());const ok=!origin||allowed.includes(origin)||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);return {'Access-Control-Allow-Origin':ok&&origin?origin:allowed[0],'Vary':'Origin','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, PUT, POST, OPTIONS','Cache-Control':'no-store'}}
function json(request,env,body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json;charset=utf-8',...cors(request,env),...extra}})}
function err(request,env,status,error,detail=null){return json(request,env,{error,detail},status)}
async function handle(request,env,ctx){if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(request,env)});const u=new URL(request.url),p=u.pathname;try{
 if(p==='/api/health')return json(request,env,{ok:true,service:'Recovery OS Research API',time:new Date().toISOString(),marketProvider:!!env.MASSIVE_API_KEY,storage:!!env.DB,watchMonitoring:env.WATCH_MONITORING_ENABLED==='true'});
 if(p==='/api/market-status'&&request.method==='GET')return json(request,env,await marketStatus(env,ctx));
 if(p==='/api/search'&&request.method==='GET')return json(request,env,await search(u.searchParams.get('q')||'',env,ctx));
 const m=p.match(/^\/api\/stock\/([^/]+)$/);if(m&&request.method==='GET')return json(request,env,{stock:await stockBundle(decodeURIComponent(m[1]),env,ctx)});
 const b=p.match(/^\/api\/bars\/([^/]+)$/);if(b&&request.method==='GET')return json(request,env,await bars(decodeURIComponent(b[1]),u.searchParams,env,ctx));
 const f=p.match(/^\/api\/financials\/([^/]+)$/);if(f&&request.method==='GET')return json(request,env,await financials(decodeURIComponent(f[1]),env,ctx));
 const n=p.match(/^\/api\/news\/([^/]+)$/);if(n&&request.method==='GET')return json(request,env,await news(decodeURIComponent(n[1]),env,ctx));
 const sf=p.match(/^\/api\/filings\/([^/]+)$/);if(sf&&request.method==='GET')return json(request,env,await filings(decodeURIComponent(sf[1]),env,ctx));
 const an=p.match(/^\/api\/analyst\/([^/]+)$/);if(an&&request.method==='GET')return json(request,env,await analyst(decodeURIComponent(an[1]),env,ctx));
 const er=p.match(/^\/api\/earnings\/([^/]+)$/);if(er&&request.method==='GET')return json(request,env,await earningsData(decodeURIComponent(er[1]),env,ctx));
 const po=p.match(/^\/api\/positioning\/([^/]+)$/);if(po&&request.method==='GET')return json(request,env,await positioning(decodeURIComponent(po[1]),env,ctx));
 const op=p.match(/^\/api\/options\/([^/]+)$/);if(op&&request.method==='GET')return json(request,env,await options(decodeURIComponent(op[1]),u.searchParams,env,ctx));
 if(p==='/api/screener'&&request.method==='GET')return json(request,env,await screener(u.searchParams,env,ctx));
 if(p==='/api/state'&&request.method==='GET'){if(!authorized(request,env))return err(request,env,401,'Unauthorized');return json(request,env,{state:await getState(env)})}
 if(p==='/api/state'&&request.method==='PUT'){if(!authorized(request,env))return err(request,env,401,'Unauthorized');const body=await request.json();await putState(env,body.state);return json(request,env,{ok:true})}
 if(p==='/api/watch'&&request.method==='POST'){if(!authorized(request,env))return err(request,env,401,'Unauthorized');const body=await request.json();return json(request,env,await putWatch(env,body))}
 return err(request,env,404,'Route not found');
 }catch(e){console.error('Research API error',e.code||e.name);const status=e.status||500;return err(request,env,status,e.code||'Research provider unavailable',null)}}
function authorized(req,env){if(!env.RECOVERY_CLIENT_TOKEN)return false;return req.headers.get('Authorization')===`Bearer ${env.RECOVERY_CLIENT_TOKEN}`}
function symbol(raw){const t=String(raw||'').trim().toUpperCase();if(!/^[A-Z0-9.\-]{1,12}$/.test(t))throw Object.assign(new Error('Invalid ticker'),{status:400});return t}
async function mfetch(path,params,env,ctx,ttl=300){if(!env.MASSIVE_API_KEY)throw Object.assign(new Error('Market provider is not configured'),{status:503});const u=new URL(MASSIVE+path);Object.entries(params||{}).forEach(([k,v])=>v!=null&&u.searchParams.set(k,String(v)));const result=await reliableClient(env)({provider:'massive',url:u.href,headers:{Authorization:`Bearer ${env.MASSIVE_API_KEY}`},ttl,limit:5,windowSeconds:60});return result.data}

async function marketStatus(env,ctx){const d=await mfetch('/v1/marketstatus/now',{},env,ctx,30);return{market:d.market||null,earlyHours:d.earlyHours??null,afterHours:d.afterHours??null,nasdaq:d.exchanges?.nasdaq??d.exchanges_nasdaq??null,nyse:d.exchanges?.nyse??d.exchanges_nyse??null,serverTime:d.serverTime||null,dataState:'PROVIDER MARKET STATUS'}}
async function search(q,env,ctx){
 q=q.trim();
 if(!q)return{results:[],coverage:'No query'};
 const d=await mfetch('/v3/reference/tickers',{market:'stocks',locale:'us',active:'true',search:q,limit:24,sort:'ticker',order:'asc'},env,ctx,CACHE_TTL.search);
 const supported=new Set(['CS','ETF','ADRC','ADRP']);
 const rows=(d.results||[]).map(x=>({
   ticker:x.ticker,name:x.name,exchange:x.primary_exchange,type:typeName(x.type),typeCode:x.type,
   active:x.active,market:x.market,locale:x.locale,supported:supported.has(x.type),
   unsupportedReason:supported.has(x.type)?null:`${typeName(x.type)} is outside the current first-phase stock/ADR/ETF research scope.`
 }));
 rows.sort((a,b)=>(b.supported-a.supported)||a.ticker.localeCompare(b.ticker));
 return{results:rows.slice(0,12),coverage:'Massive supported U.S. stocks universe; first-phase research supports common stocks, ADRs and ETFs',asOf:new Date().toISOString()}
}
async function profile(t,env,ctx){t=symbol(t);const d=await mfetch(`/v3/reference/tickers/${encodeURIComponent(t)}`,{},env,ctx,CACHE_TTL.profile),x=d.results||d;return{ticker:x.ticker,name:x.name,exchangeCode:x.primary_exchange,exchange:x.primary_exchange,securityType:typeName(x.type),typeCode:x.type,market:x.locale==='us'?'US Stocks':x.market,currency:(x.currency_name||'').toUpperCase(),cik:x.cik||null,marketCap:x.market_cap??null,employees:x.total_employees??null,listDate:x.list_date??null,homepage:x.homepage_url??null,description:x.description??null,sic:x.sic_code??null,sicDescription:x.sic_description??null,sharesOutstanding:x.share_class_shares_outstanding??x.weighted_shares_outstanding??null}}
function typeName(t){return({CS:'Common Stock',ETF:'ETF',ADRC:'ADR',ADRP:'ADR',PFD:'Preferred Stock',UNIT:'Unit',RIGHT:'Right',WARRANT:'Warrant'}[t]||t||'Unknown')}
function dateET(d=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${o.year}-${o.month}-${o.day}`}
function priorDate(days){const d=new Date(Date.now()-days*864e5);return dateET(d)}
async function bars(t,sp,env,ctx){t=symbol(t);const range=(sp?.get?.('range')||'1y').toLowerCase(),interval=(sp?.get?.('interval')||'1d').toLowerCase();const cfg={
 '15m':{mult:15,span:'minute',days:10,limit:5000},'1h':{mult:1,span:'hour',days:45,limit:5000},'1d':{mult:1,span:'day',days:{'1m':45,'3m':110,'6m':220,'1y':380,'2y':760}[range]||380,limit:5000},'1w':{mult:1,span:'week',days:{'1y':420,'2y':800,'5y':1900}[range]||800,limit:5000}}[interval];if(!cfg)throw Object.assign(new Error('Unsupported interval'),{status:400});const from=priorDate(cfg.days),to=dateET();const d=await mfetch(`/v2/aggs/ticker/${encodeURIComponent(t)}/range/${cfg.mult}/${cfg.span}/${from}/${to}`,{adjusted:'true',sort:'asc',limit:cfg.limit},env,ctx,CACHE_TTL.bars);const rows=(d.results||[]).map(x=>({date:new Date(x.t).toISOString(),open:x.o,high:x.h,low:x.l,close:x.c,volume:x.v,vwap:x.vw??null}));return{ticker:t,interval,adjusted:true,adjustmentConvention:'Provider adjusted=true (splits/corporate-action convention per provider documentation)',bars:rows,asOf:rows.at(-1)?.date||null,dataState:'HISTORICAL / PLAN-DEPENDENT DELAY'}}

function perfAt(rows,days){if(!rows.length)return null;const latest=rows.at(-1),cut=new Date(latest.date+'T12:00:00Z').getTime()-days*864e5;let ref=rows[0];for(const r of rows){if(new Date(r.date+'T12:00:00Z').getTime()<=cut)ref=r;else break}return ref?.close?((latest.close/ref.close)-1)*100:null}
async function extendedFor(t,date,env,ctx){if(!date)return null;try{const d=await mfetch(`/v1/open-close/${encodeURIComponent(t)}/${String(date).slice(0,10)}`,{adjusted:'true'},env,ctx,300);return{preMarket:d.preMarket??null,preMarketDate:d.from??String(date).slice(0,10),afterHours:d.afterHours??null,afterHoursDate:d.from??String(date).slice(0,10),extended:d.afterHours??d.preMarket??null,extendedTimestamp:`${d.from||String(date).slice(0,10)} extended-session values; exact quote timestamps are not supplied by this daily endpoint`}}catch(e){return null}}
function quoteFromBars(rows){
 if(!rows.length)return null;
 const z=rows.at(-1),p=rows.at(-2),year=rows.slice(-252),lo=Math.min(...year.map(x=>x.low)),hi=Math.max(...year.map(x=>x.high));
 const sample=year.slice(-20),avg20=sample.reduce((a,x)=>a+(x.volume||0),0)/Math.max(1,sample.length);
 const avgDollar20=sample.reduce((a,x)=>a+((x.volume||0)*(x.close||0)),0)/Math.max(1,sample.length);
 return{price:z.close,change:p?z.close-p.close:null,changePct:p?(z.close/p.close-1)*100:null,session:'REGULAR CLOSE',timestamp:`${String(z.date).slice(0,10)} regular-session close ET`,dataState:'HISTORICAL / PLAN-DEPENDENT DELAY',regular:z.close,extended:null,extendedTimestamp:null,open:z.open,high:z.high,low:z.low,previousClose:p?.close??null,volume:z.volume,avgVolume20:avg20,avgDollarVolume20:avgDollar20,relativeVolume:avg20?z.volume/avg20:null,dayRange:[z.low,z.high],range52w:[lo,hi],from52wHighPct:(z.close/hi-1)*100,above52wLowPct:(z.close/lo-1)*100,performancePct:{'1W':perfAt(year,7),'1M':perfAt(year,30),'3M':perfAt(year,90),'6M':perfAt(year,180),'1Y':perfAt(year,365)}}
}
async function financials(t,env,ctx){t=symbol(t);try{const fetchFrame=tf=>mfetch('/vX/reference/financials',{ticker:t,timeframe:tf,include_sources:'true',limit:8,order:'desc',sort:'period_of_report_date'},env,ctx,CACHE_TTL.financials);const [q,a]=await Promise.all([fetchFrame('quarterly'),fetchFrame('annual')]);return{quarterly:(q.results||[]).map(normalizeFinancial),annual:(a.results||[]).map(normalizeFinancial),valuation:{status:'Financial ratios are fetched separately and may require an additional entitlement'}}}catch(e){if(e.status===403||e.status===401)return{quarterly:[],annual:[],valuation:{status:'NOT ENTITLED'},limitation:e.message};throw e}}

function fv(o,path){return path.split('.').reduce((a,k)=>a?.[k],o)?.value??null}
function normalizeFinancial(x){
 const f=x.financials||{},inc=f.income_statement||{},bs=f.balance_sheet||{},cf=f.cash_flow_statement||{};
 const val=(obj,...keys)=>{for(const k of keys){if(obj?.[k]?.value!=null)return obj[k].value}return null};
 const revenue=val(inc,'revenues','revenue'),gross=val(inc,'gross_profit'),op=val(inc,'operating_income_loss'),net=val(inc,'net_income_loss');
 const ocf=val(cf,'net_cash_flow_from_operating_activities','net_cash_flow_from_operating_activities_continuing');
 const rawCapex=val(cf,'capital_expenditure','capital_expenditures','payments_to_acquire_property_plant_and_equipment','payments_to_acquire_productive_assets');
 const capex=rawCapex==null?null:Math.abs(rawCapex);
 const cash=val(bs,'cash_and_cash_equivalents','cash_cash_equivalents_restricted_cash_and_restricted_cash_equivalents','cash_and_due_from_banks');
 const longDebt=val(bs,'long_term_debt','long_term_debt_noncurrent');
 const currentDebt=val(bs,'current_debt','short_term_debt');
 const totalDebt=(longDebt==null||currentDebt==null)?null:longDebt+currentDebt;
 return{
   period:`${x.fiscal_period||''} FY${x.fiscal_year||''}`.trim(),startDate:x.start_date||null,endDate:x.end_date||null,filingDate:x.filing_date||null,
   currency:inc.revenues?.unit||inc.revenue?.unit||null,revenue,grossProfit:gross,operatingIncome:op,netIncome:net,
   dilutedEPS:val(inc,'diluted_earnings_per_share'),operatingCashFlow:ocf,capitalExpenditure:capex,
   freeCashFlow:(ocf!=null&&capex!=null)?ocf-capex:null,cash,totalDebt,netDebt:(totalDebt!=null&&cash!=null)?totalDebt-cash:null,
   currentAssets:val(bs,'current_assets'),currentLiabilities:val(bs,'current_liabilities'),longTermDebt:longDebt,assets:val(bs,'assets'),
   equity:val(bs,'equity_attributable_to_parent','equity'),grossMarginPct:revenue&&gross!=null?gross/revenue*100:null,
   operatingMarginPct:revenue&&op!=null?op/revenue*100:null,netMarginPct:revenue&&net!=null?net/revenue*100:null,
   currentRatio:(val(bs,'current_assets')!=null&&val(bs,'current_liabilities'))?val(bs,'current_assets')/val(bs,'current_liabilities'):null,
   dilutedShares:val(inc,'diluted_average_shares'),source:x.source_filing_url||null,
   capexStatus:capex==null?'UNAVAILABLE IN ACCESSIBLE STANDARDIZED FEED':'REPORTED / STANDARDIZED TAG'
 }
}
async function ratios(t,env,ctx){
 t=symbol(t);
 try{
  const d=await mfetch('/stocks/financials/v1/ratios',{ticker:t,limit:1},env,ctx,CACHE_TTL.financials),x=(d.results||[])[0]||{};
  return{asOf:x.date||null,price:x.price??null,averageVolume:x.average_volume??null,marketCap:x.market_cap??null,earningsPerShare:x.earnings_per_share??null,
   priceToEarnings:x.price_to_earnings??null,forwardPE:null,priceToSales:x.price_to_sales??null,evRevenue:x.ev_to_sales??null,evEbitda:x.ev_to_ebitda??null,
   priceToBook:x.price_to_book??null,priceToCashFlow:x.price_to_cash_flow??null,priceToFreeCashFlow:x.price_to_free_cash_flow??null,
   freeCashFlowYield:x.price_to_free_cash_flow?100/x.price_to_free_cash_flow:null,dividendYield:x.dividend_yield==null?null:x.dividend_yield*100,
   returnOnAssets:x.return_on_assets==null?null:x.return_on_assets*100,returnOnEquity:x.return_on_equity==null?null:x.return_on_equity*100,
   debtToEquity:x.debt_to_equity??null,currentRatio:x.current??null,quickRatio:x.quick??null,cashRatio:x.cash??null,
   enterpriseValue:x.enterprise_value??null,freeCashFlow:x.free_cash_flow??null,status:'AVAILABLE · TTM / POINT-IN-TIME RATIO DATA'}
 }catch(e){return{priceToEarnings:null,forwardPE:null,priceToSales:null,evRevenue:null,evEbitda:null,priceToBook:null,priceToCashFlow:null,priceToFreeCashFlow:null,freeCashFlowYield:null,dividendYield:null,returnOnAssets:null,returnOnEquity:null,debtToEquity:null,currentRatio:null,quickRatio:null,cashRatio:null,enterpriseValue:null,freeCashFlow:null,status:e.status===403||e.status===401?'NOT ENTITLED · FINANCIALS & RATIOS':`UNAVAILABLE: ${e.message}`}}
}
async function news(t,env,ctx){
 t=symbol(t);const d=await mfetch('/v2/reference/news',{ticker:t,limit:30,order:'desc',sort:'published_utc'},env,ctx,CACHE_TTL.news),seen=new Set();
 return(d.results||[]).filter(x=>{const key=(x.title||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').slice(0,100);if(seen.has(key))return false;seen.add(key);return true}).map(x=>({
   id:x.id,sourceType:'NEWS',publisher:x.publisher?.name||'News',title:x.title,published:x.published_utc,eventDate:null,url:x.article_url,
   tickers:Array.isArray(x.tickers)?x.tickers:[],why:x.description||'Article associated with this ticker. Review the source before attributing price reaction.',materiality:'UNRATED'
 }))
}
async function filings(t,env,ctx){const p=await profile(t,env,ctx);if(!p.cik)return{items:[],limitation:'No CIK available'};const cik=String(p.cik).padStart(10,'0'),ua=env.SEC_USER_AGENT;if(!ua)throw Object.assign(new Error('SEC_USER_AGENT is not configured'),{status:503});const result=await reliableClient(env)({provider:'sec',url:`https://data.sec.gov/submissions/CIK${cik}.json`,headers:{'User-Agent':ua},ttl:1800,limit:2,windowSeconds:1});const d=result.data,rec=d.filings?.recent||{},items=[];for(let i=0;i<Math.min((rec.form||[]).length,80);i++){if(!['10-K','10-Q','8-K','20-F','6-K'].includes(rec.form[i]))continue;const acc=rec.accessionNumber[i],doc=rec.primaryDocument[i],base=`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(acc).replace(/-/g,'')}/`;items.push({id:`sec-${acc}`,sourceType:'OFFICIAL',publisher:'SEC EDGAR',form:rec.form[i],title:`${p.name||t} ${rec.form[i]} filing`,published:globalThis.RecoveryInformation.iso(rec.acceptanceDateTime?.[i])||globalThis.RecoveryInformation.dayEnd(rec.filingDate[i]),eventDate:rec.reportDate[i]||null,filingDate:rec.filingDate[i],reportDate:rec.reportDate[i]||null,accessionNumber:acc,primaryDocument:doc,url:base+doc,why:rec.form[i]==='8-K'?'Official current report; review item-level disclosures before inferring market impact.':'Official periodic filing for reported financial condition, operating results and risk disclosures.',materiality:rec.form[i]==='10-K'||rec.form[i]==='10-Q'?'HIGH':'UNRATED'})}return{ticker:t,cik,items,asOf:new Date().toISOString()}}
async function analyst(t,env,ctx){t=symbol(t);try{const [c,r]=await Promise.all([mfetch(`/benzinga/v1/consensus-ratings/${encodeURIComponent(t)}`,{ticker:t,limit:1},env,ctx,1800),mfetch('/benzinga/v1/ratings',{ticker:t,limit:20,sort:'last_updated.desc'},env,ctx,1800)]);const consensus=(c.results||[])[0]||c.results||null,ratings=r.results||[];let priceTarget=null;if(consensus){priceTarget={low:consensus.price_target_low??consensus.low_price_target??null,high:consensus.price_target_high??consensus.high_price_target??null,average:consensus.price_target_average??consensus.average_price_target??null}}return{status:'AVAILABLE · BENZINGA PARTNER DATA',consensus,ratings,priceTarget,asOf:new Date().toISOString()}}catch(e){return{status:e.status===403||e.status===401?'NOT ENTITLED · BENZINGA ANALYST DATASET':`UNAVAILABLE: ${e.message}`,consensus:null,ratings:[],priceTarget:null}}}
async function earningsData(t,env,ctx){t=symbol(t);try{const d=await mfetch('/benzinga/v1/earnings',{ticker:t,limit:16,sort:'date.desc'},env,ctx,1800),rows=d.results||[];const now=dateET(),future=rows.filter(x=>String(x.date||'')>=now).sort((a,b)=>String(a.date).localeCompare(String(b.date))),past=rows.filter(x=>String(x.date||'')<now).sort((a,b)=>String(b.date).localeCompare(String(a.date)));return{status:'AVAILABLE · BENZINGA PARTNER DATA',history:past,next:future[0]||null,asOf:new Date().toISOString(),note:'date_status from provider distinguishes confirmed/estimated timing when supplied'}}catch(e){return{status:e.status===403||e.status===401?'NOT ENTITLED · BENZINGA EARNINGS DATASET':`UNAVAILABLE: ${e.message}`,history:[],next:null}}}
async function positioning(t,env,ctx){t=symbol(t);const results={float:null,shortInterest:null,insiders:[],institutionalOwnership:null,status:'PARTIAL'};const calls=await Promise.allSettled([mfetch('/stocks/vX/float',{ticker:t,limit:1},env,ctx,CACHE_TTL.positioning),mfetch('/stocks/v1/short-interest',{ticker:t,limit:4,sort:'settlement_date.desc'},env,ctx,CACHE_TTL.positioning),mfetch('/stocks/filings/vX/form-4',{tickers:t,limit:20,sort:'filing_date.desc'},env,ctx,CACHE_TTL.positioning)]);if(calls[0].status==='fulfilled'){const x=(calls[0].value.results||[])[0];if(x)results.float={shares:x.free_float??null,percent:x.free_float_percent??null,effectiveDate:x.effective_date??null}}if(calls[1].status==='fulfilled'){const x=(calls[1].value.results||[])[0];if(x)results.shortInterest={shares:x.short_interest??null,avgDailyVolume:x.avg_daily_volume??null,daysToCover:x.days_to_cover??null,settlementDate:x.settlement_date??null}}if(calls[2].status==='fulfilled')results.insiders=(calls[2].value.results||[]).map(x=>({owner:x.owner_name,title:x.officer_title,filingDate:x.filing_date,transactionDate:x.transaction_date,code:x.transaction_code,classification:form4Class(x),shares:x.transaction_shares,price:x.transaction_price_per_share,acquiredDisposed:x.transaction_acquired_disposed,plan10b5:!!x.aff_10b5_one,security:x.security_title}));results.limitations=calls.map((x,i)=>x.status==='rejected'?['float','shortInterest','insiders'][i]+': '+x.reason.message:null).filter(Boolean);results.status=results.limitations.length?'PARTIAL · '+results.limitations.join(' | '):'AVAILABLE';return results}
function form4Class(x){const c=x.transaction_code;if(c==='P')return'OPEN-MARKET PURCHASE';if(c==='S')return'SALE';if(c==='A')return String(x.security_type||'').includes('derivative')?'GRANT / DERIVATIVE ACQUISITION':'ACQUISITION / GRANT';if(c==='M')return'OPTION EXERCISE / CONVERSION';if(c==='F')return'TAX / EXERCISE PAYMENT';if(c==='G')return'GIFT';return`FORM 4 CODE ${c||'UNKNOWN'}`}

async function options(t,sp,env,ctx){t=symbol(t);try{const d=await mfetch(`/v3/snapshot/options/${encodeURIComponent(t)}`,{limit:Math.min(250,Number(sp?.get?.('limit'))||100)},env,ctx,CACHE_TTL.options);return{status:'AVAILABLE',contracts:d.results||[],asOf:new Date().toISOString(),note:'Greeks/IV/open-interest fields depend on options plan; timestamps come from each contract snapshot.'}}catch(e){return{status:e.status===403||e.status===401?'NOT ENTITLED':`UNAVAILABLE: ${e.message}`,contracts:[]}}}
async function fundData(t,env,ctx){
 try{
  const [p,h]=await Promise.all([mfetch('/etf-global/v1/profiles',{composite_ticker:t,limit:1},env,ctx,21600),mfetch('/etf-global/v1/constituents',{composite_ticker:t,limit:100,sort:'constituent_rank.asc'},env,ctx,21600)]),x=(p.results||[])[0]||null;
  const holdings=(h.results||[]).map(z=>({ticker:z.constituent_ticker||null,name:z.constituent_name||null,weight:z.weight??null,rank:z.constituent_rank??null,marketValue:z.market_value??null,effectiveDate:z.effective_date??null}));
  const top10=holdings.slice(0,10).reduce((a,z)=>a+(Number(z.weight)||0),0);
  return{benchmark:x?.primary_benchmark??null,assets:x?.aum??null,expenseRatio:x?.net_expenses??x?.total_expenses??null,distributionFrequency:x?.distribution_frequency??null,
   category:x?.category??null,focus:x?.focus??null,assetClass:x?.asset_class??null,numHoldings:x?.num_holdings??holdings.length,avgDailyVolume:x?.avg_daily_trading_volume??null,
   effectiveDate:x?.effective_date??holdings[0]?.effectiveDate??null,processedDate:x?.processed_date??null,holdings,top10Concentration:holdings.length?top10:null,status:'AVAILABLE · ETF GLOBAL PARTNER DATA'}
 }catch(e){return{benchmark:null,assets:null,expenseRatio:null,holdings:[],distributions:[],status:e.status===403||e.status===401?'ETF GLOBAL NOT ENTITLED':`ETF DATA UNAVAILABLE: ${e.message}`}}
}
function researchRecoveryAssessment(p,q){
 const mcap=p?.marketCap,price=q?.price,avgDollar=q?.avgDollarVolume20,drawdown=q?.from52wHighPct==null?null:Math.abs(q.from52wHighPct),aboveLow=q?.above52wLowPct;
 const gates={marketCap:mcap==null?'UNKNOWN':mcap>=500000000?'PASS':'FAIL',price:price==null?'UNKNOWN':price>=3?'PASS':'FAIL',liquidity:avgDollar==null?'UNKNOWN':avgDollar>=10000000?'PASS':'FAIL',drawdown:drawdown==null?'UNKNOWN':drawdown>=40?'PASS':'FAIL',proximityToLow:aboveLow==null?'UNKNOWN':aboveLow<=25?'PASS':'FAIL'};
 const vals=Object.values(gates),objective=vals.includes('FAIL')?'FAIL':vals.every(x=>x==='PASS')?'PASS':'UNKNOWN';
 const missing=['Verified crisis / depression cause','Common-equity survival review','At least one evidenced recovery catalyst','Stabilization / price-structure confirmation'];
 return{tracked:false,normalScreen:objective,headline:'GENERAL RESEARCH ONLY — NOT QUALIFIED',declineCause:'NOT RESEARCHED BY THE RECOVERY SCANNER IN THIS GENERAL STOCK LOOKUP',crisisState:'UNASSESSED',businessRecovery:'UNASSESSED — objective market gates are not a substitute for business-recovery evidence',priceStructure:q?`Latest loaded price is ${q.from52wHighPct?.toFixed?.(1)??'N/A'}% from the 52-week high and ${q.above52wLowPct?.toFixed?.(1)??'N/A'}% above the 52-week low.`:'UNAVAILABLE',classification:objective==='PASS'?'OBJECTIVE SCREEN PASS · FORMAL RECOVERY RESEARCH STILL REQUIRED':objective==='FAIL'?'OBJECTIVE SCREEN FAIL · GENERAL RESEARCH':'OBJECTIVE SCREEN INCOMPLETE',scannerGates:gates,qualification:'NO — SEARCHING A STOCK NEVER QUALIFIES IT',missingEvidence:missing,invalidation:'No recovery thesis exists until a formal scanner/research episode is opened.'}
}
async function stockBundle(t,env,ctx){
 t=symbol(t);
 const [pp,bb,ff,nn]=await Promise.allSettled([profile(t,env,ctx),bars(t,new URLSearchParams({range:'1y',interval:'1d'}),env,ctx),financials(t,env,ctx),news(t,env,ctx)]);
 if(pp.status==='rejected')throw pp.reason;
 const p=pp.value,b=bb.status==='fulfilled'?bb.value:{bars:[],limitation:bb.reason.message},fin=ff.status==='fulfilled'?ff.value:{quarterly:[],annual:[],valuation:{status:ff.reason.message}},nv=await ratios(t,env,ctx);
 fin.valuation=nv;const isETF=p.typeCode==='ETF',qBase=quoteFromBars(b.bars||[]),ext=await extendedFor(t,b.bars?.at(-1)?.date,env,ctx),q=Object.assign(qBase||{},ext||{});
 let sec=[];try{sec=(await filings(t,env,ctx)).items||[]}catch(e){console.warn('SEC timeline unavailable',e)}
 const timeline=[...(nn.status==='fulfilled'?nn.value:[]),...sec].sort((a,b)=>String(b.published||b.filingDate||'').localeCompare(String(a.published||a.filingDate||'')));
 return{profile:p,quote:q,bars:b.bars||[],financials:isETF?null:fin,news:timeline,
  earnings:{history:[],next:null,status:'Benzinga earnings dataset not loaded; use on-demand endpoint if entitled.'},
  analyst:{status:'Benzinga analyst dataset not loaded; use on-demand endpoint if entitled.',consensus:null,ratings:[],priceTarget:null},
  positioning:{float:null,shortInterest:null,institutionalOwnership:null,insiders:[],status:'Load Positioning endpoint for on-demand detail.'},
  options:{status:'Load Options endpoint on demand; entitlement depends on options plan.',contracts:[]},fund:isETF?await fundData(t,env,ctx):null,
  recoveryAssessment:researchRecoveryAssessment(p,q),whatMatters:summaryFrom(p,q,fin),
  provenance:{profile:'Massive reference',bars:b.dataState||'Unavailable',financials:ff.status==='fulfilled'?'Massive SEC-derived financials':'Unavailable',news:nn.status==='fulfilled'?'Massive news + SEC EDGAR':'SEC EDGAR only',generatedAt:new Date().toISOString()}}
}
function summaryFrom(p,q,f){const out=[];if(q)out.push({type:'MARKET DATA',text:`Latest available close ${q.price}; ${q.from52wHighPct?.toFixed(1)}% from the 52-week high and ${q.above52wLowPct?.toFixed(1)}% above the 52-week low.`});const x=f?.quarterly?.[0];if(x)out.push({type:'FACT',text:`Latest loaded fiscal period ${x.period}: revenue ${x.revenue} and net income ${x.netIncome} ${x.currency}.`});out.push({type:'INTERPRETATION',text:'Recovery qualification is intentionally separate. Searching this security does not add it to the Recovery OS tracker.'});return out}
async function screener(sp,env,ctx){
 const view=sp.get('view')||'custom',num=k=>{const v=sp.get(k);return v==null||v===''?null:Number(v)},minPrice=num('minPrice')??3,minMarketCap=num('minMarketCap'),minAvgVolume=num('minAvgVolume'),maxPE=num('maxPE'),minROE=num('minROE'),maxDebtToEquity=num('maxDebtToEquity');
 try{
  const params={limit:Math.min(500,Number(sp.get('limit'))||200),sort:'market_cap.desc'};
  params['price.gte']=minPrice;
  if(minMarketCap!=null)params['market_cap.gte']=minMarketCap;
  if(minAvgVolume!=null)params['average_volume.gte']=minAvgVolume;
  if(maxPE!=null)params['price_to_earnings.lte']=maxPE;
  if(minROE!=null)params['return_on_equity.gte']=minROE/100;
  if(maxDebtToEquity!=null)params['debt_to_equity.lte']=maxDebtToEquity;
  if(view==='profitability')params['return_on_equity.gte']=Math.max(Number(params['return_on_equity.gte']||0),0.10);
  const d=await mfetch('/stocks/financials/v1/ratios',params,env,ctx,CACHE_TTL.screener);
  return{coverage:'Massive Financials & Ratios supported U.S. company universe',asOf:new Date().toISOString(),criteria:{view,minPrice,minMarketCap,minAvgVolume,maxPE,minROE,maxDebtToEquity},
   limitation:view==='recovery'?'This is a financial/liquidity prefilter only. Full Recovery OS qualification still requires historical drawdown/proximity gates plus crisis, survival, catalyst and stabilization evidence.':view==='earnings'?'Earnings-window screening requires the optional earnings calendar dataset and is not represented by the ratios endpoint alone.':null,
   results:(d.results||[]).map(x=>({ticker:x.ticker,name:null,type:'Stock',price:x.price,marketCap:x.market_cap,averageVolume:x.average_volume,performancePct:null,drawdownPct:null,pe:x.price_to_earnings??null,roe:x.return_on_equity==null?null:x.return_on_equity*100,debtToEquity:x.debt_to_equity??null,recoveryState:view==='recovery'?'PREFILTER ONLY':'RESEARCH'}))}
 }catch(e){return{coverage:'UNAVAILABLE — FULL-UNIVERSE SCREEN REQUIRES ENTITLED FINANCIALS & RATIOS DATA',asOf:new Date().toISOString(),criteria:{view,minPrice,minMarketCap,minAvgVolume,maxPE,minROE,maxDebtToEquity},results:[],limitation:e.message}}
}
async function getState(env){if(!env.DB)return null;const r=await env.DB.prepare('SELECT payload FROM user_state WHERE id=?').bind('primary').first();return r?JSON.parse(r.payload):null}
async function putState(env,state){if(!env.DB)throw Object.assign(new Error('D1 storage is not configured'),{status:503});await env.DB.prepare('INSERT INTO user_state(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind('primary',JSON.stringify(state||{}),new Date().toISOString()).run()}
async function putWatch(env,w){if(!env.DB)throw Object.assign(new Error('D1 storage is not configured'),{status:503});const id=w.id||crypto.randomUUID(),active=0;await env.DB.prepare('INSERT OR REPLACE INTO watches(id,ticker,metric,operator,value,active,frequency,last_evaluated,last_value,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,symbol(w.ticker),w.metric,w.operator,Number(w.value),active,active?'15 MIN':'MANUAL',null,null,w.createdAt||new Date().toISOString()).run();return{id,active:!!active,frequency:active?'15 MIN':'MANUAL',lastEvaluated:null}}
async function evaluateWatches(env){if(!env.DB||env.WATCH_MONITORING_ENABLED!=='true'||!env.MASSIVE_API_KEY)return;const {results=[]}=await env.DB.prepare('SELECT * FROM watches WHERE active=1').all();for(const w of results){try{let value=null;if(w.metric==='price'){const d=await mfetch(`/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(w.ticker)}`,{},env,null,300),x=d.ticker||d.results||d;value=x?.lastTrade?.p??x?.day?.c??null}const hit=value!=null&&(w.operator==='above'?value>Number(w.value):value<Number(w.value));await env.DB.prepare('UPDATE watches SET last_evaluated=?,last_value=?,last_triggered=? WHERE id=?').bind(new Date().toISOString(),value,hit?new Date().toISOString():null,w.id).run()}catch(e){console.warn('watch failed',w.id,e)}}}
