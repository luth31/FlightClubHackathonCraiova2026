import re
import unicodedata


STAGES = (
    {
        'id': 'purchasing',
        'label': 'Achiziții',
        'description': 'Necesitate, specificații, contracte și comenzi de achiziție, retur sau înlocuire',
    },
    {
        'id': 'shipping',
        'label': 'Livrare / prestare',
        'description': 'Livrări de intrare și ieșire sau documente de prestare a serviciilor',
    },
    {
        'id': 'inventory_management',
        'label': 'Gestiunea stocurilor',
        'description': 'Recepții, documente de material și evidența intrărilor sau consumului',
    },
    {
        'id': 'invoice_verification',
        'label': 'Verificarea facturilor',
        'description': 'Facturi și note de credit, inclusiv corecții de la furnizor',
    },
)

ROMANIAN_ENCODING_REPAIRS = {}
for letter in 'ăâîșțĂÂÎȘȚşţŞŢ':
    encoded = letter
    for _ in range(2):
        encoded = encoded.encode('utf-8').decode('cp1252')
        ROMANIAN_ENCODING_REPAIRS[encoded] = letter
ENCODING_REPAIR_PATTERN = re.compile('|'.join(re.escape(value)
    for value in sorted(ROMANIAN_ENCODING_REPAIRS, key=len, reverse=True)))


def normalize(value):
    # Recover known Romanian UTF8 sequences read as Windows text
    restored = ENCODING_REPAIR_PATTERN.sub(lambda match: ROMANIAN_ENCODING_REPAIRS[match.group()], str(value or ''))
    plain = ''.join(char for char in unicodedata.normalize('NFKD', restored)
        if not unicodedata.combining(char))
    return re.sub(r'[^a-z0-9]+', ' ', plain.lower()).strip()


TYPE_RULES = (
    ('purchasing', 'Comandă de retur', ('returns purchase order', 'return purchase order', 'comanda de retur', 'comanda retur')),
    ('purchasing', 'Comandă de înlocuire', ('order replacement', 'replacement order', 'comanda de inlocuire', 'comanda inlocuire')),
    ('purchasing', 'Comandă de achiziție', ('purchase order', 'comanda de achizitie', 'comanda')),
    ('purchasing', 'Referat de necesitate', ('referat de necesitate', 'purchase requisition')),
    ('purchasing', 'Caiet de sarcini', ('caiet de sarcini', 'procurement specification')),
    ('purchasing', 'Act adițional', ('act aditional', 'contract amendment')),
    ('purchasing', 'Contract', ('contract',)),
    ('shipping', 'Livrare de ieșire', ('outbound delivery', 'livrare de iesire', 'aviz de expeditie', 'aviz de retur')),
    ('shipping', 'Livrare de intrare', ('inbound delivery', 'livrare de intrare', 'aviz de livrare', 'aviz de insotire', 'delivery note')),
    ('shipping', 'Raport de prestare', ('raport de mentenanta', 'raport de prestare', 'service delivery report')),
    ('inventory_management', 'Proces-verbal de recepție', ('proces verbal de receptie', 'nota de intrare receptie', 'nota de receptie', 'goods receipt')),
    ('inventory_management', 'Document de material', ('material document', 'document de material', 'fisa de magazie', 'bon de consum', 'bon de transfer')),
    ('invoice_verification', 'Notă de credit furnizor', ('credit memo from vendor', 'vendor credit memo', 'nota de credit de la furnizor', 'nota de credit furnizor')),
    ('invoice_verification', 'Notă de credit', ('credit memo', 'credit note', 'nota de credit', 'factura storno')),
    ('invoice_verification', 'Factură', ('factura', 'invoice')),
)

EXCLUDED_CATEGORIES = {'procedura', 'audit', 'resurse umane', 'instruire'}
PROCUREMENT_TEMPLATE_TYPES = {
    'necessity': 'Referat de necesitate', 'specifications': 'Caiet de sarcini',
    'contract': 'Contract', 'purchase_order': 'Comandă de achiziție', 'addendum': 'Act adițional',
    'inbound_delivery': 'Livrare de intrare', 'service_report': 'Raport de prestare',
    'acceptance': 'Proces-verbal de recepție', 'invoice': 'Factură', 'credit_note': 'Notă de credit',
    'return_order': 'Comandă de retur', 'replacement_order': 'Comandă de înlocuire',
    'outbound_delivery': 'Livrare de ieșire',
}


def match_type(value, prefix=False):
    text = normalize(value)
    for stage, document_type, aliases in TYPE_RULES:
        if any(text == alias or (prefix and text.startswith(alias + ' ')) for alias in aliases):
            return stage, document_type
    return None


def classify(document):
    category = normalize(document.category)
    if category in EXCLUDED_CATEGORIES or normalize(document.department) == 'resurse umane':
        return None
    metadata = (document.extra or {}).get('metadata', {})
    procurement = metadata.get('procurement', {}) if isinstance(metadata, dict) else {}
    template_type = PROCUREMENT_TEMPLATE_TYPES.get(procurement.get('template_id')) if isinstance(procurement, dict) else None
    explicit = match_type(document.category)
    candidates = (
        ('template', match_type(template_type)),
        ('metadata', match_type(metadata.get('document_type')) if isinstance(metadata, dict) else None),
        ('title', match_type(document.title, prefix=True)),
    )
    # A known category keeps its stage when another type is mentioned
    for source, candidate in candidates:
        if candidate and (not explicit or candidate[0] == explicit[0]):
            if not explicit or candidate[1] != explicit[1]:
                return {'stage': candidate[0], 'document_type': candidate[1],
                    'reason': 'Șablon de achiziții predefinit' if source == 'template'
                        else 'Tipul documentului este indicat în metadate' if source == 'metadata'
                        else 'Tipul documentului este indicat în titlu', 'source': source}
    if explicit:
        return {'stage': explicit[0], 'document_type': explicit[1],
            'reason': 'Clasificare după categoria documentului', 'source': 'category'}
    return None


def case_id(document):
    metadata = (document.extra or {}).get('metadata', {})
    if not isinstance(metadata, dict):
        return None
    for key in ('case_id', 'procurement_ref', 'contract_id'):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None
