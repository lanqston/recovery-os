#!/usr/bin/env python3
"""Build public research snapshots without API keys. Never writes the recovery tracker.

SEC has no browser CORS support. Fetch here, keep source/period provenance, and
serve compact records from the same origin as the portal. Provider failures keep
the last successful file. No proxy, paid feed, or generated financial estimate.
"""
import argparse, concurrent.futures, csv, datetime as dt, email.utils, io, json, math, os, re, threading, time, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'data/open-research'
CACHE=Path(os.environ.get('RECOVERY_CACHE_DIR',str(ROOT.parent/'open-source-cache')))
UA=os.environ.get('SEC_USER_AGENT') or 'RecoveryOS/1.0 (public research; contact https://github.com/lanqston/recovery-os/issues)'
TICKERS='AAPL PLTR NVDA MSFT TSLA AMZN GOOGL META AMD AVGO ORCL CRM ADBE PYPL STZ DECK NKE ZTS ENPH ON JPM V LLY UNH XOM COST COIN SOFI HOOD UBER DIS SPY QQQ'.split()
NOW=dt.datetime.now(dt.timezone.utc).isoformat()
lock=threading.Lock();last_sec=0.0

def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')),encoding='utf8');temp.replace(path)

from public_http import PublicHTTP
from source_status import company_health, latest, seed_from_atlas
HTTP=PublicHTTP(CACHE,UA)
def fetch(url,cache_key=None,kind='json',ttl=7200,validate=None):
    return HTTP.fetch(url,cache_key,kind,ttl,validate)

def received_at(url):
    return HTTP.metadata(url).get('lastSuccessAt')

def success_health(provider,url,**values):
    meta=HTTP.metadata(url);verified=latest(meta.get('lastSuccessAt'),meta.get('lastVerifiedAt'))
    return {'provider':provider,'status':'available' if verified and latest(verified,NOW)==verified else 'cached',
            'lastSuccessAt':verified,'lastAttemptAt':NOW,'lastSourceAttemptAt':meta.get('lastAttemptAt'),'url':url,**values}

def failure_health(provider,error):
    return {'provider':provider,'status':'unavailable','detail':str(error)[:150],
            'lastAttemptAt':NOW,'retryAt':getattr(error,'retry_at',None)}


def days(a,b):
    try:return (dt.date.fromisoformat(b)-dt.date.fromisoformat(a)).days
    except (TypeError,ValueError):return -1
def finite(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def ratio(n,d,m=1):return n/d*m if finite(n) and finite(d) and d!=0 else None
def accession_url(cik,accn,document=''):
    return f'https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accn.replace("-", "")}/{urllib.parse.quote(document)}' if accn else None

TAGS={
 'revenue':['RevenuesNetOfInterestExpense','RevenueFromContractWithCustomerExcludingAssessedTax','RevenueFromContractWithCustomerIncludingAssessedTax','Revenues','SalesRevenueNet','RevenueFromContractWithCustomerNetOfTaxes'],
 'netIncome':['NetIncomeLoss','ProfitLoss'], 'grossProfit':['GrossProfit'], 'operatingIncome':['OperatingIncomeLoss'],
 'dilutedEPS':['EarningsPerShareDiluted'], 'dilutedShares':['WeightedAverageNumberOfDilutedSharesOutstanding'],
 'operatingCashFlow':['NetCashProvidedByUsedInOperatingActivities'], 'capitalExpenditure':['PaymentsToAcquirePropertyPlantAndEquipment'],
 'cash':['CashAndCashEquivalentsAtCarryingValue'], 'currentAssets':['AssetsCurrent'], 'currentLiabilities':['LiabilitiesCurrent'],
 'assets':['Assets'], 'equity':['StockholdersEquity','StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
 'longTermDebt':['LongTermDebtNoncurrent','LongTermDebt'], 'stockCompensation':['ShareBasedCompensation'],
 'researchDevelopment':['ResearchAndDevelopmentExpense'], 'shareRepurchases':['PaymentsForRepurchaseOfCommonStock'],
 'dividendsPaid':['PaymentsOfDividendsCommonStock','PaymentsOfDividends']}
INSTANT={'cash','currentAssets','currentLiabilities','assets','equity','longTermDebt'}

def candidates(facts,key):
    namespace=facts.get('facts',{}).get('us-gaap',{})
    unit='USD/shares' if key=='dilutedEPS' else 'shares' if key=='dilutedShares' else 'USD'
    rows=[]
    for priority,tag in enumerate(TAGS[key]):
        for f in namespace.get(tag,{}).get('units',{}).get(unit,[]):
            if f.get('form') in ('10-K','10-Q','10-K/A','10-Q/A') and finite(f.get('val')):
                rows.append({**f,'concept':tag,'unit':unit,'priority':priority})
    return rows

def normalize_facts(facts,sub):
    all_facts={k:candidates(facts,k) for k in TAGS}
    revenues=all_facts['revenue']
    try:fye=int(sub.get('fiscalYearEnd','1231')[:2])
    except (ValueError,TypeError):fye=12
    def row_for(base,annual=False):
        start,end=base['start'],base['end'];month=int(end[5:7]);year=int(end[:4])+(month>fye)
        quarter=4 if month==fye else min(4,math.ceil(((month-fye)%12)/3))
        row={'period':f'FY{year}' if annual else f'Q{quarter} FY{year}','fiscalYear':year,'fiscalPeriod':'FY' if annual else f'Q{quarter}',
             'startDate':start,'endDate':end,'filingDate':base.get('filed'),'currency':'USD','source':accession_url(sub['cik'],base.get('accn')),'provenance':{},'normalizedFrom':'SEC company facts'}
        for key,values in all_facts.items():
            valid=[v for v in values if v.get('end')==end and (key in INSTANT or (v.get('start') and abs(days(v.get('start'),start))<=4))]
            valid.sort(key=lambda v:(v.get('filed',''),-v['priority'],v.get('accn')==base.get('accn')),reverse=True)
            value=valid[0] if valid else None
            row[key]=value['val'] if value else None
            if key=='dilutedShares' and finite(row[key]) and row[key]<=0:row[key]=None
            if value:row['provenance'][key]={'source':accession_url(sub['cik'],value.get('accn')),'filed':value.get('filed'),'concept':value['concept'],'start':value.get('start'),'end':value.get('end'),'unit':value['unit']}
        row['freeCashFlow']=row['operatingCashFlow']-row['capitalExpenditure'] if finite(row['operatingCashFlow']) and finite(row['capitalExpenditure']) else None
        row.update(grossMarginPct=ratio(row['grossProfit'],row['revenue'],100),operatingMarginPct=ratio(row['operatingIncome'],row['revenue'],100),netMarginPct=ratio(row['netIncome'],row['revenue'],100),currentRatio=ratio(row['currentAssets'],row['currentLiabilities']))
        return row
    output={}
    for kind,low,high,count in [('quarterly',65,110,9),('annual',330,380,4)]:
        rows=[r for r in revenues if low<=days(r.get('start'),r.get('end'))<=high]
        rows.sort(key=lambda r:(r['end'],r.get('filed',''),-r['priority']),reverse=True)
        distinct={}
        for r in rows:distinct.setdefault(r['end'],r)
        output[kind]=[row_for(r,kind=='annual') for r in list(distinct.values())[:count]]
    # Cash-flow statements are usually year to date. Keep that scope explicit.
    cash=sorted(all_facts['operatingCashFlow'],key=lambda x:(x['end'],x.get('filed','')),reverse=True)
    if cash:
        c=cash[0];cap=[x for x in all_facts['capitalExpenditure'] if x.get('start')==c.get('start') and x.get('end')==c.get('end')]
        cap.sort(key=lambda x:x.get('filed',''),reverse=True);p=cap[0] if cap else None
        output['cashFlowPeriod']={'startDate':c.get('start'),'endDate':c['end'],'filingDate':c.get('filed'),'operatingCashFlow':c['val'],'capitalExpenditure':p['val'] if p else None,'freeCashFlow':c['val']-p['val'] if p else None,'source':accession_url(sub['cik'],c['accn']),'capexSource':accession_url(sub['cik'],p['accn']) if p else None,'scope':'Year to date' if days(c.get('start'),c['end'])>120 else 'Fiscal quarter'}
    return output

def filings(sub):
    r=sub.get('filings',{}).get('recent',{});items=[]
    accepted={'10-K','10-Q','8-K','10-K/A','10-Q/A','20-F','6-K','40-F','DEF 14A','4','4/A','SC 13D','SC 13D/A','SC 13G','SC 13G/A'}
    labels={'10-K':'Annual report','10-Q':'Quarterly results','8-K':'Current company event','DEF 14A':'Proxy and governance','20-F':'Annual foreign-issuer report','6-K':'Foreign-issuer update'}
    for i,form in enumerate(r.get('form',[])):
        if form not in accepted:continue
        def at(k):return r.get(k,[])[i] if i<len(r.get(k,[])) else ''
        items.append({'form':form,'title':labels.get(form,form),'filed':at('filingDate'),'reportDate':at('reportDate'),'acceptedAt':at('acceptanceDateTime') or None,'accession':at('accessionNumber'),'items':at('items'),'url':accession_url(sub['cik'],at('accessionNumber'),at('primaryDocument'))})
        if len(items)>=32:break
    return items

def feed_items(text,publisher,limit=8):
    root=ET.fromstring(text);out=[]
    def local(tag):return tag.split('}')[-1]
    for node in root.iter():
        if local(node.tag) not in ('item','entry'):continue
        fields={local(c.tag):c for c in node}
        title=''.join(fields.get('title',ET.Element('x')).itertext()).strip()
        link=fields.get('link');url=(link.attrib.get('href') or link.text or '').strip() if link is not None else ''
        date=next((''.join(fields[k].itertext()).strip() for k in ['pubDate','published','updated'] if k in fields),'')
        try:date=email.utils.parsedate_to_datetime(date).isoformat()
        except (TypeError,ValueError):pass
        if title and url.startswith('http'):out.append({'title':title,'url':url,'published':date,'publisher':publisher,'sourceType':'OFFICIAL' if publisher!='Yahoo Finance RSS' else 'NEWS','why':'Open the original release and verify its period and material claims.'})
        if len(out)>=limit:break
    return out

def stooq_price_bars(t):
    key=os.environ.get('STOOQ_API_KEY','').strip()
    if not key:raise RuntimeError('STOOQ_API_KEY not configured; fresh Stooq EOD prices are unavailable')
    end=dt.date.today();start=end-dt.timedelta(days=800)
    symbol=urllib.parse.quote(t.lower()+'.us')
    public_url=f'https://stooq.com/q/d/l/?s={symbol}&d1={start:%Y%m%d}&d2={end:%Y%m%d}&i=d'
    request_url=public_url+'&apikey='+urllib.parse.quote(key,safe='')
    text=fetch(request_url,t+'-stooq','text',ttl=1800)
    low=text.lower()
    if not text.strip() or text.strip()=='N/D' or 'get your apikey' in low or 'exceeded' in low or '<html' in low:
        raise ValueError('Stooq did not return usable CSV data')
    rows=[]
    for item in csv.DictReader(io.StringIO(text)):
        try:
            row={'date':item['Date'],**{k:float(item[k.capitalize()]) for k in ['open','high','low','close']}}
            volume=item.get('Volume');row['volume']=float(volume) if volume not in (None,'','N/D','-') else None
        except (KeyError,TypeError,ValueError):
            continue
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}',row['date']) and all(finite(row[k]) and row[k]>0 for k in ['open','high','low','close']):
            rows.append(row)
    rows.sort(key=lambda x:x['date'])
    if len(rows)<2:raise ValueError('Stooq returned fewer than two verified daily bars')
    return rows[-420:],request_url,public_url

def price_bars(t):
    url=f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(t)}?interval=1d&range=2y'
    data=fetch(url,t+'-yahoo')['chart']['result'][0];v=data['indicators']['quote'][0];bars=[]
    for i,stamp in enumerate(data.get('timestamp',[])):
        date=dt.datetime.fromtimestamp(stamp,dt.timezone.utc).date().isoformat()
        if date>=dt.date.today().isoformat():continue
        b={'date':date,**{k:v[k][i] if i<len(v.get(k,[])) else None for k in ['open','high','low','close','volume']}}
        if all(finite(b[k]) for k in ['open','high','low','close']):bars.append(b)
    return bars[-420:],data['meta']

def build_company(t,directory):
    result={'ticker':t,'lastAttemptAt':NOW,'health':[]};entry=directory.get(t)
    old_path=DEST/(t+'.json');old=json.loads(old_path.read_text()) if old_path.exists() else {}
    if entry and old.get('profile',{}).get('cik') and str(entry.get('cik')).zfill(10)!=str(old['profile']['cik']).zfill(10):old={}
    old=seed_from_atlas(ROOT,t,entry,old)
    if entry:
        cik=str(entry['cik']).zfill(10);sub=None
        result['profile']={**old.get('profile',{}),'ticker':t,'cik':cik,'name':old.get('profile',{}).get('name') or entry['name'],'exchange':entry.get('exchange')}
        try:
            url=f'https://data.sec.gov/submissions/CIK{cik}.json'
            sub=fetch(url,t+'-submissions',ttl=1800,validate=lambda x:str(x.get('cik','')).zfill(10)==cik and isinstance(x.get('filings'),dict))
            result['retrievedAt']=received_at(url)
            result['profile']={**old.get('profile',{}),'ticker':t,'name':sub.get('name',entry['name']),'exchange':entry.get('exchange'),'cik':cik,'industry':sub.get('sicDescription'),'fiscalYearEnd':sub.get('fiscalYearEnd'),'homepage':sub.get('website') or None,'investorRelations':sub.get('investorWebsite') or None}
            result['filings']=filings(sub);result['filingSource']={'url':url,'retrievedAt':received_at(url)}
            result['health'].append(success_health('SEC filings',url,asOf=result['filings'][0]['filed'] if result['filings'] else None))
        except Exception as e:result['health'].append(failure_health('SEC filings',e))
        if old.get('profile',{}).get('typeCode')!='ETF' and old.get('profile',{}).get('securityType')!='ETF' and t not in ('SPY','QQQ'):
            try:
                identity=sub or old.get('profile',{})
                if not re.fullmatch(r'\d{4}',str(identity.get('fiscalYearEnd',''))):
                    raise ValueError('Issuer fiscal calendar unavailable; original financial records retained where present')
                url=f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json'
                facts=fetch(url,t+'-facts',ttl=21600,validate=lambda x:str(x.get('cik','')).zfill(10)==cik and isinstance(x.get('facts'),dict))
                f=normalize_facts(facts,{**identity,'cik':cik})
                if not (f.get('quarterly') or f.get('annual')):
                    raise ValueError('No compatible standard financial statements; original records retained where present')
                result['financials']={**f,'retrievedAt':received_at(url)}
                result['health'].append(success_health('SEC financial statements',url,asOf=(f.get('quarterly') or f.get('annual'))[0].get('endDate')))
            except Exception as e:result['health'].append(failure_health('SEC financial statements',e))
    try:
        bars,request_url,public_url=stooq_price_bars(t)
        current=(result.get('bars') or old.get('bars') or [{}])[-1].get('date')
        last=bars[-1]
        if not current or last['date']>=current:
            result.setdefault('profile',old.get('profile') or {'ticker':t,'name':entry['name'] if entry else t,'cik':str(entry['cik']).zfill(10) if entry else None,'exchange':entry.get('exchange') if entry else None})
            prior=bars[-2]
            result['bars']=bars
            result['quote']={'price':last['close'],'changePct':ratio(last['close']-prior['close'],prior['close'],100),'timestamp':last['date']+' daily close','source':'Stooq daily history','dataState':'END-OF-DAY SNAPSHOT','currency':'USD'}
            result['priceSource']={'title':'Stooq daily history','url':public_url,'publisher':'Stooq','date':last['date'],'retrievedAt':received_at(request_url)}
        meta=HTTP.metadata(request_url);verified=latest(meta.get('lastSuccessAt'),meta.get('lastVerifiedAt'))
        result['health'].append({'provider':'Stooq daily history','status':'available' if verified and latest(verified,NOW)==verified else 'cached','lastSuccessAt':verified,'lastAttemptAt':NOW,'lastSourceAttemptAt':meta.get('lastAttemptAt'),'url':public_url,'asOf':last['date']})
    except Exception as e:
        result['health'].append(failure_health('Stooq daily history',e))
    try:
        if os.environ.get('LEGACY_MARKET_ACCESS_APPROVED')!='true': raise RuntimeError('Automatic access paused pending provider permission')
        bars,meta=price_bars(t)
        result.setdefault('profile',old.get('profile') or {'ticker':t,'name':entry['name'] if entry else meta.get('longName') or meta.get('shortName') or t,'cik':str(entry['cik']).zfill(10) if entry else None,'exchange':entry.get('exchange') if entry else meta.get('exchangeName')})
        if meta.get('instrumentType')=='ETF':result['profile'].update(typeCode='ETF',securityType='ETF')
        if bars:
            last=bars[-1];prior=bars[-2] if len(bars)>1 else last
            current=(result.get('bars') or old.get('bars') or [{}])[-1].get('date')
            url=f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(t)}?interval=1d&range=2y'
            if not current or last['date']>=current:
                result['bars']=bars;result['quote']={'price':last['close'],'changePct':ratio(last['close']-prior['close'],prior['close'],100),'timestamp':last['date']+' daily close','source':'Yahoo Finance public daily history','dataState':'DAILY SNAPSHOT','currency':meta.get('currency')}
                result['priceSource']={'title':'Yahoo Finance daily history','url':f'https://finance.yahoo.com/quote/{urllib.parse.quote(t)}/history/','publisher':'Yahoo Finance','date':last['date'],'retrievedAt':received_at(url)}
            result['health'].append(success_health('Yahoo daily history',url,asOf=last['date']))
    except Exception as e:result['health'].append(failure_health('Yahoo daily history',e))
    try:
        if os.environ.get('LEGACY_MARKET_ACCESS_APPROVED')!='true': raise RuntimeError('RSS ingestion paused pending provider permission')
        url=f'https://feeds.finance.yahoo.com/rss/2.0/headline?s={urllib.parse.quote(t)}&region=US&lang=en-US'
        rss=fetch(url,t+'-rss','text')
        result['news']=[{**n,'retrievedAt':received_at(url)} for n in feed_items(rss,'Yahoo Finance RSS',8)]
        result['health'].append(success_health('Yahoo Finance RSS',url,items=len(result['news'])))
    except Exception as e:result['health'].append(failure_health('Yahoo Finance RSS',e))
    if result.get('filings'):
        releases=[{'title':(result.get('profile',{}).get('name') or t)+' / '+('Reported results event' if '2.02' in f.get('items','') else f['title']),
            'url':f['url'],'published':f.get('acceptedAt') or f['filed'],'publisher':'SEC EDGAR','sourceType':'OFFICIAL',
            'why':'Original '+f['form']+' disclosure. Verify the reported event, period and attached release.'} for f in result['filings'] if f['form'] in ('8-K','6-K')][:12]
        prior_news=result.get('news',old.get('news',[]))
        result['news']=list({n['url']:n for n in [*prior_news,*releases]}.values())
        result['news'].sort(key=lambda x:x.get('published',''),reverse=True);result['news']=result['news'][:24]
    merged={**old,**result}
    for key in ('filings','news','bars'):merged.setdefault(key,[])
    merged.setdefault('financials',{'quarterly':[],'annual':[]})
    previous={h['provider']:h for h in company_health(old)}
    for h in merged['health']:
        if h['status']!='available':h['lastSuccessAt']=latest(h.get('lastSuccessAt'),previous.get(h['provider'],{}).get('lastSuccessAt'))
    merged['health']=company_health(merged)
    write(old_path,merged)
    print(f'{t}: {len(merged.get("financials",{}).get("quarterly",[]))} quarters, {len(merged.get("filings",[]))} filings, {len(merged.get("bars",[]))} bars',flush=True)
    return {'ticker':t,'name':merged.get('profile',{}).get('name',entry['name'] if entry else t),'exchange':entry.get('exchange') if entry else None,'cik':entry.get('cik') if entry else None,'financialThrough':merged.get('financials',{}).get('quarterly',[{}])[0].get('endDate') if merged.get('financials',{}).get('quarterly') else None,'priceThrough':(merged.get('bars') or [{}])[-1].get('date'),'filings':len(merged.get('filings',[])),'lastAttemptAt':NOW,'health':merged.get('health',[])}

def bls_observations(data,code):
    series=data.get('Results',{}).get('series',[{}])[0]
    if series.get('seriesID')!=code:raise ValueError('BLS series identity mismatch')
    rows=[]
    for r in series.get('data',[]):
        if not re.fullmatch(r'M(0[1-9]|1[0-2])',r.get('period','')):continue
        try:value=float(str(r.get('value','')).replace(',',''))
        except ValueError:continue
        if not finite(value):continue
        rows.append({'date':r['year']+'-'+r['period'][1:]+'-01','value':value,'precision':'month'})
    if not rows:raise ValueError('BLS returned no released monthly observations')
    return sorted(rows,key=lambda r:r['date'])

def macro():
    path=DEST/'macro.json';out=json.loads(path.read_text()) if path.exists() else {'releases':[],'series':{}}
    prior_health={h['provider']:h for h in out.get('health',[])}
    out['retrievedAt']=NOW;health=[]
    feeds=[('Federal Reserve','https://www.federalreserve.gov/feeds/press_all.xml'),('BLS CPI','https://www.bls.gov/feed/cpi.rss'),('BLS Employment','https://www.bls.gov/feed/empsit.rss')]
    for publisher,url in feeds:
        try:
            items=[{**n,'retrievedAt':received_at(url)} for n in feed_items(fetch(url,publisher.replace(' ','-')+'-v2','text'),publisher,6)]
            out['releases']=[x for x in out['releases'] if x['publisher']!=publisher]+items
            health.append(success_health(publisher,url,items=len(items)))
        except Exception as e:health.append({'provider':publisher,'status':'previous data retained','detail':str(e)[:120]})
    try:
        url='https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value='+str(dt.date.today().year)
        tree=ET.fromstring(fetch(url,'treasury','text'));rows=[]
        for node in tree.iter():
            if node.tag.endswith('}properties'):
                row={x.tag.split('}')[-1]:x.text for x in node};date=(row.get('NEW_DATE') or '')[:10]
                if date:rows.append({'date':date,'twoYear':float(row['BC_2YEAR']) if row.get('BC_2YEAR') else None,'tenYear':float(row['BC_10YEAR']) if row.get('BC_10YEAR') else None})
        if rows:out['treasury']={'observations':sorted(rows,key=lambda x:x['date'])[-90:],'source':url,'publisher':'US Treasury','unit':'percent','retrievedAt':received_at(url)}
        health.append(success_health('US Treasury',url,observations=len(rows)))
    except Exception as e:health.append({'provider':'US Treasury','status':'previous data retained','detail':str(e)[:120]})
    for series,name,unit in [('DFF','Effective federal funds rate','percent'),('CPIAUCSL','Consumer Price Index','index, seasonally adjusted'),('UNRATE','US unemployment rate','percent')]:
        try:
            url=f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}&cosd={dt.date.today().year-1}-01-01'
            rows=list(csv.DictReader(io.StringIO(fetch(url,series,'text'))));valid=[{'date':r['observation_date'],'value':float(r[series])} for r in rows if r.get(series) not in (None,'','.','NaN')]
            if valid:out['series'][series]={'name':name,'unit':unit,'observations':valid[-90:],'source':f'https://fred.stlouisfed.org/series/{series}','publisher':'FRED / original federal agency','retrievedAt':received_at(url)}
            health.append(success_health('FRED '+series,url,observations=len(valid)))
        except Exception as e:health.append({'provider':'FRED '+series,'status':'previous data retained','detail':str(e)[:120]})
    # BLS v1 is an independent, keyless official source for the same monthly measures.
    out.setdefault('bls',{})
    for code,name,unit in [('LNS14000000','US unemployment rate','percent'),('CUSR0000SA0','Consumer Price Index','index, seasonally adjusted')]:
        try:
            url='https://api.bls.gov/publicAPI/v1/timeseries/data/'+code
            data=fetch(url,'bls-'+code,ttl=21600,validate=lambda x:x.get('status')=='REQUEST_SUCCEEDED' and bool(x.get('Results',{}).get('series')))
            rows=bls_observations(data,code)
            out['bls'][code]={'name':name,'unit':unit,'observations':rows,'source':url,'publisher':'Bureau of Labor Statistics','retrievedAt':received_at(url)}
            fallback_key='UNRATE' if code=='LNS14000000' else 'CPIAUCSL'
            if not out['series'].get(fallback_key,{}).get('observations') or out['series'][fallback_key]['observations'][-1]['date']<rows[-1]['date']:
                out['series'][fallback_key]={**out['bls'][code],'seriesId':code}
            health.append(success_health('BLS public API '+code,url,asOf=rows[-1]['date']))
        except Exception as e:health.append({'provider':'BLS public API '+code,'status':'previous data retained','lastAttemptAt':NOW,'detail':str(e)[:120]})
    for h in health:
        h.setdefault('lastAttemptAt',NOW)
        if h['status']!='available':h['lastSuccessAt']=latest(h.get('lastSuccessAt'),prior_health.get(h['provider'],{}).get('lastSuccessAt'))
    out['health']=health;write(path,out)

def expansion_symbols(existing,directory,atlas,count=4):
    rows=[dict(zip(atlas.get('columns',[]),r)) for r in atlas.get('rows',[])]
    candidates=[r for r in rows if r.get('ticker') not in existing and r.get('ticker') in directory and r.get('financialPeriods',0)>0 and re.fullmatch(r'[A-Z][A-Z0-9.-]{0,11}',r.get('ticker',''))]
    candidates.sort(key=lambda r:(-(r.get('marketCap') or 0),r['ticker']))
    seen={str(directory[t].get('cik')).zfill(10) for t in existing if t in directory};selected=[]
    for r in candidates:
        cik=str(directory[r['ticker']].get('cik')).zfill(10)
        if cik in seen:continue
        if len(selected)>=max(0,min(8,count)):break
        selected.append(r['ticker']);seen.add(cik)
    return selected

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tickers',default=None);parser.add_argument('--skip-macro',action='store_true');parser.add_argument('--expand',type=int,choices=range(9),default=4,help='Add up to eight directory-verified company dossiers per run');args=parser.parse_args()
    prepared=json.loads((DEST/'index.json').read_text()).get('symbols',[]) if (DEST/'index.json').exists() else []
    tickers=args.tickers.upper().split() if args.tickers else list(dict.fromkeys(TICKERS+[x['ticker'] for x in sorted(prepared,key=lambda x:x.get('lastAttemptAt',''))]))
    DEST.mkdir(parents=True,exist_ok=True)
    import sys
    from refresh_sec_symbols import refresh
    prior=refresh(sys.modules[__name__])
    directory={x['ticker']:x for x in prior['symbols']}
    atlas_path=ROOT/'data/market-atlas/index.json'
    if not args.tickers and atlas_path.exists():
        additions=expansion_symbols(tickers,directory,json.loads(atlas_path.read_text()),args.expand)
        tickers=list(dict.fromkeys(tickers+additions))
        print('Coverage expansion: '+(', '.join(additions) or 'no additions'),flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        records=list(pool.map(lambda t:build_company(t,directory),tickers))
    previous=json.loads((DEST/'index.json').read_text()).get('symbols',[]) if (DEST/'index.json').exists() else []
    merged={x['ticker']:x for x in previous};merged.update({x['ticker']:x for x in records})
    write(DEST/'index.json',{'retrievedAt':NOW,'symbols':list(merged.values()),'method':'SEC statements, filings and company events; official macro sources; retained market snapshots with original timestamps. Unapproved collectors remain paused.'})
    if not args.skip_macro:macro()
    report=HTTP.report()
    for resource in report.get('resources',[]):
        url=resource.get('url','')
        if 'apikey=' in url:
            parts=urllib.parse.urlsplit(url);query=urllib.parse.parse_qsl(parts.query,keep_blank_values=True)
            query=[(k,'REDACTED' if k.lower()=='apikey' else v) for k,v in query]
            resource['url']=urllib.parse.urlunsplit((parts.scheme,parts.netloc,parts.path,urllib.parse.urlencode(query),parts.fragment))
    write(DEST/'collection.json',report)
    print(f'Completed {len(records)} stock records and {len(directory)} searchable SEC tickers.',flush=True)

if __name__=='__main__':main()
