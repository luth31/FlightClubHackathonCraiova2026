"""Conservative labelled values from PDF/OCR text, always awaiting human review."""
import re
from copy import deepcopy
from datetime import date
from app.core.exceptions import DomainError
from app.procurement import catalog

ALIASES={
    'number':['numar document','numar contract','contract nr','factura nr','invoice number','contract number','document number'],
    'issue_date':['data emiterii','data documentului','issue date','invoice date'],
    'supplier':['furnizor','prestator','supplier','vendor'],
    'currency':['moneda','currency'],
    'value':['valoare totala inclusiv tva','valoare totala','total cu tva','gross total','total amount','contract value'],
    'effective_date':['data intrarii in vigoare','data efectiva','effective date'],
    'expiration_date':['data expirarii','valabil pana la','expiration date','valid until'],
    'payment_terms':['conditii de plata','termen de plata','payment terms'],
    'tax_amount':['tva inclus','valoare tva','vat amount','tax amount'],
    'due_date':['data scadentei','scadenta','due date'],
    'accepted_amount':['valoare acceptata inclusiv tva','valoare acceptata','accepted amount'],
}
TYPE_PATTERNS=[('credit_note',r'nota de credit|credit note'),('return_order',r'comanda de retur|return order'),('replacement_order',r'comanda de inlocuire|replacement order'),('outbound_delivery',r'livrare de retur'),('addendum',r'act aditional|addendum'),('necessity',r'referat de necesitate|purchase requisition'),('specifications',r'caiet de sarcini|technical specifications'),('acceptance',r'proces.verbal de receptie|acceptance (?:record|report)'),('inbound_delivery',r'aviz de (?:insotire|livrare)|delivery note'),('service_report',r'raport de (?:servicii|mentenanta)|service report'),('invoice',r'\bfactura\b|\binvoice\b'),('purchase_order',r'comanda de achizitie|purchase order'),('contract',r'\bcontract\b|\bagreement\b')]

def apply(doc, pages):
    if not doc.extra.get('auto_intake') or doc.extra.get('edited_fields'):
        return []
    header=catalog.canonical('\n'.join(p['text'][:1800] for p in pages[:2]))
    ident=catalog.namespace(doc).get('template_id') or next((key for key,pattern in TYPE_PATTERNS if re.search(pattern,header)),None)
    if not ident:return []
    template=catalog.get_template(ident)
    if doc.department=='Resurse umane':return []
    if doc.department=='Tehnic' and template['category'] not in ('Raport de mentenanță','Proces-verbal','Procedură','Instruire'):return []
    if not catalog.namespace(doc):
        doc.category=template['category']
        doc.number=''
    catalog.apply_fields(doc,ident,{})
    evidence=[]
    for spec in template['fields']:
        aliases=ALIASES.get(spec['key'],[])+[catalog.canonical(spec['label']),spec['key'].replace('_',' ')]
        found=None
        for page_no,page in enumerate(pages,1):
            for line in page['text'].splitlines():
                parts=re.split(r'\s*[:=]\s*',line,maxsplit=1)
                if len(parts)!=2 or catalog.canonical(parts[0].strip()) not in aliases:continue
                raw=parts[1].strip();value=raw
                previous_extra=deepcopy(doc.extra)
                source=spec.get('source')
                previous_value=getattr(doc,source) if source else None
                try:
                    if spec['type']=='date':
                        if re.fullmatch(r'\d{2}[./]\d{2}[./]\d{4}',raw):
                            day,month,year=re.split(r'[./]',raw);value=date(int(year),int(month),int(day)).isoformat()
                    elif spec['type']=='money':
                        value=re.sub(r'[^0-9.,+\-]','',raw)
                        if ',' in value:value=value.replace('.','').replace(',','.')
                    elif spec['type']=='select':
                        value=next((o['value'] for o in spec['options'] if catalog.canonical(raw) in (catalog.canonical(o['label']),o['value'])),None)
                        if value is None:continue
                    elif spec['type']=='boolean':
                        if catalog.canonical(raw) not in ('da','nu','yes','no','true','false'):continue
                        value=catalog.canonical(raw) in ('da','yes','true')
                    catalog.apply_fields(doc,ident,{spec['key']:value})
                except (DomainError,ValueError):
                    doc.extra=previous_extra
                    if source:setattr(doc,source,previous_value)
                    continue
                found={'field':spec['key'],'value':value,'page':page_no,'excerpt':line,'confidence':None,'validated':False,'method':page['method']+'+label'}
                break
            if found:break
        if found:evidence.append(found)
    # Currency may be printed next to a total rather than as a separate label.
    if not any(item['field']=='currency' for item in evidence):
        match=re.search(r'\b(RON|EUR|USD|GBP)\b','\n'.join(p['text'] for p in pages))
        if match and any(s['key']=='currency' for s in template['fields']):catalog.apply_fields(doc,ident,{'currency':match.group(1)})
    return evidence
