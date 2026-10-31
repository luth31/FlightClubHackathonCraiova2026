export interface ReportDefinition {id:string;title:string;subtitle:string;category:string;theme:string;icon:string;roles:string[];source:string}
export interface ReportPreview {report:ReportDefinition;total:number;metrics:ReportData['metrics'];series:{name:string;value:number}[];currency_totals:ReportData['currency_totals'];highlights:ReportData['highlights']}
export interface BriefingPriority {id:string;document_id:string|null;title:string;number:string;owner:string;department:string;report_id:string;reason:string;severity:'critical'|'warning';days:number|null;date:string|null;kind:string}
export interface ReportBriefing {
  catalog:ReportCatalog;airport:string;date:string;demo_reference_date:string;generated_at:string;department:string;departments:string[];
  summary:{documents:number;approved:number;validated:number;new_today:number;actions_today:number;pending:number;overdue:number;due_today:number;contracts:number;expiring_contracts:number;expired_contracts:number;people:number;available:number;currency_totals:{currency:string;value:number}[];high_risk:number};
  timeline:{date:string;documents:number;actions:number}[];
  workload:{name:string;pending:number;overdue:number;documents:number}[];
  priorities:BriefingPriority[];deadlines:(ReportRow & {remaining:number})[];reports:ReportPreview[];
  coverage:{dated_contracts:number;valued_contracts:number;scope:string};
}
export type ReportFocus = ''|'due30'|'overdue';
export type SelectReport = (id:string, options?:{status?:string;department?:string;focus?:ReportFocus;tab?:'report'|'data'})=>void;
export interface ReportCatalog {items:ReportDefinition[];visible_documents:number;roles:string[];reference_date:string;refresh_seconds:number}
export interface ReportRow {id:string;document_id?:string|null;title:string;number?:string;department:string;status:string;owner:string;value?:number|null;currency?:string;date?:string|null;category?:string;days_remaining?:number|null;created_at?:string|null;validated?:boolean;supplier?:string|null;version?:number;overdue?:boolean;assignment_state?:string;flow_stage?:string|null;case_id?:string|null}
export interface Breakdown {id:string;title:string;items:Array<{name:string;value:number}>}
export interface ReportData {report:ReportDefinition;metrics:Array<{id:string;label:string;value:number;detail:string;tone:string;unit:string}>;breakdowns:Breakdown[];highlights:Array<{title:string;value:number;detail:string}>;rows:ReportRow[];total:number;table_title:string;secondary:Array<{title:string;items:ReportRow[]}>;currency_totals:Array<{currency:string;value:number}>;activity:{start:string;end:string;items:Array<{date:string;value:number}>;total:number};activity_label:string;recent_activity:Array<{id:number;action:string;actor:string;document_id?:string|null;title:string;created_at:string}>;departments:string[];department:string;reference_date:string;generated_at:string;refresh_seconds:number;scope:string}
