"""Publish connector attempts separately from the evidence still available."""
import collections
import datetime as dt
import json
from pathlib import Path
from source_status import company_health, has_evidence, latest

ROOT = Path(__file__).resolve().parents[1]


def read(path, default):
    try:
        return json.loads((ROOT / path).read_text())
    except (OSError, ValueError):
        return default


def macro_records(macro, provider):
    if provider == 'US Treasury':
        record = macro.get('treasury', {})
    elif provider.startswith('BLS public API '):
        record = macro.get('bls', {}).get(provider.rsplit(' ', 1)[-1], {})
    elif provider.startswith('FRED '):
        record = macro.get('series', {}).get(provider.split(' ', 1)[-1], {})
        if record.get('publisher') == 'Bureau of Labor Statistics':
            return 0, None
    else:
        rows = [r for r in macro.get('releases', []) if r.get('publisher') == provider]
        return len(rows), latest(*(r.get('retrievedAt') for r in rows))
    return len(record.get('observations', [])), record.get('retrievedAt')


def summarize(name, rows):
    attempted = [r for r in rows if r.get('lastAttemptAt') or r.get('paused') or 'paused' in r.get('detail', '').lower()]
    paused = bool(attempted) and all(r.get('paused') or 'paused' in r.get('detail', '').lower() for r in attempted)
    good = [r for r in rows if r.get('status') in ('available', 'Current')]
    available = [r for r in rows if r.get('recordCount', 0) > 0]
    unavailable = len(rows) - len(available)
    status = ('Paused' if paused else 'Current' if len(good) == len(rows)
              else 'Partial' if good or available and unavailable
              else 'Cached' if available else 'Unavailable')
    return {
        'provider': name, 'cost': 'Free / public sources only', 'status': status,
        'successfulRecords': len(good), 'checkedRecords': len(rows),
        'availableRecords': len(available), 'unavailableRecords': unavailable,
        'cachedRecords': sum(r not in good for r in available),
        'lastSuccessAt': latest(*(r.get('lastSuccessAt') for r in rows)),
        'lastAttemptAt': latest(*(r.get('lastAttemptAt') for r in rows)),
        'retryAt': latest(*(r.get('retryAt') for r in rows)),
        'errors': list(dict.fromkeys(r['detail'] for r in rows if r.get('detail')))[:5],
        'fallback': ('Original dated evidence is available for ' + str(len(available)) +
                     ' of ' + str(len(rows)) + ' checked records. ' if available else
                     'No saved evidence is available for these checks. ') + 'Original source links remain available.',
        'paidRequests': False,
    }


def build():
    groups = collections.defaultdict(list)
    index = read('data/open-research/index.json', {'symbols': []})
    evidence_count = 0
    for item in index['symbols']:
        bundle = read('data/open-research/' + item['ticker'] + '.json', {})
        evidence_count += int(has_evidence(bundle))
        for row in company_health(bundle):
            groups[row['provider']].append({**row, 'ticker': item['ticker']})
    macro = read('data/open-research/macro.json', {})
    for row in macro.get('health', []):
        count, recorded = macro_records(macro, row['provider'])
        groups[row['provider']].append({**row, 'recordCount': count,
                                       'lastSuccessAt': latest(row.get('lastSuccessAt'), recorded)})
    atlas = read('data/market-atlas/index.json', {})
    for row in atlas.get('health', []):
        groups[row['provider']].append({**row, 'recordCount': atlas.get('counts', {}).get('quotes', 0),
                                       'lastAttemptAt': row.get('lastAttemptAt') or atlas.get('lastAttemptAt'),
                                       'lastSuccessAt': row.get('lastSuccessAt')})
    directory = read('data/information/directory-health.json', {})
    if directory:
        groups['SEC symbol directory'].append({**directory, 'recordCount': directory.get('records', 0),
                                               'detail': directory.get('error', '')})
    collection = read('data/open-research/collection.json', {})
    atlas_http = read('data/market-atlas/collection.json', {}).get('http', {})
    return {
        'schemaVersion': 2, 'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'mode': 'FREE_SOURCES_ONLY', 'providers': [summarize(name, rows) for name, rows in groups.items()],
        'coverage': {'securities': atlas.get('counts', {}).get('symbols', 0),
                     'preparedDossiers': len(index['symbols']), 'evidenceDossiers': evidence_count,
                     'identityOnlyDossiers': len(index['symbols']) - evidence_count},
        'efficiency': {k: collection.get(k, 0) + atlas_http.get(k, 0)
                       for k in ('requests', 'cacheHits', 'requestsAvoided')},
        'automaticMaintenance': {
            'refresh': 'Weekdays before and after the US regular session; manual refresh also available',
            'coverageGrowth': 'Up to four additional directory-verified company records per collection. Matching saved atlas evidence is reused with its original dates.',
            'dataProtection': 'Failed requests retain the last verified data, source identity and successful retrieval time',
            'requests': 'Conditional requests, cache reuse, host cooldowns and bounded retries',
            'quality': 'Financial and price checks, source coverage reports, and tracker integrity gate',
            'rendering': 'Bounded frame-time adaptation; reduced detail on slower devices',
            'codeChanges': 'Evidence-backed improvement proposals require validation and review',
        },
        'limitations': [
            'Market sources paused for access permission remain paused; stored quotes are not live.',
            'Analyst, options and intraday coverage is unavailable where no compatible free source is connected.',
            'Passing checks describe the application; individual source blocks and missing records are reported separately.',
        ],
    }


if __name__ == '__main__':
    report = build()
    path = ROOT / 'data/information/connectors.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'providers': len(report['providers']), 'coverage': report['coverage']}))
