#!/usr/bin/env python3
"""A small publication manifest; attempts never masquerade as source observations."""
import datetime as dt, hashlib, json
from pathlib import Path
from import_market_quotes import effective, stamp

ROOT = Path(__file__).resolve().parents[1]

def read(path, default=None):
    try: return json.loads((ROOT/path).read_text())
    except (OSError, ValueError): return {} if default is None else default

def build():
    now = dt.datetime.now(dt.timezone.utc)
    items = read('data/open-research/index.json').get('symbols', [])
    bundles = [read('data/open-research/'+i['ticker']+'.json') for i in items]
    def latest(values):
        dated = [(stamp(x), x) for x in values if stamp(x)]
        return max(dated, default=(None,None), key=lambda x:x[0])[1]
    def component(name, dates, successes=(), attempts=(), max_hours=36):
        dates = list(dates); valid = [stamp(x) for x in dates if stamp(x)]
        current = sum(0 <= (now-x).total_seconds() <= max_hours*3600 for x in valid)
        return {'id':name, 'total':len(dates), 'available':len(valid), 'current':current, 'stale':len(valid)-current,
                'unavailable':len(dates)-len(valid), 'latestObservationAt':latest(dates),
                'lastSuccessfulRetrieval':latest(successes), 'lastAttemptAt':latest(attempts),
                'status':'Current' if dates and current==len(dates) else 'Partial' if current else 'Stale' if valid else 'Unavailable'}
    max_hours = 96 if now.weekday()==0 else 72 if now.weekday()==6 else 48 if now.weekday()==5 else 36
    parts = [component('quotes', [effective(b).isoformat() if b.get('quote') else None for b in bundles],
                       [b.get('priceSource',{}).get('retrievedAt') for b in bundles], [b.get('lastAttemptAt') for b in bundles], max_hours),
             component('priceHistory', [(b.get('bars') or [{}])[-1].get('date') for b in bundles], max_hours=max_hours),
             component('news', [latest(n.get('published') for n in b.get('news',[])) for b in bundles], max_hours=168),
             component('filings', [latest(f.get('filed') for f in b.get('filings',[])) for b in bundles], max_hours=24*120),
             component('financials', [latest(f.get('endDate') for f in b.get('financials',{}).get('quarterly',[])) for b in bundles], max_hours=24*150)]
    for part,provider in [(parts[3],'SEC filings'),(parts[4],'SEC financial statements')]:
        verified=[latest(h.get('lastSuccessAt') for h in b.get('health',[]) if h.get('provider')==provider) for b in bundles]
        attempts=[latest(h.get('lastAttemptAt') for h in b.get('health',[]) if h.get('provider')==provider) for b in bundles]
        current=sum(bool(stamp(x)) and 0 <= (now-stamp(x)).total_seconds() <= 72*3600 for x in verified)
        part.update(current=min(current,part['available']),stale=max(0,part['available']-current),lastSuccessfulRetrieval=latest(verified),lastAttemptAt=latest(attempts),status='Current' if current==part['total'] else 'Partial' if current else 'Stale' if part['available'] else 'Unavailable')
        part['note']='Reported dates are preserved. Current requires a successful source check within 72 hours.'
    news = read('data/information/news-health.json'); macro = read('data/open-research/macro.json')
    parts[2]['lastSuccessfulRetrieval'] = latest(x.get('lastSuccessAt') for x in news.get('feeds',[]))
    parts[2]['lastAttemptAt'] = news.get('generatedAt')
    parts[2]['note'] = 'Publication dates and successful feed checks are separate. A current feed can have no new headline.'
    for name,path in [('directory','data/information/directory-health.json'),('macro','data/open-research/macro.json'),('atlas','data/market-atlas/index.json')]:
        value=read(path); health=value.get('health',[])
        if name=='directory': health=[value]
        successes=[h.get('lastSuccessAt') for h in health]
        attempts=[h.get('lastAttemptAt') for h in health]
        c=component(name,[latest(successes)],successes,attempts,max_hours=72)
        c['note']='Refresh check time is not the date of every underlying observation.'
        if name=='atlas': c['status']='Partial'; c['total']=value.get('counts',{}).get('symbols',0)
        parts.append(c)
    tracker=read('data/recovery-os.json')
    parts.append({'id':'recoveryThesis','status':'Saved review','latestObservationAt':tracker.get('meta',{}).get('lastSuccessfulScan'),
                  'note':'Original discovery, thesis, scores and trades require an evidence review; quote refreshes do not change them.'})
    headlines={}
    for b in bundles:
        for item in b.get('news',[]):
            if item.get('url'): headlines[item['url']]={**item,'relatedTicker':b.get('ticker') or b.get('profile',{}).get('ticker')}
    for item in macro.get('releases',[]):
        if item.get('url'): headlines[item['url']]=item
    news_feed={'generatedAt':now.isoformat(),'items':sorted(headlines.values(),key=lambda x:x.get('published',''),reverse=True)[:600]}
    (ROOT/'data/news.json').write_text(json.dumps(news_feed,separators=(',',':'))+'\n')
    digest=hashlib.sha256()
    paths=[ROOT/'data/market-quotes.json',ROOT/'data/open-research/index.json',ROOT/'data/open-research/macro.json',ROOT/'data/market-atlas/index.json',ROOT/'data/information/coverage.json',ROOT/'data/information/connectors.json']
    paths += [ROOT/f'data/open-research/{i["ticker"]}.json' for i in items]
    for path in paths:
        if path.exists(): digest.update(path.read_bytes())
    return {'schemaVersion':1,'revision':digest.hexdigest()[:24],'completedAt':now.isoformat(),
            'status':'Current' if all(p['status']=='Current' for p in parts[:-1]) else 'Partial',
            'schedule':'Source refresh every day at 12:37 and 22:37 UTC; connected quote collection daily in the US evening.',
            'pollSeconds':60,'components':parts,'preparedDossiers':len(items),
            'quotesAsOf':parts[0]['latestObservationAt'],
            'limitations':['Quotes are dated observations, not a streaming feed.','Historical bars are not fabricated from a quote.',
                            'Source failures retain original timestamps.','The broad directory includes securities without current quotes or prepared research.']}

if __name__=='__main__':
    report=build();(ROOT/'data/refresh-status.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'dossiers':report['preparedDossiers'],'quotes':report['components'][0]}))
