import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import * as THREE from 'three';
async function load(path){const bundled=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external'});const module={exports:{}};new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);return module.exports;}
const {prepareRoute,sampleRoute,SimulationMotionClock,aircraftCloseUp,smoothGroundHeight,SURFACE_CLEARANCE}=await load('../src/features/operations/flight-motion.ts');

test('fast playback traverses every corner instead of cutting a chord between one-second polls',()=>{
  // One network interval at 120× crosses two taxiway turns. The rendered path
  // must visit both vertices even though no server snapshot lands on them.
  const route=[{seconds:0,position:new THREE.Vector3(0,0,0),heading:90},{seconds:20,position:new THREE.Vector3(100,0,0),heading:0},{seconds:60,position:new THREE.Vector3(100,0,-200),heading:90},{seconds:120,position:new THREE.Vector3(400,0,-200),heading:90}];
  for(const speed of [1,30,60,120]){
    const clock=new SimulationMotionClock();clock.sync({runId:'run',seconds:0,speed,playing:true},0);
    for(let t=0;t<120;t+=speed/60){
      const wall=t/speed*1000;
      if(t% speed < speed/60)clock.sync({runId:'run',seconds:t,speed,playing:true},wall);
      const point=new THREE.Vector3();sampleRoute(route,clock.read(wall),point);
      const onPath=(Math.abs(point.z)<1e-8&&point.x<=100)||(Math.abs(point.x-100)<1e-8&&point.z>=-200)||(Math.abs(point.z+200)<1e-8&&point.x>=100);
      assert.ok(onPath,`${speed}×: ${point.toArray()}`);assert.equal(point.y,0);
    }
  }
});

test('network jitter does not rewind climb; pause, seek and a new run reset the visual clock',()=>{
  const clock=new SimulationMotionClock();
  clock.sync({runId:'one',seconds:1200,speed:120,playing:true},0);
  const before=clock.read(1100);
  clock.sync({runId:'one',seconds:1320,speed:120,playing:true},1100);
  assert.ok(clock.read(1100)>=before);
  assert.equal(clock.read(5000),clock.read(10000),'lost network must bound prediction');
  clock.sync({runId:'one',seconds:600,speed:120,playing:false},10000);
  assert.equal(clock.read(20000),600);
  clock.sync({runId:'two',seconds:0,speed:1,playing:false},20000);
  assert.equal(clock.read(30000),0);
});

test('route altitude and heading remain continuous across runway and climb vertices',()=>{
  const ref={lat:44.318,lon:23.888,elevation:191,label:'Test',icao:'TEST'};
  const route=prepareRoute([{at_seconds:0,lat:44.318,lon:23.888,altitude_m:191,heading:90},{at_seconds:45,lat:44.318,lon:23.9,altitude_m:191,heading:90},{at_seconds:195,lat:44.318,lon:23.97,altitude_m:1591,heading:90}],ref,'photorealistic');
  const point=new THREE.Vector3();let previous=0;
  for(let t=0;t<200;t+=.2){assert.equal(sampleRoute(route,t,point),90);assert.ok(point.y>=previous);previous=point.y;}
});

test('live aircraft close-up has a visible mesh even ten kilometres above the airport',()=>{
  for(const altitude of [0,1000,10000]){
    const plane=new THREE.Vector3(20000,altitude,-15000),frame=aircraftCloseUp(plane);
    const camera=new THREE.PerspectiveCamera(43,1.5,2,400000);camera.position.copy(frame.position);camera.lookAt(frame.target);camera.updateMatrixWorld();
    const left=plane.clone().add(new THREE.Vector3(-18,0,0)).project(camera),right=plane.clone().add(new THREE.Vector3(18,0,0)).project(camera);
    assert.ok(left.distanceTo(right)*500>40,'aircraft should span over 40 pixels in a 1000 px viewport');
    assert.ok(plane.clone().project(camera).length()<1.01);
  }
});

test('terrain correction converges without oscillating between poll and render heights',()=>{
  let height=0;
  for(let i=0;i<200;i++){
    const next=smoothGroundHeight(height,-.6,1/60);
    assert.ok(next<=height&&next>=-.6);height=next;
    assert.ok(Math.abs((height+SURFACE_CLEARANCE)-(height+.35))<1e-9);
  }
  assert.ok(Math.abs(height+.6)<.0001);
});

test('severity changes preserve aircraft geometry, transform and animation identity',async()=>{
  const {createAircraft,setAircraftStatus}=await load('../src/features/operations/aircraft-model.ts');
  const plane=createAircraft('neutral');plane.position.set(100,200,300);plane.rotation.y=1;
  const children=[...plane.children];setAircraftStatus(plane,'critical');
  assert.deepEqual(plane.children,children);assert.deepEqual(plane.position.toArray(),[100,200,300]);assert.equal(plane.rotation.y,1);
  assert.equal(plane.userData.ownedMaterials[0].color.getHexString(),'dc2626');
});

const {LiveMotionBuffer}=await load('../src/features/operations/live-motion.ts');
test('buffered ADS-B advances evenly between readings and wraps heading via the short turn',()=>{
  const buffer=new LiveMotionBuffer(),p=new THREE.Vector3();
  buffer.push(0,new THREE.Vector3(0,100,0),350*Math.PI/180);
  buffer.push(10000,new THREE.Vector3(1000,200,500),10*Math.PI/180);
  for(let t=0;t<=10000;t+=100){
    const sample=buffer.sample(t+15000,p);
    assert.ok(Math.abs(p.x-t/10)<1e-8);
    assert.ok(Math.abs(p.y-(100+t/100))<1e-8);
    if(t===5000)assert.ok(Math.abs(sample.heading-2*Math.PI)<1e-8);
  }
  assert.equal(buffer.sample(90000,p).pending,false);
  assert.deepEqual(p.toArray(),[1000,200,500]);
});
test('cached or reordered packets do not rewind playback; startup holds without extrapolation',()=>{
  const buffer=new LiveMotionBuffer(),p=new THREE.Vector3();
  assert.equal(buffer.sample(0,p),null);
  buffer.push(10000,new THREE.Vector3(10,0,0),0);
  buffer.sample(12000,p);assert.equal(p.x,10);
  buffer.push(20000,new THREE.Vector3(20,0,0),0);
  buffer.push(20000,new THREE.Vector3(999,0,0),0);
  buffer.push(15000,new THREE.Vector3(-999,0,0),0);
  buffer.sample(30000,p);assert.equal(p.x,15);
  buffer.sample(40000,p);assert.equal(p.x,20);
  buffer.push(90000,new THREE.Vector3(90,0,0),0);
  buffer.sample(80000,p);assert.equal(p.x,20,'hold during a long provider gap');
  buffer.sample(105000,p);assert.equal(p.x,90);
});
