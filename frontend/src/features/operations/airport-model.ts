import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {projectPoint,type AirportReference} from './scene-types';

interface GeoGeometry {type:string;coordinates: unknown}
interface GeoFeature {type:'Feature';properties:Record<string,unknown>;geometry:GeoGeometry}
export interface AirportGeoJSON {type:'FeatureCollection';features:GeoFeature[];metadata?:Record<string,unknown>}
type Point=[number,number];
const mat=(color:string,roughness=.9,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const asphalt=mat('#4e5552'),shoulder=mat('#73766a'),taxiMaterial=mat('#656b60'),concrete=mat('#a5aa9c'),roadMaterial=mat('#6d7169');
const white=mat('#f4f3dc'),yellow=mat('#ead481'),roof=mat('#bfc5be',.7,.2),wall=mat('#d6d8ca',.78,.1),glass=mat('#587575',.35,.45),metal=mat('#879491',.5,.5);
function seeded(seed:number){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function noiseTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#8b9876';ctx.fillRect(0,0,512,512);const rand=seeded(731);
  for(let i=0;i<45000;i++){const shade=Math.floor(90+rand()*55);ctx.fillStyle=`rgba(${shade},${shade+13},${shade-19},.2)`;ctx.fillRect(rand()*512,rand()*512,1+rand()*2,1+rand()*2);}
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(12,12);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function poly(points:Point[],height:number,material:THREE.Material){
  const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));
  const result=new THREE.Mesh(new THREE.ShapeGeometry(shape),material);result.rotation.x=-Math.PI/2;result.position.y=height;result.receiveShadow=true;return result;
}
function ribbon(points:Point[],width:number,height:number,material:THREE.Material){
  const group=new THREE.Group();
  for(let i=1;i<points.length;i++){
    const [x,z]=points[i-1],[xx,zz]=points[i],length=Math.hypot(xx-x,zz-z);if(length<.1)continue;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,length),material);mesh.rotation.x=-Math.PI/2;mesh.rotation.z=Math.atan2(xx-x,zz-z);mesh.position.set((x+xx)/2,height,(z+zz)/2);mesh.receiveShadow=true;group.add(mesh);
    if(i<points.length-1){const joint=new THREE.Mesh(new THREE.CircleGeometry(width/2,12),material);joint.rotation.x=-Math.PI/2;joint.position.set(xx,height,zz);group.add(joint);}
  }
  return group;
}
function box(x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;return mesh;}
function numberTexture(label:string){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#ecebdd';ctx.font='bold 90px monospace';ctx.textAlign='center';ctx.fillText(label,128,101);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;}
function runway(points:Point[],tags:Record<string,unknown>){
  const group=new THREE.Group();const width=Number.parseFloat(String(tags.width||45))||45;
  group.add(ribbon(points,width+18,.08,shoulder),ribbon(points,width,.16,asphalt));
  const first=new THREE.Vector2(...points[0]),last=new THREE.Vector2(...points.at(-1)!);const direction=last.clone().sub(first).normalize();const length=last.distanceTo(first);const perpendicular=new THREE.Vector2(-direction.y,direction.x);
  const rect=(along:number,across:number,w:number,l:number,material:THREE.Material=white)=>{
    const p=first.clone().addScaledVector(direction,along).addScaledVector(perpendicular,across);
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,l),material);mesh.rotation.x=-Math.PI/2;mesh.rotation.z=Math.atan2(direction.x,direction.y);mesh.position.set(p.x,.21,p.y);group.add(mesh);return mesh;
  };
  for(let d=100;d<length-100;d+=60)rect(d,0,.9,30);
  for(const side of [-1,1])rect(length/2,side*(width/2-1),.45,length-6);
  for(const end of [0,1]){
    const base=end?length-28:28;
    for(const side of [-1,1])for(let i=0;i<5;i++)rect(base,side*(4+i*3),1.7,28);
    for(const side of [-1,1])rect(end?length-300:300,side*11,5,40);
    const ref=String(tags.ref||'08/26').split('/')[end]||'';
    const marking=rect(end?length-68:68,0,18,25,new THREE.MeshBasicMaterial({map:numberTexture(ref),transparent:true,depthWrite:false}));
    if(end)marking.rotation.z+=Math.PI;
  }
  const lightGeometry=new THREE.SphereGeometry(.65,6,4);const lightMaterial=new THREE.MeshBasicMaterial({color:'#fff2c5'});
  const lights=new THREE.InstancedMesh(lightGeometry,lightMaterial,Math.ceil(length/60)*2);let li=0;const matrix=new THREE.Matrix4();
  for(let d=0;d<length;d+=60)for(const side of [-1,1]){const p=first.clone().addScaledVector(direction,d).addScaledVector(perpendicular,side*(width/2+3));matrix.makeTranslation(p.x,.6,p.y);lights.setMatrixAt(li++,matrix);}lights.count=li;group.add(lights);
  return group;
}
function building(points:Point[],tags:Record<string,unknown>,index:number){
  const group=new THREE.Group();const terminal=tags.aeroway==='terminal'||tags.building==='terminal'||String(tags.name||'').toLowerCase().includes('terminal');
  const height=Number.parseFloat(String(tags.height||''))||Number(tags['building:levels']||0)*3.5||(terminal?12:7);
  const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));
  const solid=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}),wall);solid.rotation.x=-Math.PI/2;solid.castShadow=solid.receiveShadow=true;group.add(solid,poly(points,height+.03,roof));
  const detailed=terminal||Math.hypot(points[0][0],points[0][1])<1500;
  // Facade panels follow each surveyed edge; heights and roof equipment are illustrative.
  for(let i=1;detailed&&i<points.length;i++){
    const [x,z]=points[i-1],[xx,zz]=points[i],length=Math.hypot(xx-x,zz-z);if(length<8)continue;
    const cx=(x+xx)/2,cz=(z+zz)/2,angle=Math.atan2(zz-z,xx-x);
    const facade=box(cx,height*.46,cz,length-.8,terminal?height*.55:height*.27,.24,glass);facade.rotation.y=-angle;group.add(facade);
    const rail=box(cx,height*.83,cz,length+.3,.6,.6,metal);rail.rotation.y=-angle;group.add(rail);
    const mullions=Math.floor(length/6);
    for(let j=1;j<mullions;j++)group.add(box(x+(xx-x)*j/mullions,height*.46,z+(zz-z)*j/mullions,.45,terminal?height*.6:height*.31,.45,wall));
  }
  const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);const cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2;
  if(inside([cx,cz],points)){
    group.add(box(cx,height+1,cz,3.8,2.1,4.8,metal));
    if(index%2===0){const fan=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,.3,16),asphalt);fan.position.set(cx,height+2.2,cz);group.add(fan);}
  }
  return group;
}
function inside(point:Point,polygon:Point[]){let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if(((a[1]>point[1])!==(b[1]>point[1]))&&(point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]))result=!result;}return result;}
function localCoordinates(feature:GeoFeature,ref:AirportReference):Point[][]{
  const project=(coords:number[][])=>coords.map(([lon,lat])=>projectPoint(lon,lat,ref));
  if(feature.geometry.type==='LineString')return[project(feature.geometry.coordinates as number[][])];
  if(feature.geometry.type==='Polygon')return[project((feature.geometry.coordinates as number[][][])[0])];
  if(feature.geometry.type==='MultiPolygon')return(feature.geometry.coordinates as number[][][][]).map(p=>project(p[0]));
  return[];
}

export function createAirportModel(data:AirportGeoJSON,reference:AirportReference){
  const group=new THREE.Group();group.name='owned-airport-model';
  const groundTexture=noiseTexture();const groundMaterial=new THREE.MeshStandardMaterial({map:groundTexture,roughness:1,color:'#dce1c2'});
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(16000,16000),groundMaterial);ground.rotation.x=-Math.PI/2;ground.position.y=-.08;ground.receiveShadow=true;group.add(ground);
  let boundary:Point[]=[];const runwayPoints:Point[]=[];const buildingPolys:Point[][]=[];const pavedPolys:Point[][]=[];
  const features=data.features.map(feature=>({feature,tags:{...feature.properties,...(feature.properties.tags as Record<string,unknown>||{})},lines:localCoordinates(feature,reference)}));
  for(const {tags,lines} of features){
    if(tags.aeroway==='aerodrome'&&lines[0]?.length>3){boundary=lines[0];group.add(poly(boundary,.01,mat('#8e9c7e')));}
    if(tags.landuse==='forest'||tags.natural==='wood')for(const line of lines)group.add(poly(line,.02,mat('#687d61')));
    if(tags.landuse==='farmland'||tags.landuse==='grass')for(const line of lines)group.add(poly(line,.02,mat(tags.landuse==='grass'?'#a3aa87':'#a29d77')));
    if(tags.aeroway==='apron'||tags.amenity==='parking')for(const line of lines){group.add(poly(line,.09,tags.aeroway==='apron'?concrete:roadMaterial));pavedPolys.push(line);}
    if(tags.highway)for(const line of lines){group.add(ribbon(line,tags.highway==='primary'?13:6,.06,roadMaterial));}
  }
  for(const {feature,tags,lines} of features){
    if(tags.aeroway==='taxiway')for(const line of lines){group.add(ribbon(line,Number(tags.width)||23,.11,taxiMaterial),ribbon(line,.4,.19,yellow));}
    if(tags.aeroway==='runway')for(const line of lines){
      if(feature.geometry.type==='LineString'){
        if(tags.surface==='grass'){group.add(ribbon(line,30,.1,mat('#9fa880')));continue;}
        if(tags.runway==='displaced_threshold'){group.add(ribbon(line,45,.15,asphalt));continue;}
        group.add(runway(line,reference.icao==='LRCV'?{...tags,ref:'08/26'}:tags));runwayPoints.push(...line);
      }
      else group.add(poly(line,.14,asphalt));
    }
  }
  let buildingCount=0;
  for(const {tags,lines} of features){
    if((tags.building&&tags.building!=='no')||tags.aeroway==='terminal'||tags.aeroway==='hangar')for(const line of lines){if(line.length<3)continue;group.add(building(line,tags,buildingCount++));buildingPolys.push(line);}
    if(tags.aeroway==='parking_position'||tags.aeroway==='taxilane')for(const line of lines)group.add(ribbon(line,.32,.25,yellow));
  }
  const bounds=new THREE.Box3();(runwayPoints.length?runwayPoints:boundary).forEach(([x,z])=>bounds.expandByPoint(new THREE.Vector3(x,0,z)));
  if(bounds.isEmpty())bounds.set(new THREE.Vector3(-1500,0,-700),new THREE.Vector3(1500,0,700));
  const rand=seeded(reference.icao==='LRCV'?734:912);const treeCount=900;
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.9,1.2,8,5),mat('#77755c'),treeCount);
  const leaves=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(5,1),mat('#688366'),treeCount);
  let used=0;const matrix=new THREE.Matrix4(),q=new THREE.Quaternion();const color=new THREE.Color();
  for(let attempt=0;attempt<treeCount*10&&used<treeCount;attempt++){
    const x=(rand()-.5)*6800,z=(rand()-.5)*5000;
    if(boundary.length&&inside([x,z],boundary))continue;
    if(buildingPolys.some(p=>inside([x,z],p))||pavedPolys.some(p=>inside([x,z],p)))continue;
    const scale=.7+rand()*.8;matrix.compose(new THREE.Vector3(x,3.2*scale,z),q,new THREE.Vector3(scale,scale,scale));trunks.setMatrixAt(used,matrix);
    matrix.compose(new THREE.Vector3(x,9*scale,z),q,new THREE.Vector3(scale,1.4*scale,scale));leaves.setMatrixAt(used,matrix);color.setHSL(.24+rand()*.05,.16+rand()*.1,.34+rand()*.1);leaves.setColorAt(used,color);used++;
  }
  trunks.count=leaves.count=used;leaves.castShadow=true;group.add(trunks,leaves);
  for(const {tags,lines} of features)if(tags.aeroway==='apron'&&!tags.ref&&lines[0]?.length>3)addGroundVehicles(group,lines[0]);
  batchStaticMeshes(group);
  group.userData.groundTexture=groundTexture;
  return{group,bounds,reference,featureCount:data.features.length,buildingCount};
}

// Batch static geometry by material. Thousands of surveyed footprints stay inexpensive to orbit.
function batchStaticMeshes(root:THREE.Group){
  root.updateMatrixWorld(true);
  const buckets=new Map<string,{material:THREE.Material;castShadow:boolean;geometries:THREE.BufferGeometry[]}>();const removed:THREE.Mesh[]=[];
  root.traverse(child=>{
    if(!(child instanceof THREE.Mesh)||child instanceof THREE.InstancedMesh||Array.isArray(child.material))return;
    let geometry=child.geometry.clone().applyMatrix4(child.matrixWorld);
    if(geometry.index){const converted=geometry.toNonIndexed();geometry.dispose();geometry=converted;}
    const key=`${child.material.uuid}/${child.castShadow}`;const bucket=buckets.get(key)||{material:child.material,castShadow:child.castShadow,geometries:[] as THREE.BufferGeometry[]};bucket.geometries.push(geometry);buckets.set(key,bucket);removed.push(child);
  });
  for(const {material,castShadow,geometries}of buckets.values()){
    const geometry=mergeGeometries(geometries,false);if(geometry){const merged=new THREE.Mesh(geometry,material);merged.castShadow=castShadow;merged.receiveShadow=true;root.add(merged);}
    geometries.forEach(g=>g.dispose());
  }
  const oldGeometry=new Set<THREE.BufferGeometry>();removed.forEach(m=>{m.removeFromParent();oldGeometry.add(m.geometry);});oldGeometry.forEach(g=>g.dispose());
}

function addGroundVehicles(root:THREE.Group,polygon:Point[]){
  const xs=polygon.map(p=>p[0]),zs=polygon.map(p=>p[1]),minX=Math.min(...xs),minZ=Math.min(...zs),maxX=Math.max(...xs),maxZ=Math.max(...zs);
  if((maxX-minX)*(maxZ-minZ)<8000)return;
  let parked=0;
  for(let j=0;j<12&&parked<5;j++){
    const x=minX+(maxX-minX)*(.12+j*.065),z=minZ+(maxZ-minZ)*.88;if(!inside([x,z],polygon))continue;
    const vehicle=new THREE.Group(),bus=parked%3===0;
    vehicle.add(box(0,bus?1.9:1.2,0,2.5,bus?2.8:1.7,bus?10:5,wall));
    vehicle.add(box(0,bus?2.4:1.5,-(bus?4:2),2.3,.8,.18,glass));
    if(bus)for(const side of [-1,1])vehicle.add(box(side*1.26,2.3,0,.05,1,8.2,glass));
    else vehicle.add(box(0,2.15,1,1.9,.6,1.7,metal));
    for(const side of [-1,1])for(const axle of [-1,1]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.24,8),asphalt);wheel.rotation.z=Math.PI/2;wheel.position.set(side*1.25,.52,axle*(bus?3.1:1.5));vehicle.add(wheel);}
    vehicle.position.set(x,0,z);vehicle.rotation.y=Math.PI*.5;root.add(vehicle);parked++;
  }
}
