#!/usr/bin/env python3
"""Whole-directory SEC filing discovery. No size ranking or curated ticker list."""
import datetime as dt,json,re
from zoneinfo import ZoneInfo
import refresh_open_research as public
FORMS={'8-K':'Company update','6-K':'Company update','10-Q':'Quarterly report','10-K':'Annual report','20-F':'Annual report','40-F':'Annual report','S-1':'Share registration','S-3':'Share registration','F-1':'Share registration','F-3':'Share registration','DEF 14A':'Shareholder meeting'}
def parse(text,companies,now):
 result=[]
 for line in text.splitlines():
  fields=line.split('|')
  if len(fields)!=5:continue
  cik,name,form,date,path=fields
  if not cik.isdigit() or int(cik) not in companies or form.removesuffix('/A') not in FORMS:continue
  try:day=dt.date.fromisoformat(date)
  except ValueError:continue
  if day>now.date() or day<now.date()-dt.timedelta(days=90) or not re.fullmatch(r'edgar/data/\d+/[\d-]+\.txt',path):continue
  symbols=companies[int(cik)];result.append({'title':f'{name} — {FORMS[form.removesuffix("/A")]} ({form})','publisher':'SEC EDGAR','published':day.isoformat(),'url':'https://www.sec.gov/Archives/'+path,'tickers':symbols,'relatedTicker':symbols[0],'sourceType':'REGULATORY','newsCategory':'filings','form':form,'dateOnly':True})
 return result

def refresh():
 now=dt.datetime.now(ZoneInfo('America/New_York'));dest=public.ROOT/'data/market-filings.json'
 directory=json.loads((public.DEST/'directory.json').read_text());companies={}
 for r in directory.get('symbols',[]):
  if str(r.get('cik','')).isdigit():companies.setdefault(int(r['cik']),[]).append(r['ticker'])
 try:out=json.loads(dest.read_text())
 except (OSError,ValueError):out={'items':[]}
 merged={x['url']:x for x in out['items'] if x['published']>=(now.date()-dt.timedelta(days=90)).isoformat()};successes=0;errors=[]
 for offset in range(1,9):
  day=now.date()-dt.timedelta(days=offset)
  if day.weekday()>4:continue
  url=f'https://www.sec.gov/Archives/edgar/daily-index/{day.year}/QTR{(day.month-1)//3+1}/master.{day:%Y%m%d}.idx'
  try:
   raw=public.fetch(url,kind='text',ttl=21600,validate=lambda s:'CIK|Company Name|Form Type|Date Filed|' in s)
   for item in parse(raw,companies,now):merged[item['url']]=item
   successes+=1
  except Exception as exc:
   errors.append(str(exc))
   if getattr(exc,'status',None) in (401,403,429) or 'COOLDOWN' in str(exc):break
 out.update(items=sorted(merged.values(),key=lambda x:x['published'],reverse=True),lastAttemptAt=now.isoformat(),directoryCompanies=len(companies),directorySymbols=sum(map(len,companies.values())),indexesChecked=successes,errors=errors)
 if successes:out['lastSuccessAt']=now.isoformat()
 public.write(dest,out);print(json.dumps({k:v for k,v in out.items() if k!='items'}));print('Filing events:',len(out['items']))
if __name__=='__main__':refresh()
