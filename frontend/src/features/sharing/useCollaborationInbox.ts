import {useEffect,useState} from 'react';
import {api} from '@/services/api-client';
import type {CoordinationInbox} from './coordination-types';

export function collaborationChanged() {
  window.dispatchEvent(new Event('flyleaf:collaboration-changed'));
}

/** The badge counts open incoming requests, not unread messages. */
export function useCollaborationInbox(enabled:boolean,userId?:string) {
  const [snapshot,setSnapshot]=useState<{userId:string;pendingCount:number;connected:boolean}>();
  useEffect(()=>{
    if(!enabled||!userId)return;
    let disposed=false,pending=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let controller:AbortController|undefined;
    async function load(){
      clearTimeout(timer);
      if(disposed||document.hidden||pending)return;
      pending=true;controller=new AbortController();
      try{
        const data=await api<CoordinationInbox>('/collaboration',{signal:controller.signal});
        if(!disposed)setSnapshot({userId:userId!,pendingCount:data.requests.filter(item=>item.direction==='incoming'&&item.status==='open').length,connected:data.connected});
      }catch{
        if(!disposed)setSnapshot(current=>({userId:userId!,pendingCount:current&&current.userId===userId?current.pendingCount:0,connected:false}));
      }finally{
        pending=false;
        if(!disposed&&!document.hidden)timer=setTimeout(load,25000);
      }
    }
    function visibility(){if(document.hidden){clearTimeout(timer);controller?.abort()}else void load()}
    const changed=()=>{void load()};
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('flyleaf:collaboration-changed',changed);
    void load();
    return()=>{disposed=true;controller?.abort();clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('flyleaf:collaboration-changed',changed)};
  },[enabled,userId]);
  return enabled&&snapshot&&snapshot.userId===userId?{pendingCount:snapshot.pendingCount,connected:snapshot.connected}:{pendingCount:0,connected:false};
}
