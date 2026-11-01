import {t,useLanguage} from '@/i18n';
import {useEffect,useRef,useState} from 'react';
import {Globe2,LocateFixed} from 'lucide-react';
import type {Map as LeafletMap,Marker as LeafletMarker} from 'leaflet';
import type {PartnerConnection} from './coordination-types';

let googleLoading:Promise<void>|undefined;
function loadGoogle(key:string){
  if(window.google?.maps?.Map)return Promise.resolve();
  if(!googleLoading)googleLoading=new Promise<void>((resolve,reject)=>{
    const callback='flyleafGoogleMapLoaded';
    const globals=window as unknown as Record<string,unknown>;
    globals[callback]=()=>{delete globals[callback];resolve()};
    globals.gm_authFailure=()=>reject(new Error('Google Maps unavailable'));
    const script=document.createElement('script');script.async=true;
    script.src='https://maps.googleapis.com/maps/api/js?'+new URLSearchParams({key,callback,loading:'async',v:'weekly',libraries:'marker',language:'ro'});
    script.onerror=()=>reject(new Error('Map unavailable'));document.head.appendChild(script);
    setTimeout(()=>reject(new Error('Map timeout')),12000);
  });
  return googleLoading;
}
function pin(airport:PartnerConnection,selected:boolean){
  const node=document.createElement('div');node.className=`airport-map-pin ${selected?'selected':''} ${airport.participation_enabled?'available':'unavailable'}`;
  node.style.setProperty('--airport-color',airport.color||'#176b73');
  node.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';
  const label=document.createElement('strong');label.textContent=airport.iata||airport.id.slice(0,3).toUpperCase();node.append(label);
  return node;
}

export function AirportMap({airports,selected,onSelect,googleKey}:{airports:PartnerConnection[];selected?:string;onSelect:(id:string)=>void;googleKey?:string|null}){
  useLanguage();
  const container=useRef<HTMLDivElement>(null),onSelectRef=useRef(onSelect);
  const engine=useRef<{world:()=>void;fit:()=>void;select:(id?:string)=>void;destroy:()=>void}|undefined>(undefined);
  const [ready,setReady]=useState(false),[notice,setNotice]=useState('');
  onSelectRef.current=onSelect;
  const signature=airports.map(a=>`${a.id}:${a.latitude}:${a.longitude}:${a.participation_enabled}`).join('|');
  useEffect(()=>{
    let disposed=false;setReady(false);setNotice('');
    const points=airports.filter(a=>Number.isFinite(a.latitude)&&Number.isFinite(a.longitude));
    async function start(){
      if(googleKey){
        try{
          await loadGoogle(googleKey);if(disposed)return;
          const map=new google.maps.Map(container.current!,{center:{lat:46,lng:25},zoom:6,mapId:'DEMO_MAP_ID',mapTypeControl:false,streetViewControl:false,fullscreenControl:false,gestureHandling:'cooperative'});
          const markers=points.map(a=>{const marker=new google.maps.marker.AdvancedMarkerElement({map,position:{lat:a.latitude!,lng:a.longitude!},title:a.name,content:pin(a,a.id===selected)});marker.addListener('click',()=>onSelectRef.current(a.id));return {airport:a,marker}});
          const fit=()=>{if(!points.length){map.setCenter({lat:25,lng:10});map.setZoom(2);return}const bounds=new google.maps.LatLngBounds();points.forEach(a=>bounds.extend({lat:a.latitude!,lng:a.longitude!}));map.fitBounds(bounds,70);google.maps.event.addListenerOnce(map,'idle',()=>{if((map.getZoom()||0)>9)map.setZoom(9)})};
          engine.current={world:()=>{map.setCenter({lat:25,lng:10});map.setZoom(2)},fit,select:id=>{markers.forEach(({airport:a,marker})=>{marker.content=pin(a,a.id===id);marker.zIndex=a.id===id?100:1});const a=points.find(a=>a.id===id);if(a){map.panTo({lat:a.latitude!,lng:a.longitude!});map.setZoom(9)}},destroy:()=>{markers.forEach(({marker})=>{google.maps.event.clearInstanceListeners(marker);marker.map=null});google.maps.event.clearInstanceListeners(map)}};
          fit();setReady(true);return;
        }catch{if(disposed)return;setNotice('Google Maps nu răspunde. Harta OpenStreetMap este disponibilă.')}
      }
      const L=await import('leaflet');if(disposed)return;
      const map:LeafletMap=L.map(container.current!,{scrollWheelZoom:false,zoomControl:false}).setView([46,25],6);
      L.control.zoom({position:'bottomright'}).addTo(map);
      const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'}).addTo(map);
      let errors=0;tiles.on('tileerror',()=>{if(++errors>=3&&!disposed)setNotice('Fundalul hărții nu se poate încărca. Aeroporturile și lista rămân disponibile.')});
      const markers:Array<{airport:PartnerConnection;marker:LeafletMarker}>=points.map(a=>({airport:a,marker:L.marker([a.latitude!,a.longitude!],{title:a.name,alt:a.name,keyboard:true,icon:L.divIcon({html:pin(a,a.id===selected),className:'airport-map-marker',iconSize:[64,42],iconAnchor:[32,48]})}).on('click',()=>onSelectRef.current(a.id)).addTo(map)}));
      const fit=()=>{if(points.length)map.fitBounds(L.latLngBounds(points.map(a=>[a.latitude!,a.longitude!])),{padding:[80,75],maxZoom:8});else map.setView([25,10],2)};
      engine.current={world:()=>map.setView([25,10],2),fit,select:id=>{markers.forEach(({airport:a,marker})=>{marker.setIcon(L.divIcon({html:pin(a,a.id===id),className:'airport-map-marker',iconSize:[64,42],iconAnchor:[32,48]}));marker.setZIndexOffset(a.id===id?1000:0)});const a=points.find(a=>a.id===id);if(a)map.setView([a.latitude!,a.longitude!],9,{animate:!matchMedia('(prefers-reduced-motion: reduce)').matches})},destroy:()=>map.remove()};
      fit();setReady(true);
    }
    void start().catch(()=>{if(!disposed)setNotice('Harta nu este disponibilă. Poți căuta și selecta aeroporturile din listă.')});
    return()=>{disposed=true;engine.current?.destroy();engine.current=undefined};
  },[signature,googleKey]);
  useEffect(()=>{if(ready)engine.current?.select(selected)},[selected,ready]);
  return <div className="airport-map-wrap"><div ref={container} className="airport-map" aria-label={t("Hartă aeroporturi")}/><div className="airport-map-controls"><button disabled={!ready} onClick={()=>engine.current?.world()}><Globe2 size={15}/>{t("Lume")}</button><button disabled={!ready} onClick={()=>engine.current?.fit()}><LocateFixed size={15}/>{t("Rezultate")}</button></div><div className="airport-map-legend"><i/>{t("În colaborare")}<span/><i className="inactive"/>{t("Dezactivat")}</div>{notice&&<div className="airport-map-notice" role="status">{notice}</div>}</div>;
}
