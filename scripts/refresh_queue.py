"""A fair, bounded refresh queue covering the entire searchable universe."""
import re
import time
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED


def universe(prepared, directory, atlas, seeds=()):
    symbols = set(seeds) | set(directory)
    symbols.update(row['ticker'] for row in prepared)
    columns = atlas.get('columns', [])
    if 'ticker' in columns:
        index = columns.index('ticker')
        symbols.update(row[index] for row in atlas.get('rows', []) if len(row) > index)
    prior = {row['ticker']: row.get('lastAttemptAt') or '' for row in prepared}
    # Unattempted records first, then oldest attempts: interrupted runs cannot
    # repeatedly starve the tail of the alphabet. Reject paths from input data.
    return sorted((s for s in symbols if isinstance(s, str) and
                   re.fullmatch(r'[A-Z][A-Z0-9.-]{0,11}', s)),
                  key=lambda s: (prior.get(s, ''), s))


def collect(symbols, build, on_result, budget_seconds, workers=3, clock=time.monotonic):
    deadline = clock() + budget_seconds
    pending = iter(symbols)
    completed, errors = [], []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        active = {}
        def submit():
            if clock() >= deadline:
                return False
            symbol = next(pending, None)
            if symbol is None:
                return False
            active[pool.submit(build, symbol)] = symbol
            return True
        for _ in range(workers):
            submit()
        while active:
            done, _ = wait(active, return_when=FIRST_COMPLETED)
            for future in done:
                symbol = active.pop(future)
                try:
                    result = future.result()
                    on_result(result)
                    completed.append(symbol)
                except Exception as exc:
                    # One malformed issuer must not discard other saved results.
                    errors.append({'ticker': symbol, 'error': type(exc).__name__})
                submit()
    return {'targetCount': len(symbols), 'completedCount': len(completed),
            'deferredCount': len(symbols)-len(completed)-len(errors),
            'errors': errors, 'complete': len(completed) == len(symbols)}
