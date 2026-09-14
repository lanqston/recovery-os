import json,sys,tempfile,unittest,urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from public_http import PublicHTTP,FetchError,retry_seconds
class Response:
    def __init__(self,body,headers=None):self.body=json.dumps(body).encode();self.headers=headers or {}
    def read(self,n):return self.body[:n]
    def __enter__(self):return self
    def __exit__(self,*args):pass
class HTTPTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
    def client(self,opener):return PublicHTTP(self.temp.name,'RecoveryOS test',opener=opener,sleep=lambda _:None)
    def test_cache_and_conditional_request(self):
        calls=[]
        def opener(request,**kwargs):
            calls.append(request)
            if len(calls)>1:raise urllib.error.HTTPError(request.full_url,304,'Not modified',{},None)
            return Response({'price':5},{'ETag':'test'})
        c=self.client(opener);first=c.fetch('https://data.sec.gov/test');self.assertEqual(c.fetch('https://data.sec.gov/test'),first);self.assertEqual(len(calls),1)
        self.assertEqual(c.fetch('https://data.sec.gov/test',ttl=0),first);self.assertEqual(calls[-1].get_header('If-none-match'),'test')
    def test_directory_403_does_not_block_data_host_and_persists_cooldown(self):
        calls=[]
        def opener(request,**kwargs):
            calls.append(request.full_url)
            if 'www.sec.gov' in request.full_url:raise urllib.error.HTTPError(request.full_url,403,'Forbidden',{},None)
            return Response({'ok':True})
        c=self.client(opener)
        with self.assertRaises(FetchError):c.fetch('https://www.sec.gov/directory')
        with self.assertRaises(FetchError):self.client(opener).fetch('https://www.sec.gov/directory')
        self.assertEqual(c.fetch('https://data.sec.gov/company')['ok'],True);self.assertEqual(len(calls),2)
    def test_network_retry_and_schema_failure_preserve_cache(self):
        calls=[]
        def opener(request,**kwargs):
            calls.append(1)
            if len(calls)<3:raise urllib.error.URLError('temporary')
            return Response({'price':5})
        c=self.client(opener);self.assertEqual(c.fetch('https://data.sec.gov/facts')['price'],5);self.assertEqual(len(calls),3)
        c.opener=lambda *a,**k:Response({'price':'bad'})
        with self.assertRaises(FetchError):c.fetch('https://data.sec.gov/facts',ttl=0,validate=lambda x:isinstance(x.get('price'),int))
        self.assertEqual(c.fetch('https://data.sec.gov/facts')['price'],5)
    def test_retry_after_date(self):self.assertEqual(retry_seconds('Thu, 01 Jan 1970 00:01:00 GMT',0),60)
if __name__=='__main__':unittest.main()

class CoverageExpansionTests(unittest.TestCase):
    def test_only_directory_verified_companies_expand_within_budget(self):
        from refresh_open_research import expansion_symbols
        atlas={'columns':['ticker','marketCap','financialPeriods'],'rows':[['AAPL',10,9],['ZZZ',5,1],['BBB',8,1],['BAD',100,9],['GAP',90,0]]}
        self.assertEqual(expansion_symbols(['AAPL'],{'AAPL':{'cik':'1'},'ZZZ':{'cik':'2'},'BBB':{'cik':'3'},'GAP':{'cik':'4'}},atlas,1),['BBB'])
        self.assertEqual(expansion_symbols([],{},atlas),[])

class BLSObservationTests(unittest.TestCase):
    def test_unreleased_months_and_annual_summary_are_not_numeric_observations(self):
        from refresh_open_research import bls_observations
        d={'Results':{'series':[{'seriesID':'TEST','data':[{'year':'2026','period':'M09','value':'-'},{'year':'2026','period':'M08','value':'4.2'},{'year':'2026','period':'M13','value':'5.0'}]}]}}
        self.assertEqual(bls_observations(d,'TEST'),[{'date':'2026-08-01','value':4.2,'precision':'month'}])
        with self.assertRaises(ValueError):bls_observations(d,'WRONG')
