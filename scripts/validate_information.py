#!/usr/bin/env python3
"""The local/CI gate. Does not collect data, mutate the tracker, publish, or deploy."""
import hashlib,json,pathlib,subprocess,sys,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
def run():
    tracker=ROOT/'data/recovery-os.json';before=hashlib.sha256(tracker.read_bytes()).hexdigest();checks=[]
    commands=[['node','--test',*map(str,sorted((ROOT/'tests').glob('*.test.cjs'))),*map(str,sorted((ROOT/'tests').glob('*.test.mjs')))],['python3','-m','unittest','discover','-s','tests','-p','test_*.py']]
    for command in commands:
        r=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,timeout=180);checks.append({'command':command,'passed':r.returncode==0,'output':(r.stdout+r.stderr)[-20000:]})
    for name in ['information-model.js','information-store.js','information-bridge.js','information-ui.js','information-world.js','market-world.js','research-universe.js','backend/cloudflare/worker.js','backend/cloudflare/information.mjs','backend/cloudflare/provider-client.mjs','backend/cloudflare/free-api.mjs','research-transport.js','data-freshness.js','refresh-controller.js','app.js','market-atlas.js']:
        r=subprocess.run(['node','--input-type=module','--check'],input=(ROOT/name).read_text(),capture_output=True,text=True);checks.append({'file':name,'passed':r.returncode==0,'output':r.stderr})
    after=hashlib.sha256(tracker.read_bytes()).hexdigest();checks.append({'name':'canonical tracker unchanged','passed':before==after,'sha256':after})
    return {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':all(x['passed'] for x in checks),'checks':checks,'releaseEnabled':False,'browserValidation':'See the reviewed browser fixture report; this command does not claim physical iPhone testing.'}
if __name__=='__main__':
    r=run();target=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/recovery-information-validation.json');target.write_text(json.dumps(r,indent=2)+'\n');print(f"{sum(x['passed'] for x in r['checks'])}/{len(r['checks'])} checks passed: {target}");sys.exit(0 if r['passed'] else 1)
