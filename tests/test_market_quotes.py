import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from import_market_quotes import parse, effective

class Quotes(unittest.TestCase):
    def evidence(self, text):
        return {'collectedAt':'2026-09-22T22:00:00Z','requested':['AAPL'], 'responses':[{'result':{'content':[{'type':'text','text':text}]}}]}
    def test_requires_identity_price_and_real_observation_time(self):
        text='Apple (AAPL) is a equity in the USA market. The price is 14.0 USD currently with a change of 1.0 (7.0%) from the previous close. The latest trade time is Tuesday, September 22, 21:00:00 UTC.'
        records,raw=parse(self.evidence(text));self.assertEqual(records['AAPL']['quote']['price'],14)
        self.assertNotIn('bars',records['AAPL']);self.assertIn('AAPL',raw)
        for invalid in [text.replace('(AAPL)','(MSFT)'),text.replace('14.0','NaN'),text.split('The latest trade time')[0],text.replace('Tuesday','Friday')]:
            self.assertEqual(parse(self.evidence(invalid))[0],{})
    def test_retrieval_cannot_advance_observation_date(self):
        older={'quote':{'price':5,'timestamp':'2026-09-11 daily close'},'priceSource':{'retrievedAt':'2026-09-23T10:00:00Z'}}
        newer={'quote':{'price':7,'timestamp':'2026-09-22T20:00:00Z'}}
        self.assertGreater(effective(newer),effective(older))

if __name__=='__main__':unittest.main()
