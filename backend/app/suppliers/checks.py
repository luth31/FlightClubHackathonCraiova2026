"""Stored rule results and live decision preconditions remain separate."""
from decimal import Decimal
from difflib import SequenceMatcher
from app.documents.models import Document
from app.suppliers.models import Supplier
from app.core.security import can_read

BLOCKING = {'unknown_supplier','invalid_iban','source_not_approved','amount_above_contract',
            'outside_service_period','currency_mismatch','supplier_suspended'}

def evaluate_checks(body, document, supplier):
    from app.suppliers.service import normalize_iban, valid_ro_iban
    result = []
    def add(code, state, message, reasons=()):
        result.append({'code':code,'result':state,'message':message,'reason_codes':list(reasons)})
    reasons = []
    if not supplier: reasons.append('unknown_supplier')
    if not valid_ro_iban(body.observed_iban): reasons.append('invalid_iban')
    if supplier and normalize_iban(body.observed_iban)!=supplier.expected_iban: reasons.append('iban_mismatch')
    if supplier and getattr(supplier,'state','active')!='active': reasons.append('supplier_suspended')
    add('iban','failed' if reasons else 'passed','Cont comparat cu registrul; titularul nu este verificat.',reasons)
    contact = supplier.verified_contact if supplier else ''
    sender = body.sender_email.strip().lower()
    reasons = []
    if contact and sender!=contact: reasons.append('lookalike_sender' if SequenceMatcher(None,sender,contact).ratio()>=.75 else 'unknown_sender')
    add('sender','not_checked' if not contact else 'failed' if reasons else 'passed','Adresă comparată cu contactul cunoscut; expeditorul nu este autentificat.',reasons)
    source_ok = bool(document and document.validated and document.status in ('approved','signed'))
    add('source','passed' if source_ok else 'failed','Contract validat și aprobat.' if source_ok else 'Lipsește o sursă validată și aprobată.',() if source_ok else ('source_not_approved',))
    mismatch = bool(document and body.invoice_amount is not None and body.invoice_currency!=document.currency)
    if not source_ok or body.invoice_amount is None or document.value is None or mismatch:
        add('amount','not_checked','Suma, moneda sau plafonul comparabil lipsește.',('currency_mismatch',) if mismatch else ())
    else:
        exceeded = Decimal(str(body.invoice_amount))>Decimal(str(document.value))
        add('amount','failed' if exceeded else 'passed','Comparație individuală cu plafonul, fără cumul de facturi.',('amount_above_contract',) if exceeded else ())
    effective = (document.extra or {}).get('metadata',{}).get('effective_date') if document else None
    expiry = document.expires_at if document else None
    if not source_ok or not body.service_date or not (effective or expiry):
        add('service_period','not_checked','Data prestației sau limitele perioadei lipsesc.')
    else:
        day = body.service_date.isoformat()
        outside = (effective and day<str(effective)[:10]) or (expiry and day>expiry[:10])
        add('service_period','failed' if outside else 'passed',
            f'Limite evaluate: {str(effective)[:10] if effective else "început neînregistrat"} — {expiry[:10] if expiry else "sfârșit neînregistrat"}.',('outside_service_period',) if outside else ())
    return result

def review_freshness(db,user,item):
    if item.contract_snapshot is None or item.registry_revision is None:
        return {'state':'unrecorded','reasons':['Contextul inițial nu este înregistrat. Creează o verificare nouă.']}
    doc=db.get(Document,item.document_id) if item.document_id else None
    supplier=db.get(Supplier,item.supplier_id) if item.supplier_id else None
    reasons=[]
    if not doc or not can_read(user,doc) or doc.version!=item.source_version or not doc.validated or doc.status not in ('approved','signed'):
        reasons.append('Contractul sursă s-a modificat sau nu mai este aprobat și accesibil.')
    if not supplier or supplier.airport_id!=user.airport_id or supplier.registry_revision!=item.registry_revision or supplier.expected_iban!=item.expected_iban or supplier.verified_contact!=item.verified_contact or getattr(supplier,'state','active')!='active':
        reasons.append('Registrul furnizorului s-a modificat sau furnizorul este suspendat.')
    return {'state':'stale' if reasons else 'current','reasons':reasons}
