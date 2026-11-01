from datetime import date
from decimal import Decimal, InvalidOperation
import re
from app.core.exceptions import DomainError

VERSION = 1
STAGES = [{'id': key, 'label': label} for key, label in [
    ('draft', 'Ciornă'), ('needs_review', 'În verificare'), ('committed', 'Angajat'),
    ('accepted', 'Recepționat'), ('invoiced', 'Facturat'), ('paid', 'Plătit')]]


def money(value, *, signed=False):
    try:
        result = Decimal(str(value))
        if (not result.is_finite() or result.as_tuple().exponent < -2 or
                abs(result) > Decimal('9999999999.99') or (not signed and result < 0)):
            raise ValueError()
    except (ValueError, InvalidOperation, TypeError):
        raise DomainError('Valoarea trebuie să fie finită, cu cel mult două zecimale și în limita permisă.', 422)
    return result.quantize(Decimal('0.01'))


def field(key, label, kind='text', required=True, source=None, options=None):
    result = dict(key=key, label=label, type=kind, required=required)
    if source: result['source'] = source
    if options: result['options'] = [{'value': v, 'label': l} for v, l in options]
    return result


COMMON = [field('number', 'Număr document', source='number'), field('issue_date', 'Data emiterii', 'date')]
FINANCIAL = [field('supplier', 'Furnizor', source='supplier'), field('currency', 'Monedă', source='currency'),
             field('value', 'Valoare totală inclusiv TVA', 'money', source='value')]


def template(ident, label, category, fields):
    return dict(id=ident, label=label, category=category, fields=COMMON + fields)


TEMPLATES = [
    template('necessity', 'Referat de necesitate', 'Referat de necesitate', [
        field('requester', 'Solicitant'), field('justification', 'Justificare', 'textarea'),
        field('value', 'Valoare estimată inclusiv TVA', 'money', source='value'),
        field('currency', 'Monedă', source='currency'), field('budget_line', 'Linie bugetară'),
        field('urgency', 'Urgență', 'select', options=[('normal', 'Normală'), ('urgent', 'Urgentă')])]),
    template('specifications', 'Caiet de sarcini', 'Caiet de sarcini', [
        field('scope', 'Proiect / obiect'), field('technical_requirements', 'Cerințe tehnice', 'textarea'),
        field('acceptance_criteria', 'Criterii de recepție', 'textarea'), field('author', 'Autor')]),
    template('contract', 'Contract', 'Contract', FINANCIAL + [
        field('effective_date', 'Data intrării în vigoare', 'date'), field('expiration_date', 'Data expirării', 'date', source='expires_at'),
        field('payment_terms', 'Condiții de plată', 'textarea')]),
    template('purchase_order', 'Comandă de achiziție', 'Comandă', FINANCIAL + [
        field('delivery_deadline', 'Termen de livrare', 'date'), field('delivery_destination', 'Destinație')]),
    template('addendum', 'Act adițional', 'Act adițional', [
        field('currency', 'Monedă', source='currency'), field('supplier', 'Furnizor', source='supplier'),
        field('amendment_kind', 'Tip modificare', 'select', options=[('price', 'Preț'), ('scope', 'Obiect'), ('terms', 'Condiții')]),
        field('effective_date', 'Data efectivă', 'date'), field('value_delta', 'Diferență de valoare inclusiv TVA (+/-)', 'money'),
        field('change_description', 'Descriere modificare', 'textarea')]),
    template('inbound_delivery', 'Document de livrare', 'Proces-verbal', [field('delivery_date', 'Data livrării', 'date'), field('items', 'Bunuri / lucrări livrate', 'textarea'), field('reference', 'Referință')]),
    template('service_report', 'Raport de servicii', 'Raport de mentenanță', [field('delivery_date', 'Data prestării', 'date'), field('items', 'Servicii prestate', 'textarea'), field('reference', 'Referință')]),
    template('acceptance', 'Proces-verbal de recepție', 'Proces-verbal', [
        field('currency', 'Monedă', source='currency'), field('inspection_date', 'Data inspecției', 'date'),
        field('verdict', 'Rezultat', 'select', options=[('accepted', 'Acceptat'), ('reserved', 'Acceptat cu rezerve'), ('rejected', 'Respins')]),
        field('accepted_amount', 'Valoare acceptată inclusiv TVA', 'money'), field('findings', 'Constatări', 'textarea', False),
        field('resolved', 'Rezerve / constatări rezolvate', 'boolean', False)]),
    template('invoice', 'Factură', 'Factură', FINANCIAL + [field('due_date', 'Data scadenței', 'date'), field('tax_amount', 'TVA inclus', 'money')]),
    template('credit_note', 'Notă de credit', 'Factură', [field('supplier', 'Furnizor', source='supplier'), field('currency', 'Monedă', source='currency'), field('credit_amount', 'Valoare credit inclusiv TVA', 'money'), field('reason', 'Motiv', 'textarea')]),
    *[template(ident, label, category, [field('reference', 'Referință'), field('date', 'Data', 'date'), field('reason', 'Motiv', 'textarea'), field('items', 'Bunuri afectate', 'textarea'), field('resolved', 'Rezolvat', 'boolean', False)]) for ident, label, category in [
        ('return_order', 'Comandă de retur', 'Comandă'), ('replacement_order', 'Comandă de înlocuire', 'Comandă'), ('outbound_delivery', 'Livrare de retur', 'Proces-verbal')]]]
BY_ID = {t['id']: t for t in TEMPLATES}
RELATIONSHIPS = [dict(id=key, label=label, source_types=source, target_types=target) for key, label, source, target in [
    ('specifies_need', 'Detaliază necesitatea', ['specifications'], ['necessity']),
    ('fulfills_request', 'Îndeplinește solicitarea', ['contract', 'purchase_order'], ['necessity', 'specifications', 'contract']),
    ('amends_contract', 'Modifică contractul', ['addendum'], ['contract']),
    ('delivers_against', 'Livrează în baza', ['inbound_delivery', 'service_report'], ['contract', 'purchase_order']),
    ('accepts_delivery', 'Recepționează livrarea', ['acceptance'], ['inbound_delivery', 'service_report']),
    ('invoices_against', 'Facturează în baza', ['invoice'], ['contract', 'purchase_order', 'acceptance']),
    ('credits_invoice', 'Creditează factura', ['credit_note'], ['invoice']),
    ('returns_delivery', 'Returnează / înlocuiește', ['return_order', 'replacement_order', 'outbound_delivery'], ['purchase_order', 'inbound_delivery', 'service_report', 'return_order', 'replacement_order'])]]


def canonical(value):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFKD', value) if not unicodedata.combining(c)).casefold()


def get_template(ident):
    if ident not in BY_ID: raise DomainError('Șablonul de achiziții nu există.', 422)
    return BY_ID[ident]


def namespace(document):
    extra = document.extra if isinstance(document.extra, dict) else {}
    metadata = extra.get('metadata')
    metadata = metadata if isinstance(metadata, dict) else {}
    value = metadata.get('procurement')
    return value if isinstance(value, dict) else {}


def document_fields(document, template_id=None):
    ident = template_id or namespace(document).get('template_id')
    if ident not in BY_ID: return {}
    stored = namespace(document).get('fields', {})
    values = dict(stored) if isinstance(stored, dict) else {}
    for spec in BY_ID[ident]['fields']:
        if spec.get('source'):
            value = getattr(document, spec['source'], None)
            if value is not None and spec['type'] == 'money':
                try: value = format(money(value), '.2f')
                except DomainError: value = str(value)
            values[spec['key']] = value
    return values


def validate_value(spec, value):
    key = spec['key']
    if value is None or value == '': return None
    if spec['type'] == 'money': return format(money(value, signed=key == 'value_delta'), '.2f')
    if spec['type'] == 'date':
        if not isinstance(value, str): raise DomainError(f"{spec['label']}: dată invalidă.", 422)
        try: return date.fromisoformat(value).isoformat()
        except ValueError: raise DomainError(f"{spec['label']}: dată invalidă.", 422)
    if spec['type'] == 'boolean':
        if not isinstance(value, bool): raise DomainError(f"{spec['label']}: selectează da sau nu.", 422)
        return value
    if not isinstance(value, str) or len(value) > (10000 if spec['type'] == 'textarea' else 500):
        raise DomainError(f"{spec['label']}: text invalid sau prea lung.", 422)
    value = value.strip()
    if spec['type'] == 'select' and value not in {o['value'] for o in spec['options']}:
        raise DomainError(f"{spec['label']}: opțiune invalidă.", 422)
    if key == 'currency' and not re.fullmatch('[A-Z]{3}', value):
        raise DomainError('Moneda trebuie să aibă trei litere majuscule.', 422)
    return value


def apply_fields(document, template_id, fields):
    selected = get_template(template_id)
    if canonical(document.category) != canonical(selected['category']):
        raise DomainError('Șablonul trebuie să corespundă categoriei documentului.', 422)
    allowed = {s['key']: s for s in selected['fields']}
    if not isinstance(fields, dict) or set(fields) - set(allowed):
        raise DomainError('Câmpurile șablonului nu sunt valide.', 422)
    values = {}
    for key, value in fields.items():
        spec = allowed[key]
        value = validate_value(spec, value)
        if spec.get('source'):
            if spec['source'] in ('number', 'currency') and not value:
                raise DomainError(f"{spec['label']}: câmp obligatoriu.", 422)
            setattr(document, spec['source'], float(value) if spec['source'] == 'value' and value is not None else value)
        else: values[key] = value
    existing = namespace(document)
    if existing.get('template_id') == template_id:
        old_fields = existing.get('fields', {})
        values = {**(old_fields if isinstance(old_fields, dict) else {}), **values}
    document.extra = {**(document.extra or {}), 'metadata': {**(document.extra or {}).get('metadata', {}),
        'procurement': {'template_id': template_id, 'version': VERSION, 'fields': values}}}
    errors = semantic_errors(document_fields(document, template_id), template_id)
    if errors: raise DomainError(' '.join(errors), 422)


def semantic_errors(fields, ident):
    errors = []
    if fields.get('expiration_date') and fields.get('effective_date') and fields['expiration_date'] < fields['effective_date']:
        errors.append('Data expirării precede intrarea în vigoare.')
    if fields.get('due_date') and fields.get('issue_date') and fields['due_date'] < fields['issue_date']:
        errors.append('Scadența precede data emiterii.')
    if ident == 'invoice' and fields.get('tax_amount') is not None and fields.get('value') is not None and money(fields['tax_amount']) > money(fields['value']):
        errors.append('TVA nu poate depăși valoarea totală.')
    if ident == 'addendum' and fields.get('amendment_kind') == 'terms' and fields.get('value_delta') is not None and money(fields['value_delta'], signed=True) != 0:
        errors.append('Modificarea de condiții necesită diferență de valoare zero.')
    return errors


def document_errors(document, template_id=None):
    ident = template_id or namespace(document).get('template_id')
    if not ident: return []
    if ident not in BY_ID: return ['Șablon necunoscut.']
    values = document_fields(document, ident)
    errors = [f"{s['label']}: câmp obligatoriu." for s in BY_ID[ident]['fields'] if s['required'] and values.get(s['key']) in (None, '')]
    invalid = False
    for spec in BY_ID[ident]['fields']:
        try: values[spec['key']] = validate_value(spec, values.get(spec['key']))
        except DomainError as exc:
            errors.append(exc.message)
            invalid = True
    if canonical(document.category) != canonical(BY_ID[ident]['category']): errors.append('Categoria nu corespunde șablonului.')
    if not invalid: errors += semantic_errors(values, ident)
    if ident == 'acceptance' and values.get('verdict') in ('reserved', 'rejected') and not values.get('findings'):
        errors.append('Explică rezervele sau respingerea în constatări.')
    return errors
