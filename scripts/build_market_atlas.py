#!/usr/bin/env python3
"""Build a broad, sharded public market atlas. No credentials or invented observations.

SEC frames select calendar cohorts; each company retains its actual start/end dates.
Nasdaq screener quotes have a collection timestamp, never an invented exchange time.
"""
import argparse, concurrent.futures, datetime as dt, json, math, re
from pathlib import Path
import refresh_open_research as public

DEST=public.ROOT/'data/market-atlas'
NOW=dt.datetime.now(dt.timezone.utc).isoformat()
NASDAQ='https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=20000&download=true'
METRICS={
 'revenue':['RevenuesNetOfInterestExpense','RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet'],
 'netIncome':['NetIncomeLoss'], 'operatingIncome':['OperatingIncomeLoss'],
 'dilutedEPS':['EarningsPerShareDiluted'],'dilutedShares':['WeightedAverageNumberOfDilutedSharesOutstanding'],
 'cash':['CashAndCashEquivalentsAtCarryingValue'],'assets':['Assets'],
 'currentAssets':['AssetsCurrent'],'currentLiabilities':['LiabilitiesCurrent'],
 'equity':['StockholdersEquity'],'longTermDebt':['LongTermDebtNoncurrent']}
INSTANT={'cash','assets','currentAssets','currentLiabilities','equity','longTermDebt'}

def write_atlas(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,separators=(',',':'),ensure_ascii=False)+'\n')

def number(value):
    try:
        n=float(re.sub(r'[$%,\s]','',str(value)))
        return n if math.isfinite(n) else None
    except (TypeError,ValueError):return None

def shard(ticker):
    n=0
    for c in ticker:n=(n*31+ord(c))&0xffffffff
    return f'{n%64:02x}'

def quarters():
    today=dt.date.today();q=(today.month-1)//3 # last completed calendar quarter
    y=today.year
    if q==0:y-=1;q=4
    result=[]
    for _ in range(5):
        result.append((y,q))
        q-=1
        if q==0:y-=1;q=4
    return result

def fetch_frame(task):
    metric,tag,year,quarter,priority=task
    period=f'CY{year}Q{quarter}'+('I' if metric in INSTANT else '')
    unit='USD-per-shares' if metric=='dilutedEPS' else 'shares' if metric=='dilutedShares' else 'USD'
    url=f'https://data.sec.gov/api/xbrl/frames/us-gaap/{tag}/{unit}/{period}.json'
    try:
        payload=public.fetch(url,f'atlas-{tag}-{period}',ttl=21600,validate=lambda x:isinstance(x.get('data'),list))
        return task,payload.get('data',[]),{'source':url,'status':'available','records':len(payload.get('data',[]))}
    except Exception as e:return task,[],{'source':url,'status':'previous snapshot retained','detail':str(e)[:120]}

def normalize_company(cik,cohorts):
    rows=[]
    for (year,quarter),facts in sorted(cohorts.items(),reverse=True):
        bases=facts.get('revenue') or facts.get('netIncome') or facts.get('dilutedEPS') or []
        bases=[v for v in bases if 65<=public.days(v.get('start'),v.get('end'))<=110]
        bases.sort(key=lambda v:v['priority'])
        if not bases:continue
        base=bases[0];start,end=base['start'],base['end'];accn=base.get('accn','')
        row={'period':'Quarter ended '+end,'startDate':start,'endDate':end,'comparisonYear':year,'comparisonQuarter':quarter,
             'currency':'USD','source':public.accession_url(cik,accn),'normalizedFrom':'SEC XBRL frames','metricSources':{},'concepts':{}}
        for metric,values in facts.items():
            valid=[v for v in values if v.get('end')==end and (metric in INSTANT or v.get('start')==start)]
            if not valid:continue
            valid.sort(key=lambda v:v['priority']);value=valid[0]
            if not public.finite(value['val']) or (metric=='dilutedShares' and value['val']<=0):continue
            row[metric]=value['val'];row['concepts'][metric]=value['concept']
            if value.get('accn')!=accn:row['metricSources'][metric]=public.accession_url(cik,value.get('accn'))
        for margin,income in [('operatingMarginPct','operatingIncome'),('netMarginPct','netIncome')]:
            value=public.ratio(row.get(income),row.get('revenue'),100)
            if value is not None:row[margin]=value
        value=public.ratio(row.get('currentAssets'),row.get('currentLiabilities'))
        if value is not None:row['currentRatio']=value
        rows.append(row)
    return rows

def retain_periods(previous,latest):
    """A failed concept feed must not erase other successfully collected fields."""
    rows={(r['startDate'],r['endDate'],r.get('currency')):r for r in previous}
    for r in latest:
        key=(r['startDate'],r['endDate'],r.get('currency'));old=rows.get(key,{})
        merged={**old,**{k:v for k,v in r.items() if v is not None}}
        merged['metricSources']={**old.get('metricSources',{}),**r.get('metricSources',{})}
        merged['concepts']={**old.get('concepts',{}),**r.get('concepts',{})}
        for k,v in old.items():
            if public.finite(v) and k not in r and old.get('source')!=r.get('source'):
                merged['metricSources'][k]=old.get('metricSources',{}).get(k,old.get('source'))
        rows[key]=merged
    return sorted(rows.values(),key=lambda r:r['endDate'],reverse=True)[:9]

def build(skip_frames=False):
    DEST.mkdir(parents=True,exist_ok=True)
    directory=json.loads((public.DEST/'directory.json').read_text()).get('symbols',[])
    records={x['ticker']:{'profile':{**x,'securityType':'SEC-listed security'},'retrievedAt':NOW} for x in directory}
    old_index=DEST/'index.json';old={}
    if old_index.exists():
        for file in (DEST/'shards').glob('*.json'):
            old.update(json.loads(file.read_text()).get('stocks',{}))
    for t,b in old.items():
        fresh=records.get(t,{}).get('profile',{}).get('cik');previous=b.get('profile',{}).get('cik')
        if fresh and previous and str(fresh).zfill(10)!=str(previous).zfill(10):continue
        records[t]=b
    health=[]
    try:
        if public.os.environ.get('LEGACY_MARKET_ACCESS_APPROVED')!='true': raise RuntimeError('Automatic screener ingestion paused pending documented access permission')
        payload=public.fetch(NASDAQ,'nasdaq-screener');quotes=payload.get('data',{}).get('rows') or []
        for x in quotes:
            t=x.get('symbol','').strip().upper()
            if not re.fullmatch(r'[A-Z][A-Z0-9.\-]{0,11}',t):continue
            b=records.setdefault(t,{'profile':{'ticker':t},'retrievedAt':NOW});p=b['profile']
            p.update(name=x.get('name') or p.get('name',t),sector=x.get('sector') or p.get('sector','Market frontier'),industry=x.get('industry') or p.get('industry',''),country=x.get('country') or '',marketCap=number(x.get('marketCap')))
            p['securityType']='ETF' if re.search(r'\bETF\b|Exchange.Traded',p['name'],re.I) else 'Listed security'
            price=number(x.get('lastsale'))
            if price is not None and price>0:
                url='https://www.nasdaq.com'+x.get('url',f'/market-activity/stocks/{t.lower()}')
                b['quote']={'price':price,'changePct':number(x.get('pctchange')),'volume':number(x.get('volume')),'currency':'USD',
                    'timestamp':'Provider snapshot · collected '+NOW[:10], 'collectedAt':NOW,'source':'Nasdaq public stock screener',
                    'dataState':'PROVIDER SNAPSHOT','sessionNote':'The source does not supply an exchange timestamp. Verify the latest session before acting.'}
                b['priceSource']={'url':url,'publisher':'Nasdaq','date':NOW[:10],'title':'Nasdaq public market snapshot'}
            b['retrievedAt']=NOW
        health.append({'provider':'Nasdaq public screener','status':'available','records':len(quotes),'collectedAt':NOW})
        print(f'Nasdaq: {len(quotes)} public market records',flush=True)
    except Exception as e:health.append({'provider':'Nasdaq public screener','status':'previous records retained','detail':str(e)[:150],
        'lastAttemptAt':NOW,'lastSuccessAt':public.latest(*(b.get('quote',{}).get('collectedAt') for b in records.values() if b.get('quote',{}).get('source')=='Nasdaq public stock screener'))})
    cohorts={};frame_health=[]
    if not skip_frames:
        tasks=[(metric,tag,y,q,i) for metric,tags in METRICS.items() for i,tag in enumerate(tags) for y,q in (quarters()[:2] if metric in INSTANT else quarters())]
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            for task,data,h in pool.map(fetch_frame,tasks):
                metric,tag,y,q,priority=task;frame_health.append(h)
                for x in data:
                    cohorts.setdefault(str(x['cik']).zfill(10),{}).setdefault((y,q),{}).setdefault(metric,[]).append({**x,'concept':tag,'priority':priority})
                print(f'{tag} CY{y}Q{q}: {len(data)} issuer facts',flush=True)
        normalized={cik:normalize_company(cik,value) for cik,value in cohorts.items()}
        for t,b in records.items():
            rows=normalized.get(str(b['profile'].get('cik','')).zfill(10),[])
            if rows:
                rows=retain_periods(b.get('financials',{}).get('quarterly',[]),rows)
                b['financials']={'quarterly':rows,'annual':[]}
                b['filings']=[{'form':'Financial filing','title':'Original report supporting '+r['period'].lower(),'url':r['source'],'filed':None,'reportDate':r['endDate']} for r in rows]
    # Include prepared ETF worlds and their actual market snapshots in the directory.
    prepared=json.loads((public.DEST/'index.json').read_text()).get('symbols',[])
    seed=json.loads((public.ROOT/'data/symbols-seed.json').read_text()).get('symbols',[])
    seed_by_ticker={x['ticker']:x for x in seed}
    for item in prepared:
        t=item['ticker'];path=public.DEST/(t+'.json')
        if not path.exists():continue
        detail=json.loads(path.read_text());p=detail.get('profile',{})
        b=records.setdefault(t,{'profile':p,'retrievedAt':detail.get('retrievedAt',NOW)})
        if p.get('typeCode')=='ETF' or 'ETF' in p.get('securityType','') or 'ETF' in seed_by_ticker.get(t,{}).get('securityType',''):
            b['profile'].update(securityType='ETF',typeCode='ETF',sector='Funds')
        if not public.finite(b.get('quote',{}).get('price')) and public.finite(detail.get('quote',{}).get('price')):
            b['quote']=detail['quote'];b['priceSource']=detail.get('priceSource')
    # Make issuer and market source paths useful even when a metric is not disclosed.
    buckets={f'{i:02x}':{} for i in range(64)};symbols=[]
    for t,b in sorted(records.items()):
        p=b['profile'];p.setdefault('name',t)
        b.setdefault('financials',{'quarterly':[],'annual':[]});b.setdefault('filings',[]);b.setdefault('news',[]);b.setdefault('bars',[])
        b['coverage']={'financialPeriods':len(b['financials']['quarterly']),'quote':public.finite(b.get('quote',{}).get('price')),'sourceDirectory':True}
        buckets[shard(t)][t]=b
        symbols.append([t,p['name'],p.get('sector','Market frontier'),p.get('exchange'),p.get('cik'),b.get('quote',{}).get('price'),b.get('quote',{}).get('changePct'),p.get('marketCap'),b['coverage']['financialPeriods'],p.get('securityType','Listed security')])
    for key,value in buckets.items():write_atlas(DEST/'shards'/(key+'.json'),{'stocks':value})
    write_atlas(DEST/'index.json',{'retrievedAt':NOW,'columns':['ticker','name','sector','exchange','cik','price','changePct','marketCap','financialPeriods','securityType'],'rows':symbols,
        'counts':{'symbols':len(symbols),'quotes':sum(b['coverage']['quote'] for b in records.values()),'financials':sum(bool(b['coverage']['financialPeriods']) for b in records.values())},
        'health':health,'method':'Nasdaq screener snapshots and SEC XBRL frames. Company periods are matched by exact start/end dates; field-specific filing links are retained.'})
    write_atlas(DEST/'collection.json',{'retrievedAt':NOW,'sources':health,'frames':frame_health,'http':{k:v for k,v in public.HTTP.report().items() if k!='resources'}})
    print(f'Atlas complete: {len(symbols)} symbols; {sum(b["coverage"]["quote"] for b in records.values())} quotes; {sum(bool(b["coverage"]["financialPeriods"]) for b in records.values())} issuers with financial records.',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--skip-frames',action='store_true');args=parser.parse_args();build(args.skip_frames)
