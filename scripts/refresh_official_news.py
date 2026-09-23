#!/usr/bin/env python3
"""Collect linked headlines from issuer-published RSS/Atom feeds, with retention."""
import json, hashlib, datetime as dt
from pathlib import Path
import refresh_open_research as public

FEEDS = {
    'AMZN': [('Amazon News', 'https://www.aboutamazon.com/rss/feed.rss')],
    'AAPL': [('Apple Newsroom', 'https://www.apple.com/newsroom/rss-feed.rss')],
    'NVDA': [('NVIDIA Newsroom', 'https://nvidianews.nvidia.com/releases.xml')],
    'MSFT': [('Microsoft News', 'https://news.microsoft.com/feed/')],
    'AMD': [('AMD Investor Relations', 'https://ir.amd.com/news-events/press-releases/rss'), ('AMD Newsroom', 'https://newsroom.amd.com/rss.xml')],
    'ENPH': [('Enphase Investor Relations', 'https://investor.enphase.com/rss/news-releases.xml')],
    'ON': [('onsemi Investor Relations', 'https://investor.onsemi.com/rss/news-releases.xml')],
    'META': [('Meta Newsroom', 'https://about.fb.com/feed/')],
    'GOOGL': [('Google The Keyword', 'https://blog.google/rss/')],
    'GOOG': [('Google The Keyword', 'https://blog.google/rss/')],
}

def refresh():
    reports = []
    for ticker, sources in FEEDS.items():
      for publisher, url in sources:
        path = public.DEST/(ticker+'.json')
        if not path.exists(): continue
        bundle = json.loads(path.read_text()); provider = 'Official issuer news'
        try:
            text = public.fetch(url, 'issuer-'+hashlib.sha256(url.encode()).hexdigest()[:16], 'text', ttl=1800)
            items = public.feed_items(text, publisher, 60)
            if not items: raise ValueError('Feed returned no usable linked headlines; previous news retained')
            received = public.received_at(url)
            valid = []
            for item in items:
                try: published = dt.datetime.fromisoformat(item['published'].replace('Z', '+00:00'))
                except (ValueError, KeyError): continue
                if published.tzinfo is None or published > dt.datetime.now(dt.timezone.utc)+dt.timedelta(minutes=5): continue
                valid.append({**item, 'retrievedAt': received, 'tickers': [ticker], 'sourceType': 'OFFICIAL', 'feedUrl': url})
            if not valid: raise ValueError('No valid publication timestamps; previous news retained')
            # Retain distinct history; the same URL is updated only by the issuer feed.
            fresh_keys = {(x['title'], x['published']) for x in valid}
            merged = {x['url']: x for x in bundle.get('news', [])
                      if not (x.get('feedUrl') == url and (x.get('title'), x.get('published')) in fresh_keys)}
            merged.update({x['url']: x for x in valid})
            bundle['news'] = sorted(merged.values(), key=lambda x:x.get('published',''), reverse=True)
            health = public.success_health(provider, url, asOf=max(x['published'] for x in valid), items=len(valid))
            health['publisher'] = publisher
        except Exception as exc:
            health = public.failure_health(provider, exc); health.update(url=url, publisher=publisher)
            prior = next((h for h in bundle.get('health', []) if h['provider']==provider and h.get('url')==url), {})
            health['lastSuccessAt'] = prior.get('lastSuccessAt')
        bundle['health'] = [h for h in bundle.get('health', []) if not (h['provider'] == provider and (h.get('url') == url or not h.get('url')))]+[health]
        public.write(path, bundle); reports.append({'ticker':ticker, **health})
    public.write(public.ROOT/'data/information/news-health.json', {'generatedAt':public.NOW, 'feeds':reports,
        'scope':'Issuer RSS feeds where verified; SEC events for other companies. No complete market news coverage is implied.'})
    print(f'Official issuer feeds: {sum(x["status"] in ("available","cached") for x in reports)}/{len(reports)} succeeded')

if __name__ == '__main__': refresh()
