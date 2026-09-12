#!/usr/bin/env python3
"""Package the existing application as a portable, offline review artifact. Does not deploy."""
import argparse,base64,gzip,json,pathlib,re,posixpath
ROOT=pathlib.Path(__file__).resolve().parents[1]
def build(output):
    html=(ROOT/'index.html').read_text();scripts=re.findall(r'<script[^>]+src="([^"]+)"[^>]*></script>',html)
    classic=[p.split('?')[0] for p in scripts if not p.startswith('market-world.js')]
    modules=['vendor/three.module.min.js','world-renderer.js','research-universe.js','information-world.js','market-world.js']
    assets={str(p.relative_to(ROOT)):p.read_text() for p in (ROOT/'data').rglob('*.json')}
    css=[]
    for src in re.findall(r'<link[^>]+href="([^"]+)"[^>]*>',html):
        name=src.split('?')[0]
        if name.endswith('.css'):css.append((ROOT/name).read_text())
    html=re.sub(r'<link[^>]+(?:rel="(?:stylesheet|manifest|icon)")[^>]*>','',html)
    html=re.sub(r'<script[^>]+src="[^"]+"[^>]*></script>','',html)
    # Rewritten bare import identifiers can be mapped to Blob URLs without a server.
    rewritten={}
    for name in modules:
        text=(ROOT/name).read_text()
        for spec in re.findall(r"(?:from\s*|import\s*\()[\"'](\.[^\"']+)[\"']",text):
            target=posixpath.normpath(posixpath.join(posixpath.dirname(name),spec));text=text.replace("'"+spec+"'","'review/"+target+"'").replace('"'+spec+'"','"review/'+target+'"')
        rewritten[name]=text
    bundle={'assets':assets,'scripts':[(ROOT/p).read_text() for p in classic],'modules':rewritten}
    packed=base64.b64encode(gzip.compress(json.dumps(bundle,separators=(',',':')).encode(),compresslevel=9)).decode()
    loader=r'''<script>window.RECOVERY_REVIEW=true;(async()=>{
const encoded=__PACKED__;const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
const bundle=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
window.fetch=async function reviewFetch(input){const raw=typeof input==='string'?input:input.url;let key;try{const u=new URL(raw,location.href);key=u.pathname.replace(/^.*?\/data\//,'data/');if(!key.startsWith('data/'))key=u.pathname.replace(/^\//,'');}catch{key=raw.split('?')[0]}
 const content=bundle.assets[key];return new Response(content??JSON.stringify({error:'Unavailable in the offline review. Open the original source or configure the reviewed backend.'}),{status:content==null?404:200,headers:{'Content-Type':'application/json'}})};
const imports={};for(const [name,text] of Object.entries(bundle.modules))imports['review/'+name]=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));
const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);
for(const text of bundle.scripts){const script=document.createElement('script');script.textContent=text;document.body.append(script)}
await window.loadSeed();
await import('review/market-world.js');
})().catch(e=>{document.body.insertAdjacentHTML('beforeend','<p style="position:fixed;inset:20px;z-index:10000;background:#09202c;color:#fff;padding:30px">The offline review could not start. Open this file in a current browser with JavaScript, WebGL and decompression support. '+String(e.message).replace(/[<>&]/g,'')+'</p>')});</script>'''.replace('__PACKED__',json.dumps(packed))
    html=html.replace('</head>','<style>'+'\n'.join(css)+'</style></head>').replace('</body>',loader+'</body>')
    output=pathlib.Path(output);output.parent.mkdir(parents=True,exist_ok=True);output.write_text(html);print(json.dumps({'path':str(output),'bytes':output.stat().st_size,'embeddedDataFiles':len(assets),'sourceMode':'saved evidence only; no deployed services'}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('output');a=p.parse_args();build(a.output)
