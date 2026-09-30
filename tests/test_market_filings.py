import datetime as dt,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from refresh_market_filings import parse
class FilingsTest(unittest.TestCase):
 def test_small_company_and_compact_date(self):
  rows=parse('123|Small Company|8-K|20260929|edgar/data/123/000123-26-001.txt',{123:['SMALL','SMALL.A']},dt.datetime(2026,9,30))
  self.assertEqual(rows[0]['published'],'2026-09-29');self.assertEqual(rows[0]['tickers'],['SMALL','SMALL.A'])
 def test_unmapped_future_routine_and_bad_path_excluded(self):
  text='\n'.join(['123|Company|4|20260929|edgar/data/123/000123-26-001.txt','123|Company|8-K|20261001|edgar/data/123/000123-26-002.txt','123|Company|8-K|20260929|https://evil.example/','456|Other|8-K|20260929|edgar/data/456/000456-26-001.txt'])
  self.assertEqual(parse(text,{123:['SMALL']},dt.datetime(2026,9,30)),[])
if __name__=='__main__':unittest.main()
