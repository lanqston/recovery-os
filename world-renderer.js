/* Markets uses native document layout. No graphics context is created. */
export class StaticMapRenderer {
  constructor(canvas){this.canvas=canvas;this.software=true;this.staticMap=true;this.ratio=1;}
  setPixelRatio(){} getPixelRatio(){return 1;}
  setClearColor(){} setSize(){} render(){} dispose(){}
}
export function marketRenderer(canvas){return new StaticMapRenderer(canvas);}
