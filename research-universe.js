import * as THREE from './vendor/three.module.min.js';
import {marketRenderer} from './world-renderer.js';

const Q=s=>document.querySelector(s),QA=s=>[...document.querySelectorAll(s)];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.informationMotion==='reduced';
const small=()=>innerWidth<760;
const COLORS={brief:0x9cbdff,price:0x54e6c2,financials:0xa0a9ff,catalysts:0xffc58b,risks:0xff839b,sources:0x86d5ff,filings:0xd8dfef,macro:0xba99ff};
const TITLES={brief:'Research desk',price:'Price observatory',financials:'Financial engine',catalysts:'Catalyst field',risks:'Risk scenarios',sources:'Source archive',filings:'Filing trail',macro:'Macro observatory'};
const TOPICS=['brief','price','financials','filings','catalysts','risks','macro','sources'];
const pretty=t=>t==='brief'?'Research':t==='price'?'Price':t[0].toUpperCase()+t.slice(1);
const baseOpen=openExplorer,baseClose=closeExplorer,baseView=showView,baseRender=renderResearchWorld,baseSelect=selectResearchSection;
let U=null,enabled=false,readerPreference=false,ready=false;
try{readerPreference=localStorage.getItem('recovery-research-view')==='reader'}catch{}

export class StockUniverse{
  constructor(){
    this.active=false;this.selected=null;this.bundle=null;this.flight=null;this.mode='orbit';this.keys=new Set();this.nodes=[];this.hubs=[];this.topicNodes=[];this.labels=[];this.pickables=[];this.hover=null;this.time=0;this.lastFrame=0;this.tourIndex=-1;this.tourTimer=null;
    this.target=new THREE.Vector3(0,10,0);this.cameraTarget=this.target.clone();this.yaw=.34;this.pitch=1.02;this.distance=590;this.pointers=new Map();this.changed=true;
    this.mount();
    try{this.initScene();this.bind();this.resize();this.frame(0)}catch(error){this.failed=true;this.stage.innerHTML='<div class="universe-fallback"><h2>Your research is ready.</h2><p>This browser could not start the 3D view. The full research reader is available.</p><button id="fallbackReader" class="ex-btn">Open reading view ↗</button></div>';Q('#fallbackReader').onclick=()=>window.RecoveryUniverse?.read();}
  }
  mount(){
    const explorer=Q('#explorer');
    this.stage=document.createElement('div');this.stage.id='universeStage';this.stage.innerHTML='<canvas id="universeCanvas" tabindex="0" aria-label="Interactive three-dimensional stock universe. Drag to orbit, pinch or scroll to travel. Use the destination buttons to read research."></canvas><div id="universeLabels" aria-label="Destinations in the research universe"></div><div class="universe-vignette" aria-hidden="true"></div>';
    explorer.prepend(this.stage);this.canvas=Q('#universeCanvas');this.labelHost=Q('#universeLabels');
    const hud=document.createElement('div');hud.id='universeHUD';hud.innerHTML=`<section class="universe-heading"><div class="universe-eyebrow"><span class="universe-live-dot"></span> RECOVERY OS / OPEN RESEARCH</div><h2 id="universeTitle">A world of<br><em>market intelligence.</em></h2><p id="universeSubtitle">Find a company. Follow a connection. Go deeper.</p><div id="universeStockMeta" class="universe-stock-meta"></div><div class="universe-heading-actions"><button id="universeGeneral" class="universe-primary">Start with AAPL <span>↗</span></button><button id="universeTour" class="universe-ghost">Take a flight <span>▷</span></button></div></section><div class="universe-flight-controls"><button id="universeOverview" aria-label="Return to the whole stock universe" title="Whole universe">◎</button><button id="universeReset" aria-label="Reset camera" title="Reset camera">⌖</button><button id="universeZoomIn" aria-label="Travel closer" title="Travel closer">＋</button><button id="universeZoomOut" aria-label="Travel farther" title="Travel farther">−</button><button id="universeMode" aria-pressed="false">Free fly</button></div><div class="universe-travel-pad" aria-label="Flight movement"><button data-flight-key="q" aria-label="Fly down">↓</button><button data-flight-key="w" aria-label="Fly forward">↑</button><button data-flight-key="e" aria-label="Fly up">↑+</button><button data-flight-key="a" aria-label="Fly left">←</button><button data-flight-key="s" aria-label="Fly backward">↓−</button><button data-flight-key="d" aria-label="Fly right">→</button></div><div class="universe-radar"><canvas id="universeRadar" width="160" height="160" role="img" aria-label="Your position in the stock universe"></canvas><span>RESEARCH COORDINATES</span></div><div class="universe-travel-status" id="universeTravelStatus" role="status">Choose a company hub to begin.</div><nav id="universeDestinations" class="universe-destinations" aria-label="Fly to a research destination"></nav><footer class="universe-footer"><div><button id="universeTracker">↖ Recovery tracker</button><button id="universeReader">Reading view</button><button id="universeCompare">Compare</button><button id="universeNotes">Notes</button></div><span id="universeHelp">DRAG TO ORBIT · SCROLL / PINCH TO TRAVEL</span><button id="universeHelpButton" aria-label="World navigation help">?</button></footer><div id="universeHelpPanel" class="universe-help-panel" hidden><h3>Make the world yours.</h3><p>Drag to orbit a company. Scroll or pinch to travel closer. Select a floating destination to fly there and open its evidence.</p><p>Free fly: drag to look, then use W/A/S/D to move and Q/E to change altitude while the world has keyboard focus. On touch screens, hold the movement buttons.</p><p>The layout organizes research. Distance between companies does not represent a measured correlation.</p><button id="universeHelpClose" class="ex-btn">Got it</button></div>`;
    explorer.append(hud);this.hud=hud;
    const bar=document.createElement('div');bar.id='universeReaderBar';bar.innerHTML='<div><span id="universePaneKicker">RESEARCH DESTINATION</span><strong id="universePaneTitle">Research desk</strong></div><button id="universeRefresh" aria-label="Refresh public research" title="Refresh public research">↻</button><button id="universeExpand" aria-label="Expand the research reader" title="Expand reading view">↗</button><button id="universePaneClose" aria-label="Close research panel" title="Close research panel">×</button>';
    Q('.ex-main').prepend(bar);
    const returnButton=document.createElement('button');returnButton.id='returnUniverse';returnButton.className='ex-btn';returnButton.textContent='3D World ↗';returnButton.onclick=()=>window.RecoveryUniverse?.open();Q('.ex-actions').prepend(returnButton);
  }
  initScene(){
    this.renderer=marketRenderer(this.canvas,small());
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,small()?1.5:1.8));this.renderer.setClearColor(0x040810,1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.35;
    this.scene=new THREE.Scene();this.scene.fog=new THREE.FogExp2(0x040810,.00135);this.camera=new THREE.PerspectiveCamera(48,1,.2,3600);
    this.scene.add(new THREE.AmbientLight(0xc1d8ff,1.8));const light=new THREE.DirectionalLight(0x86bbff,2.5);light.position.set(-160,280,180);this.scene.add(light);
    const purple=new THREE.PointLight(0x7557ff,14000,1400,2);purple.position.set(-180,80,-180);this.scene.add(purple);
    const grid=new THREE.GridHelper(2600,130,0x315d82,0x172b43);grid.position.y=-16;grid.material.transparent=true;grid.material.opacity=.38;this.scene.add(grid);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(2800,2800),new THREE.MeshStandardMaterial({color:0x06101a,roughness:.65,metalness:.45,transparent:true,opacity:.94}));floor.rotation.x=-Math.PI/2;floor.position.y=-16.2;floor.userData.skipSoftware=true;this.scene.add(floor);
    this.addStars();this.addCore();this.addCompanyHubs();this.addPortals();
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.radar=Q('#universeRadar').getContext('2d');
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.stage);
    this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.recoverRenderer?.()});
  }
  material(color,opacity=1){return new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.15,metalness:.65,roughness:.28,transparent:opacity<1,opacity})}
  line(points,color=0x37658d,opacity=.45){const g=new THREE.BufferGeometry().setFromPoints(points);return new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:true,opacity}))}
  ring(radius,color,y=0){const pts=[];for(let i=0;i<=96;i++){const angle=i/96*Math.PI*2;pts.push(new THREE.Vector3(Math.cos(angle)*radius,y,Math.sin(angle)*radius))}return this.line(pts,color,.75)}
  glow(color,size=32){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);const hex='#'+new THREE.Color(color).getHexString();g.addColorStop(0,hex+'cc');g.addColorStop(.2,hex+'50');g.addColorStop(1,hex+'00');x.fillStyle=g;x.fillRect(0,0,64,64);const texture=new THREE.CanvasTexture(c);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));sprite.scale.set(size,size,1);return sprite}
  addStars(){
    const pts=[],colors=[];let seed=27;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
    for(let i=0;i<(small()?800:1700);i++){pts.push((random()-.5)*2500,random()*900-80,(random()-.5)*2500);const c=new THREE.Color().setHSL(.58+random()*.12,.45,.4+random()*.45);colors.push(c.r,c.g,c.b)}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));this.stars=new THREE.Points(g,new THREE.PointsMaterial({size:1.25,vertexColors:true,transparent:true,opacity:.7,sizeAttenuation:true}));this.scene.add(this.stars);
    const haze=this.glow(0x443da4,750);haze.position.set(-250,180,-600);this.scene.add(haze);const haze2=this.glow(0x12388b,900);haze2.position.set(400,50,-500);this.scene.add(haze2);
  }
  addCore(){
    this.core=new THREE.Group();this.scene.add(this.core);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(30,36,6,64),this.material(0x182b48));base.position.y=-8;this.core.add(base);
    for(const r of [36,45,57])this.core.add(this.ring(r,0x587bbd,-4));
    this.coreOrb=new THREE.Mesh(new THREE.IcosahedronGeometry(20,2),new THREE.MeshBasicMaterial({color:0x739aff,wireframe:true,transparent:true,opacity:.24}));this.coreOrb.position.y=24;this.core.add(this.coreOrb);
    const inner=new THREE.Mesh(new THREE.IcosahedronGeometry(11,0),this.material(0x49629d,.8));inner.position.y=24;this.core.add(inner);this.coreInner=inner;
    const glow=this.glow(0x426af0,110);glow.position.y=23;this.core.add(glow);
    this.coreOrbit=new THREE.Group();this.coreOrbit.position.y=24;this.coreOrbit.rotation.z=.55;const r=this.ring(28,0x8facff);this.coreOrbit.add(r);this.core.add(this.coreOrbit);
    this.dataSculpture=new THREE.Group();this.core.add(this.dataSculpture);
    this.wordmark=this.makeText('RECOVERY',0xffffff,1024,180);this.wordmark.scale.set(88,15.5,1);this.wordmark.position.set(0,62,0);this.core.add(this.wordmark);
  }
  makeText(text,color,w=512,h=128){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.textAlign='center';x.textBaseline='middle';x.fillStyle='#'+new THREE.Color(color).getHexString();x.font=`600 ${h*.67}px system-ui`;x.fillText(text,w/2,h/2,w-30);const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;return new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthWrite:false}))}
  addLabel(node){
    const button=document.createElement('button');button.className='universe-node-label '+node.kind;button.type='button';button.dataset.universeNode=node.id;button.innerHTML=`<small>${esc(node.kicker)}</small><strong>${esc(node.title)} <span>↗</span></strong><em>${esc(node.detail||'')}</em>`;button.setAttribute('aria-label',node.kind==='company'?`Fly to ${node.title}`:`Fly to ${TITLES[node.id]}`);button.onclick=()=>{this.stopTour();node.kind==='company'?openResearch(node.id):selectResearchSection(node.id,{scroll:false})};this.labelHost.append(button);node.label=button;this.labels.push(node);return node;
  }
  addCompanyHubs(){
    const records=OPEN_RESEARCH_INDEX.length?OPEN_RESEARCH_INDEX:researchIndex;
    this.records=records;const baseGeometry=new THREE.CylinderGeometry(13,18,3,6),towerGeometry=new THREE.BoxGeometry(4,1,4);
    records.forEach((r,i)=>{
      const angle=i/records.length*Math.PI*2+.3,ring=i%3,radius=205+ring*88;const pos=new THREE.Vector3(Math.sin(angle)*radius,0,Math.cos(angle)*radius);
      const group=new THREE.Group();group.position.copy(pos);const color=i%4===0?0x857dff:i%4===1?0x67bde4:i%4===2?0x79cabc:0x648dca;
      const base=new THREE.Mesh(baseGeometry,this.material(0x142338));base.position.y=-9;group.add(base);group.add(this.ring(18,color,-6));
      for(let k=0;k<5;k++){const box=new THREE.Mesh(towerGeometry,this.material(color,.55));const height=6+((i*13+k*11)%20);box.scale.y=height;box.position.set((k-2)*5,-6+height/2,0);group.add(box)}
      const beacon=new THREE.Mesh(new THREE.OctahedronGeometry(3,0),this.material(color));beacon.position.y=28;group.add(beacon);const glow=this.glow(color,22);glow.position.y=25;group.add(glow);this.scene.add(group);
      const node={id:r.ticker,kind:'company',title:r.ticker,kicker:r.exchange||'PUBLIC COMPANY',detail:r.name,position:pos.clone().add(new THREE.Vector3(0,37,0)),base:pos,group,beacon,color};base.userData.node=node;beacon.userData.node=node;this.pickables.push(base,beacon);this.hubs.push(this.addLabel(node));
      const p0=pos.clone().setY(-8),p1=pos.clone().multiplyScalar(.72).setY(-8);this.scene.add(this.line([p0,p1,new THREE.Vector3(0,-8,0)],color,.09));
    });
  }
  addPortals(){
    this.portalGroup=new THREE.Group();this.portalGroup.visible=false;this.scene.add(this.portalGroup);
    TOPICS.forEach((id,i)=>{
      const angle=i/TOPICS.length*Math.PI*2-.28;const pos=new THREE.Vector3(Math.sin(angle)*112,4+Math.sin(i*1.2)*14,Math.cos(angle)*112);
      const group=new THREE.Group();group.position.copy(pos);const color=COLORS[id];
      const geometry=id==='brief'?new THREE.IcosahedronGeometry(8,0):id==='filings'?new THREE.BoxGeometry(10,14,5):id==='financials'?new THREE.CylinderGeometry(7,10,14,6):new THREE.OctahedronGeometry(9,0);
      const mesh=new THREE.Mesh(geometry,this.material(color,.68));mesh.position.y=8;group.add(mesh);const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color,transparent:true,opacity:.9}));edge.position.copy(mesh.position);group.add(edge);
      group.add(this.ring(18,color,-8));const glow=this.glow(color,45);glow.position.y=7;group.add(glow);
      const pillar=this.line([new THREE.Vector3(0,-8,0),new THREE.Vector3(0,26,0)],color,.3);group.add(pillar);
      const pts=[];for(let n=0;n<=24;n++){const u=n/24;pts.push(new THREE.Vector3(pos.x*u,12+Math.sin(u*Math.PI)*14+pos.y*u,pos.z*u))}this.portalGroup.add(this.line(pts,color,.23));
      const node={id,kind:'topic',title:TITLES[id],kicker:'0'+(i+1)+' / RESEARCH DESTINATION',detail:'Select to explore',local:pos.clone().add(new THREE.Vector3(0,29,0)),position:pos.clone(),group,beacon:mesh,color};mesh.userData.node=node;this.pickables.push(mesh);this.portalGroup.add(group);this.topicNodes.push(this.addLabel(node));
    });
  }
  updateSculpture(b){
    if(!this.dataSculpture)return;
    for(const child of [...this.dataSculpture.children]){child.geometry?.dispose();child.material?.dispose();this.dataSculpture.remove(child)}
    const bars=(b?.bars||[]).filter(x=>[x.open,x.high,x.low,x.close].every(Number.isFinite)).slice(-34);if(!bars.length)return;
    const lo=Math.min(...bars.map(x=>x.low)),hi=Math.max(...bars.map(x=>x.high)),range=hi-lo||1;
    bars.forEach((b,i)=>{const a=i/bars.length*Math.PI*1.45+.5,r=47,low=3+(b.low-lo)/range*17,high=3+(b.high-lo)/range*17,color=b.close>=b.open?0x72e4ca:0xcd779a;const body=new THREE.Mesh(new THREE.BoxGeometry(1.3,Math.max(.8,Math.abs(b.close-b.open)/range*17),1.3),this.material(color));body.position.set(Math.sin(a)*r,3+((b.open+b.close)/2-lo)/range*17,Math.cos(a)*r);this.dataSculpture.add(body);const wick=this.line([new THREE.Vector3(body.position.x,low,body.position.z),new THREE.Vector3(body.position.x,high,body.position.z)],color,.7);this.dataSculpture.add(wick)});
  }
  overview(){
    this.selected=null;this.bundle=null;this.closePane();this.stopTour();this.portalGroup&&(this.portalGroup.visible=false);this.core?.position.set(0,0,0);this.swapWordmark('RECOVERY');Q('#universeTitle').classList.remove('company-title');Q('#universeTitle').innerHTML='A world of<br><em>market intelligence.</em>';Q('#universeSubtitle').textContent='Find a company. Follow a connection. Go deeper.';Q('#universeStockMeta').innerHTML=`<span>${this.records?.length||0} research hubs</span><span>${SYMBOLS.length.toLocaleString()} searchable symbols</span>`;Q('#universeGeneral').innerHTML='Start with AAPL <span>↗</span>';Q('#universeDestinations').innerHTML=`${(this.records||[]).slice(0,8).map(r=>`<button data-universe-ticker="${esc(r.ticker)}">${esc(r.ticker)} <span>↗</span></button>`).join('')}<button id="universeAllCompanies">All companies ⌕</button>`;QA('[data-universe-ticker]').forEach(x=>x.onclick=()=>openResearch(x.dataset.universeTicker));Q('#universeAllCompanies').onclick=()=>{this.openAux('explore');Q('#exHomeSearch')?.focus()};Q('#universeTravelStatus').textContent='Choose a company hub to begin.';this.fly(new THREE.Vector3(0,12,0),small()?760:570,.34,1.02);this.changed=true;
  }
  swapWordmark(text){if(!this.wordmark)return;this.wordmark.material.map.dispose();this.wordmark.material.dispose();this.core.remove(this.wordmark);this.wordmark=this.makeText(text,0xe2ebff,1024,180);this.wordmark.scale.set(text.length>6?88:68,15.5,1);this.wordmark.position.set(0,62,0);this.core.add(this.wordmark)}
  stock(b){
    const t=b.profile.ticker,changed=t!==this.selected;this.selected=t;this.bundle=b;this.closePane();this.stopTour();const hub=this.hubs.find(x=>x.id===t),pos=hub?.base||new THREE.Vector3(0,0,0);this.core?.position.copy(pos);this.portalGroup?.position.copy(pos);if(this.portalGroup)this.portalGroup.visible=true;this.swapWordmark(t);this.updateSculpture(b);
    const a=MODEL.analyze(b,tracked(t));this.analysis=a;
    Q('#universeTitle').textContent=t;Q('#universeTitle').classList.add('company-title');Q('#universeSubtitle').textContent=b.profile.name||t;
    Q('#universeStockMeta').innerHTML=`${MODEL.finite(b.quote?.price)?`<b>${fmtMoney(b.quote.price)}</b><span class="${(b.quote.changePct||0)>=0?'up':'down'}">${fmtPct(b.quote.changePct,2)}</span>`:''}<small>${esc(b.quote?.timestamp||'Public company records')}</small><span>${a.sources.length} attached sources</span>`;Q('#universeGeneral').innerHTML='General Research <span>↗</span>';
    Q('#universeDestinations').innerHTML=TOPICS.map((id,i)=>`<button data-universe-destination="${id}" ${id==='brief'?'class="selected"':''}><small>0${i+1}</small>${pretty(id)}</button>`).join('');QA('[data-universe-destination]').forEach(x=>x.onclick=()=>selectResearchSection(x.dataset.universeDestination,{scroll:false}));
    const f=a.fin.latest,cf=b.financials?.cashFlowPeriod;
    const details={brief:`${a.fin.rows.length} quarters · ${a.sources.length} sources`,price:b.quote?.price!=null?`${fmtMoney(b.quote.price)} · ${a.tech?.bars.length||0} daily bars`:'Market history & structure',financials:f?`${evidenceMoney(f.revenue)} revenue · ${f.period}`:'Company financial records',filings:`${b.filings?.length||0} original company filings`,catalysts:`${b.news?.length||0} news and release records`,risks:tracked(t)?.blocker?'Recovery conditions & invalidation':'Competing research scenarios',macro:'Rates · inflation · employment',sources:`${a.sources.length} evidence connections`};
    this.topicNodes.forEach(n=>{n.detail=details[n.id];n.label.querySelector('em').textContent=n.detail;n.position.copy(n.local).add(pos)});
    Q('#universeTravelStatus').textContent=`${t} / Research world ready. Choose a destination.`;
    if(changed||!this.flight)this.fly(pos.clone().add(new THREE.Vector3(0,18,0)),small()?380:280,.12,1.12);
    Q('#universeNotes').disabled=false;this.changed=true;
  }
  destination(id){
    if(!this.bundle)return;this.stopTour(false);const node=this.topicNodes.find(n=>n.id===id);this.openPane(TITLES[id]||'Research desk');
    QA('[data-universe-destination]').forEach(x=>x.classList.toggle('selected',x.dataset.universeDestination===id));this.topicNodes.forEach(x=>x.label.classList.toggle('selected',x.id===id));
    if(node){const pos=node.position.clone().add(new THREE.Vector3(0,-8,0));this.fly(pos,small()?240:170,Math.atan2(pos.x-this.core.position.x,pos.z-this.core.position.z)+.2,1.17);}
    Q('#universeTravelStatus').textContent=`${this.selected} / ${TITLES[id]||'Recovery thesis'}`;Q('.ex-main').scrollTo({top:0,behavior:'instant'});this.changed=true;
  }
  openPane(title){document.body.classList.add('universe-pane-open');Q('#universePaneTitle').textContent=title;Q('#universePaneKicker').textContent=(this.selected||'RECOVERY OS')+' / NATIVE RESEARCH';Q('.ex-main').removeAttribute('inert');this.resize();}
  closePane(){document.body.classList.remove('universe-pane-open');if(enabled)Q('.ex-main')?.setAttribute('inert','');this.resize();}
  openAux(id){baseView(id);this.openPane(id==='compare'?'Compare companies':id==='lists'?'Your research workspace':id==='explore'?'Find a company':'Stock screener');}
  fly(target,distance,yaw=this.yaw,pitch=this.pitch){
    if(this.failed)return;this.mode='orbit';Q('#universeMode').setAttribute('aria-pressed','false');Q('#universeMode').textContent='Free fly';document.body.classList.remove('universe-free-flight');this.keys.clear();
    const direction=new THREE.Vector3(Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch));const destination=target.clone().addScaledVector(direction,distance);
    this.flight={start:performance.now(),duration:reduced()?0:1550,from:this.camera.position.clone(),to:destination,fromTarget:this.cameraTarget.clone(),target:target.clone(),distance,yaw,pitch};this.changed=true;
  }
  reset(){const pos=this.selected?this.core.position.clone().add(new THREE.Vector3(0,18,0)):new THREE.Vector3(0,12,0);this.fly(pos,this.selected?(small()?380:280):(small()?760:570),.12,1.12)}
  travel(amount){this.flight=null;if(this.mode==='free'){const v=new THREE.Vector3();this.camera.getWorldDirection(v);this.camera.position.addScaledVector(v,amount*28)}else{this.distance=clamp(this.distance*Math.exp(-amount*.13),55,1500)}this.changed=true;}
  freeFly(){this.flight=null;this.mode=this.mode==='free'?'orbit':'free';this.keys.clear();if(this.mode==='free'){const e=new THREE.Euler().setFromQuaternion(this.camera.quaternion,'YXZ');this.freeYaw=e.y;this.freePitch=e.x;}else{this.target.copy(this.camera.position).add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(180));this.distance=180;const off=this.camera.position.clone().sub(this.target),s=new THREE.Spherical().setFromVector3(off);this.yaw=s.theta;this.pitch=s.phi;}document.body.classList.toggle('universe-free-flight',this.mode==='free');Q('#universeMode').setAttribute('aria-pressed',String(this.mode==='free'));Q('#universeMode').textContent=this.mode==='free'?'Orbit mode':'Free fly';Q('#universeHelp').textContent=this.mode==='free'?'DRAG TO LOOK · WASD TO FLY · Q / E ALTITUDE':'DRAG TO ORBIT · SCROLL / PINCH TO TRAVEL';this.canvas.focus({preventScroll:true});this.changed=true;}
  startTour(){if(this.tourTimer){this.stopTour();return}if(!this.selected){openResearch('AAPL').then(()=>this.startTour());return}this.tourIndex=0;Q('#universeTour').innerHTML='Pause flight <span>Ⅱ</span>';const next=()=>{if(!enabled)return;const id=TOPICS[this.tourIndex%TOPICS.length];baseSelect(id,{scroll:false});this.destination(id);this.tourIndex++;this.tourTimer=setTimeout(next,8500)};next();}
  stopTour(reset=true){if(reset){clearTimeout(this.tourTimer);this.tourTimer=null;Q('#universeTour')&&(Q('#universeTour').innerHTML='Take a flight <span>▷</span>')}}
  resize(){if(!this.renderer)return;const rect=this.stage.getBoundingClientRect();if(!rect.width||!rect.height)return;this.renderer.setSize(rect.width,rect.height,false);this.camera.aspect=rect.width/rect.height;this.camera.updateProjectionMatrix();this.changed=true;}
  bind(){
    const stop=()=>{this.flight=null;this.stopTour();this.changed=true};
    this.canvas.addEventListener('pointerdown',e=>{try{this.canvas.setPointerCapture(e.pointerId)}catch{}this.canvas.focus({preventScroll:true});this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.down={x:e.clientX,y:e.clientY,moved:0};stop()});
    this.canvas.addEventListener('pointermove',e=>{
      const prev=this.pointers.get(e.pointerId);if(!prev)return;const dx=e.clientX-prev.x,dy=e.clientY-prev.y;this.down.moved+=Math.abs(dx)+Math.abs(dy);
      if(this.pointers.size===2){const pts=[...this.pointers.entries()],other=pts.find(([id])=>id!==e.pointerId)?.[1];if(other){const before=Math.hypot(prev.x-other.x,prev.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);this.travel((after-before)*.027)}}
      else if(this.mode==='free'){this.freeYaw-=dx*.005;this.freePitch=clamp(this.freePitch-dy*.005,-1.45,1.45)}
      else if(e.shiftKey||e.buttons===2){const right=new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion);this.target.addScaledVector(right,-dx*this.distance/750);this.target.y+=dy*this.distance/750;}
      else{this.yaw-=dx*.005;this.pitch=clamp(this.pitch+dy*.005,.2,1.5)}
      this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.changed=true;
    });
    const up=e=>{const tap=this.down&&this.down.moved<7;this.pointers.delete(e.pointerId);if(tap){const r=this.canvas.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hit=this.raycaster.intersectObjects(this.pickables).find(h=>h.object.parent.visible&&h.object.userData.node?.kind==='company'||this.selected&&h.object.userData.node?.kind==='topic');const node=hit?.object.userData.node;if(node)node.kind==='company'?(window.RecoveryWorldInfo?window.RecoveryWorldInfo.select(node.id):openResearch(node.id)):selectResearchSection(node.id,{scroll:false});}};
    this.canvas.addEventListener('pointerup',up);this.canvas.addEventListener('pointercancel',e=>this.pointers.delete(e.pointerId));this.canvas.addEventListener('contextmenu',e=>e.preventDefault());this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.stopTour();this.travel(-clamp(e.deltaY,-140,140)/120)},{passive:false});
    this.canvas.addEventListener('keydown',e=>{if(['w','a','s','d','q','e','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();if(this.mode!=='free')this.freeFly();this.keys.add(e.key.toLowerCase());this.stopTour();this.changed=true}});
    document.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{this.keys.clear();this.pointers.clear()});
    QA('[data-flight-key]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);this.keys.add(b.dataset.flightKey);this.changed=true};for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>this.keys.delete(b.dataset.flightKey));});
    Q('#universeGeneral').onclick=()=>this.selected?selectResearchSection('brief',{scroll:false}):openResearch('AAPL');Q('#universeTour').onclick=()=>this.startTour();Q('#universeOverview').onclick=()=>{baseView('explore');this.overview()};Q('#universeReset').onclick=()=>{this.stopTour();this.reset()};Q('#universeZoomIn').onclick=()=>this.travel(1);Q('#universeZoomOut').onclick=()=>this.travel(-1);Q('#universeMode').onclick=()=>this.freeFly();Q('#universePaneClose').onclick=()=>this.closePane();Q('#universeRefresh').onclick=()=>{if(this.selected)openResearch(this.bundle.researchSymbol||this.selected,{section:researchSection,refresh:true,history:false})};Q('#universeExpand').onclick=()=>window.RecoveryUniverse?.read();Q('#universeTracker').onclick=()=>closeExplorer();Q('#universeReader').onclick=()=>window.RecoveryUniverse?.read();Q('#universeCompare').onclick=()=>{if(this.selected)addCompare(this.selected);this.openAux('compare')};Q('#universeNotes').onclick=()=>{if(!this.selected){this.openAux('lists');return}baseView('stock');this.openPane('Your research notes');scrollResearchTo(Q('#worldNotebook'));Q('#worldNote')?.focus({preventScroll:true})};
    Q('#universeHelpButton').onclick=()=>{Q('#universeHelpPanel').hidden=!Q('#universeHelpPanel').hidden};Q('#universeHelpClose').onclick=()=>{Q('#universeHelpPanel').hidden=true};document.addEventListener('visibilitychange',()=>{this.keys.clear();this.lastFrame=0;this.changed=true});window.addEventListener('resize',()=>this.resize());
  }
  projectLabels(){
    const width=this.stage.clientWidth,height=this.stage.clientHeight,placed=[];const selected=!!this.selected;
    const visible=[...this.topicNodes.filter(()=>selected),...this.hubs.filter(x=>x.id!==this.selected)].map(n=>({n,d:n.position.distanceTo(this.camera.position)})).sort((a,b)=>(a.n.kind==='topic'?-1:1)-(b.n.kind==='topic'?-1:1)||a.d-b.d);
    for(const n of this.labels)n.label.hidden=true;
    let companyCount=0;
    for(const {n,d} of visible){
      if(n.kind==='topic')n.position.copy(n.local).add(this.portalGroup.position);
      if(n.kind==='company'&&((selected&&d>500)||companyCount>(small()?7:15)))continue;
      const v=n.position.clone().project(this.camera);if(v.z<0||v.z>1||Math.abs(v.x)>1.05||Math.abs(v.y)>.83)continue;
      const x=(v.x+1)/2*width,y=(-v.y+1)/2*height,w=small()?126:168,h=n.kind==='topic'?76:66;
      if(x<w/2+8||x>width-w/2-8||y<138||y>height-125)continue;
      const heading=Q('.universe-heading').getBoundingClientRect();if(x-w/2<heading.right+12&&y<heading.bottom+12)continue;
      if(placed.some(p=>Math.abs(p.x-x)<(p.w+w)/2+7&&Math.abs(p.y-y)<(p.h+h)/2+10))continue;
      n.label.hidden=false;n.label.style.transform=`translate3d(${x-w/2}px,${y}px,0)`;n.label.style.opacity=selected&&n.kind==='company'?'.48':'1';n.label.style.zIndex=String(Math.max(1,1000-Math.floor(d)));placed.push({x,y,w,h});if(n.kind==='company')companyCount++;
    }
  }
  drawRadar(){
    if(!this.radar)return;const x=this.radar;x.clearRect(0,0,160,160);x.strokeStyle='#46729066';x.lineWidth=1;for(const r of [24,48,72]){x.beginPath();x.arc(80,80,r,0,Math.PI*2);x.stroke()}x.beginPath();x.moveTo(8,80);x.lineTo(152,80);x.moveTo(80,8);x.lineTo(80,152);x.stroke();for(const n of this.hubs){x.fillStyle=n.id===this.selected?'#deedff':'#7792b988';x.fillRect(80+n.base.x*.15-1.5,80+n.base.z*.15-1.5,3,3)}const p=this.camera.position;x.fillStyle='#85e8cc';x.beginPath();x.arc(clamp(80+p.x*.15,5,155),clamp(80+p.z*.15,5,155),3,0,Math.PI*2);x.fill();}
  frame(timestamp){
    requestAnimationFrame(t=>this.frame(t));if(!this.active||document.hidden||this.failed)return;const frameDelay=this.renderer.software?(small()?50:42):(small()?33:24);if(timestamp-this.lastFrame<frameDelay)return;const dt=Math.min(.06,(timestamp-this.lastFrame)/1000||.016);this.lastFrame=timestamp;this.time+=dt;
    if(this.flight){const f=this.flight,p=f.duration?clamp((performance.now()-f.start)/f.duration,0,1):1,e=p*p*(3-2*p);this.camera.position.lerpVectors(f.from,f.to,e);this.camera.position.y+=Math.sin(Math.PI*p)*16;this.cameraTarget.lerpVectors(f.fromTarget,f.target,e);this.camera.lookAt(this.cameraTarget);if(p===1){this.target.copy(f.target);this.distance=f.distance;this.yaw=f.yaw;this.pitch=f.pitch;this.flight=null;}}
    else if(this.mode==='free'){
      this.camera.quaternion.setFromEuler(new THREE.Euler(this.freePitch,this.freeYaw,0,'YXZ'));const forward=this.camera.getWorldDirection(new THREE.Vector3()),right=new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion),speed=dt*240;
      if(this.keys.has('w')||this.keys.has('arrowup'))this.camera.position.addScaledVector(forward,speed);if(this.keys.has('s')||this.keys.has('arrowdown'))this.camera.position.addScaledVector(forward,-speed);if(this.keys.has('a')||this.keys.has('arrowleft'))this.camera.position.addScaledVector(right,-speed);if(this.keys.has('d')||this.keys.has('arrowright'))this.camera.position.addScaledVector(right,speed);if(this.keys.has('q'))this.camera.position.y-=speed;if(this.keys.has('e'))this.camera.position.y+=speed;this.camera.position.y=clamp(this.camera.position.y,-7,1100);if(this.camera.position.length()>50000)this.camera.position.setLength(50000);this.cameraTarget.copy(this.camera.position).addScaledVector(forward,180);
    }else{this.camera.position.set(this.target.x+Math.sin(this.yaw)*Math.sin(this.pitch)*this.distance,this.target.y+Math.cos(this.pitch)*this.distance,this.target.z+Math.cos(this.yaw)*Math.sin(this.pitch)*this.distance);this.cameraTarget.copy(this.target);this.camera.lookAt(this.target)}
    if(!reduced()){this.coreOrb.rotation.y+=dt*.13;this.coreInner.rotation.y-=dt*.19;this.coreOrbit.rotation.y+=dt*.08;for(const n of this.topicNodes)n.beacon.rotation.y+=dt*.2;}
    if(reduced()&&!this.changed&&!this.flight&&!this.keys.size)return;this.renderer.render(this.scene,this.camera);this.projectLabels();this.drawRadar();this.changed=false;
  }
  activate(){this.active=true;document.body.classList.add('universe-mode');Q('#explorer').setAttribute('aria-label','Recovery OS research universe');this.resize();this.changed=true;}
  deactivate(){this.active=false;this.stopTour();this.keys.clear();this.pointers.clear();document.body.classList.remove('universe-mode','universe-pane-open','universe-free-flight');Q('.ex-main')?.removeAttribute('inert');}
}
