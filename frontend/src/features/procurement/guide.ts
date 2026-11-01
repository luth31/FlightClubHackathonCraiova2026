import type {CaseDetailData,CaseDocument} from './types';
import {t,getLocale} from '@/i18n';

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
  if(item.stage==='paid')return t('Dosar finalizat');
  const missing=guideSlots[guideIndex(item.stage)].find(slot=>!item.documents.some(doc=>slot.types.includes(doc.template_id)));
  if(missing)return t('Adaugă {document}',{document:t(missing.label).toLocaleLowerCase(getLocale())});
  if(item.documents.some(doc=>!evidenceApproved(doc)))return t('Verifică documentele și aprobările');
  if(item.stage==='needs_review'&&!item.primary_document_id)return t('Confirmă contractul principal');
  if(item.stage==='invoiced'&&item.balances&&item.balances.outstanding!=='0.00')return t('Înregistrează plata');
  if(item.blockers.length)return t('Rezolvă verificările rămase');
  return t(item.next_action||'Dosar închis');
}
