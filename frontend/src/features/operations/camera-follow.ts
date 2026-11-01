import {Vector3, type Camera} from 'three';

/** Translate the camera with an aircraft without replacing the user's orbit/zoom. */
export class AircraftCameraFollow {
  private previous:Vector3|null=null;
  private delta=new Vector3();

  start(position:Vector3){this.previous=position.clone();}
  stop(){this.previous=null;}

  update(camera:Camera,target:Vector3,position:Vector3):boolean {
    if(!this.previous)return false;
    this.delta.subVectors(position,this.previous);
    this.previous.copy(position);
    if(this.delta.lengthSq()===0)return false;
    camera.position.add(this.delta);
    target.add(this.delta);
    return true;
  }
}
