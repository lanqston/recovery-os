import datetime as dt,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from refresh_official_context import parse_release,parse_rates
class OfficialContextTests(unittest.TestCase):
 def setUp(self):self.now=dt.datetime(2026,9,30,tzinfo=dt.timezone.utc)
 def test_company_name_matching_is_bounded(self):
  row={'date':str(self.now.timestamp()-86400),'title':'Google settlement announced','url':'https://www.justice.gov/opa/pr/example'}
  self.assertEqual(parse_release(row,{'GOOG':['Google'],'ON':['onsemi']},self.now)['tickers'],['GOOG'])
  row['title']='Googler charged';self.assertIsNone(parse_release(row,{'GOOG':['Google']},self.now))
 def test_future_and_untrusted_records_rejected(self):
  row={'date':str(self.now.timestamp()+86400),'title':'Google settlement','url':'https://www.justice.gov/opa/pr/a'}
  self.assertIsNone(parse_release(row,{'GOOG':['Google']},self.now));row['date']=str(self.now.timestamp());row['url']='https://example.com/a';self.assertIsNone(parse_release(row,{'GOOG':['Google']},self.now))
 def test_rates_require_both_valid_dated_benchmarks(self):
  d={'refRates':[{'type':t,'effectiveDate':'2026-09-29','percentRate':3.9} for t in ['SOFR','EFFR']]}
  self.assertEqual(len(parse_rates(d,self.now)),2);d['refRates'][0]['percentRate']='NaN'
  with self.assertRaises(ValueError):parse_rates(d,self.now)
