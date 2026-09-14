"""Publish factual connector status and bounded automatic-maintenance recommendations."""
import collections,datetime as dt,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(path,default):
    try:return json.loads((ROOT/path).read_text())
    except (OSError,ValueError):return default
def build():
    groups=collections.defaultdict(list)
    index=read('data/open-research/index.json',{'symbols':[]})
    for x in index['symbols']:
        b=read('data/open-research/'+x['ticker']+'.json',{})
        for h in b.get('health',[]):
            last=b.get('priceSource',{}).get('retrievedAt') if h['provider']=='Yahoo daily history' else b.get('financials',{}).get('retrievedAt') if h['provider']=='SEC financial statements' else b.get('retrievedAt') if h['provider']=='SEC filings' else None
            groups[h['provider']].append({**h,'ticker':x['ticker'],'recordRetrievedAt':last,'attemptedAt':b.get('lastAttemptAt')})
    macro=read('data/open-research/macro.json',{})
    for h in macro.get('health',[]):groups[h['provider']].append(h)
    atlas=read('data/market-atlas/index.json',{})
    for h in atlas.get('health',[]):groups[h['provider']].append({**h,'lastAttemptAt':atlas.get('retrievedAt'),'lastSuccessAt':atlas.get('retrievedAt') if h.get('status')=='available' else None})
    directory=read('data/information/directory-health.json',{})
    if directory:groups['SEC symbol directory'].append({**directory,'detail':directory.get('error','')})
    providers=[]
    for name,rows in groups.items():
        paused=all('paused' in x.get('detail','').lower() for x in rows)
        good=[x for x in rows if x.get('status') in ('available','Current')]
        success=[x.get('lastSuccessAt') or x.get('recordRetrievedAt') for x in rows]
        attempts=[x.get('lastAttemptAt') or x.get('attemptedAt') for x in rows]
        providers.append({'provider':name,'cost':'Free / public sources only','status':'Paused' if paused else 'Current' if len(good)==len(rows) else 'Partial' if good else 'Cached',
          'successfulRecords':len(good),'checkedRecords':len(rows),'lastSuccessAt':max(filter(None,success),default=None),'lastAttemptAt':max(filter(None,attempts),default=None),
          'errors':list(dict.fromkeys(x.get('detail') for x in rows if x.get('detail')))[:5],
          'fallback':'Retained observations with original timestamps, then original source links','paidRequests':False})
    collection=read('data/open-research/collection.json',{})
    return {'schemaVersion':1,'generatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'mode':'FREE_SOURCES_ONLY','providers':providers,
      'coverage':{'securities':atlas.get('counts',{}).get('symbols',0),'preparedDossiers':len(index['symbols'])},
      'efficiency':{k:collection.get(k,0)+read('data/market-atlas/collection.json',{}).get('http',{}).get(k,0) for k in ('requests','cacheHits','requestsAvoided')},
      'automaticMaintenance':{'refresh':'Weekdays before and after the US regular session; manual refresh also available','coverageGrowth':'Up to four additional directory-verified company dossiers per collection, prioritized by available market cap; no fabricated price history','dataProtection':'Failed or invalid requests retain the last verified data and original timestamps','requests':'Conditional requests, cache reuse, host cooldowns and bounded retries','quality':'Financial and price checks, source coverage reports, and tracker integrity gate','rendering':'Bounded frame-time adaptation; reduced detail on slower devices','codeChanges':'Evidence-backed improvement proposals require validation and review'},
      'limitations':['Market sources paused for access permission remain paused; stored quotes are not live.','Analyst, options and intraday coverage is unavailable where no compatible free source is connected.','A passing application check does not imply that every upstream provider is reachable.']}
if __name__=='__main__':
    report=build();p=ROOT/'data/information/connectors.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'providers':len(report['providers']),'efficiency':report['efficiency']}))
