#!/usr/bin/env node
/* Read-only monitoring: emits reports; never writes a source dossier or recovery tracker. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const F=require('../information-model.js');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
function audit(){
 const findings=[],files=fs.readdirSync(path.join(ROOT,'data/open-research')).filter(n=>/^[A-Z0-9.-]+\.json$/.test(n));
 const add=(ticker,code,detail,severity='review')=>findings.push({ticker,code,detail,severity});
 let bytes=0,bars=0,events=0;
 for(const file of files){
  const raw=fs.readFileSync(path.join(ROOT,'data/open-research',file)),d=JSON.parse(raw);bytes+=raw.length;
  const ticker=file.slice(0,-5),seen=new Set();
  if(d.profile?.ticker!==ticker)add(ticker,'IDENTITY_MISMATCH','File and resolved symbol disagree','quarantine');
  if(!F.iso(d.retrievedAt))add(ticker,'MISSING_RETRIEVAL_TIME','Original collection time not recorded');
  if(raw.length>2e6)add(ticker,'LARGE_DOSSIER','Payload exceeds 2 MB; split history into lazy chunks');
  for(const b of d.bars||[]){bars++;if(!F.finite(b.close)||b.close<=0||F.finite(b.volume)&&b.volume<0)add(ticker,'INVALID_BAR',b.date,'quarantine');
   if(!F.date(b.date))add(ticker,'MISSING_BAR_DATE',String(b.date),'quarantine');
   if(seen.has(b.date))add(ticker,'DUPLICATE_BAR',b.date);seen.add(b.date);
  }
  const last=d.bars?.at(-1);if(last&&Date.now()-Date.parse(F.date(last.date))>F.ttl.prices)add(ticker,'STALE_QUOTE',last.date);
  for(const row of [...(d.financials?.quarterly||[]),...(d.financials?.annual||[])]){
   if(!row.endDate||!row.filingDate)add(ticker,'MISSING_FINANCIAL_PERIOD',row.period||'Unknown');
   for(const key of ['assets','cash','capitalExpenditure'])if(F.finite(row[key])&&row[key]<0)add(ticker,'INVALID_POSITIVE_METRIC',key+' '+row.period,'quarantine');
   if(row.startDate&&row.startDate>row.endDate)add(ticker,'REVERSED_FISCAL_PERIOD',row.period,'quarantine');
   if(!row.currency)add(ticker,'UNKNOWN_CURRENCY',row.period);
   const calculated=F.financialMetrics(row,d).freeCashFlow;
   if(calculated.value!=null&&row.freeCashFlow!=null&&Math.abs(calculated.value-row.freeCashFlow)>.01)add(ticker,'FCF_CONFLICT',row.period+' retained both values for source review');
  }
  for(const group of [d.filings||[],d.news||[]]){const eventKeys=new Set();for(const e of group){events++;const k=e.accession||e.url;if(eventKeys.has(k))add(ticker,'DUPLICATE_EVENT',k);eventKeys.add(k);if(!F.date(e.acceptedAt||e.filed||e.published))add(ticker,'MISSING_PUBLICATION_TIME',e.title||k);}}
  for(const h of d.health||[])if(/error|blocked|limit|retained|fail/i.test(h.status+' '+h.detail))add(ticker,'PROVIDER_FAILURE',h.provider+': '+h.detail);
 }
 const groups=Object.entries(Object.groupBy(findings,x=>x.code)).map(([code,rows])=>({code,count:rows.length,severity:rows.some(x=>x.severity==='quarantine')?'high':'medium'})).sort((a,b)=>b.count-a.count);
 const proposals=groups.map((g,i)=>({id:'proposal-'+g.code,rank:i+1,problem:g.code,evidence:findings.filter(x=>x.code===g.code).slice(0,5),affectedSystems:['Information Fabric','Provider adapters','Data Coverage Center'],affectedFiles:['information-model.js','information-bridge.js','backend/cloudflare/provider-client.mjs'],expectedBenefit:'Resolve '+g.count+' flagged observations without replacing retained evidence',difficulty:g.severity==='high'?'medium':'low',risks:['Provider access and dataset scope must be rechecked','Historical values must retain original provenance'],validation:['Schema and identity tests','Calculation and replay tests','Regression build'],status:'RECOMMEND',releaseAllowed:false}));
 return{schemaVersion:1,generatedAt:new Date().toISOString(),scope:{dossiers:files.length,bars,events,bytes},trackerSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'data/recovery-os.json'))).digest('hex'),mode:'READ_ONLY',findings,summary:groups,proposals,monitoringBounds:{pixelRatio:[1,1.8],mobilePoints:1600,desktopPoints:6000,mobileHubs:24,desktopHubs:46,historyFetchLimit:100},limitations:['No provider credentials or personal notes are collected.','Source-link probes run only for approved documentation URLs.','Data flags require review; existing source caches and canonical records are never rewritten.']};
}
if(require.main===module){const output=process.argv[2]||'data/information/health.json',report=audit();fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,scope:report.scope,findings:report.findings.length,trackerSHA256:report.trackerSHA256}));}
module.exports={audit};
