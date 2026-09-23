import sys, json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import refresh_official_news as collector

class OfficialNewsTests(unittest.TestCase):
    def test_multiple_feeds_retain_history_and_independent_health(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);dest=root/'data/open-research';dest.mkdir(parents=True)
            old=[{'title':f'Old {i}','url':f'https://example.com/{i}','published':'2026-08-01T12:00:00+00:00'} for i in range(90)]
            (dest/'AMD.json').write_text(json.dumps({'news':old,'health':[{'provider':'Official issuer news','url':'https://issuer.test/second','lastSuccessAt':'2026-09-19T12:00:00+00:00'}]}))
            def fetch(url,*args,**kwargs):
                if url.endswith('second'):raise RuntimeError('HTTP_403')
                return '<rss><channel><item><title>New release</title><link>https://issuer.test/new</link><pubDate>Sun, 20 Sep 2026 12:00:00 GMT</pubDate></item></channel></rss>'
            with patch.dict(collector.FEEDS,{'AMD':[('Issuer','https://issuer.test/first'),('Issuer','https://issuer.test/second')]},clear=True),patch.object(collector.public,'DEST',dest),patch.object(collector.public,'ROOT',root),patch.object(collector.public,'fetch',side_effect=fetch),patch.object(collector.public,'received_at',return_value='2026-09-22T12:00:00+00:00'),patch.object(collector.public,'success_health',side_effect=lambda provider,url,**kw:dict(provider=provider,url=url,status='available',**kw)):
                collector.refresh()
            saved=json.loads((dest/'AMD.json').read_text())
            self.assertEqual(len(saved['news']),91)
            self.assertEqual(len(saved['health']),2)
            failed=next(x for x in saved['health'] if x['url'].endswith('second'))
            self.assertEqual(failed['lastSuccessAt'],'2026-09-19T12:00:00+00:00')
            self.assertEqual({x['url'] for x in old}.issubset({x['url'] for x in saved['news']}),True)

if __name__=='__main__':unittest.main()
