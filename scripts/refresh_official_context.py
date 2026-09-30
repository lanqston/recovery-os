#!/usr/bin/env python3
"""Small, keyless official feeds. No tracker mutations or inferred stock risks."""
import argparse,datetime as dt,html,json,math,re,time,urllib.parse
from pathlib import Path
from public_http import PublicHTTP
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'data/official-context.json'
NYFED='https://markets.newyorkfed.org/api/rates/all/latest.json'
DOJ='https://www.justice.gov/api/v1/press_releases.json'
ALIASES={'AAPL':['Apple Inc.','Apple Inc'], 'GOOGL':['Google'], 'GOOG':['Google'], 'MSFT':['Microsoft'], 'BA':['Boeing'], 'JPM':['JPMorgan','J.P. Morgan'], 'BAC':['Bank of America'], 'WFC':['Wells Fargo'], 'PFE':['Pfizer'], 'JNJ':['Johnson & Johnson'], 'META':['Meta Platforms'], 'NVDA':['Nvidia'], 'AMZN':['Amazon.com'], 'UNH':['UnitedHealth','UnitedHealthcare'], 'CVS':['CVS Health','CVS Pharmacy'], 'RTX':['Raytheon'], 'LMT':['Lockheed Martin']}
def names():
 out={k:list(v) for k,v in ALIASES.items()}
 path=ROOT/'data/market-atlas/index.json'
 if path.exists():
  data=json.loads(path.read_text())
  for row in data.get('rows',[]):
   r=dict(zip(data['columns'],row));name=r.get('name','');name=re.split(r'\b(?:Common Stock|Common Shares|Class [A-Z]|Ordinary Shares|American Depositary)\b',name)[0].strip(' ,.-')
   if len(name)>=14 and len(name.split())>=2 and not re.search(r'fund|ETF|trust',name,re.I):out.setdefault(r['ticker'],[]).append(name)
 return out

def parse_release(row,aliases,now):
 try:stamp=dt.datetime.fromtimestamp(float(row['date']),dt.timezone.utc)
 except (ValueError,KeyError,TypeError,OverflowError):return None
 if stamp>now or stamp<now-dt.timedelta(days=180):return None
 url=row.get('url','');host=urllib.parse.urlsplit(url).hostname
 if host not in ('www.justice.gov','justice.gov') or not url.startswith('https://'):return None
 title=html.unescape(row.get('title','')).strip()
 # Individual employee cases do not establish a risk involving the company.
 if re.search(r'\b(?:employee|employees|former executive)\b',title,re.I):return None
 tickers=[t for t,terms in aliases.items() if any(re.search(r'(?<!\w)'+re.escape(n)+r'(?!\w)',title,re.I) for n in terms)]
 if not tickers:return None
 return {'title':title,'url':url,'published':stamp.isoformat(),'publisher':'U.S. Department of Justice','sourceType':'GOVERNMENT','riskCategory':'Legal & regulatory','tickers':sorted(set(tickers)),'matchBasis':'Company name appears in the official headline; not an assessment of liability.'}

def parse_rates(data,now):
 rows=[]
 for r in data.get('refRates',[]):
  try:date=dt.date.fromisoformat(r['effectiveDate']);value=float(r['percentRate'])
  except (KeyError,ValueError,TypeError):continue
  if r.get('type') not in ('SOFR','EFFR') or not math.isfinite(value) or not -5<=value<=50 or date>now.date():continue
  rows.append({'type':r['type'],'value':value,'date':date.isoformat(),'unit':'percent','publisher':'Federal Reserve Bank of New York','url':'https://www.newyorkfed.org/markets/reference-rates','dataURL':NYFED})
 if len(rows)!=2:raise ValueError('Expected dated SOFR and EFFR observations')
 return rows

def refresh(backfill=False):
 import os
 now=dt.datetime.now(dt.timezone.utc);stamp=now.isoformat()
 client=PublicHTTP(os.environ.get('RECOVERY_CACHE_DIR',str(ROOT.parent/'official-source-cache')),'RecoveryOS/1.0 (public research; https://github.com/lanqston/recovery-os)')
 try:out=json.loads(DEST.read_text())
 except (OSError,ValueError):out={'rates':[],'events':[],'health':{}}
 out['lastAttemptAt']=stamp;out['scope']='NY Fed reference rates and company-name-matched DOJ headlines. Not comprehensive litigation coverage.'
 for name in ['nyfed','doj']:
  previous=out.get('health',{}).get(name,{})
  try:
   if name=='nyfed':out['rates']=parse_rates(client.fetch(NYFED,'nyfed-rates',ttl=3600),now);count=len(out['rates'])
   else:
    aliases=names();merged={x['url']:x for x in out.get('events',[]) if x.get('published','')>=(now-dt.timedelta(days=180)).isoformat()}
    queries=[{'page':p} for p in range(4)]
    if backfill:queries += [{'parameters[title]':n} for n in ['Google','Boeing','Microsoft','JPMorgan','Wells Fargo','Pfizer','UnitedHealth','Raytheon']]
    scanned=0
    for query in queries:
     url=DOJ+'?'+urllib.parse.urlencode({'pagesize':50,'sort':'date','direction':'DESC','fields':'title,url,date,uuid',**query})
     payload=client.fetch(url,kind='json',ttl=3600,validate=lambda d:isinstance(d.get('results'),list));scanned+=len(payload['results'])
     for row in payload['results']:
      item=parse_release(row,aliases,now)
      if item:merged[item['url']]={**item,'retrievedAt':stamp}
     time.sleep(.3)
    out['events']=sorted(merged.values(),key=lambda x:x['published'],reverse=True)[:500];count=len(out['events']);out['scannedReleases']=scanned
   out.setdefault('health',{})[name]={'status':'available','lastAttemptAt':stamp,'lastSuccessAt':stamp,'records':count}
  except Exception as exc:out.setdefault('health',{})[name]={**previous,'status':'previous data retained','lastAttemptAt':stamp,'error':str(exc)[:120]}
 DEST.write_text(json.dumps(out,separators=(',',':'))+'\n');print(json.dumps(out['health']))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--backfill',action='store_true');refresh(parser.parse_args().backfill)
