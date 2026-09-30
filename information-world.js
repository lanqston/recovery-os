/* Research navigation for the document-based market browser. */
export function installInformationWorld(world){
 const U=window.RecoveryFabric,$=s=>document.querySelector(s);
 const home=world.home.bind(world);
 world.home=function(...args){U.exitReplay();home(...args);U.lastVisited=null;$('#informationStockBar')?.setAttribute('hidden','');document.body.classList.remove('information-open');};
 const stock=world.stock.bind(world);
 world.stock=function(bundle){stock(bundle);U.onStock(bundle);};
 const station=world.station.bind(world);
 world.station=function(id,options){
  const routes={coverage:()=>U.openCoverage(),changes:()=>U.openChanges(),replay:()=>U.openReplay(),health:()=>U.openHealth(),console:()=>U.openTools()};
  if(routes[id])return routes[id]();
  U.exitReplay();document.body.classList.remove('information-open');$('#informationStockBar')?.setAttribute('hidden','');return station(id,options);
 };
 const select=t=>{U.exitReplay();return openResearch(t);};
 window.RecoveryWorldInfo={select,teleport:select,matches:()=>true,controls:()=>world.home(),stats:()=> 'Standard page layout'};
 window.addEventListener('information-replay',e=>document.body.classList.toggle('information-historical',!!e.detail));
 U.mount(world);
}
