"""Describe retained evidence without inventing successful requests or timestamps."""
import copy
import datetime as dt
import json
from pathlib import Path


def latest(*values):
    dated = []
    for value in values:
        try:
            instant = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
            if instant.tzinfo is not None:
                dated.append((instant, value))
        except (AttributeError, TypeError, ValueError):
            pass
    return max(dated, default=(None, None))[1]


def source_records(bundle, provider):
    if provider == 'SEC filings':
        rows = [r for r in bundle.get('filings', []) if r.get('form') != 'Financial filing']
        return len(rows), (bundle.get('filingSource') or {}).get('retrievedAt') or (bundle.get('retrievedAt') if rows else None)
    if provider == 'SEC financial statements':
        facts = bundle.get('financials') or {}
        count = len(facts.get('quarterly', [])) + len(facts.get('annual', []))
        return count, facts.get('retrievedAt') or (bundle.get('retrievedAt') if count else None)
    if provider in ('Yahoo daily history', 'Stooq daily history'):
        rows = bundle.get('bars', [])
        source = bundle.get('priceSource') or {}
        quote = bundle.get('quote') or {}
        expected = 'Yahoo Finance' if provider == 'Yahoo daily history' else 'Stooq'
        matched = source.get('publisher') == expected or expected in str(quote.get('source', ''))
        return (len(rows), source.get('retrievedAt')) if rows and matched else (0, None)
    if provider == 'Yahoo Finance RSS':
        rows = [r for r in bundle.get('news', []) if r.get('publisher') == provider]
        return len(rows), latest(*(r.get('retrievedAt') for r in rows))
    if provider == 'Nasdaq public screener':
        quote = bundle.get('quote') or {}
        saved = quote.get('source') == 'Nasdaq public stock screener' and quote.get('price') is not None
        return int(saved), ((bundle.get('priceSource') or {}).get('retrievedAt') or quote.get('collectedAt')) if saved else None
    return 0, None


def company_health(bundle):
    """Upgrade legacy generic SEC failures, keeping each dataset's own history."""
    rows = []
    for item in bundle.get('health', []):
        if item.get('provider') == 'SEC':
            rows.extend({**item, 'provider': provider} for provider in ('SEC filings', 'SEC financial statements'))
        else:
            rows.append(dict(item))
    if source_records(bundle, 'Nasdaq public screener')[0] and not any(r.get('provider') == 'Nasdaq public screener' for r in rows):
        rows.append({'provider': 'Nasdaq public screener', 'status': 'cached',
                     'detail': 'Saved provider snapshot; no new market request was made.', 'lastAttemptAt': None})
    result = []
    for row in rows:
        count, recorded = source_records(bundle, row['provider'])
        row['recordCount'] = count
        row['lastSuccessAt'] = latest(row.get('lastSuccessAt'), recorded)
        row.setdefault('lastAttemptAt', bundle.get('lastAttemptAt'))
        row['paused'] = row.get('paused', False) or 'paused' in row.get('detail', '').lower()
        if row.get('status') not in ('available', 'Current'):
            row['status'] = 'cached' if count else 'unavailable'
        if not count:
            for suffix in ('; saved history retained', '; saved news retained'):
                row['detail'] = row.get('detail', '').replace(suffix, '')
        result.append(row)
    return result


def has_evidence(bundle):
    return bool(bundle.get('bars') or (bundle.get('quote') or {}).get('price') is not None
                or bundle.get('filings') or bundle.get('news')
                or (bundle.get('financials') or {}).get('quarterly')
                or (bundle.get('financials') or {}).get('annual'))


def seed_from_atlas(root, ticker, entry, old):
    """Recover an empty dossier only from the matching saved ticker and issuer."""
    if has_evidence(old) or not entry or not str(entry.get('cik', '')).isdigit():
        return copy.deepcopy(old)
    h = 0
    for character in ticker:
        h = (h * 31 + ord(character)) & 0xffffffff
    relative = f'data/market-atlas/shards/{h % 64:02x}.json'
    try:
        saved = json.loads((Path(root) / relative).read_text())['stocks'][ticker]
    except (OSError, ValueError, KeyError):
        return copy.deepcopy(old)
    profile = saved.get('profile', {})
    if profile.get('ticker') != ticker or str(profile.get('cik', '')).zfill(10) != str(entry['cik']).zfill(10):
        return copy.deepcopy(old)
    if not has_evidence(saved):
        return copy.deepcopy(old)
    result = copy.deepcopy(saved)
    result.update(ticker=ticker, health=copy.deepcopy(old.get('health', [])), lastAttemptAt=old.get('lastAttemptAt'))
    result.setdefault('financials', {}).setdefault('retrievedAt', saved.get('retrievedAt'))
    result['archiveFallback'] = {'source': 'Recovery OS saved market atlas', 'path': relative,
                                 'retrievedAt': saved.get('retrievedAt'), 'identityVerified': True}
    return result
