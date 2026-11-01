import {useSyncExternalStore} from 'react';
import {english} from './en';

export type Language='ro'|'en';
const STORAGE_KEY='flyleaf.interface-language';
let language:Language='ro';
try {if(globalThis.localStorage?.getItem(STORAGE_KEY)==='en')language='en'} catch { /* Storage can be disabled. */ }
const listeners=new Set<()=>void>();
export const getLanguage=()=>language;
export const getLocale=()=>language==='en'?'en-GB':'ro-RO';
export function setLanguage(value:Language){
  if(value!=='ro'&&value!=='en')return;
  language=value;
  try {globalThis.localStorage?.setItem(STORAGE_KEY,value)} catch { /* The current session remains usable. */ }
  if(typeof document!=='undefined')document.documentElement.lang=value;
  for(const listener of listeners)listener();
}
export function useLanguage(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener)}},getLanguage,()=> 'ro' as Language)}
export function t(source:string,values?:Record<string,unknown>,context?:string){
  const raw=language==='en'?((context?english[`${context}::${source}`]:undefined)??english[source]??source):source;
  const text=raw.replace(/&(?:gt|lt|amp|quot|apos|nbsp);/g,entity=>({'&gt;':'>','&lt;':'<','&amp;':'&','&quot;':'"','&apos;':"'",'&nbsp;':' '}[entity]||entity));
  return values?text.replace(/\{(\w+)\}/g,(match,key)=>Object.hasOwn(values,key)?String(values[key]):match):text;
}
if(typeof document!=='undefined')document.documentElement.lang=language;
if(typeof window!=='undefined')window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY&&(event.newValue==='ro'||event.newValue==='en'))setLanguage(event.newValue)});
