"""Refresh the shared SEC directory; retain the exact prior file on upstream failure."""
import datetime as dt,json
from pathlib import Path

def refresh(public=None):
    if public is None:
        import refresh_open_research as public
    path=public.DEST/'directory.json';now=dt.datetime.now(dt.timezone.utc).isoformat()
    prior=json.loads(path.read_text()) if path.exists() else {'symbols':[]}
    try:
        url='https://www.sec.gov/files/company_tickers_exchange.json'
        source=public.fetch(url,'company-directory',ttl=86400,validate=lambda x:isinstance(x.get('data'),list) and {'cik','ticker','name','exchange'}.issubset(x.get('fields',[])))
        rows=[dict(zip(source['fields'],r)) for r in source['data']]
        symbols=[{'ticker':r['ticker'],'name':r['name'],'exchange':r['exchange'],'cik':str(r['cik']).zfill(10)} for r in rows if r.get('ticker') and str(r.get('cik','')).isdigit()]
        if len(symbols)<max(1000,len(prior['symbols'])*.8):raise ValueError('Unexpected directory shrinkage; previous file retained')
        prior={'source':url,'retrievedAt':now,'symbols':symbols};public.write(path,prior)
        status={'status':'Current','lastSuccessAt':now,'lastAttemptAt':now,'records':len(symbols)}
    except Exception as e:
        status={'status':'Cached' if prior['symbols'] else 'Unavailable','lastSuccessAt':prior.get('retrievedAt'),'lastAttemptAt':now,'records':len(prior['symbols']),'error':str(e),'retryAt':getattr(e,'retry_at',None)}
    legacy=public.ROOT/'data/sec-symbols.json'
    # Regenerate only from a successful directory fetch, or when no compatibility file exists.
    if status['status']=='Current' or not legacy.exists():
        public.write(legacy,{'meta':{'source':prior.get('source'),'generatedAt':prior.get('retrievedAt'),'coverage':'SEC-listed securities; directory membership is not a price feed.'},'symbols':[{**r,'securityType':'SEC registrant'} for r in prior['symbols'] if r.get('exchange') in {'Nasdaq','NYSE','NYSE American','NYSE Arca','Cboe'}]})
    public.write(public.ROOT/'data/information/directory-health.json',status);print(json.dumps(status));return prior

if __name__=='__main__':refresh()
