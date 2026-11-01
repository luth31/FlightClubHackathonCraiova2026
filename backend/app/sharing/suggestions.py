"""Explainable candidate detection; publication always requires review of the derivative."""
import re
from app.core.security import require_share_documents
from app.documents.service import get_document, current_version, file_hash
from app.core.exceptions import DomainError


def redaction_suggestions(db, user, document_id):
    require_share_documents(user)
    document = get_document(db, document_id, user)
    if document.department == 'Resurse umane':
        raise DomainError('Documentele de personal nu se partajează între aeroporturi.', 403)
    version = current_version(db, document)
    if file_hash(version.file_path) != version.sha256:
        raise DomainError('Integritatea documentului nu poate fi confirmată.', 409)
    candidates = {}
    from app.extraction.service import cached_result
    from app.sharing.studio import matches as find_matches
    result=cached_result(db,version)
    text=result['text']
    for email in re.findall(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', text):
        candidates[email] = 'Adresă de e-mail'
    for account in re.findall(r'\bRO\d{2}(?:[ \t]?[A-Z0-9]){20}\b', text, flags=re.I):
        candidates[account] = 'Cont bancar'
    for term, kind in [(document.supplier, 'Furnizor'), (document.owner, 'Persoană responsabilă')]:
        if term:
            candidates[term] = kind
    metadata = (document.extra or {}).get('metadata', {})
    for key, kind in [('supplier_iban', 'Cont bancar'), ('supplier_contact', 'Date de contact'), ('supplier_tax_id', 'Identificator furnizor')]:
        if isinstance(metadata.get(key), str):
            candidates[metadata[key]] = kind
    items = []
    seen = set()
    for term, kind in candidates.items():
        key = term.casefold()
        if key in seen:
            continue
        seen.add(key)
        matches = find_matches(result['pages'],term)
        pages = sorted({match['page'] for match in matches})
        if pages:
            items.append({'term': term, 'kind': kind, 'pages': pages, 'occurrences': len(matches)})
    return {'items': items, 'source_version': document.version, 'method': 'rules',
        'notice': 'Sugestii automate bazate pe text și metadate. Verifică toate paginile copiei înainte de partajare.'}
