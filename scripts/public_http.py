"""Shared free-source HTTP policy: cache validators, bounded retries and durable cooldowns."""
import datetime as dt,email.utils,hashlib,json,math,os,threading,time,urllib.error,urllib.parse,urllib.request
from pathlib import Path

class FetchError(RuntimeError):
    def __init__(self,code,status=None,retry_at=None):
        super().__init__(code);self.code=code;self.status=status;self.retry_at=retry_at

def iso(stamp):return dt.datetime.fromtimestamp(stamp,dt.timezone.utc).isoformat()
def retry_seconds(value,now):
    try:
        n=float(value)
        if math.isfinite(n):return max(0,n)
    except (TypeError,ValueError):pass
    try:return max(0,email.utils.parsedate_to_datetime(value).timestamp()-now)
    except (TypeError,ValueError,OverflowError):return 60

class PublicHTTP:
    def __init__(self,cache,ua,opener=urllib.request.urlopen,clock=time.time,sleep=time.sleep):
        self.cache=Path(cache);self.ua=ua;self.opener=opener;self.clock=clock;self.sleep=sleep
        self.lock=threading.RLock();self.gates={};self.last={};self.pending={};self.requests=0;self.hits=0;self.skipped=0
        self.state_path=self.cache/'http-state.json'
        try:self.state=json.loads(self.state_path.read_text())
        except (OSError,ValueError):self.state={'cooldowns':{},'resources':{}}
    def save(self):
        with self.lock:
            self.cache.mkdir(parents=True,exist_ok=True);temp=self.state_path.with_suffix('.tmp')
            temp.write_text(json.dumps(self.state,separators=(',',':')));temp.replace(self.state_path)
    def metadata(self,url):
        with self.lock:
            return dict(self.state['resources'].get(hashlib.sha256(url.encode()).hexdigest(),{}))
    def fetch(self,url,cache_key=None,kind='json',ttl=7200,validate=None):
        parsed=urllib.parse.urlparse(url)
        if parsed.scheme!='https' or parsed.username or parsed.password:raise FetchError('SOURCE_URL_NOT_ALLOWED',400)
        key=hashlib.sha256(url.encode()).hexdigest();path=self.cache/((cache_key or key)+('.json' if kind=='json' else '.txt'))
        with self.lock:
            gate=self.pending.setdefault(key,threading.Lock())
            host_gate=self.gates.setdefault(parsed.hostname,threading.Lock())
        # Coalesce each resource; allow bounded workers to download distinct records.
        with gate:
            now=self.clock();meta=self.state['resources'].get(key,{})
            if path.exists() and now-path.stat().st_mtime<ttl:
                try:
                    body=path.read_text();value=json.loads(body) if kind=='json' else body
                    if validate and not validate(value):raise ValueError('schema')
                    self.hits+=1;return value
                except (ValueError,OSError):pass
            until=max(self.state['cooldowns'].get(parsed.hostname,0),meta.get('retryUntil',0))
            if until>now:self.skipped+=1;raise FetchError('SOURCE_COOLDOWN',meta.get('httpStatus'),iso(until))
            headers={'User-Agent':self.ua,'Accept':'application/json, application/xml, text/csv, */*'}
            if path.exists():
                if meta.get('etag'):headers['If-None-Match']=meta['etag']
                if meta.get('modified'):headers['If-Modified-Since']=meta['modified']
            for attempt in range(3):
                with host_gate:
                    delay=max(0,(self.last.get(parsed.hostname,0)+(.55 if parsed.hostname.endswith('sec.gov') else .12))-self.clock())
                    if delay:self.sleep(delay)
                    attempted=self.clock()
                    until=self.state['cooldowns'].get(parsed.hostname,0)
                    if until>attempted:self.skipped+=1;raise FetchError('SOURCE_COOLDOWN',429,iso(until))
                    self.last[parsed.hostname]=attempted;self.requests+=1
                try:
                    with self.opener(urllib.request.Request(url,headers=headers),timeout=18) as response:
                        content=response.read(18_000_001)
                        if len(content)>18_000_000:raise FetchError('PAYLOAD_TOO_LARGE',502)
                        body=content.decode('utf-8-sig');value=json.loads(body) if kind=='json' else body
                        if not body.strip() or kind=='json' and not isinstance(value,(dict,list)) or validate and not validate(value):raise FetchError('SOURCE_SCHEMA_CHANGED',502)
                        if kind=='text' and ('<html' in body[:500].lower() or '<!doctype html' in body[:500].lower()):raise FetchError('UNEXPECTED_HTML_RESPONSE',502)
                        self.cache.mkdir(parents=True,exist_ok=True);temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(body);temp.replace(path)
                        self.state['resources'][key]={'url':url,'lastSuccessAt':iso(attempted),'lastAttemptAt':iso(attempted),'httpStatus':200,'etag':response.headers.get('ETag'),'modified':response.headers.get('Last-Modified'),'bytes':len(content)}
                        self.save();return value
                except urllib.error.HTTPError as e:
                    if e.code==304 and path.exists():
                        body=path.read_text();value=json.loads(body) if kind=='json' else body
                        if validate and not validate(value):raise FetchError('CACHED_SCHEMA_CHANGED',502)
                        os.utime(path,(attempted,attempted));self.state['resources'][key]={**meta,'url':url,'lastAttemptAt':iso(attempted),'lastVerifiedAt':iso(attempted),'httpStatus':304};self.hits+=1;self.save();return value
                    wait=retry_seconds(e.headers.get('Retry-After'),attempted) if e.code==429 else 3600 if e.code in (401,403) else 21600 if e.code==404 else 30
                    if e.code in (401,403,429):self.state['cooldowns'][parsed.hostname]=attempted+wait
                    self.state['resources'][key]={**meta,'url':url,'lastAttemptAt':iso(attempted),'httpStatus':e.code,'error':'HTTP_'+str(e.code),'retryUntil':attempted+wait}
                    self.save()
                    if e.code>=500 and attempt<2:self.sleep(.25*2**attempt);continue
                    raise FetchError('HTTP_'+str(e.code),e.code,iso(attempted+wait)) from None
                except (urllib.error.URLError,TimeoutError,ConnectionError) as e:
                    if attempt<2:self.sleep(.25*2**attempt);continue
                    self.state['resources'][key]={**meta,'url':url,'lastAttemptAt':iso(attempted),'error':'NETWORK_OR_TIMEOUT','retryUntil':attempted+60};self.save();raise FetchError('NETWORK_OR_TIMEOUT',503,iso(attempted+60)) from None
                except (ValueError,UnicodeError,FetchError) as e:
                    code=e.code if isinstance(e,FetchError) else 'INVALID_SOURCE_FORMAT'
                    self.state['resources'][key]={**meta,'url':url,'lastAttemptAt':iso(attempted),'error':code,'retryUntil':attempted+3600};self.save();raise FetchError(code,502,iso(attempted+3600)) from None
    def report(self):
        return {'generatedAt':iso(self.clock()),'requests':self.requests,'cacheHits':self.hits,'requestsAvoided':self.skipped,'resources':list(self.state['resources'].values())}
