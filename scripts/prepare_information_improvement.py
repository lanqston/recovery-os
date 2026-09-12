#!/usr/bin/env python3
"""Prepare an explicitly scoped routine patch in a new worktree; never merge, push or release."""
import argparse,datetime,hashlib,json,pathlib,re,subprocess,tempfile,os
ROOT=pathlib.Path(__file__).resolve().parents[1]
SAFE_ENV={k:v for k,v in os.environ.items() if k in {'PATH','LANG','LC_ALL','TMPDIR','SYSTEMROOT'}}
SAFE_ENV.update(CI='true',RECOVERY_PREPARE_MODE='true')
CLASSES={'provider-repair','cache','performance','accessibility','error-state','schema-migration','dependency-maintenance'}
ALLOWED=('information-', 'information.css','backend/cloudflare/', 'tests/', 'docs/')
DENIED=('.github/','data/','.git','node_modules/','vendor/','scripts/prepare_')
def validate_paths(patch):
    paths=list(dict.fromkeys(re.findall(r'^(?:\+\+\+ b|--- a)/(.+)$',patch,re.M)))
    if not paths: raise ValueError('No changed paths')
    for p in paths:
        parts=pathlib.PurePosixPath(p).parts
        if '..' in parts or p.startswith('/') or '\\' in p or not p.startswith(ALLOWED) or p.startswith(DENIED): raise ValueError('Protected or unapproved path: '+p)
    if any(x in patch for x in ['new file mode 120000','old mode 120000','GIT binary patch','deleted file mode']): raise ValueError('Symlinks, binary changes and deletion are outside routine preparation')
    return paths
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('proposal');p.add_argument('patch');p.add_argument('--output',required=True);a=p.parse_args();proposal=json.loads(pathlib.Path(a.proposal).read_text());patch=pathlib.Path(a.patch).read_text()
    if proposal.get('class') not in CLASSES or proposal.get('status')!='APPROVED_CLASS' or not proposal.get('evidence') or not proposal.get('validation'): raise ValueError('Proposal needs an approved routine class, evidence and validation requirements')
    paths=validate_paths(patch);base=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip();suffix=hashlib.sha256(patch.encode()).hexdigest()[:10];branch='prepare/information-'+suffix;directory=pathlib.Path(tempfile.mkdtemp(prefix='recovery-prepare-'))/'worktree'
    subprocess.run(['git','-c','core.hooksPath=/dev/null','worktree','add','-b',branch,str(directory),base],cwd=ROOT,check=True)
    subprocess.run(['git','apply','--check','-'],input=patch,cwd=directory,text=True,check=True);subprocess.run(['git','apply','-'],input=patch,cwd=directory,text=True,check=True)
    before=(directory/'data/recovery-os.json').read_bytes();result=subprocess.run(['python3','scripts/validate_information.py',str(directory/'validation.json')],cwd=directory,capture_output=True,text=True,timeout=240,env=SAFE_ENV)
    report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'proposal':proposal,'branch':branch,'base':base,'worktree':str(directory),'files':paths,'passed':result.returncode==0 and before==(directory/'data/recovery-os.json').read_bytes(),'validation':result.stdout+result.stderr,'preview':'Serve the isolated worktree for review; never publish it automatically','productionRelease':False,'rollback':'Remove this isolated worktree and branch; the source branch was not changed'}
    pathlib.Path(a.output).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'branch':branch,'passed':report['passed'],'report':a.output}));raise SystemExit(0 if report['passed'] else 1)
