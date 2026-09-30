"""Refresh evidence for tracked companies without changing saved assessments."""
import json,re,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def recovery_symbols(state):
    return sorted({x['ticker'].upper() for x in state.get('stocks',[])+state.get('researchQueue',[]) if isinstance(x,dict) and re.fullmatch(r'[A-Za-z0-9.\-]{1,12}',x.get('ticker',''))})
def main():
    symbols=recovery_symbols(json.loads((ROOT/'data/recovery-os.json').read_text()))
    if not symbols:raise SystemExit('No recovery symbols configured')
    subprocess.run([sys.executable,str(ROOT/'scripts/refresh_open_research.py'),'--tickers',' '.join(symbols),'--skip-macro','--budget-minutes','15'],cwd=ROOT,check=True)
if __name__=='__main__':main()
