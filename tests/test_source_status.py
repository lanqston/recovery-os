import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import build_connector_report as report
import refresh_open_research as collector
from public_http import FetchError
from source_status import company_health, latest, seed_from_atlas

OLD = '2026-09-10T12:00:00Z'
OLDER = '2026-09-09T12:00:00Z'
NOW = '2026-09-14T12:00:00Z'


def dossier():
    return {'ticker': 'TEST', 'profile': {'ticker': 'TEST', 'cik': '0000000001', 'fiscalYearEnd': '1231'},
            'retrievedAt': OLD, 'lastAttemptAt': NOW,
            'filings': [{'form': '10-Q', 'filed': '2026-08-01', 'url': 'https://www.sec.gov/test'}],
            'financials': {'retrievedAt': OLDER, 'quarterly': [{'endDate': '2026-06-30', 'revenue': 10}]},
            'bars': [], 'news': [], 'health': [{'provider': 'SEC', 'status': 'last successful record retained', 'detail': 'HTTP_403'}]}


class SourceStatusTests(unittest.TestCase):
    def test_failed_collection_retains_each_source_time_without_mutation(self):
        source = dossier(); before = copy.deepcopy(source)
        rows = {r['provider']: r for r in company_health(source)}
        self.assertEqual(rows['SEC filings']['lastSuccessAt'], OLD)
        self.assertEqual(rows['SEC financial statements']['lastSuccessAt'], OLDER)
        self.assertTrue(all(r['status'] == 'cached' and r['lastAttemptAt'] == NOW for r in rows.values()))
        self.assertEqual(source, before)

    def test_empty_record_cannot_claim_cached_data(self):
        rows = company_health({'lastAttemptAt': NOW, 'health': [{'provider': 'SEC', 'status': 'retained', 'detail': 'HTTP_403'}]})
        self.assertTrue(all(r['status'] == 'unavailable' and r['lastSuccessAt'] is None for r in rows))
        for row in rows:
            self.assertEqual(report.summarize(row['provider'], [row])['status'], 'Unavailable')

    def test_official_news_is_not_a_yahoo_rss_success(self):
        rows = company_health({'news': [{'publisher': 'SEC EDGAR'}], 'health': [{'provider': 'Yahoo Finance RSS', 'status': 'saved news retained', 'detail': 'RSS ingestion paused; saved news retained'}]})
        self.assertEqual(rows[0]['recordCount'], 0)
        self.assertEqual(rows[0]['status'], 'unavailable')
        self.assertNotIn('saved news retained', rows[0]['detail'])

    def test_mixed_missing_and_retained_evidence_is_partial(self):
        rows = [{'status': 'cached', 'recordCount': 2, 'lastSuccessAt': OLD, 'lastAttemptAt': NOW},
                {'status': 'unavailable', 'recordCount': 0, 'lastAttemptAt': NOW}]
        result = report.summarize('SEC', rows)
        self.assertEqual((result['status'], result['cachedRecords'], result['unavailableRecords']), ('Partial', 1, 1))
        self.assertEqual(result['lastSuccessAt'], OLD)
        self.assertEqual(result['successfulRecords'], 0)

    def test_unknown_dates_are_not_filled_from_attempts(self):
        self.assertIsNone(latest(None, '', '2026-09-12', '2026-09-12T12:00:00'))
        self.assertEqual(latest('2026-09-12T13:00:00+02:00', '2026-09-12T12:00:00Z'), '2026-09-12T12:00:00Z')

    def test_cached_response_keeps_network_retrieval_time(self):
        with patch.object(collector, 'NOW', NOW), patch.object(collector.HTTP, 'metadata', return_value={'lastSuccessAt': OLD, 'lastAttemptAt': OLD}):
            row = collector.success_health('SEC filings', 'https://data.sec.gov/test')
            self.assertEqual(row['status'], 'cached')
            self.assertEqual(row['lastSuccessAt'], OLD)
            self.assertEqual(collector.received_at('https://data.sec.gov/test'), OLD)

    def test_bls_fallback_is_not_counted_as_fred_evidence(self):
        self.assertEqual(report.macro_records({'series': {'UNRATE': {'publisher': 'Bureau of Labor Statistics', 'observations': [1]}}}, 'FRED UNRATE'), (0, None))

    def test_saved_atlas_rows_cannot_unpause_a_provider(self):
        rows = [{'status': 'cached', 'recordCount': 1, 'lastAttemptAt': None},
                {'status': 'unavailable', 'recordCount': 1, 'detail': 'Automatic ingestion paused', 'lastAttemptAt': NOW}]
        self.assertEqual(report.summarize('Nasdaq public screener', rows)['status'], 'Paused')

    def test_price_history_is_attributed_to_actual_provider(self):
        source = dossier()
        source['bars'] = [{'date': '2026-09-18', 'open': 10, 'high': 12, 'low': 9, 'close': 11, 'volume': 100}]
        source['quote'] = {'price': 11, 'source': 'Stooq daily history'}
        source['priceSource'] = {'publisher': 'Stooq', 'retrievedAt': NOW}
        source['health'] = [
            {'provider': 'Yahoo daily history', 'status': 'unavailable', 'detail': 'paused'},
            {'provider': 'Stooq daily history', 'status': 'available', 'lastSuccessAt': NOW},
        ]
        rows = {r['provider']: r for r in company_health(source)}
        self.assertEqual(rows['Stooq daily history']['recordCount'], 1)
        self.assertEqual(rows['Yahoo daily history']['recordCount'], 0)

    def test_stooq_parser_keeps_secret_out_of_public_url(self):
        body = 'Date,Open,High,Low,Close,Volume\n2026-09-17,10,11,9,10.5,100\n2026-09-18,10.5,12,10,11.5,120\n'
        with patch.dict(collector.os.environ, {'STOOQ_API_KEY': 'top-secret'}), patch.object(collector, 'fetch', return_value=body):
            bars, request_url, public_url = collector.stooq_price_bars('TEST')
        self.assertEqual(bars[-1]['close'], 11.5)
        self.assertIn('top-secret', request_url)
        self.assertNotIn('top-secret', public_url)


class ArchiveSeedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); h = 0
        for character in 'TEST': h = (h * 31 + ord(character)) & 0xffffffff
        self.path = self.root / f'data/market-atlas/shards/{h % 64:02x}.json'
        self.path.parent.mkdir(parents=True)
        self.saved = dossier(); self.saved['financials']['quarterly'][0]['filingDate'] = None
        self.saved['quote'] = {'price': 12, 'collectedAt': OLDER, 'dataState': 'PROVIDER SNAPSHOT'}
        self.path.write_text(json.dumps({'stocks': {'TEST': self.saved}}))

    def test_matching_archive_restores_evidence_without_new_dates_or_bars(self):
        before = self.path.read_bytes()
        result = seed_from_atlas(self.root, 'TEST', {'cik': '1'}, {'health': []})
        self.assertEqual(result['retrievedAt'], OLD)
        self.assertEqual(result['quote'], self.saved['quote'])
        self.assertEqual(result['financials'], self.saved['financials'])
        self.assertEqual(result['bars'], [])
        self.assertTrue(result['archiveFallback']['identityVerified'])
        self.assertEqual(self.path.read_bytes(), before)

    def test_reused_ticker_cannot_inherit_another_issuer(self):
        self.assertEqual(seed_from_atlas(self.root, 'TEST', {'cik': '2'}, {}), {})

    def test_existing_evidence_is_not_replaced_by_an_atlas_snapshot(self):
        existing = {'quote': {'price': 40}}
        self.assertEqual(seed_from_atlas(self.root, 'TEST', {'cik': '1'}, existing), existing)


class CollectorRetentionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.dest = self.root / 'data/open-research'; self.dest.mkdir(parents=True)
        self.path = self.dest / 'TEST.json'; self.old = dossier(); self.path.write_text(json.dumps(self.old))
        self.directory = {'TEST': {'cik': '1', 'name': 'Test Company', 'exchange': 'NYSE'}}

    def run_collection(self, fetch):
        with patch.multiple(collector, ROOT=self.root, DEST=self.dest, NOW=NOW), patch.object(collector, 'fetch', side_effect=fetch), patch.object(collector.HTTP, 'metadata', return_value={'lastSuccessAt': NOW, 'lastAttemptAt': NOW}), patch.dict(collector.os.environ, {'LEGACY_MARKET_ACCESS_APPROVED': 'false'}):
            collector.build_company('TEST', self.directory)
        return json.loads(self.path.read_text())

    def test_facts_failure_does_not_erase_a_successful_filings_request(self):
        def fetch(url, *args, **kwargs):
            if '/submissions/' in url:
                return {'cik': '1', 'name': 'Test Company', 'fiscalYearEnd': '1231', 'filings': {'recent': {'form': ['10-Q'], 'filingDate': ['2026-08-01'], 'accessionNumber': ['0000000001-26-000001']}}}
            raise FetchError('HTTP_403', 403)
        result = self.run_collection(fetch); rows = {r['provider']: r for r in result['health']}
        self.assertEqual(rows['SEC filings']['status'], 'available')
        self.assertEqual(rows['SEC filings']['lastSuccessAt'], NOW)
        self.assertEqual(rows['SEC financial statements']['lastSuccessAt'], OLDER)
        self.assertEqual(result['financials'], self.old['financials'])
        self.assertEqual(result['bars'], self.old['bars'])

    def test_two_blocked_routes_preserve_dates_and_data(self):
        def blocked(*args, **kwargs): raise FetchError('SOURCE_COOLDOWN', 403)
        result = self.run_collection(blocked)
        for key in ('retrievedAt', 'financials', 'filings', 'bars', 'news'):
            self.assertEqual(result[key], self.old[key])
        self.assertEqual({r['provider']: r['lastSuccessAt'] for r in result['health']}['SEC financial statements'], OLDER)

    def test_failed_macro_feed_keeps_its_success_history(self):
        saved = {'releases': [{'publisher': 'BLS CPI', 'title': 'Old release'}], 'series': {},
                 'health': [{'provider': 'BLS CPI', 'status': 'available', 'lastSuccessAt': OLD}]}
        (self.dest / 'macro.json').write_text(json.dumps(saved))
        with patch.multiple(collector, DEST=self.dest, NOW=NOW), patch.object(collector, 'fetch', side_effect=FetchError('HTTP_403', 403)):
            collector.macro()
        result = json.loads((self.dest / 'macro.json').read_text())
        self.assertEqual(result['releases'], saved['releases'])
        row = next(r for r in result['health'] if r['provider'] == 'BLS CPI')
        self.assertEqual(row['lastSuccessAt'], OLD)
        self.assertEqual(row['lastAttemptAt'], NOW)


if __name__ == '__main__':
    unittest.main()
