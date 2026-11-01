export interface ProgressDocument {
  status:string; validated:boolean; extraction_status?:string|null;
  workflow?:{diagram?:{version_signed:boolean};steps?:Array<{label:string;status:string}>};
  managed_workflow?:{type:string};
}
export type ProgressState='completed'|'current'|'upcoming'|'skipped';
export function documentProgress(doc:ProgressDocument):Array<{label:string;note:string;state:ProgressState}> {
  if(doc.managed_workflow&&doc.workflow?.steps){
    const active=doc.workflow.steps.findIndex(step=>step.status==='current');
    return doc.workflow.steps.map((step,index)=>({label:step.label,note:'',state:['done','completed','approved'].includes(step.status)?'completed':index===active?'current':'upcoming'}));
  }
  const extracting=['queued','processing'].includes(doc.extraction_status||'');
  const active=['signed','archived'].includes(doc.status)?3:doc.status==='approved'?2:extracting?0:1;
  const signed=doc.status==='signed'||doc.workflow?.diagram?.version_signed===true;
  const unsignedArchive=doc.status==='archived'&&!signed;
  return [
    {label:'Ciornă',note:extracting?'Extragere automată':'Document încărcat'},
    {label:'Verificare și aprobare',note:doc.status==='in_review'?'În așteptarea aprobării':doc.validated?'Date confirmate':'Verificarea datelor extrase'},
    {label:'Semnare',note:unsignedArchive?'Nesemnat · arhivat':signed?'Document semnat':doc.status==='approved'?'Pregătit pentru semnare':'După aprobare'},
    {label:'Finalizat',note:doc.status==='archived'?'Document arhivat':'Document semnat'},
  ].map((step,index)=>({...step,state:index===2&&unsignedArchive?'skipped':index<active?'completed':index===active?'current':'upcoming'}));
}
