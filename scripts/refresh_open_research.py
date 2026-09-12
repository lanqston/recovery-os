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
    path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')),encoding='utf8')

def fetch(url,cache_key=None,kind='json'):
    global last_sec
    if cache_key:
        p=CACHE/(cache_key+'.'+('json' if kind=='json' else 'txt'))
        if p.exists() and time.time()-p.stat().st_mtime<7200:
            return json.loads(p.read_text()) if kind=='json' else p.read_text()
    if 'sec.gov/' in url:
        with lock:
            delay=max(0,0.55-(time.monotonic()-last_sec))
            if delay:time.sleep(delay)
            last_sec=time.monotonic()
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json, application/xml, text/csv, */*'})
    with urllib.request.urlopen(req,timeout=22) as res:
        text=res.read(18_000_000).decode('utf-8-sig')
    value=json.loads(text) if kind=='json' else text
    if cache_key:
        p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
    return value

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
    accepted={'10-K','10-Q','8-K','10-K/A','10-Q/A','20-F','6-K','DEF 14A'}
    labels={'10-K':'Annual report','10-Q':'Quarterly results','8-K':'Current company event','DEF 14A':'Proxy and governance','20-F':'Annual foreign-issuer report','6-K':'Foreign-issuer update'}
    for i,form in enumerate(r.get('form',[])):
        if form not in accepted:continue
        def at(k):return r.get(k,[])[i] if i<len(r.get(k,[])) else ''
        items.append({'form':form,'title':labels.get(form,form),'filed':at('filingDate'),'reportDate':at('reportDate'),'accession':at('accessionNumber'),'items':at('items'),'url':accession_url(sub['cik'],at('accessionNumber'),at('primaryDocument'))})
        if len(items)>=16:break
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
    result={'ticker':t,'retrievedAt':NOW,'health':[]};entry=directory.get(t)
    old_path=DEST/(t+'.json');old=json.loads(old_path.read_text()) if old_path.exists() else {}
    if entry:
        try:
            cik=str(entry['cik']).zfill(10);sub=fetch(f'https://data.sec.gov/submissions/CIK{cik}.json',t+'-submissions')
            result['profile']={'ticker':t,'name':sub.get('name',entry['name']),'exchange':entry.get('exchange'),'cik':cik,'industry':sub.get('sicDescription'),'fiscalYearEnd':sub.get('fiscalYearEnd'),'homepage':sub.get('website') or None,'investorRelations':sub.get('investorWebsite') or None}
            result['filings']=filings(sub);result['health'].append({'provider':'SEC filings','status':'available','asOf':result['filings'][0]['filed'] if result['filings'] else None})
            if t not in ('SPY','QQQ'):
                facts=fetch(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json',t+'-facts');f=normalize_facts(facts,sub)
                if f.get('quarterly') or f.get('annual'):result['financials']=f
                result['health'].append({'provider':'SEC financial statements','status':'available' if f.get('quarterly') else 'no standard quarterly facts','asOf':f.get('quarterly',[{}])[0].get('endDate') if f.get('quarterly') else None})
        except Exception as e:result['health'].append({'provider':'SEC','status':'last successful record retained' if old else 'unavailable','detail':str(e)[:150]})
    try:
        bars,meta=price_bars(t)
        if bars:
            last=bars[-1];prior=bars[-2] if len(bars)>1 else last
            result['bars']=bars;result['quote']={'price':last['close'],'changePct':ratio(last['close']-prior['close'],prior['close'],100),'timestamp':last['date']+' daily close','source':'Yahoo Finance public daily history','dataState':'DAILY SNAPSHOT','currency':meta.get('currency','USD')}
            result['priceSource']={'title':'Yahoo Finance daily history','url':f'https://finance.yahoo.com/quote/{urllib.parse.quote(t)}/history/','publisher':'Yahoo Finance','date':last['date']}
            result['health'].append({'provider':'Yahoo daily history','status':'available','asOf':last['date']})
    except Exception as e:result['health'].append({'provider':'Yahoo daily history','status':'saved price history retained','detail':str(e)[:150]})
    try:
        rss=fetch(f'https://feeds.finance.yahoo.com/rss/2.0/headline?s={urllib.parse.quote(t)}&region=US&lang=en-US',t+'-rss','text')
        result['news']=feed_items(rss,'Yahoo Finance RSS',8);result['health'].append({'provider':'Yahoo Finance RSS','status':'available','items':len(result['news'])})
    except Exception as e:result['health'].append({'provider':'Yahoo Finance RSS','status':'saved news retained','detail':str(e)[:150]})
    merged={**old,**result};write(old_path,merged)
    print(f'{t}: {len(merged.get("financials",{}).get("quarterly",[]))} quarters, {len(merged.get("filings",[]))} filings, {len(merged.get("bars",[]))} bars',flush=True)
    return {'ticker':t,'name':merged.get('profile',{}).get('name',entry['name'] if entry else t),'exchange':entry.get('exchange') if entry else None,'cik':entry.get('cik') if entry else None,'financialThrough':merged.get('financials',{}).get('quarterly',[{}])[0].get('endDate') if merged.get('financials',{}).get('quarterly') else None,'priceThrough':merged.get('bars',[{}])[-1].get('date'),'filings':len(merged.get('filings',[])),'health':merged.get('health',[])}

def macro():
    path=DEST/'macro.json';out=json.loads(path.read_text()) if path.exists() else {'releases':[],'series':{}}
    out['retrievedAt']=NOW;health=[]
    feeds=[('Federal Reserve','https://www.federalreserve.gov/feeds/press_monetary.xml'),('BLS CPI','https://www.bls.gov/feed/cpi.rss'),('BLS Employment','https://www.bls.gov/feed/empsit.rss')]
    for publisher,url in feeds:
        try:
            items=feed_items(fetch(url,publisher.replace(' ','-'),'text'),publisher,4)
            out['releases']=[x for x in out['releases'] if x['publisher']!=publisher]+items
            health.append({'provider':publisher,'status':'available','items':len(items),'url':url})
        except Exception as e:health.append({'provider':publisher,'status':'previous data retained','detail':str(e)[:120]})
    try:
        url='https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value='+str(dt.date.today().year)
        tree=ET.fromstring(fetch(url,'treasury','text'));rows=[]
        for node in tree.iter():
            if node.tag.endswith('}properties'):
                row={x.tag.split('}')[-1]:x.text for x in node};date=(row.get('NEW_DATE') or '')[:10]
                if date:rows.append({'date':date,'twoYear':float(row['BC_2YEAR']) if row.get('BC_2YEAR') else None,'tenYear':float(row['BC_10YEAR']) if row.get('BC_10YEAR') else None})
        if rows:out['treasury']={'observations':sorted(rows,key=lambda x:x['date'])[-90:],'source':url,'publisher':'US Treasury','unit':'percent'}
        health.append({'provider':'US Treasury','status':'available','observations':len(rows),'url':url})
    except Exception as e:health.append({'provider':'US Treasury','status':'previous data retained','detail':str(e)[:120]})
    for series,name,unit in [('DFF','Effective federal funds rate','percent'),('CPIAUCSL','Consumer Price Index','index, seasonally adjusted'),('UNRATE','US unemployment rate','percent')]:
        try:
            url=f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}&cosd={dt.date.today().year-1}-01-01'
            rows=list(csv.DictReader(io.StringIO(fetch(url,series,'text'))));valid=[{'date':r['observation_date'],'value':float(r[series])} for r in rows if r.get(series) not in (None,'','.','NaN')]
            if valid:out['series'][series]={'name':name,'unit':unit,'observations':valid[-90:],'source':f'https://fred.stlouisfed.org/series/{series}','publisher':'FRED / original federal agency'}
            health.append({'provider':'FRED '+series,'status':'available','observations':len(valid)})
        except Exception as e:health.append({'provider':'FRED '+series,'status':'previous data retained','detail':str(e)[:120]})
    out['health']=health;write(path,out)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tickers',default=' '.join(TICKERS));parser.add_argument('--skip-macro',action='store_true');args=parser.parse_args()
    DEST.mkdir(parents=True,exist_ok=True)
    try:
        raw=fetch('https://www.sec.gov/files/company_tickers_exchange.json','company-directory')
        directory={row[2]:dict(zip(raw['fields'],row)) for row in raw['data']}
        write(DEST/'directory.json',{'source':'https://www.sec.gov/files/company_tickers_exchange.json','retrievedAt':NOW,'symbols':[{'ticker':t,'name':x['name'],'exchange':x['exchange'],'cik':str(x['cik']).zfill(10)} for t,x in directory.items()]})
    except Exception as error:
        prior=json.loads((DEST/'directory.json').read_text()) if (DEST/'directory.json').exists() else {'symbols':[]}
        directory={x['ticker']:{'ticker':x['ticker'],'name':x.get('name',x['ticker']),'exchange':x.get('exchange'),'cik':int(x['cik']) if str(x.get('cik','')).isdigit() else 0} for x in prior.get('symbols',[])}
        print(f'SEC directory unavailable; retaining previous directory ({error})',flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        records=list(pool.map(lambda t:build_company(t,directory),args.tickers.upper().split()))
    previous=json.loads((DEST/'index.json').read_text()).get('symbols',[]) if (DEST/'index.json').exists() else []
    merged={x['ticker']:x for x in previous};merged.update({x['ticker']:x for x in records})
    write(DEST/'index.json',{'retrievedAt':NOW,'symbols':list(merged.values()),'method':'Public SEC statements and filing history, Yahoo daily history and RSS; preserved snapshots on provider failure.'})
    if not args.skip_macro:macro()
    print(f'Completed {len(records)} stock records and {len(directory)} searchable SEC tickers.',flush=True)

if __name__=='__main__':main()
