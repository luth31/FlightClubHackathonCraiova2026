import hmac
import re
from types import SimpleNamespace
from urllib.parse import quote,unquote
import httpx
from sqlalchemy import select
from app.config import settings
from app.core.exceptions import DomainError
from app.core.security import require_role,require_page
from app.core.audit import record
from app.documents.models import Document
from app.documents.service import file_hash
from app.sharing.models import Share, SharePreview
from app.sharing.service import serialize

PEERS = {'craiova': 'Aeroportul Craiova', 'sibiu': 'Aeroportul Sibiu'}


def gateway_token():
    path = settings.exchange_token_file
    if not path or not path.is_file():
        raise DomainError('Legătura cu aeroportul partener nu este configurată.', 503)
    return path.read_text().strip()


def authenticated_peer(authorization, airport, requester, roles, department=''):
    token = gateway_token()
    if not hmac.compare_digest(authorization or '', f'Bearer {token}'):
        raise DomainError('Gateway neautorizat.', 401)
    if airport not in PEERS or airport == settings.airport_id:
        raise DomainError('Aeroportul nu este un partener autorizat.', 403)
    if not requester or len(requester) > 100 or not {'director', 'reviewer'} & set((roles or '').split(',')):
        raise DomainError('Destinatarul nu are acces la biblioteca partajată.', 403)
    return SimpleNamespace(id=f'{airport}/{requester}', name=f'{PEERS[airport]} · {requester}', airport_id=airport, department=unquote(department))


def recipient_matches(share,peer):
    return share.recipient_airport_id==peer.airport_id and (not share.recipient_department or share.recipient_department==getattr(peer,'department',''))


def accessible_share(db, peer, share_id):
    share = db.get(Share, share_id)
    if not share or not recipient_matches(share,peer):
        raise DomainError('Documentul nu a fost partajat cu acest destinatar.', 404)
    if serialize(share, db)['status'] != 'active':
        raise DomainError('Accesul a expirat, a fost revocat sau versiunea s-a schimbat.', 403)
    document = db.get(Document, share.document_id)
    if not document or document.airport_id != settings.airport_id or document.department == 'Resurse umane':
        raise DomainError('Documentul nu este disponibil pentru partajare.', 403)
    preview = db.get(SharePreview, share.preview_id)
    if not preview or file_hash(preview.file_path) != preview.sha256:
        raise DomainError('Integritatea copiei nu poate fi verificată.', 409)
    return share, document, preview


def incoming_list(db, peer):
    result = []
    for item in db.scalars(select(Share).where(Share.recipient_airport_id == peer.airport_id)):
        if not recipient_matches(item,peer) or serialize(item, db)['status'] != 'active':
            continue
        share, document, preview = accessible_share(db, peer, item.id)
        title = document.title
        for redaction in preview.redactions:
            title = re.sub(re.escape(redaction['term']), '[redactat]', title, flags=re.I)
        result.append({'id': share.id, 'document_title': title, 'source_version': share.source_version,
            'source_airport': settings.airport_name, 'source_airport_id': settings.airport_id,
            'expires_at': share.expires_at, 'created_at': share.created_at, 'status': 'active', 'recipient_department':share.recipient_department,
            'sha256': preview.sha256, 'file_url': f'/api/received/{share.id}/file'})
    record(db, peer, 'Bibliotecă partajată consultată', detail=f'{len(result)} copii disponibile pentru aeroportul destinatar.')
    db.commit()
    return {'items': result, 'total': len(result), 'connected': True}


def incoming_file(db, peer, share_id):
    share, document, preview = accessible_share(db, peer, share_id)
    record(db, peer, 'Copie consultată de aeroportul partener', document, f'{share.id}; v{share.source_version}; SHA256 {preview.sha256}')
    db.commit()
    return preview


def fetch_peer(db, user, suffix=''):
    require_page(user, 'sharing')
    require_role(user, 'director', 'reviewer')
    if not settings.exchange_url:
        raise DomainError('Legătura cu aeroportul partener nu este configurată. Documentele locale rămân disponibile.', 503)
    headers = {'Authorization': f'Bearer {gateway_token()}', 'X-Requester-Id': user.id,
        'X-Requester-Roles': ','.join(r for r in user.roles if r in ('director', 'reviewer')), 'X-Requester-Department':quote(user.department,safe='')}
    try:
        result = httpx.get(settings.exchange_url.rstrip('/') + '/outgoing/shares' + suffix,
            headers=headers, timeout=8.0, follow_redirects=False)
    except httpx.HTTPError:
        raise DomainError('Aeroportul partener nu este disponibil. Documentele locale rămân accesibile.', 503)
    if result.status_code >= 400:
        if result.status_code in (403, 404, 409):
            raise DomainError('Copia partajată nu mai este disponibilă sau accesul a fost revocat.', result.status_code)
        raise DomainError('Legătura cu aeroportul partener este indisponibilă.', 503)
    record(db, user, 'Copie primită consultată' if suffix else 'Bibliotecă aeroport partener consultată', detail=suffix or 'Listă actualizată direct de la sursă; fără cache local.')
    db.commit()
    return result
