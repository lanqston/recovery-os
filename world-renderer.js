import * as THREE from './vendor/three.module.min.js';

/* The same perspective scene remains navigable without a GPU/WebGL context. */
export class HologramRenderer{
  constructor(canvas){this.canvas=canvas;this.context=canvas.getContext('2d',{alpha:false});this.ratio=1;this.width=1;this.height=1;this.edges=new WeakMap();this.vector=new THREE.Vector3();this.matrix=new THREE.Matrix4();this.software=true;}
  setPixelRatio(r){this.ratio=Math.min(r,1.5)}
  setClearColor(){}
  setSize(w,h){this.width=w;this.height=h;this.canvas.width=Math.max(1,Math.round(w*this.ratio));this.canvas.height=Math.max(1,Math.round(h*this.ratio));}
  project(x,y,z,matrix){const v=this.vector.set(x,y,z).applyMatrix4(matrix);return{x:(v.x+1)*this.width/2,y:(1-v.y)*this.height/2,z:v.z};}
  render(scene,camera){
    const ctx=this.context,w=this.width,h=this.height;if(!ctx)return;
    ctx.setTransform(this.ratio,0,0,this.ratio,0,0);ctx.globalAlpha=1;ctx.fillStyle='#030911';ctx.fillRect(0,0,w,h);
    const glow=ctx.createRadialGradient(w*.56,h*.44,0,w*.56,h*.44,w*.65);glow.addColorStop(0,'#0a2433');glow.addColorStop(.48,'#071622');glow.addColorStop(1,'#030911');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const draw=[];scene.traverseVisible(obj=>{if(obj.isMesh||obj.isLine||obj.isPoints||obj.isSprite){if(obj.userData.skipSoftware)return;const center=this.vector.setFromMatrixPosition(obj.matrixWorld);const depth=center.distanceToSquared(camera.position);draw.push({obj,depth})}});draw.sort((a,b)=>b.depth-a.depth);
    for(const {obj,depth}of draw){
      const m=new THREE.Matrix4().multiplyMatrices(this.matrix,obj.matrixWorld),mat=Array.isArray(obj.material)?obj.material[0]:obj.material;if(!mat||mat.visible===false)continue;
      const opacity=mat.opacity??1,color='#'+(mat.color?.getHexString()||'8fcddd');ctx.globalAlpha=Math.min(1,opacity);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=.7;
      if(obj.isSprite){const point=this.project(0,0,0,m);if(point.z<0||point.z>1)continue;const scale=obj.getWorldScale(new THREE.Vector3()),distance=Math.max(1,Math.sqrt(depth));const size=h/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))/distance;const image=mat.map?.image;if(image&&scale.x*size>1){ctx.globalAlpha=Math.min(opacity,.9);ctx.drawImage(image,point.x-scale.x*size/2,point.y-scale.y*size/2,scale.x*size,scale.y*size)}continue;}
      if(obj.isPoints){const p=obj.geometry.attributes.position,colors=obj.geometry.attributes.color;const step=w<760?2:1;ctx.globalAlpha=Math.min(opacity,.8);for(let i=0;i<p.count;i+=step){const point=this.project(p.getX(i),p.getY(i),p.getZ(i),m);if(point.z<0||point.z>1||point.x<0||point.x>w||point.y<80||point.y>h)continue;if(colors){const c=new THREE.Color().fromBufferAttribute(colors,i);ctx.fillStyle='#'+c.getHexString()}const radius=obj.userData.marketCloud?1.4:.7;ctx.fillRect(point.x,point.y,radius,radius)}continue;}
      let geometry=obj.geometry;
      if(obj.isMesh){if(!this.edges.has(geometry))this.edges.set(geometry,mat.wireframe?new THREE.WireframeGeometry(geometry):new THREE.EdgesGeometry(geometry,25));geometry=this.edges.get(geometry);ctx.globalAlpha=Math.min(.64,opacity*.7+.12);}
      const positions=geometry?.attributes.position;if(!positions)continue;
      const segments=obj.isMesh||obj.isLineSegments,index=geometry.index,count=index?index.count:positions.count;ctx.beginPath();let visible=0;
      for(let i=0;i<count-1;i+=segments?2:1){const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,p=this.project(positions.getX(a),positions.getY(a),positions.getZ(a),m),q=this.project(positions.getX(b),positions.getY(b),positions.getZ(b),m);if(p.z<0||p.z>1||q.z<0||q.z>1||Math.abs(p.x)>w*4||Math.abs(q.x)>w*4||Math.abs(p.y)>h*4||Math.abs(q.y)>h*4)continue;ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);visible++;}
      if(visible)ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  dispose(){}
}

export function marketRenderer(canvas,mobile){
  let gl=null;try{gl=canvas.getContext('webgl2',{alpha:false,antialias:!mobile,powerPreference:'low-power'})}catch{}
  if(gl)return new THREE.WebGLRenderer({canvas,context:gl,alpha:false,antialias:!mobile,powerPreference:'low-power'});
  // A failed context request does not lock the canvas; use the perspective renderer.
  return new HologramRenderer(canvas);
}
