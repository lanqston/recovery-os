#!/usr/bin/env python3
"""Import timestamped finance-tool observations; never manufacture daily bars.

Input: {collectedAt, requested: [ticker], responses: [{result: <web tool result>}]}.
The daily connected task uses this same importer. No credentials are published.
"""
import argparse, datetime as dt, json, math, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROVIDER = 'Web finance market data'

def stamp(value):
    match = re.search(r'\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?', str(value or ''))
    if not match: return None
    raw = match.group().replace('Z', '+00:00')
    try:
        value = dt.datetime.fromisoformat(raw)
        return value.replace(tzinfo=dt.timezone.utc) if value.tzinfo is None else value
    except ValueError: return None

def effective(bundle):
    q, source = bundle.get('quote') or {}, bundle.get('priceSource') or {}
    for value in (q.get('asOf'), q.get('timestamp'), source.get('date'), (bundle.get('bars') or [{}])[-1].get('date'), q.get('collectedAt')):
        if stamp(value): return stamp(value)
    return dt.datetime.min.replace(tzinfo=dt.timezone.utc)

def parse(evidence):
    collected = stamp(evidence.get('collectedAt'))
    if not collected: raise ValueError('A real collection timestamp is required')
    requested = set(evidence['requested']); quotes = {}; raw = {}
    for response in evidence['responses']:
        result = response['result']
        text = result if isinstance(result, str) else '\n'.join(x.get('text', '') for x in result.get('content', []) if x.get('type') == 'text')
        for block in re.split(r'-{5,}', text):
            identity = re.search(r'\(([^()]+)\) is a (equity|fund) in the USA market\.', block)
            price = re.search(r'The price is ([\d.]+) ([A-Z]{3}) currently', block)
            trade = re.search(r'The latest trade time is (\w+), (\w+ \d{1,2}), (\d{2}:\d{2}:\d{2}) UTC', block)
            if not identity or not price or not trade: continue
            ticker = {'BRK.B': 'BRK-B'}.get(identity[1], identity[1])
            if ticker not in requested: continue
            value = float(price[1])
            if not math.isfinite(value) or value <= 0: continue
            observed = dt.datetime.strptime(f'{collected.year} {trade[2]} {trade[3]}', '%Y %B %d %H:%M:%S').replace(tzinfo=dt.timezone.utc)
            if observed > collected + dt.timedelta(days=1): observed = observed.replace(year=observed.year-1)
            if observed.strftime('%A') != trade[1] or observed > collected + dt.timedelta(minutes=5): continue
            change = re.search(r'with a change of [-\d.]+ \(([-\d.]+)%\)', block)
            quote = {'price': value, 'currency': price[2], 'timestamp': observed.isoformat(), 'asOf': observed.isoformat(),
                     'collectedAt': evidence['collectedAt'], 'source': PROVIDER, 'dataState': 'DATED MARKET SNAPSHOT',
                     'sessionNote': 'Provider trade timestamp. Session and delay were not supplied; not a verified regular-session close.',
                     'changePct': float(change[1]) if change else None}
            if ticker in quotes and effective(quotes[ticker]) > observed: continue
            reference = re.search(r'【([^】]+)】', block)
            source = {'publisher': PROVIDER, 'title': 'Timestamped quote observation', 'date': observed.isoformat(),
                      'retrievedAt': evidence['collectedAt'], 'sourceType': 'MARKET_DATA',
                      'url': f'https://github.com/lanqston/recovery-os/blob/main/data/market-observations/{collected.date()}.json',
                      'evidenceId': reference[1] if reference else None}
            quotes[ticker] = {'ticker': ticker, 'quote': quote, 'priceSource': source}
            raw[ticker] = block.strip()
    return quotes, raw

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix+'.tmp'); temp.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n'); temp.replace(path)

def import_evidence(path):
    evidence = json.loads(Path(path).read_text()); quotes, raw = parse(evidence)
    if not quotes: raise ValueError('No valid timestamped quotes; existing observations were retained')
    target = ROOT/'data/market-quotes.json'
    previous = json.loads(target.read_text()) if target.exists() else {'quotes': {}}
    merged = dict(previous.get('quotes', {}))
    for ticker, bundle in quotes.items():
        if ticker not in merged or effective(bundle) >= effective(merged[ticker]): merged[ticker] = bundle
    write(target, {'schemaVersion': 1, 'generatedAt': evidence['collectedAt'], 'provider': PROVIDER, 'quotes': merged,
                   'requestedCount': len(evidence['requested']), 'receivedCount': len(quotes),
                   'unavailable': [{'ticker': t, 'reason': 'No validated finance-tool quote returned; prior observation retained if present.'}
                                   for t in evidence['requested'] if t not in quotes]})
    day = stamp(evidence['collectedAt']).date()
    # One dated evidence archive per collection date; retain earlier ticker observations.
    archive = ROOT/f'data/market-observations/{day}.json'
    prior = json.loads(archive.read_text()) if archive.exists() else {}
    old = prior.get('observations', {})
    collections = prior.get('collections', [])
    if evidence not in collections: collections.append(evidence)
    write(archive, {'collectedAt': evidence['collectedAt'], 'provider': PROVIDER, 'observations': {**old, **raw}, 'collections': collections})
    print(f'Imported {len(quotes)}/{len(evidence["requested"])} timestamped quotes; no daily bars or tracker state changed.')

def apply_quotes():
    path = ROOT/'data/market-quotes.json'
    if not path.exists(): return
    records = json.loads(path.read_text()); index_path = ROOT/'data/open-research/index.json'
    index = json.loads(index_path.read_text()); count = 0
    for row in index['symbols']:
        ticker = row['ticker']; candidate = records['quotes'].get(ticker); dest = ROOT/f'data/open-research/{ticker}.json'
        if not candidate or not dest.exists(): continue
        bundle = json.loads(dest.read_text())
        if effective(candidate) < effective(bundle): continue
        if bundle.get('bars'): bundle.setdefault('barSource', bundle.get('priceSource'))
        bundle.update(quote=candidate['quote'], priceSource=candidate['priceSource'])
        health = {'provider': PROVIDER, 'status': 'cached', 'detail': 'Dated quote only; daily chart history has its own date.',
                  'lastSuccessAt': candidate['quote']['collectedAt'], 'lastAttemptAt': records['generatedAt'],
                  'asOf': candidate['quote']['timestamp'], 'recordCount': 1}
        bundle['health'] = [h for h in bundle.get('health', []) if h['provider'] != PROVIDER]+[health]
        row['health'] = bundle['health']; row['quoteThrough'] = candidate['quote']['timestamp']
        write(dest, bundle); count += 1
    write(index_path, index); print(f'Applied {count} quote observations; historical bars and recovery theses preserved.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--input'); parser.add_argument('--apply', action='store_true'); args = parser.parse_args()
    if args.input: import_evidence(args.input)
    if args.apply: apply_quotes()
