import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import build_market_atlas as atlas

class MarketAtlasTests(unittest.TestCase):
    def fact(self,value,start='2026-04-01',end='2026-06-30',accn='0000000123-26-000005'):
        return {'val':value,'start':start,'end':end,'accn':accn,'priority':0,'concept':'TestConcept'}
    def test_exact_period_matching(self):
        rows=atlas.normalize_company('123',{(2026,2):{'revenue':[self.fact(100)],'netIncome':[self.fact(15,start='2026-01-01')],'cash':[self.fact(40,start=None)]}})
        self.assertEqual(rows[0]['revenue'],100);self.assertEqual(rows[0]['cash'],40);self.assertNotIn('netIncome',rows[0])
    def test_field_specific_source(self):
        rows=atlas.normalize_company('123',{(2026,2):{'revenue':[self.fact(100)],'netIncome':[self.fact(15,accn='0000000123-26-000006')]}})
        self.assertIn('000000012326000006',rows[0]['metricSources']['netIncome']);self.assertEqual(rows[0]['netMarginPct'],15)
    def test_preserves_actual_company_dates(self):
        rows=atlas.normalize_company('123',{(2026,2):{'revenue':[self.fact(100,start='2026-03-29',end='2026-06-27')]}})
        self.assertEqual(rows[0]['endDate'],'2026-06-27');self.assertNotIn('fiscalYear',rows[0])
    def test_income_without_standard_revenue(self):
        rows=atlas.normalize_company('123',{(2026,2):{'netIncome':[self.fact(-5)]}})
        self.assertEqual(rows[0]['netIncome'],-5);self.assertNotIn('revenue',rows[0]);self.assertNotIn('netMarginPct',rows[0])
    def test_partial_failure_retains_evidence(self):
        old={'startDate':'2026-04-01','endDate':'2026-06-30','currency':'USD','source':'https://sec.gov/old','revenue':100,'cash':42}
        new={**old,'source':'https://sec.gov/new','revenue':0};del new['cash']
        merged=atlas.retain_periods([old],[new])[0]
        self.assertEqual(merged['revenue'],0);self.assertEqual(merged['cash'],42);self.assertEqual(merged['metricSources']['cash'],old['source'])
    def test_numeric_parser(self):
        self.assertEqual(atlas.number('$1,250.50'),1250.5);self.assertEqual(atlas.number('0'),0)
        for value in [None,'N/A','NaN','Infinity']:self.assertIsNone(atlas.number(value))

if __name__=='__main__':unittest.main()
