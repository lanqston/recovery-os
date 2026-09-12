#!/usr/bin/env python3
"""Bounded source discovery. Candidates require human review; this has no adapter activation path."""
import argparse, datetime, hashlib, json, pathlib, urllib.parse, urllib.request, html.parser
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Links(html.parser.HTMLParser):
    def __init__(self): super().__init__(); self.urls=[]
    def handle_starttag(self,tag,attrs):
        if tag=='a': self.urls.extend(v for k,v in attrs if k=='href' and v)
def discover(check_links=False):
    registry=json.loads((ROOT/'data/information/providers.json').read_text()); candidates=[]
    for source in registry['sources']:
        docs=source['docs']; extra=[]; result='NOT_PROBED'
        # A source must explicitly approve documentation discovery in the registry.
        if check_links and source.get('documentationDiscoveryApproved') and docs:
            try:
                req=urllib.request.Request(docs[0],headers={'User-Agent':'RecoveryOS source-review/1.0 (https://github.com/lanqston/recovery-os)'})
                with urllib.request.urlopen(req,timeout=8) as r:
                    if urllib.parse.urlsplit(r.url).hostname!=urllib.parse.urlsplit(docs[0]).hostname: raise ValueError('Cross-host redirect requires review')
                    page=r.read(200000).decode('utf-8',errors='replace')
                parser=Links();parser.feed(page);host=urllib.parse.urlsplit(docs[0]).hostname
                extra=list(dict.fromkeys(urllib.parse.urljoin(docs[0],x) for x in parser.urls if any(k in x.lower() for k in ['api','data','rss','feed','developer'])))
                extra=[x for x in extra if urllib.parse.urlsplit(x).scheme=='https' and urllib.parse.urlsplit(x).hostname==host][:12];result='DOCUMENTATION_REACHABLE'
            except Exception as e: result=type(e).__name__+'; retained documentation record'
        for url in list(dict.fromkeys(docs+extra)):
            candidates.append({'id':hashlib.sha256(url.encode()).hexdigest()[:20],'operator':source['operator'],'url':url,'official':source['authority'] in ['Regulator','Government','Exchange / market authority'],'categories':source['categories'],'coverage':source['coverage'],'refresh':source['refresh'],'auth':source['auth'],'rateLimit':source['rateLimit'],'license':source['license'],'probe':result,'status':'REVIEW_REQUIRED','automatedAccess':'Not approved for new ingestion until source-specific review','reliability':'Not measured','existingStrongerSource':'Must be checked for each field and reporting period','value':'Candidate coverage for '+', '.join(source['categories']),'validationRequired':['Access and licensing','Identity and timestamps','Quality tests','Fallback behavior'],'activationAllowed':False})
    return {'schemaVersion':1,'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidates':candidates,'releaseEnabled':False}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--check-links',action='store_true');p.add_argument('--output',default='data/information/source-review.json');a=p.parse_args();target=pathlib.Path(a.output);target.parent.mkdir(parents=True,exist_ok=True);r=discover(a.check_links);target.write_text(json.dumps(r,indent=2)+'\n');print(f"{len(r['candidates'])} candidates queued; no providers activated")
