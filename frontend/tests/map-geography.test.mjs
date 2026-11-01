import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import * as THREE from 'three';
import {WGS84_ELLIPSOID,OBJECT_FRAME} from '3d-tiles-renderer';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
async function load(file){const bundle=await build({entryPoints:[fileURLToPath(new URL(file,import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external'});const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);return module.exports;}
const geometry=await load('../src/features/operations/scene-types.ts');

test('camera lock follows motion and timeline jumps while preserving orbit, zoom and framing',async()=>{
  const {AircraftCameraFollow}=await load('../src/features/operations/camera-follow.ts');
  const follow=new AircraftCameraFollow(),camera=new THREE.PerspectiveCamera(43,1.6,2,400000);
  const aircraft=new THREE.Vector3(100,20,200),target=aircraft.clone();
  camera.position.copy(target).add(new THREE.Vector3(115,100,140));camera.lookAt(target);camera.updateMatrixWorld();
  follow.start(aircraft);
  for(const destination of [[120,20,205],[800,1000,-400],[100,20,200]]){
    // The user can zoom/orbit between position updates without losing lock.
    camera.position.sub(target).multiplyScalar(.8).applyAxisAngle(new THREE.Vector3(0,1,0),.15).add(target);
    camera.lookAt(target);camera.updateMatrixWorld();
    const offset=camera.position.clone().sub(target),rotation=camera.quaternion.clone(),screen=aircraft.clone().project(camera);
    aircraft.fromArray(destination);
    assert.equal(follow.update(camera,target,aircraft),true);
    camera.updateMatrixWorld();
    assert.ok(target.distanceTo(aircraft)<1e-9);
    assert.ok(camera.position.clone().sub(target).distanceTo(offset)<1e-9);
    assert.ok(camera.quaternion.angleTo(rotation)<1e-7);
    assert.ok(aircraft.clone().project(camera).distanceTo(screen)<1e-9);
    assert.equal(follow.update(camera,target,aircraft),false,'stationary aircraft must not keep the render loop awake');
  }
  follow.stop();const unlocked=camera.position.clone();
  assert.equal(follow.update(camera,target,new THREE.Vector3(2000,0,0)),false);
  assert.deepEqual(camera.position.toArray(),unlocked.toArray());
});

test('reduced demo aircraft fit the reserved clearance at every heading',async()=>{
  const {createAircraft}=await load('../src/features/operations/aircraft-model.ts');
  for(const status of ['neutral','caution','critical']){
    const aircraft=createAircraft(status,.62);
    aircraft.getObjectByName('selection-ring').removeFromParent();
    aircraft.updateMatrixWorld(true);
    const point=new THREE.Vector3();let radius=0;
    aircraft.traverse(child=>{
      if(!child.isMesh)return;
      const vertices=child.geometry.attributes.position;
      for(let i=0;i<vertices.count;i++){
        point.fromBufferAttribute(vertices,i).applyMatrix4(child.matrixWorld);
        radius=Math.max(radius,Math.hypot(point.x,point.z));
      }
    });
    assert.ok(radius<14,`Rendered footprint exceeds the reserved 14 m radius: ${radius}`);
    const size=new THREE.Box3().setFromObject(aircraft).getSize(new THREE.Vector3());
    assert.ok(size.z>23&&size.z<24,'about 23 m long at the demo display scale');
    assert.ok(size.x>22&&size.x<23,'about 23 m wide at the demo display scale');
  }
});

test('live aircraft use exact east/up/south WGS84 coordinates instead of adding terrain twice',()=>{
  const ref=geometry.AIRPORT_REFERENCE.craiova;
  const origin=geometry.geodeticToLocal(ref.lon,ref.lat,ref.elevation+40,ref);
  assert.ok(Math.hypot(...origin)<.000001);
  const point=geometry.geodeticToLocal(ref.lon+.01,ref.lat+.01,ref.elevation+1040,ref);
  assert.ok(point[0]>750&&point[0]<850,'east is positive X');
  assert.ok(point[2]<-1100&&point[2]>-1130,'north is negative Z');
  assert.ok(point[1]>999&&point[1]<1001,'height is relative to reference ellipsoid, no terrain addition');
});

test('regional framing includes far aircraft altitude and fits narrow as well as wide viewports',()=>{
  const points=[new THREE.Vector3(0,0,0),new THREE.Vector3(24000,10500,-34000),new THREE.Vector3(-40000,3000,14000)];
  for(const aspect of [.7,1.7]){
    const camera=new THREE.PerspectiveCamera(43,aspect,2,300000);
    const frame=geometry.fitTrafficFrame(points.map(p=>p.toArray()),camera.fov,aspect);
    camera.position.fromArray(frame.position);camera.lookAt(new THREE.Vector3().fromArray(frame.target));camera.updateMatrixWorld();
    for(const point of points){const ndc=point.clone().project(camera);assert.ok(Math.abs(ndc.x)<.92&&Math.abs(ndc.y)<.92&&ndc.z<1,JSON.stringify(ndc));}
  }
});

test('wheel over labels and controls zooms map without bubbling a scroll gesture to the page',async()=>{
  const {installMapWheelBoundary}=await load('../src/features/operations/map-input.ts');
  const dom=new JSDOM('<main><div id="map"><canvas></canvas><button>Flight</button></div></main>',{pretendToBeVisual:true});
  const {document}=dom.window;const boundary=document.querySelector('#map'),canvas=boundary.querySelector('canvas');
  globalThis.document=document;
  const camera=new THREE.PerspectiveCamera(43,1,2,300000);camera.position.set(0,1000,1000);
  const controls=new OrbitControls(camera,canvas);controls.update();let bubbled=0;
  document.querySelector('main').addEventListener('wheel',()=>bubbled++);
  const cleanup=installMapWheelBoundary(boundary,canvas);
  for(const target of [canvas,boundary.querySelector('button')]){
    const before=camera.position.length();const event=new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:80});target.dispatchEvent(event);
    assert.equal(event.defaultPrevented,true);assert.ok(camera.position.length()>before,'same gesture must still zoom');
  }
  assert.equal(bubbled,0);
  cleanup();const event=new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:80});boundary.querySelector('button').dispatchEvent(event);assert.equal(event.defaultPrevented,false);
  controls.dispose();dom.window.close();
});


test('overlay coordinates agree with the actual tile library reorientation at both airports',()=>{
  for(const ref of Object.values(geometry.AIRPORT_REFERENCE)){
    const rad=Math.PI/180,frame=new THREE.Matrix4();
    WGS84_ELLIPSOID.getObjectFrame(ref.lat*rad,ref.lon*rad,ref.elevation+40,0,0,0,frame,OBJECT_FRAME);
    frame.invert().premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
    const actual=new THREE.Vector3();
    WGS84_ELLIPSOID.getCartographicToPosition((ref.lat+.3)*rad,(ref.lon+.3)*rad,10000,actual);actual.applyMatrix4(frame);
    const expected=new THREE.Vector3().fromArray(geometry.geodeticToLocal(ref.lon+.3,ref.lat+.3,10000,ref));
    assert.ok(actual.distanceTo(expected)<.001,actual.distanceTo(expected));
  }
});

test('retained hidden scene ignores wheel gestures while the active style zooms exactly once',async()=>{
  const {installMapWheelBoundary}=await load('../src/features/operations/map-input.ts');
  const dom=new JSDOM('<main><div id="map"><canvas id="model"></canvas><canvas id="google"></canvas><button>Style</button></div></main>');
  const boundary=dom.window.document.querySelector('#map');
  let active='google';const counts={model:0,google:0},cleanups=[];
  for(const style of ['model','google']){
    const canvas=boundary.querySelector('#'+style);
    canvas.addEventListener('wheel',()=>counts[style]++);
    cleanups.push(installMapWheelBoundary(boundary,canvas,()=>active===style));
  }
  const wheel=()=>new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:80});
  boundary.querySelector('button').dispatchEvent(wheel());assert.deepEqual(counts,{model:0,google:1});
  active='model';boundary.querySelector('button').dispatchEvent(wheel());assert.deepEqual(counts,{model:1,google:1});
  boundary.querySelector('#model').dispatchEvent(wheel());assert.deepEqual(counts,{model:2,google:1});
  for(const cleanup of cleanups)cleanup();dom.window.close();
});
