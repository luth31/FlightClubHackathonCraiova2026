import {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {Focus, Maximize2, Minus, Plus, Radar, RotateCcw, Plane} from 'lucide-react';
import {createAirportModel, type AirportGeoJSON} from './airport-model';
import {createAircraft, disposeObject} from './aircraft-model';
import {AIRPORT_REFERENCE, flightCoordinates, fitTrafficFrame, REFERENCE_GEOID_OFFSET_M, type AirportSceneProps, type SceneFlight} from './scene-types';
import {installMapWheelBoundary} from './map-input';
import './airport-scene.css';
import type {TilesRenderer} from '3d-tiles-renderer';

type FlightObject={mesh:THREE.Group;target:THREE.Vector3;heading:number;flight:SceneFlight;ground:number;base:THREE.Vector3;projection:THREE.Line;footprint:THREE.Mesh};
type SceneHandle={wake:()=>void;syncFlights:()=>void;overview:()=>void;airport:()=>void;traffic:()=>void;focus:()=>void;zoom:(factor:number)=>void;checkLoadingTimeout:()=>void};
type Notice={status:'loading'|'ready'|'error';message:string};
const modelCache=new Map<string,AirportGeoJSON>();
const statusLabel={neutral:'Fără alertă',caution:'Atenție',critical:'Prioritate'};

/** Owns one WebGL context; Google controls HTTP cache lifetime through its headers. */
export function AirportScene(props:AirportSceneProps){
  const {airportId,mapMode='model',googleApiKey,active=true,focusRequest,overviewRequest}=props;
  const host=useRef<HTMLDivElement>(null),labelLayer=useRef<HTMLDivElement>(null),compass=useRef<HTMLSpanElement>(null),airportAnchor=useRef<HTMLButtonElement>(null);
  const latest=useRef(props),handle=useRef<SceneHandle|null>(null);
  const [notice,setNotice]=useState<Notice>({status:'loading',message:'Pregătim aeroportul…'});
  const [credits,setCredits]=useState('');
  const [restart,setRestart]=useState(0);
  useEffect(()=>{latest.current=props;handle.current?.syncFlights();handle.current?.wake();},[props]);
  useEffect(()=>{handle.current?.focus();},[focusRequest]);
  useEffect(()=>{handle.current?.overview();},[overviewRequest]);
  useEffect(()=>{
    if(!active||mapMode!=='photorealistic')return;
    const timer=window.setTimeout(()=>handle.current?.checkLoadingTimeout(),45000);
    return()=>window.clearTimeout(timer);
  },[active,mapMode,airportId,googleApiKey,restart]);

  useEffect(()=>{
    const container=host.current;if(!container)return;
    let disposed=false,contextLost=false,raf=0,lastFrame=0,settleFrames=0,tiles:TilesRenderer|undefined;
    let dimensions={width:1,height:1},mapReady=false,creditsAt=0,lastGroundAt=0,tileFailure=false;
    let wasTrafficMode=false,trafficFramed=false;
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
    const camera=new THREE.PerspectiveCamera(43,1,2,400000);camera.position.set(850,1800,2500);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=!reducedMotion;controls.dampingFactor=.12;
    controls.minDistance=75;controls.maxDistance=250000;controls.maxPolarAngle=Math.PI*.475;controls.minPolarAngle=.1;controls.target.set(-100,0,120);
    controls.screenSpacePanning=false;controls.panSpeed=.7;controls.zoomSpeed=.7;
    const removeWheelBoundary=installMapWheelBoundary(container.closest<HTMLElement>('.ops-map-area')||container,renderer.domElement,()=>latest.current.active!==false);
    const ambient=new THREE.HemisphereLight('#f0f4ff','#68745d',.95);scene.add(ambient);
    const sun=new THREE.DirectionalLight('#fff1d7',2.1);sun.position.set(-1600,2200,1400);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-2100;sun.shadow.camera.right=2100;sun.shadow.camera.top=1400;sun.shadow.camera.bottom=-1400;sun.shadow.camera.near=10;sun.shadow.camera.far=7000;sun.shadow.normalBias=1;sun.shadow.bias=-.00008;scene.add(sun,sun.target);
    const environment=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);const environmentTarget=pmrem.fromScene(environment,.04);scene.environment=environmentTarget.texture;scene.environmentIntensity=.3;environment.dispose();pmrem.dispose();
    const aircraftGroup=new THREE.Group();aircraftGroup.name='live-aircraft';scene.add(aircraftGroup);
    const regionalGuide=new THREE.Group();scene.add(regionalGuide);
    if(mapMode==='model'){
      const plane=new THREE.Mesh(new THREE.PlaneGeometry(140000,140000),new THREE.MeshBasicMaterial({color:'#dce5df'}));plane.rotation.x=-Math.PI/2;plane.position.y=-.2;regionalGuide.add(plane);
      for(const nauticalMiles of [5,10,25]){
        const radius=nauticalMiles*1852;
        const points=Array.from({length:129},(_,i)=>new THREE.Vector3(Math.sin(i/128*Math.PI*2)*radius,.2,Math.cos(i/128*Math.PI*2)*radius));
        const ring=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#789386',transparent:true,opacity:.28}));regionalGuide.add(ring);
      }
    }
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),projected=new THREE.Vector3();
    const groundRay=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0),0,15000);
    const mapBounds=new THREE.Box3(new THREE.Vector3(-1450,0,-600),new THREE.Vector3(1450,0,600));
    let mapObject:THREE.Group|undefined;
    const wake=()=>{if(!disposed&&!contextLost&&!raf&&latest.current.active!==false&&!document.hidden)raf=requestAnimationFrame(render);};
    const airportOverview=()=>{
      const center=mapBounds.getCenter(new THREE.Vector3());const size=mapBounds.getSize(new THREE.Vector3());const distance=Math.max(size.x,size.z)*1.08;
      controls.target.copy(center).add(new THREE.Vector3(0,0,airportId==='craiova'?150:-100));
      camera.position.copy(controls.target).add(new THREE.Vector3(distance*.12,distance*.57,distance*.76));controls.update();settleFrames=12;wake();
    };
    const trafficOverview=()=>{
      const points=[mapBounds.min.toArray(),mapBounds.max.toArray(),...Array.from(flights.values(),item=>item.target.toArray())];
      const frame=fitTrafficFrame(points,camera.fov,camera.aspect);
      controls.target.fromArray(frame.target);camera.position.fromArray(frame.position);controls.update();settleFrames=12;wake();
      trafficFramed=flights.size>0;
    };
    const overview=()=>latest.current.trafficMode?trafficOverview():airportOverview();
    const focus=()=>{
      const selected=flights.get(latest.current.selectedFlightId||'');if(!selected)return;
      if(latest.current.trafficMode){
        // Keep its geographic footprint visible too: an airborne close-up alone
        // hides the airport/terrain that makes a reported position meaningful.
        const point=selected.mesh.position;
        const frame=fitTrafficFrame([selected.base.toArray(),point.toArray()],camera.fov,camera.aspect);
        controls.target.fromArray(frame.target);camera.position.fromArray(frame.position);
      }else{controls.target.copy(selected.mesh.position);camera.position.copy(selected.mesh.position).add(new THREE.Vector3(115,100,140));}
      controls.update();settleFrames=12;wake();
    };
    const zoom=(factor:number)=>{camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();settleFrames=12;wake();};
    const removeFlight=(id:string,item:FlightObject)=>{aircraftGroup.remove(item.mesh,item.projection,item.footprint);disposeObject(item.mesh,false);(item.mesh.userData.ownedMaterials as THREE.Material[]).forEach(material=>material.dispose());item.projection.geometry.dispose();(item.projection.material as THREE.Material).dispose();item.footprint.geometry.dispose();(item.footprint.material as THREE.Material).dispose();flights.delete(id);};
    const syncFlights=()=>{
      const wanted=new Set(latest.current.flights.map(f=>f.id));for(const [id,item]of flights)if(!wanted.has(id))removeFlight(id,item);
      for(const flight of latest.current.flights){
        if(!Number.isFinite(flight.lat)||!Number.isFinite(flight.lon))continue;
        let item=flights.get(flight.id);const [x,y,z]=flightCoordinates(flight,reference,mapMode);
        if(item&&item.flight.status!==flight.status){removeFlight(flight.id,item);item=undefined;}
        if(!item){
          const mesh=createAircraft(flight.status,flight.display_scale);mesh.userData.flightId=flight.id;mesh.position.set(x,y,z);mesh.rotation.y=-(flight.heading||0)*Math.PI/180;
          const projection=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineDashedMaterial({color:'#ffffff',transparent:true,opacity:.85,dashSize:100,gapSize:70,depthTest:false}));
          const footprint=new THREE.Mesh(new THREE.RingGeometry(28,38,32),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.9,side:THREE.DoubleSide,depthTest:false}));footprint.rotation.x=-Math.PI/2;
          aircraftGroup.add(mesh,projection,footprint);item={mesh,target:mesh.position.clone(),heading:mesh.rotation.y,flight,ground:0,base:new THREE.Vector3(),projection,footprint};flights.set(flight.id,item);
        }
        item.base.fromArray(flightCoordinates({...flight,altitude_m:0,reported_altitude_m:reference.elevation+REFERENCE_GEOID_OFFSET_M,altitude_reference:'geometric_ellipsoid'},reference,mapMode));
        item.flight=flight;item.target.set(x,y+(flight.source==='live'&&!flight.ground?0:item.ground),z);item.heading=-(flight.heading||0)*Math.PI/180;
        item.mesh.scale.setScalar(flight.display_scale??1);
        // A timeline seek is a new instant, not a straight taxi route between
        // distant snapshots. Never sweep through terrain or occupied stands.
        if(flight.source==='simulation'&&latest.current.animateFlights===false){item.mesh.position.copy(item.target);item.mesh.rotation.y=item.heading;}
        const ring=item.mesh.getObjectByName('selection-ring');if(ring)ring.visible=latest.current.selectedFlightId===flight.id;
      }
      const trafficMode=Boolean(latest.current.trafficMode);
      regionalGuide.visible=trafficMode;
      scene.fog=new THREE.Fog('#dce5df',trafficMode?180000:7000,trafficMode?350000:15500);
      if(trafficMode&&(!wasTrafficMode||!trafficFramed&&flights.size>0))trafficOverview();
      else if(!trafficMode&&wasTrafficMode){trafficFramed=false;airportOverview();}
      wasTrafficMode=trafficMode;
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
      if(airportAnchor.current){
        projected.set(0,25,0).project(camera);
        airportAnchor.current.hidden=!latest.current.trafficMode||projected.z<=-1||projected.z>=1||Math.abs(projected.x)>1||Math.abs(projected.y)>1;
        const half=airportAnchor.current.offsetWidth/2;
        airportAnchor.current.style.left=`${Math.max(half+8,Math.min(dimensions.width-half-58,(projected.x*.5+.5)*dimensions.width))}px`;
        airportAnchor.current.style.top=`${Math.max(64,Math.min(dimensions.height-75,(-projected.y*.5+.5)*dimensions.height))}px`;
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
      for(const item of flights.values()){
        const show=Boolean(latest.current.trafficMode&&item.flight.source==='live'&&!item.flight.ground&&item.mesh.position.y>30);
        item.projection.visible=item.footprint.visible=show;
        if(show){
          const p=item.mesh.position;const vertices=item.projection.geometry.getAttribute('position');
          vertices.setXYZ(0,item.base.x,item.base.y,item.base.z);vertices.setXYZ(1,p.x,p.y,p.z);vertices.needsUpdate=true;item.projection.geometry.computeBoundingSphere();item.projection.computeLineDistances();
          item.footprint.position.copy(item.base);item.footprint.position.y+=.4;item.footprint.scale.setScalar(Math.max(1,Math.min(40,camera.position.distanceTo(item.mesh.position)/4000)));
        }
      }
      camera.updateMatrixWorld();
      if(tiles&&!tileFailure){
        tiles.update();
        if(now-lastGroundAt>1200&&tiles.visibleTiles.size){
          lastGroundAt=now;scene.updateMatrixWorld(true);
          for(const item of flights.values()){
            if(item.flight.source==='live'?!item.flight.ground:(item.flight.altitude_m||0)>2)continue;
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
    const observer=new ResizeObserver(()=>{const width=container.clientWidth,height=container.clientHeight;if(!width||!height||width===dimensions.width&&height===dimensions.height)return;dimensions={width,height};renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();tiles?.setResolutionFromRenderer(camera,renderer);if(latest.current.trafficMode&&trafficFramed)trafficOverview();wake();});observer.observe(container);
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
    const checkLoadingTimeout=()=>{if(!mapReady&&!disposed){tileFailure=true;report('error','Harta fotorealistă răspunde prea lent. Poți continua cu modelul aeroportului.');}};
    handle.current={wake,syncFlights,overview,airport:airportOverview,traffic:trafficOverview,focus,zoom,checkLoadingTimeout};syncFlights();overview();
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
          if(disposed)return;tiles=new Renderer();
          // Browser HTTP cache honours Google's Cache-Control and ETag headers.
          // No application-managed persistent/offline cache or forced stale reuse.
          tiles.fetchOptions={cache:'default'};
          tiles.registerPlugin(new GoogleCloudAuthPlugin({apiToken:googleApiKey,autoRefreshToken:true}));
          tiles.registerPlugin(new ReorientationPlugin({lat:reference.lat*Math.PI/180,lon:reference.lon*Math.PI/180,height:reference.elevation+REFERENCE_GEOID_OFFSET_M}));
          // Plugin's local frame is west/north; our flight coordinates are east/south.
          const orient=new THREE.Group();orient.rotation.y=Math.PI;orient.add(tiles.group);scene.add(orient);
          tiles.setCamera(camera);tiles.setResolutionFromRenderer(camera,renderer);tiles.errorTarget=12;
          tiles.addEventListener('needs-update',wake);tiles.addEventListener('load-model',wake);tiles.addEventListener('tile-visibility-change',wake);
          tiles.addEventListener('load-error',({tile})=>{if(!tile&&!mapReady&&!disposed){tileFailure=true;report('error','Harta fotorealistă nu este disponibilă acum. Poți continua cu modelul aeroportului.');}});
          wake();
        }catch{if(!disposed)report('error','Harta fotorealistă nu a putut porni. Modelul aeroportului rămâne disponibil.');}
      };void loadTiles();
    }else report('error','Harta fotorealistă nu este configurată pentru această instalare.');
    return()=>{
      disposed=true;abort.abort();cancelAnimationFrame(raf);handle.current=null;observer.disconnect();document.removeEventListener('visibilitychange',onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost',onContextLost);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('keydown',keyDown);
      removeWheelBoundary();controls.removeEventListener('change',onControls);controls.dispose();tiles?.dispose();
      if(mapObject){disposeObject(mapObject);const textures=new Set<THREE.Texture>();mapObject.traverse(o=>{if(o instanceof THREE.Mesh){const materials=Array.isArray(o.material)?o.material:[o.material];for(const material of materials)if('map'in material&&material.map instanceof THREE.Texture)textures.add(material.map);}});textures.forEach(t=>t.dispose());}
      for(const [id,item]of flights)removeFlight(id,item);regionalGuide.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Line){object.geometry.dispose();(object.material as THREE.Material).dispose();}});environmentTarget.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
    };
  },[airportId,mapMode,googleApiKey,restart]);

  return <div ref={host} className={`airport-scene ${active?'':'is-paused'}`}>
    <div ref={labelLayer} className="airport-scene-labels">{props.flights.map(flight=><button type="button" key={flight.id} data-flight-id={flight.id} className={`airport-flight-label is-${flight.status} ${props.selectedFlightId===flight.id?'is-selected':''}`} onClick={()=>props.onSelectFlight(flight.id)} aria-label={`${flight.callsign}, ${statusLabel[flight.status]}`}>{flight.source==='live'?<Plane size={13} style={{transform:`rotate(${(flight.heading||0)-45}deg)`}} aria-hidden="true"/>:<span className="airport-flight-dot"/>}<strong>{flight.callsign}</strong>{props.selectedFlightId===flight.id&&<span title={flight.source==='live'?'Altitudine raportată de aeronavă':'Altitudine relativă la aeroport'}>{flight.ground?'La sol':flight.source==='live'?`${Math.round(flight.reported_altitude_m??flight.altitude_m??0).toLocaleString('ro-RO')} m`:Math.round(flight.altitude_m||0)>15?`${Math.round(flight.altitude_m||0)} m`:'La sol'}</span>}</button>)}</div>
    <button ref={airportAnchor} hidden={!props.trafficMode} className="airport-origin-label" onClick={()=>handle.current?.airport()} title="Încadrează aeroportul">{AIRPORT_REFERENCE[airportId].icao}<span>{AIRPORT_REFERENCE[airportId].label}</span></button>
    {props.trafficMode&&<div className="airport-traffic-caption">Poziții geografice ADS-B<span>Liniile leagă aeronavele de poziția lor pe hartă</span></div>}
    <div className="airport-scene-orientation"><span ref={compass}><i/>N</span></div>
    <div className="airport-scene-controls" aria-label="Control hartă">
      <button type="button" title="Apropie" aria-label="Apropie harta" onClick={()=>handle.current?.zoom(.75)}><Plus size={17}/></button>
      <button type="button" title="Depărtează" aria-label="Depărtează harta" onClick={()=>handle.current?.zoom(1.3)}><Minus size={17}/></button>
      <button type="button" title="Încadrează aeroportul" aria-label="Încadrează aeroportul" onClick={()=>handle.current?.airport()}><Maximize2 size={16}/></button>
      {props.trafficMode&&<button type="button" title="Încadrează toate aeronavele" aria-label="Încadrează toate aeronavele" onClick={()=>handle.current?.traffic()}><Radar size={17}/></button>}
      {props.selectedFlightId&&<button type="button" title="Urmărește aeronava" aria-label="Încadrează aeronava selectată" onClick={()=>handle.current?.focus()}><Focus size={17}/></button>}
    </div>
    {notice.status!=='ready'&&<div className={`airport-scene-notice is-${notice.status}`} role={notice.status==='error'?'alert':'status'}>{notice.status==='loading'&&<span className="airport-scene-loader"/>}<span>{notice.message}</span>{notice.status==='error'&&(mapMode==='photorealistic'&&props.onMapModeChange?<button type="button" onClick={()=>props.onMapModeChange?.('model')}>Deschide modelul 3D</button>:<button type="button" onClick={()=>setRestart(n=>n+1)}><RotateCcw size={14}/> Reîncearcă</button>)}</div>}
    <div className="airport-scene-attribution">{mapMode==='photorealistic'?<><img src="/operations/google-maps.svg" alt="Google Maps"/><span>{credits}</span></>:<><span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></span><span>Volumetrie ilustrativă · geometrie reală</span></>}</div>
  </div>;
}
export default AirportScene;
