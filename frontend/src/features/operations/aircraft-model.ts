import * as THREE from 'three';
import type {SceneStatus} from './scene-types';

const material = (color: string, roughness = .48, metalness = .15) => new THREE.MeshStandardMaterial({color, roughness, metalness});
const white = material('#eef1ed', .31, .28);
const aluminum = material('#b8c0c1', .4, .7);
const dark = material('#25333a', .32, .35);
const rubber = material('#172322', .92, .05);
const glass = material('#19383e', .2, .6);
const NAV_RED = new THREE.MeshBasicMaterial({color:'#ff867e'});
const NAV_BLUE = new THREE.MeshBasicMaterial({color:'#d8efff'});

function surface(points: [number, number][], depth: number, mat: THREE.Material) {
  const shape = new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth, bevelEnabled:false}),mat);
  mesh.rotation.x = -Math.PI/2;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, x:number,y:number,z:number) {
  const result = new THREE.Mesh(geometry,mat);
  result.position.set(x,y,z);result.castShadow=true;result.receiveShadow=true;return result;
}

/** Authored narrow-body aircraft, in metres; nose faces local -Z. */
export function createAircraft(status: SceneStatus, displayScale=1) {
  const group=new THREE.Group();
  group.scale.setScalar(displayScale);
  const accent=material(status==='critical'?'#e85f52':status==='caution'?'#edb63e':'#3c5558', .32,.3);
  const fuselageMaterial=white.clone();
  if(status!=='neutral')fuselageMaterial.color.set(status==='critical'?'#f5ada4':'#f3d88e');
  const body=new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0,-18.8),new THREE.Vector2(.55,-18.2),new THREE.Vector2(1.35,-16.1),
    new THREE.Vector2(1.9,-13.5),new THREE.Vector2(2.02,-10),new THREE.Vector2(2.02,8),
    new THREE.Vector2(1.6,12),new THREE.Vector2(.82,16.4),new THREE.Vector2(.1,18.6),
  ],32),fuselageMaterial);
  body.rotation.x=Math.PI/2;body.position.y=4.4;body.castShadow=true;body.receiveShadow=true;group.add(body);
  const wing=surface([[-1.4,-2],[-4,-2.9],[-17.9,6.5],[-17.4,9.1],[-6,4.4],[-1.4,6.4]],.34,aluminum);
  wing.position.y=3.25;group.add(wing);
  const rightWing=wing.clone();rightWing.scale.x=-1;group.add(rightWing);
  const tailWing=surface([[-.8,12],[-6.5,15.4],[-6.5,17],[-1,15.6]],.22,aluminum);tailWing.position.y=5.1;group.add(tailWing);
  const rightTail=tailWing.clone();rightTail.scale.x=-1;group.add(rightTail);
  const finShape=new THREE.Shape([new THREE.Vector2(11.2,0),new THREE.Vector2(15.4,7.5),new THREE.Vector2(17.2,7.5),new THREE.Vector2(18.4,0)]);
  const fin=new THREE.Mesh(new THREE.ExtrudeGeometry(finShape,{depth:.35,bevelEnabled:false}),accent);
  fin.rotation.y=-Math.PI/2;fin.position.set(.18,5.8,0);fin.castShadow=true;group.add(fin);
  const logo=mesh(new THREE.CircleGeometry(1.35,3),white,0,10,15.6);logo.rotation.y=Math.PI/2;group.add(logo);
  const logoOther=logo.clone();logoOther.position.x=-.2;logoOther.rotation.y=-Math.PI/2;group.add(logoOther);
  const windows=new THREE.InstancedMesh(new THREE.SphereGeometry(.22,8,6),glass,50);
  const matrix=new THREE.Matrix4();let i=0;
  for(const side of [-1,1])for(let n=0;n<25;n++){
    matrix.compose(new THREE.Vector3(side*1.99,5.25,-11.5+n*.84),new THREE.Quaternion(),new THREE.Vector3(.2,1.25,1));windows.setMatrixAt(i++,matrix);
  }
  group.add(windows);
  const cockpit=mesh(new THREE.SphereGeometry(1,16,8),glass,0,5.25,-14.95);cockpit.scale.set(1.5,.5,1.25);group.add(cockpit);
  for(const side of [-1,1]){
    const engine=mesh(new THREE.CylinderGeometry(1.18,1.05,4.8,24,1,true),white,side*6.1,2.65,1.3);engine.rotation.x=Math.PI/2;group.add(engine);
    const rim=mesh(new THREE.TorusGeometry(1.08,.13,8,24),aluminum,side*6.1,2.65,-1.1);group.add(rim);
    const fan=mesh(new THREE.CircleGeometry(.96,24),dark,side*6.1,2.65,-1.12);fan.rotation.y=Math.PI;group.add(fan);
    const spinner=mesh(new THREE.ConeGeometry(.34,.6,14),aluminum,side*6.1,2.65,-1.4);spinner.rotation.x=-Math.PI/2;group.add(spinner);
    const pylon=mesh(new THREE.BoxGeometry(.6,1.4,2.3),aluminum,side*6.1,3.6,2.2);group.add(pylon);
    const winglet=mesh(new THREE.BoxGeometry(.2,2.1,2),accent,side*17.8,4.2,7.8);winglet.rotation.z=side*-.24;group.add(winglet);
    group.add(mesh(new THREE.SphereGeometry(.26,8,6),side<0?NAV_RED:NAV_BLUE,side*17.85,4.8,7.6));
    for(const z of [2.6,3.9]){
      const wheel=mesh(new THREE.CylinderGeometry(.56,.56,.36,14),rubber,side*2.9,.6,z);wheel.rotation.z=Math.PI/2;group.add(wheel);
    }
    group.add(mesh(new THREE.CylinderGeometry(.13,.13,2.7,8),aluminum,side*2.9,1.8,3.2));
  }
  for(const x of [-.32,.32]){
    const wheel=mesh(new THREE.CylinderGeometry(.42,.42,.25,12),rubber,x,.45,-12.5);wheel.rotation.z=Math.PI/2;group.add(wheel);
  }
  group.add(mesh(new THREE.CylinderGeometry(.13,.13,2.8,8),aluminum,0,1.8,-12.5));
  // Selection glow uses a separate ring, never a green normal-state signal.
  const ring=new THREE.Mesh(new THREE.RingGeometry(24,25.1,80),new THREE.MeshBasicMaterial({color:'#fff7d7',transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.3;ring.name='selection-ring';ring.visible=false;group.add(ring);
  group.userData.status=status;group.userData.ownedMaterials=[accent,fuselageMaterial,ring.material];
  return group;
}

export function disposeObject(object:THREE.Object3D,disposeMaterials=true){
  const geometries=new Set<THREE.BufferGeometry>();const materials=new Set<THREE.Material>();
  object.traverse(child=>{if(child instanceof THREE.Mesh||child instanceof THREE.Line){geometries.add(child.geometry);if(disposeMaterials){const mats=Array.isArray(child.material)?child.material:[child.material];mats.forEach(m=>materials.add(m));}}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
