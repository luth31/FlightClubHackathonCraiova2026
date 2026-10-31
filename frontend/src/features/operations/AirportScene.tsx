import {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {Focus, Maximize2, Minus, Plus, RotateCcw} from 'lucide-react';
import {createAirportModel, type AirportGeoJSON} from './airport-model';
import {createAircraft, disposeObject} from './aircraft-model';
import {AIRPORT_REFERENCE, projectPoint, type AirportSceneProps, type SceneFlight} from './scene-types';
import './airport-scene.css';
import type {TilesRenderer} from '3d-tiles-renderer';

type FlightObject={mesh:THREE.Group;target:THREE.Vector3;heading:number;flight:SceneFlight;ground:number};
type SceneHandle={wake:()=>void;syncFlights:()=>void;overview:()=>void;focus:()=>void;zoom:(factor:number)=>void};
type Notice={status:'loading'|'ready'|'error';message:string};
const modelCache=new Map<string,AirportGeoJSON>();
const statusLabel={neutral:'Fără alertă',caution:'Atenție',critical:'Prioritate'};

/** Owns one WebGL context, including tiles and aircraft; never persists Google content. */
export function AirportScene(props:AirportSceneProps){
  const {airportId,mapMode='model',googleApiKey,active=true,focusRequest,overviewRequest}=props;
  const host=useRef<HTMLDivElement>(null),labelLayer=useRef<HTMLDivElement>(null),compass=useRef<HTMLSpanElement>(null);
  const latest=useRef(props),handle=useRef<SceneHandle|null>(null);
  const [notice,setNotice]=useState<Notice>({status:'loading',message:'Pregătim aeroportul…'});
  const [credits,setCredits]=useState('');
  const [restart,setRestart]=useState(0);
  useEffect(()=>{latest.current=props;handle.current?.syncFlights();handle.current?.wake();},[props]);
  useEffect(()=>{handle.current?.focus();},[focusRequest]);
  useEffect(()=>{handle.current?.overview();},[overviewRequest]);

  useEffect(()=>{
    const container=host.current;if(!container)return;
    let disposed=false,contextLost=false,raf=0,lastFrame=0,settleFrames=0,tiles:TilesRenderer|undefined;
    let dimensions={width:1,height:1},mapReady=false,creditsAt=0,lastGroundAt=0,tileFailure=false;
    const abort=new AbortController(),reference=AIRPORT_REFERENCE[airportId];
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const flights=new Map<string,FlightObject>();
    const report=(status:Notice['status'],message:string)=>{if(disposed)return;setNotice({status,message});latest.current.onMapStatus?.(status,message);};
    report('loading',mapMode==='photorealistic'?'Încărcăm aeroportul fotorealist…':'Construim aeroportul din geometria reală…');
    setCredits('');
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,logarithmicDepthBuffer:true,powerPreference:'high-performance'});}
    catch{report('error','Grafica 3D nu este disponibilă în acest browser. Activează accelerarea hardware.');return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
    renderer.shadowMap.enabled=mapMode==='model';renderer.shadowMap.type=THREE.PCFShadowMap;
    renderer.domElement.className='airport-scene-canvas';renderer.domElement.setAttribute('aria-label',`Hartă 3D interactivă a aeroportului ${reference.label}`);
    renderer.domElement.tabIndex=0;container.prepend(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#dce5df');scene.fog=new THREE.Fog('#dce5df',7000,15500);
    const camera=new THREE.PerspectiveCamera(43,1,2,35000);camera.position.set(850,1800,2500);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=!reducedMotion;controls.dampingFactor=.12;
    controls.minDistance=75;controls.maxDistance=9500;controls.maxPolarAngle=Math.PI*.475;controls.minPolarAngle=.1;controls.target.set(-100,0,120);
    controls.screenSpacePanning=false;controls.panSpeed=.7;controls.zoomSpeed=.7;
    const ambient=new THREE.HemisphereLight('#f0f4ff','#68745d',.95);scene.add(ambient);
    const sun=new THREE.DirectionalLight('#fff1d7',2.1);sun.position.set(-1600,2200,1400);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-2100;sun.shadow.camera.right=2100;sun.shadow.camera.top=1400;sun.shadow.camera.bottom=-1400;sun.shadow.camera.near=10;sun.shadow.camera.far=7000;sun.shadow.normalBias=1;sun.shadow.bias=-.00008;scene.add(sun,sun.target);
    const environment=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);const environmentTarget=pmrem.fromScene(environment,.04);scene.environment=environmentTarget.texture;scene.environmentIntensity=.3;environment.dispose();pmrem.dispose();
    const aircraftGroup=new THREE.Group();aircraftGroup.name='live-aircraft';scene.add(aircraftGroup);
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),projected=new THREE.Vector3();
    const groundRay=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0),0,15000);
    const mapBounds=new THREE.Box3(new THREE.Vector3(-1450,0,-600),new THREE.Vector3(1450,0,600));
    let mapObject:THREE.Group|undefined;
    const wake=()=>{if(!disposed&&!contextLost&&!raf&&latest.current.active!==false&&!document.hidden)raf=requestAnimationFrame(render);};
    const overview=()=>{
      const center=mapBounds.getCenter(new THREE.Vector3());const size=mapBounds.getSize(new THREE.Vector3());const distance=Math.max(size.x,size.z)*1.08;
      controls.target.copy(center).add(new THREE.Vector3(0,0,airportId==='craiova'?150:-100));
      camera.position.copy(controls.target).add(new THREE.Vector3(distance*.12,distance*.57,distance*.76));controls.update();settleFrames=12;wake();
    };
    const focus=()=>{const selected=flights.get(latest.current.selectedFlightId||'');if(!selected)return;controls.target.copy(selected.mesh.position);camera.position.copy(selected.mesh.position).add(new THREE.Vector3(115,100,140));controls.update();settleFrames=12;wake();};
    const zoom=(factor:number)=>{camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();settleFrames=12;wake();};
    const removeFlight=(id:string,item:FlightObject)=>{aircraftGroup.remove(item.mesh);disposeObject(item.mesh,false);(item.mesh.userData.ownedMaterials as THREE.Material[]).forEach(material=>material.dispose());flights.delete(id);};
    const syncFlights=()=>{
      const wanted=new Set(latest.current.flights.map(f=>f.id));for(const [id,item]of flights)if(!wanted.has(id))removeFlight(id,item);
      for(const flight of latest.current.flights){
        if(!Number.isFinite(flight.lat)||!Number.isFinite(flight.lon))continue;
        let item=flights.get(flight.id);const [x,z]=projectPoint(flight.lon,flight.lat,reference);
        if(item&&item.flight.status!==flight.status){removeFlight(flight.id,item);item=undefined;}
        if(!item){const mesh=createAircraft(flight.status);mesh.userData.flightId=flight.id;mesh.position.set(x,Math.max(0,flight.altitude_m||0),z);mesh.rotation.y=-(flight.heading||0)*Math.PI/180;aircraftGroup.add(mesh);item={mesh,target:mesh.position.clone(),heading:mesh.rotation.y,flight,ground:0};flights.set(flight.id,item);}
        item.flight=flight;item.target.set(x,item.ground+Math.max(0,flight.altitude_m||0),z);item.heading=-(flight.heading||0)*Math.PI/180;
        const ring=item.mesh.getObjectByName('selection-ring');if(ring)ring.visible=latest.current.selectedFlightId===flight.id;
      }
      settleFrames=Math.max(settleFrames,2);wake();
    };
    function updateLabels(){
      const layer=labelLayer.current;if(!layer)return;
      const occupied:{x:number;y:number;w:number;h:number}[]=[];
      const children=Array.from(layer.children).sort((a,b)=>Number((b as HTMLElement).dataset.flightId===latest.current.selectedFlightId)-Number((a as HTMLElement).dataset.flightId===latest.current.selectedFlightId));
      for(const child of children){
        const el=child as HTMLElement,item=flights.get(el.dataset.flightId||'');if(!item){el.style.display='none';continue;}
        projected.copy(item.mesh.position);projected.y+=18;projected.project(camera);
        const visible=projected.z>-1&&projected.z<1&&Math.abs(projected.x)<1.04&&Math.abs(projected.y)<1.04;
        el.style.display=visible?'':'none';if(visible){
          const w=el.offsetWidth,h=el.offsetHeight;const x=Math.max(w/2+6,Math.min(dimensions.width-w/2-6,(projected.x*.5+.5)*dimensions.width));
          const anchorY=(-projected.y*.5+.5)*dimensions.height;let y=anchorY;
          for(let attempt=0;attempt<5&&occupied.some(rect=>Math.abs(rect.x-x)<(rect.w+w)/2+5&&Math.abs(rect.y-y)<(rect.h+h)/2+4);attempt++)y-=h+5;
          occupied.push({x,y,w,h});el.style.setProperty('--label-lift',`${anchorY-y}px`);el.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;
        }
      }
      if(compass.current){const direction=camera.position.clone().sub(controls.target);compass.current.style.transform=`rotate(${Math.atan2(direction.x,direction.z)}rad)`;}
    }
    function render(now:number){
      raf=0;if(disposed||latest.current.active===false||document.hidden)return;
      const delta=Math.min((now-lastFrame)/1000||.016,.05);lastFrame=now;
      const controlsChanged=controls.update(delta);let moving=false;
      for(const item of flights.values()){
        const distance=item.mesh.position.distanceToSquared(item.target);
        if(distance>.0001){item.mesh.position.lerp(item.target,reducedMotion?1:Math.min(1,delta*4));moving=true;}
        const diff=Math.atan2(Math.sin(item.heading-item.mesh.rotation.y),Math.cos(item.heading-item.mesh.rotation.y));
        if(Math.abs(diff)>.0001){item.mesh.rotation.y+=diff*(reducedMotion?1:Math.min(1,delta*5));moving=true;}
      }
      camera.updateMatrixWorld();
      if(tiles&&!tileFailure){
        tiles.update();
        if(now-lastGroundAt>1200&&tiles.visibleTiles.size){
          lastGroundAt=now;scene.updateMatrixWorld(true);
          for(const item of flights.values()){
            groundRay.ray.origin.set(item.target.x,8000,item.target.z);
            const hit=groundRay.intersectObject(tiles.group,true)[0];
            if(hit&&Math.abs(hit.point.y)<1500){item.ground=hit.point.y;item.target.y=item.ground+Math.max(0,item.flight.altitude_m||0)+.35;}
          }
        }
        if(now-creditsAt>500){creditsAt=now;const values=tiles.getAttributions().filter(a=>a.type==='string').map(a=>String(a.value)).filter(Boolean);setCredits([...new Set(values)].join(' · '));}
        if(!mapReady&&tiles.visibleTiles.size>0){mapReady=true;report('ready','');}
      }
      updateLabels();renderer.render(scene,camera);
      if(controlsChanged||moving||settleFrames-->0)wake();
    }
    const onControls=()=>{settleFrames=12;wake();};controls.addEventListener('change',onControls);
    const observer=new ResizeObserver(()=>{dimensions={width:Math.max(1,container.clientWidth),height:Math.max(1,container.clientHeight)};renderer.setSize(dimensions.width,dimensions.height);camera.aspect=dimensions.width/dimensions.height;camera.updateProjectionMatrix();tiles?.setResolutionFromRenderer(camera,renderer);wake();});observer.observe(container);
    const onVisibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else wake();};document.addEventListener('visibilitychange',onVisibility);
    const onContextLost=(event:Event)=>{event.preventDefault();contextLost=true;cancelAnimationFrame(raf);raf=0;report('error','Sesiunea grafică a fost întreruptă. Reîncarcă harta pentru a continua.');};
    renderer.domElement.addEventListener('webglcontextlost',onContextLost);
    let down={x:0,y:0};const pointerDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
    const pointerUp=(e:PointerEvent)=>{
      if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
      const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
      const hits=raycaster.intersectObjects(aircraftGroup.children,true);let object:THREE.Object3D|null=hits[0]?.object||null;
      while(object&&!object.userData.flightId)object=object.parent;
      if(object?.userData.flightId)latest.current.onSelectFlight(String(object.userData.flightId));
    };
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);
    const keyDown=(e:KeyboardEvent)=>{if(e.key==='+'||e.key==='='){e.preventDefault();zoom(.8);}if(e.key==='-'){e.preventDefault();zoom(1.2);}if(e.key==='Home'){e.preventDefault();overview();}};renderer.domElement.addEventListener('keydown',keyDown);
    handle.current={wake,syncFlights,overview,focus,zoom};syncFlights();overview();
    if(mapMode==='model'){
      const load=async()=>{
        try{
          let data=modelCache.get(airportId);if(!data){const response=await fetch(`/airports/${airportId}.geojson`,{signal:abort.signal});if(!response.ok)throw new Error('geometry unavailable');data=await response.json() as AirportGeoJSON;modelCache.set(airportId,data);}
          if(disposed)return;const model=createAirportModel(data,reference);mapObject=model.group;scene.add(model.group);mapBounds.copy(model.bounds);mapReady=true;report('ready','');overview();
        }catch{if(!disposed&&!abort.signal.aborted)report('error','Geometria aeroportului nu s-a încărcat. Reîncearcă harta.');}
      };void load();
    }else if(googleApiKey){
      const loadTiles=async()=>{
        try{
          const [{TilesRenderer:Renderer},{GoogleCloudAuthPlugin},{ReorientationPlugin}]=await Promise.all([import('3d-tiles-renderer'),import('3d-tiles-renderer/core/plugins'),import('3d-tiles-renderer/three/plugins')]);
          if(disposed)return;tiles=new Renderer();tiles.fetchOptions={cache:'no-store'};
          tiles.registerPlugin(new GoogleCloudAuthPlugin({apiToken:googleApiKey,autoRefreshToken:true}));
          tiles.registerPlugin(new ReorientationPlugin({lat:reference.lat*Math.PI/180,lon:reference.lon*Math.PI/180,height:reference.elevation+40}));
          // Plugin's local frame is west/north; our flight coordinates are east/south.
          const orient=new THREE.Group();orient.rotation.y=Math.PI;orient.add(tiles.group);scene.add(orient);
          tiles.setCamera(camera);tiles.setResolutionFromRenderer(camera,renderer);tiles.errorTarget=12;
          tiles.addEventListener('needs-update',wake);tiles.addEventListener('load-model',wake);tiles.addEventListener('tile-visibility-change',wake);
          tiles.addEventListener('load-error',({tile})=>{if(!tile&&!mapReady&&!disposed){tileFailure=true;report('error','Harta fotorealistă nu este disponibilă acum. Poți continua cu modelul aeroportului.');}});
          wake();
        }catch{if(!disposed)report('error','Harta fotorealistă nu a putut porni. Modelul aeroportului rămâne disponibil.');}
      };void loadTiles();
    }else report('error','Harta fotorealistă nu este configurată pentru această instalare.');
    const loadingTimeout=window.setTimeout(()=>{if(!mapReady&&!disposed&&mapMode==='photorealistic'){tileFailure=true;report('error','Harta fotorealistă răspunde prea lent. Poți continua cu modelul aeroportului.');}},45000);
    return()=>{
      window.clearTimeout(loadingTimeout);disposed=true;abort.abort();cancelAnimationFrame(raf);handle.current=null;observer.disconnect();document.removeEventListener('visibilitychange',onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost',onContextLost);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('keydown',keyDown);
      controls.removeEventListener('change',onControls);controls.dispose();tiles?.dispose();
      if(mapObject){disposeObject(mapObject);const textures=new Set<THREE.Texture>();mapObject.traverse(o=>{if(o instanceof THREE.Mesh){const materials=Array.isArray(o.material)?o.material:[o.material];for(const material of materials)if('map'in material&&material.map instanceof THREE.Texture)textures.add(material.map);}});textures.forEach(t=>t.dispose());}
      disposeObject(aircraftGroup);environmentTarget.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
    };
  },[airportId,mapMode,googleApiKey,restart]);

  return <div ref={host} className={`airport-scene ${active?'':'is-paused'}`}>
    <div ref={labelLayer} className="airport-scene-labels">{props.flights.map(flight=><button type="button" key={flight.id} data-flight-id={flight.id} className={`airport-flight-label is-${flight.status} ${props.selectedFlightId===flight.id?'is-selected':''}`} onClick={()=>props.onSelectFlight(flight.id)} aria-label={`${flight.callsign}, ${statusLabel[flight.status]}`}><span className="airport-flight-dot"/><strong>{flight.callsign}</strong>{props.selectedFlightId===flight.id&&<span>{Math.round(flight.altitude_m||0)>15?`${Math.round(flight.altitude_m||0)} m`:'La sol'}</span>}</button>)}</div>
    <div className="airport-scene-orientation"><span ref={compass}><i/>N</span></div>
    <div className="airport-scene-controls" aria-label="Control hartă">
      <button type="button" title="Apropie" aria-label="Apropie harta" onClick={()=>handle.current?.zoom(.75)}><Plus size={17}/></button>
      <button type="button" title="Depărtează" aria-label="Depărtează harta" onClick={()=>handle.current?.zoom(1.3)}><Minus size={17}/></button>
      <button type="button" title="Încadrează aeroportul" aria-label="Încadrează aeroportul" onClick={()=>handle.current?.overview()}><Maximize2 size={16}/></button>
      {props.selectedFlightId&&<button type="button" title="Urmărește aeronava" aria-label="Încadrează aeronava selectată" onClick={()=>handle.current?.focus()}><Focus size={17}/></button>}
    </div>
    {notice.status!=='ready'&&<div className={`airport-scene-notice is-${notice.status}`} role={notice.status==='error'?'alert':'status'}>{notice.status==='loading'&&<span className="airport-scene-loader"/>}<span>{notice.message}</span>{notice.status==='error'&&(mapMode==='photorealistic'&&props.onMapModeChange?<button type="button" onClick={()=>props.onMapModeChange?.('model')}>Deschide modelul 3D</button>:<button type="button" onClick={()=>setRestart(n=>n+1)}><RotateCcw size={14}/> Reîncearcă</button>)}</div>}
    <div className="airport-scene-attribution">{mapMode==='photorealistic'?<><img src="/operations/google-maps.svg" alt="Google Maps"/><span>{credits}</span></>:<><span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></span><span>Volumetrie ilustrativă · geometrie reală</span></>}</div>
  </div>;
}
export default AirportScene;
