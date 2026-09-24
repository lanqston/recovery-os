import sys, unittest, json, tempfile
from unittest.mock import patch
import importlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from import_market_quotes import parse, effective
quotes_module=importlib.import_module("import_market_quotes")

class Quotes(unittest.TestCase):
    def evidence(self, text):
        return {'collectedAt':'2026-09-22T22:00:00Z','requested':['AAPL'], 'responses':[{'result':{'content':[{'type':'text','text':text}]}}]}
    def test_requires_identity_price_and_real_observation_time(self):
        text='Apple (AAPL) is a equity in the USA market. The price is 14.0 USD currently with a change of 1.0 (7.0%) from the previous close. The latest trade time is Tuesday, September 22, 21:00:00 UTC.'
        records,raw=parse(self.evidence(text));self.assertEqual(records['AAPL']['quote']['price'],14)
        self.assertNotIn('bars',records['AAPL']);self.assertIn('AAPL',raw)
        for invalid in [text.replace('(AAPL)','(MSFT)'),text.replace('14.0','NaN'),text.split('The latest trade time')[0],text.replace('Tuesday','Friday')]:
            self.assertEqual(parse(self.evidence(invalid))[0],{})
    def test_batches_with_or_without_separator_newlines_and_string_results(self):
        a='Apple (AAPL) is a equity in the USA market. The price is 14.0 USD currently. The latest trade time is Tuesday, September 22, 21:00:00 UTC.'
        b=a.replace('Apple (AAPL)', 'Microsoft (MSFT)').replace('14.0', '20.0')
        for separator in ['-----', '\n-----\n']:
            for raw_string in [True, False]:
                evidence=self.evidence(a+separator+b);evidence['requested'].append('MSFT')
                if raw_string:evidence['responses'][0]['result']=a+separator+b
                records,raw=parse(evidence)
                self.assertEqual(set(records), {'AAPL','MSFT'})
                self.assertEqual(records['MSFT']['quote']['price'],20)
                self.assertEqual(raw['AAPL'],a)
                self.assertEqual(raw['MSFT'],b)

    def test_archive_keeps_complete_unmodified_responses(self):
        original='Apple (AAPL) is a equity in the USA market. The price is 14.0 USD currently. The latest trade time is Tuesday, September 22, 21:00:00 UTC.-----Unparsed provider explanation.'
        evidence=self.evidence(original)
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);path=root/'input.json';path.write_text(json.dumps(evidence))
            with patch.object(quotes_module,'ROOT',root):quotes_module.import_evidence(path)
            archive=json.loads((root/'data/market-observations/2026-09-22.json').read_text())
            self.assertEqual(archive['collections'],[evidence])
            self.assertIn('Unparsed provider explanation.',archive['collections'][0]['responses'][0]['result']['content'][0]['text'])

    def test_retrieval_cannot_advance_observation_date(self):
        older={'quote':{'price':5,'timestamp':'2026-09-11 daily close'},'priceSource':{'retrievedAt':'2026-09-23T10:00:00Z'}}
        newer={'quote':{'price':7,'timestamp':'2026-09-22T20:00:00Z'}}
        self.assertGreater(effective(newer),effective(older))

if __name__=='__main__':unittest.main()
