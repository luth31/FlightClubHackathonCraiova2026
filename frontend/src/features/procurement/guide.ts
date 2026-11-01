import type {CaseDetailData,CaseDocument} from './types';

export const guideSteps=[
  {id:'preparation',label:'Pregătire',description:'Justifică achiziția',stages:['draft']},
  {id:'purchase',label:'Achiziție',description:'Aprobă contractul',stages:['needs_review']},
  {id:'acceptance',label:'Recepție',description:'Confirmă livrarea',stages:['committed']},
  {id:'payment',label:'Plată',description:'Verifică factura și închide',stages:['accepted','invoiced','paid']},
];
export const guideIndex=(stage:string)=>Math.max(0,guideSteps.findIndex(step=>step.stages.includes(stage)));
export const evidenceApproved=(doc:CaseDocument)=>!doc.stale&&doc.complete&&!doc.errors.length&&['approved','signed','archived'].includes(doc.status);
export const guideSlots=[
  [{label:'Referat de necesitate',types:['necessity']},{label:'Caiet de sarcini',types:['specifications']}],
  [{label:'Contract sau comandă de achiziție',types:['contract','purchase_order']}],
  [{label:'Document de livrare sau raport de servicii',types:['inbound_delivery','service_report']},{label:'Proces-verbal de recepție',types:['acceptance']}],
  [{label:'Factură',types:['invoice']}],
];
export function caseNextHint(item:CaseDetailData) {
  if(item.stage==='paid')return 'Dosar finalizat';
  const missing=guideSlots[guideIndex(item.stage)].find(slot=>!item.documents.some(doc=>slot.types.includes(doc.template_id)));
  if(missing)return `Adaugă ${missing.label.toLocaleLowerCase('ro')}`;
  if(item.documents.some(doc=>!evidenceApproved(doc)))return 'Verifică documentele și aprobările';
  if(item.stage==='needs_review'&&!item.primary_document_id)return 'Confirmă contractul principal';
  if(item.stage==='invoiced'&&item.balances&&item.balances.outstanding!=='0.00')return 'Înregistrează plata';
  if(item.blockers.length)return 'Rezolvă verificările rămase';
  return item.next_action||'Dosar închis';
}
