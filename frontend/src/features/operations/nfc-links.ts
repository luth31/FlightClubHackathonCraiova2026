const storageKey='flyleaf.pendingNfc';
const pattern=/^[a-zA-Z0-9:_-]{1,80}$/;
export function cardFromHash(hash:string):string|null {
  const [page,query='']=hash.replace(/^#/,'').split('?');
  const value=new URLSearchParams(query).get('card');
  return page==='operations'&&value&&pattern.test(value)?value:null;
}
export function rememberNfcLink(){
  const card=cardFromHash(window.location.hash);
  if(card)try{sessionStorage.setItem(storageKey,JSON.stringify({card,at:Date.now()}))}catch{/* Session storage can be unavailable. */}
}
export function pendingNfcCard():string|null {
  try{
    const value:unknown=JSON.parse(sessionStorage.getItem(storageKey)||'null');
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const {card,at}=value as {card?:unknown;at?:unknown};
    if(typeof card!=='string'||!pattern.test(card)||typeof at!=='number'||!Number.isFinite(at))return null;
    const age=Date.now()-at;
    return age>=0&&age<30*60*1000?card:null;
  }catch{return null}
}
export function clearNfcLink(){try{sessionStorage.removeItem(storageKey)}catch{/* No persistent state required. */}}
export function nfcLink(card:string){return `${window.location.origin}${window.location.pathname}#operations?view=station&card=${encodeURIComponent(card)}`}
