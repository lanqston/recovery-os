import importlib.util, unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('public_research',Path(__file__).resolve().parents[1]/'scripts/refresh_open_research.py')
model=importlib.util.module_from_spec(spec);spec.loader.exec_module(model)

class PublicResearchTests(unittest.TestCase):
    def fact(self,value,start='2026-04-01',end='2026-06-30',filed='2026-08-01'):
        return {'val':value,'start':start,'end':end,'filed':filed,'form':'10-Q','accn':'0000000123-26-000005','fy':2026,'fp':'Q2'}
    def bundle(self):
        return {'facts':{'us-gaap':{
          'RevenueFromContractWithCustomerExcludingAssessedTax':{'units':{'USD':[self.fact(120)]}},
          'NetIncomeLoss':{'units':{'USD':[self.fact(20)]}},
          'NetCashProvidedByUsedInOperatingActivities':{'units':{'USD':[self.fact(80,start='2026-01-01')]}},
          'PaymentsToAcquirePropertyPlantAndEquipment':{'units':{'USD':[self.fact(30,start='2026-01-01')]}},
          'WeightedAverageNumberOfDilutedSharesOutstanding':{'units':{'shares':[self.fact(100)]}},
          'EarningsPerShareDiluted':{'units':{'USD/shares':[self.fact(0.2)]}},
          'AssetsCurrent':{'units':{'USD':[dict(self.fact(80),start=None)]}},
          'LiabilitiesCurrent':{'units':{'USD':[dict(self.fact(40),start=None)]}}
        }}}
    def normalized(self,b=None):return model.normalize_facts(b or self.bundle(),{'cik':123,'fiscalYearEnd':'1231'})
    def test_cash_flow_period_not_mixed(self):
        x=self.normalized();q=x['quarterly'][0];cash=x['cashFlowPeriod']
        self.assertIsNone(q['operatingCashFlow']);self.assertIsNone(q['freeCashFlow'])
        self.assertEqual(cash['freeCashFlow'],50);self.assertEqual(cash['scope'],'Year to date')
        self.assertEqual(q['dilutedShares'],100);self.assertEqual(q['dilutedEPS'],.2)
        self.assertEqual(q['currentRatio'],2);self.assertEqual(q['period'],'Q2 FY2026')
    def test_fiscal_year_mapping(self):
        x=model.normalize_facts(self.bundle(),{'cik':123,'fiscalYearEnd':'0930'})
        self.assertEqual(x['quarterly'][0]['period'],'Q3 FY2026')
    def test_newer_filing_wins_and_zero_is_valid(self):
        b=self.bundle();tag=b['facts']['us-gaap']['RevenueFromContractWithCustomerExcludingAssessedTax']['units']['USD']
        tag.append(self.fact(0,filed='2026-08-15'));q=self.normalized(b)['quarterly'][0]
        self.assertEqual(q['revenue'],0);self.assertIsNone(q['operatingMarginPct'])
        self.assertEqual(q['filingDate'],'2026-08-15')
    def test_missing_capex_stays_missing(self):
        b=self.bundle();del b['facts']['us-gaap']['PaymentsToAcquirePropertyPlantAndEquipment']
        self.assertIsNone(self.normalized(b)['cashFlowPeriod']['freeCashFlow'])
    def test_feed_rss_and_atom(self):
        rss='<rss><channel><item><title>Company release</title><link>https://example.com/report</link><pubDate>Fri, 11 Sep 2026 15:00:00 GMT</pubDate></item></channel></rss>'
        atom='<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Inflation release</title><link href="https://bls.gov/report"/><updated>2026-09-11T12:00:00Z</updated></entry></feed>'
        self.assertEqual(model.feed_items(rss,'Yahoo Finance RSS')[0]['sourceType'],'NEWS')
        self.assertEqual(model.feed_items(atom,'BLS CPI')[0]['url'],'https://bls.gov/report')

if __name__=='__main__':unittest.main()
