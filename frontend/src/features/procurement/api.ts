import type {CaseDetailData, CaseList, DocumentTemplateDetail, FieldValues, TemplateCatalog} from './types';
export class ProcurementError extends Error {
  constructor(message: string, public status: number) {super(message)}
}
export async function procurementApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type','application/json');
  const response = await fetch(`/api/procurement${path}`, {...options,headers,credentials:'include'});
  if (!response.ok) {
    const body = await response.json().catch(()=>({detail:'Serviciul nu este disponibil momentan.'}));
    const detail = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.map((item: {msg?: string})=>item.msg||'Verifică câmpurile.').join(' ') : 'Verifică informațiile introduse.';
    throw new ProcurementError(detail,response.status);
  }
  return response.json();
}
export const getTemplates = () => procurementApi<TemplateCatalog>('/templates');
export const getCases = (query = '') => procurementApi<CaseList>(`/cases?q=${encodeURIComponent(query)}`);
export const getCase = (id: string) => procurementApi<CaseDetailData>(`/cases/${encodeURIComponent(id)}`);
export const getDocumentTemplate = (id: string) => procurementApi<DocumentTemplateDetail>(`/documents/${encodeURIComponent(id)}`);
export const saveDocumentTemplate = (id: string, body: FieldValues) => procurementApi<DocumentTemplateDetail>(`/documents/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(body)});
