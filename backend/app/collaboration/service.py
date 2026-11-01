"""Small partner request inbox. Each airport owns its writes; gateways only serve GET.

Peer events are pulled into a separate airport's database with an ordered cursor.
Acknowledged means persisted by the partner, never read by a person.
Message content is plain text, never HTML or instructions for an AI model.
"""
import hashlib
import json
import re
from urllib.parse import quote
from uuid import uuid4

import httpx
from pydantic import ValidationError
from sqlalchemy import func, select, text, or_

from app.config import settings
from app.core.audit import now, record
from app.core.exceptions import DomainError
from app.core.security import can_read, has_role, require_page, is_department_head
from app.documents.models import Document
from app.people.models import Department
from app.people.organization import canonical_department, DEPARTMENT_LABELS, LEGACY_IDS
from app.documents.service import file_hash
from app.exchange.service import PEERS, gateway_token
from app.exchange.registry import legacy_peer, peer_urls, trusted_peer_ids, airport_profile
from app.core.login_names import normalize_login
from app.collaboration.models import CollaborationMailboxState
from app.sharing.models import Share, SharePreview
from app.sharing.service import serialize as share_state
from app.collaboration.models import CollaborationEvent as Event, CollaborationSync as Sync, CollaborationThread as Thread
from app.collaboration.schemas import Attachment, Feed
from app.collaboration import participation


def partner_id(thread=None):
    if thread:
        return thread.recipient_airport_id if thread.requester_airport_id == settings.airport_id else thread.requester_airport_id
    return legacy_peer()


def require_access(user):
    if not user.active or user.airport_id != settings.airport_id:
        raise DomainError('Spațiul de colaborare nu este disponibil pentru acest aeroport.', 403)
    require_page(user, 'sharing')


def can_manage(user):
    return participation.eligible(user)


def visible_to(user, thread):
    if thread.requester_contact and thread.recipient_contact:
        person = thread.requester_contact if thread.requester_airport_id == settings.airport_id else thread.recipient_contact
        return can_manage(user) and person['id'] == user.id
    if has_role(user, 'director') or (has_role(user, 'reviewer') and canonical_department(user.department) == 'Conformitate'):
        return True
    department = thread.requester_department if thread.requester_airport_id == settings.airport_id else thread.recipient_department
    return bool(department and is_department_head(user, department))


def require_management(user):
    if not can_manage(user):
        raise DomainError('Doar șefii de departament și directorul pot iniția sau gestiona cereri.', 403)


def sync_state(db, peer_id=None):
    peer_id = peer_id or partner_id()
    key = settings.airport_id + ':' + peer_id
    row = db.get(Sync, key)
    if row is None:
        row = Sync(id=key, airport_id=settings.airport_id, peer_airport_id=peer_id, received_cursor=0, acknowledged_cursor=0)
        db.add(row)
        db.flush()
    return row


def header(thread):
    return {key: getattr(thread, key) for key in ('id', 'requester_airport_id', 'recipient_airport_id', 'subject', 'topic', 'created_at', 'requester_department', 'recipient_department', 'requester_contact', 'recipient_contact', 'category')}


def outgoing(db, peer, after=0):
    if peer.airport_id not in trusted_peer_ids():
        raise DomainError('Partener neautorizat.', 403)
    rows = list(db.scalars(select(Event).join(Thread, Event.thread_id == Thread.id).where(
        or_(Thread.requester_airport_id == peer.airport_id, Thread.recipient_airport_id == peer.airport_id),
        Event.airport_id == settings.airport_id,
        Event.author_airport_id == settings.airport_id, Event.sequence > after).order_by(Event.sequence).limit(101)))
    if not participation.enabled(db):
        rows = []
    items = []
    for event in rows[:100]:
        thread = db.get(Thread, event.thread_id)
        if not thread or thread.airport_id != settings.airport_id or {thread.requester_airport_id, thread.recipient_airport_id} != {settings.airport_id, peer.airport_id}:
            raise DomainError('Cererea nu aparține acestei legături.', 409)
        attachment = event.attachment
        if attachment:
            grant = db.get(Share, attachment['share_id'])
            if not grant or share_state(grant, db)['status'] != 'active':
                attachment = None  # Do not newly disclose attachment metadata after revocation/expiry.
        items.append({'id': event.id, 'sequence': event.sequence, 'author_airport_id': event.author_airport_id, 'author_id': event.author_id,
            'author_role': event.author_role, 'kind': event.kind, 'body': event.body, 'created_at': event.created_at,
            'attachment': attachment, 'thread': header(thread)})
    state = db.get(Sync, settings.airport_id + ':' + peer.airport_id)
    return {'source_airport_id': settings.airport_id, 'recipient_airport_id': peer.airport_id,
        'source_airport_name': settings.airport_name,
        'participation_enabled': participation.enabled(db), 'contacts': participation.directory(db),
        'departments': [{'name': d.name, 'label': DEPARTMENT_LABELS.get(d.name, d.name)} for d in db.scalars(select(Department).where(Department.airport_id == settings.airport_id, Department.id.not_in(list(LEGACY_IDS)))) if d.name != 'Conducere'],
        'events': items, 'next_cursor': items[-1]['sequence'] if items else after,
        'acknowledged_cursor': state.received_cursor if state else 0, 'has_more': len(rows) > 100}


def import_feed(db, payload, requested_cursor, peer_id=None):
    """All-or-nothing validation, idempotent under concurrent polling and replay."""
    peer_id = peer_id or partner_id()
    try:
        feed = Feed.model_validate(payload)
        if len({c.id for c in feed.contacts}) != len(feed.contacts) or (feed.contacts and not feed.participation_enabled):
            raise ValueError('Invalid published contacts')
        if peer_id not in trusted_peer_ids() or feed.source_airport_id != peer_id or feed.recipient_airport_id != settings.airport_id:
            raise ValueError('Wrong peer')
        sequences = [event.sequence for event in feed.events]
        if sequences != sorted(set(sequences)) or any(value <= requested_cursor for value in sequences):
            raise ValueError('Unordered peer sequence')
        if feed.next_cursor != (sequences[-1] if sequences else requested_cursor) or (feed.has_more and not sequences):
            raise ValueError('Invalid cursor')
        db.commit()
        db.execute(text('BEGIN IMMEDIATE'))
        state = sync_state(db, peer_id)
        # The cursor may have been loaded before the network call. Another poll
        # can commit while that call is in flight; expire_on_commit=False keeps
        # our stale ORM object alive even after acquiring the write lock.
        db.refresh(state)
        last_local = db.scalar(select(func.max(Event.sequence)).join(Thread, Event.thread_id == Thread.id).where(
            or_(Thread.requester_airport_id == peer_id, Thread.recipient_airport_id == peer_id), Event.airport_id == settings.airport_id,
            Event.author_airport_id == settings.airport_id)) or 0
        if feed.acknowledged_cursor > last_local:
            raise ValueError('Impossible acknowledgement')
        for event in feed.events:
            if event.sequence <= state.received_cursor:
                continue
            data = event.thread.model_dump(mode='json')
            # datetime normalizes the wire value; require timezone-aware timestamps.
            if event.created_at.tzinfo is None or event.thread.created_at.tzinfo is None:
                raise ValueError('Missing timezone')
            data['created_at'] = event.thread.created_at.isoformat()
            if (event.author_airport_id != peer_id or not event.id.startswith('collab-' + peer_id + '-')
                or data['requester_airport_id'] == data['recipient_airport_id']
                or {data['requester_airport_id'], data['recipient_airport_id']} != {settings.airport_id, peer_id}
                or not data['id'].startswith('request-' + data['requester_airport_id'] + '-')):
                raise ValueError('Spoofed author or participants')
            if event.kind == 'request' and event.author_airport_id != data['requester_airport_id']:
                raise ValueError('Spoofed request')
            if event.kind == 'resolved' and event.author_airport_id != data['requester_airport_id']:
                raise ValueError('Only requester resolves')
            if event.kind == 'declined' and event.author_airport_id != data['recipient_airport_id']:
                raise ValueError('Only recipient declines')
            if event.kind in ('request', 'reply') and not event.body:
                raise ValueError('Empty message')
            if bool(data['requester_contact']) != bool(data['recipient_contact']):
                raise ValueError('Incomplete participant identity')
            if data['requester_contact']:
                author = data['requester_contact'] if event.author_airport_id == data['requester_airport_id'] else data['recipient_contact']
                if event.author_id != author['id']:
                    raise ValueError('Author is not a participant')
                if data['requester_department'] != data['requester_contact']['department'] or data['recipient_department'] != data['recipient_contact']['department']:
                    raise ValueError('Participant department mismatch')
            if event.attachment and (event.kind not in ('request', 'reply') or event.attachment.source_airport_id != event.author_airport_id):
                raise ValueError('Spoofed attachment')
            thread = db.get(Thread, data['id'])
            if thread is None:
                if event.kind != 'request' or data['requester_airport_id'] != peer_id:
                    raise ValueError('Missing original request')
                thread = Thread(airport_id=settings.airport_id, **data)
                db.add(thread)
                db.flush()
            elif thread.airport_id != settings.airport_id or header(thread) != data:
                raise ValueError('Thread identity changed')
            elif event.kind == 'request':
                raise ValueError('Duplicate original request')
            if db.scalar(select(Event.id).where(Event.id == event.id)):
                raise ValueError('Reused event identity')
            db.add(Event(id=event.id, airport_id=settings.airport_id, thread_id=thread.id,
                author_airport_id=event.author_airport_id, author_role=event.author_role, author_id=event.author_id,
                origin_sequence=event.sequence, kind=event.kind, body=event.body,
                created_at=event.created_at.isoformat(), attachment=event.attachment.model_dump() if event.attachment else None))
        state.peer_name = feed.source_airport_name or PEERS[peer_id]
        state.departments = [d.model_dump() for d in feed.departments]
        state.participation_enabled = feed.participation_enabled
        state.contacts = [c.model_dump() for c in feed.contacts] if feed.participation_enabled else []
        state.last_synced_at = now()
        state.received_cursor = max(state.received_cursor, feed.next_cursor)
        state.acknowledged_cursor = max(state.acknowledged_cursor, feed.acknowledged_cursor)
        db.commit()
        return feed.has_more
    except (ValidationError, ValueError):
        db.rollback()
        raise DomainError('Răspunsul partenerului nu a putut fi verificat. Mesajele locale sunt păstrate.', 502) from None
    except Exception:
        db.rollback()
        raise


def synchronize_peer(db, user, peer_id, url):
    require_access(user)
    try:
        token = gateway_token()
        headers = {'Authorization': 'Bearer ' + token, 'X-Requester-Id': user.id,
            'X-Requester-Roles': ','.join(set(user.roles) | ({'department_head'} if is_department_head(user) else set())), 'X-Requester-Department': quote(user.department, safe='')}
        # Bounded catch-up. Further batches are fetched by the next visible-page poll.
        for _ in range(5):
            state = db.get(Sync, settings.airport_id + ':' + peer_id)
            cursor = state.received_cursor if state else 0
            response = httpx.get(url + '/outgoing/collaboration',
                params={'after': cursor}, headers=headers, timeout=8, follow_redirects=False)
            if response.status_code != 200 or len(response.content) > 1500000:
                raise DomainError('Aeroportul partener nu este disponibil pentru sincronizare. Reîncearcă; mesajele locale sunt păstrate.', 503)
            try:
                payload = response.json()
            except ValueError:
                raise DomainError('Răspunsul partenerului nu a putut fi verificat.', 502) from None
            if not participation.enabled(db) and isinstance(payload, dict):
                payload = {**payload, 'events': [], 'next_cursor': cursor, 'has_more': False}
            if not import_feed(db, payload, cursor, peer_id):
                break
        else:
            return {'connected': False, 'sync_error': 'Sincronizarea istoricului continuă. Actualizează înainte de a trimite un răspuns.'}
        return {'connected': True, 'sync_error': None}
    except httpx.HTTPError:
        db.rollback()
        return {'connected': False, 'sync_error': 'Aeroportul partener nu răspunde. Mesajele locale sunt păstrate; reîncearcă sincronizarea.'}
    except DomainError as exc:
        return {'connected': False, 'sync_error': exc.message}


def synchronize(db, user):
    require_access(user)
    urls = peer_urls()
    if not urls:
        return {'connected':False, 'sync_error':'Legătura cu aeroportul partener nu este configurată. Cererile păstrate local rămân disponibile.', 'peers':{}}
    connections = {identifier:synchronize_peer(db, user, identifier, url) for identifier,url in urls.items()}
    errors = [f'{PEERS[key]}: {value["sync_error"]}' for key,value in connections.items() if value['sync_error']]
    return {'connected':any(value['connected'] for value in connections.values()),
        'sync_error':' '.join(errors) or None, 'peers':connections}


def peer_connection(connection, identifier):
    return connection.get('peers', {}).get(identifier, connection if 'peers' not in connection else
        {'connected':False,'sync_error':'Legătura cu aeroportul partener nu este configurată.'})


def require_connected(connection):
    if not connection['connected']:
        raise DomainError(connection['sync_error'], 503)


def events_for(db, thread):
    return list(db.scalars(select(Event).where(Event.airport_id == settings.airport_id,
        Event.thread_id == thread.id).order_by(Event.created_at, Event.id)))


def status_for(events):
    # Simultaneous terminal decisions converge: requester resolution takes precedence.
    kinds = {event.kind for event in events}
    return 'resolved' if 'resolved' in kinds else 'declined' if 'declined' in kinds else 'open'


def get_thread(db, identifier, user=None):
    thread = db.get(Thread, identifier)
    if not thread or thread.airport_id != settings.airport_id or (user is not None and not visible_to(user, thread)):
        raise DomainError('Cererea nu există în acest aeroport.', 404)
    return thread


def context(db, connection, peer_id=None):
    urls = peer_urls()
    def describe(identifier):
        current = peer_connection(connection, identifier)
        state = db.get(Sync, settings.airport_id + ':' + identifier)
        active = bool(state and state.participation_enabled)
        local_active = participation.enabled(db)
        return {**airport_profile(identifier), 'name':state.peer_name if state and state.peer_name else PEERS[identifier],
            'connected':current['connected'], 'configured':identifier in urls,
            'sync_error':current.get('sync_error'),
            'last_synced_at':state.last_synced_at if state else None,
            'departments':state.departments or [] if state else [], 'participation_enabled':active,
            'contacts':state.contacts or [] if state and active and current['connected'] and local_active else [],
            'sharing_enabled':active and local_active and current['connected']}
    peers = [describe(identifier) for identifier in urls]
    partner = describe(peer_id or next(iter(urls), partner_id()))
    return {**connection, 'partner': partner, 'partners':peers,
        'local_airport': {**airport_profile(settings.airport_id), 'name': settings.airport_name}}


def remote_contact(thread):
    return thread.recipient_contact if thread.requester_airport_id == settings.airport_id else thread.requester_contact


def can_exchange(db, connection, thread=None, peer_id=None):
    peer = context(db, connection, partner_id(thread) if thread else peer_id)['partner']
    if not peer['sharing_enabled']:
        return False
    contact = remote_contact(thread) if thread else None
    return not contact or any(c['id'] == contact['id'] for c in peer['contacts'])


def require_exchange(db, connection, thread=None, peer_id=None):
    peer_id = partner_id(thread) if thread else peer_id or partner_id()
    require_connected(peer_connection(connection, peer_id))
    if not can_exchange(db, connection, thread, peer_id):
        raise DomainError('Colaborarea trebuie activată în ambele aeroporturi, iar destinatarul trebuie să fie încă autorizat.', 409)


def present(db, thread, connection, detail=False, user=None):
    peer_id = partner_id(thread)
    events = events_for(db, thread)
    state = db.get(Sync, settings.airport_id + ':' + peer_id)
    ack = state.acknowledged_cursor if state else 0
    pending = any(event.author_airport_id == settings.airport_id and event.sequence > ack for event in events)
    status = status_for(events)
    outgoing_request = thread.requester_airport_id == settings.airport_id
    mailbox = db.get(CollaborationMailboxState, (settings.airport_id,user.id,thread.id)) if user else None
    last_sequence = max((event.sequence for event in events),default=0)
    last_remote = max((event.sequence for event in events if event.author_airport_id != settings.airport_id),default=0)
    result = {**header(thread), 'direction': 'outgoing' if outgoing_request else 'incoming', 'status': status,
        'starred':bool(mailbox and mailbox.starred), 'archived':bool(mailbox and mailbox.archived),
        'unread':last_remote > (mailbox.read_sequence if mailbox else 0), 'last_sequence':last_sequence,
        'in_inbox':bool(last_remote), 'in_sent':any(event.author_airport_id==settings.airport_id for event in events),
        'has_attachment':any(event.attachment for event in events),
        'updated_at': max((event.created_at for event in events), default=thread.created_at),
        'partner_name': context(db, connection, peer_id)['partner']['name'], 'message_count': len(events),
        'last_message': events[-1].body if events else '', 'pending_delivery': pending}
    if detail:
        messages = []
        for event in events:
            local = event.author_airport_id == settings.airport_id
            attachment = None
            if event.attachment:
                attachment = dict(event.attachment)
                share = db.get(Share, attachment['share_id']) if local else None
                attachment['status'] = share_state(share, db)['status'] if share else ('unavailable' if local else 'verify_on_open')
                attachment['file_url'] = f'/api/shares/{attachment["share_id"]}/file' if local else f'/api/received/{attachment["share_id"]}/file?airport_id={peer_id}'
            messages.append({'id': event.id, 'body': event.body, 'kind': event.kind,
                'author_contact': thread.requester_contact if event.author_airport_id == thread.requester_airport_id else thread.recipient_contact,
                'author_airport_id': event.author_airport_id, 'author_airport_name': PEERS[event.author_airport_id],
                'author_role': event.author_role, 'created_at': event.created_at, 'is_local': local,
                'delivery': 'pending' if local and event.sequence > ack else 'received', 'attachment': attachment})
        can_write = can_exchange(db, connection, thread) and status == 'open' and user is not None and can_manage(user) and visible_to(user, thread)
        details = context(db, connection, peer_id)
        details.update(peer_connection(connection, peer_id))
        result.update(**details, messages=messages, can_reply=can_write,
            can_participate=user is not None and can_manage(user) and visible_to(user, thread),
            can_resolve=can_write and outgoing_request, can_decline=can_write and not outgoing_request)
    return result


def listing(db, user):
    connection = synchronize(db, user)
    threads = list(db.scalars(select(Thread).where(Thread.airport_id == settings.airport_id)))
    items = [present(db, thread, connection, user=user) for thread in threads if visible_to(user, thread)]
    items.sort(key=lambda item: (item['updated_at'], item['id']), reverse=True)
    return {**context(db, connection), 'participation': participation.snapshot(db, user),
        'sender': participation.contact(user), 'can_create': can_manage(user) and any(p['sharing_enabled'] and p['contacts'] for p in context(db,connection)['partners']), 'requests': items}


def detail(db, user, identifier):
    connection = synchronize(db, user)
    return present(db, get_thread(db, identifier, user), connection, detail=True, user=user)


def update_mailbox(db,user,identifier,body):
    require_access(user)
    thread=get_thread(db,identifier,user)
    values=body.model_dump(exclude_none=True)
    if not values:raise DomainError('Selectează o acțiune pentru conversație.',422)
    maximum=db.scalar(select(func.max(Event.sequence)).where(Event.thread_id==thread.id,Event.airport_id==settings.airport_id)) or 0
    if values.get('read_sequence',0)>maximum:raise DomainError('Mesajul nu există în această conversație.',422)
    key=(settings.airport_id,user.id,thread.id)
    row=db.get(CollaborationMailboxState,key)
    if not row:
        row=CollaborationMailboxState(airport_id=key[0],user_id=key[1],thread_id=key[2]);db.add(row)
    for name,value in values.items():setattr(row,name,value)
    db.commit()
    return {'starred':row.starred,'archived':row.archived,'read_sequence':row.read_sequence}


def airport_directory(db,user,q='',available=True,offset=0,limit=12):
    connection=synchronize(db,user)
    data=context(db,connection)
    needle=normalize_login(q)
    items=[p for p in data['partners'] if (not available or p['participation_enabled']) and
        (not needle or needle in normalize_login(' '.join(str(p.get(k,'')) for k in ('name','city','country','iata','icao'))))]
    items.sort(key=lambda p:(not p['participation_enabled'],p['name']))
    return {'items':items[offset:offset+limit],'total':len(items),'offset':offset,'limit':limit,
        'local_airport':data['local_airport'],'google_api_key':settings.google_maps_api_key.get_secret_value() or None}


def digest(payload):
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def existing_request(db, user, key, request_hash):
    event = db.scalar(select(Event).where(Event.airport_id == settings.airport_id,
        Event.author_id == user.id, Event.idempotency_key == key))
    if event and event.request_hash != request_hash:
        raise DomainError('Identificatorul de retrimitere aparține altui mesaj. Actualizează cererea.', 409)
    return event


def add_local_event(db, user, thread, kind, body, key, request_hash, attachment=None):
    event = Event(id='collab-' + settings.airport_id + '-' + uuid4().hex, airport_id=settings.airport_id,
        thread_id=thread.id, author_airport_id=settings.airport_id, author_id=user.id,
        author_role='director' if has_role(user, 'director') else 'department_head', kind=kind,
        body=body, created_at=now(), attachment=attachment, idempotency_key=key, request_hash=request_hash)
    db.add(event)
    record(db, user, 'Coordonare cu aeroportul partener', detail=f'{thread.id}; {kind}; {partner_id(thread)}; în așteptarea sincronizării partenerului')
    db.commit()


def create(db, user, body):
    require_access(user)
    require_management(user)
    request_hash = digest({'action': 'create', **body.model_dump()})
    prior = existing_request(db, user, body.idempotency_key, request_hash)
    connection = synchronize(db, user)
    if prior:
        return present(db, get_thread(db, prior.thread_id, user), connection, detail=True, user=user)
    if body.recipient_airport_id not in peer_urls():
        raise DomainError('Selectează un aeroport conectat.', 422)
    require_exchange(db, connection, peer_id=body.recipient_airport_id)
    recipient = next((c for c in context(db, connection, body.recipient_airport_id)['partner']['contacts'] if c['id'] == body.recipient_user_id), None)
    if not recipient:
        raise DomainError('Selectează o persoană din contactele publicate de aeroportul partener.', 422)
    attachment = approved_attachment(db, user, body.share_id, body.recipient_airport_id)
    if body.category == 'document' and not attachment:
        raise DomainError('Adaugă o copie verificată pentru un mesaj de tip Document.', 422)
    db.commit(); db.execute(text('BEGIN IMMEDIATE'))
    prior = existing_request(db, user, body.idempotency_key, request_hash)
    if prior:
        db.commit()
        return present(db, get_thread(db, prior.thread_id, user), connection, detail=True, user=user)
    # Recheck local opt-in under the write lock; a director may have disabled it during the network call.
    require_access(user)
    require_exchange(db, connection, peer_id=body.recipient_airport_id)
    thread = Thread(id='request-' + settings.airport_id + '-' + uuid4().hex, airport_id=settings.airport_id,
        requester_airport_id=settings.airport_id, recipient_airport_id=body.recipient_airport_id,
        subject=body.subject, topic=body.topic, created_at=now(),
        requester_department=canonical_department(user.department), recipient_department=recipient['department'],
        requester_contact=participation.contact(user), recipient_contact=recipient, category=body.category)
    db.add(thread); db.flush()
    add_local_event(db, user, thread, 'request', body.body, body.idempotency_key, request_hash, attachment)
    return present(db, thread, connection, detail=True, user=user)


def approved_attachment(db, user, share_id, peer_id=None):
    if not share_id:
        return None
    share = db.get(Share, share_id)
    document = db.get(Document, share.document_id) if share else None
    if not share or not document or not can_read(user, document) or document.airport_id != settings.airport_id:
        raise DomainError('Copia partajată nu este disponibilă pentru acest aeroport.', 404)
    if (share.recipient_airport_id != (peer_id or partner_id()) or share.recipient_department is not None
        or not share.reviewed or document.department == 'Resurse umane'
        or document.status not in ('approved', 'signed') or share_state(share, db)['status'] != 'active'):
        raise DomainError('Atașează o copie aprobată, activă și partajată cu aeroportul partener, fără limitare la un departament. Partajarea se verifică separat.', 409)
    preview = db.get(SharePreview, share.preview_id)
    if not preview or preview.source_version != document.version or file_hash(preview.file_path) != preview.sha256:
        raise DomainError('Integritatea copiei partajate nu poate fi confirmată.', 409)
    title = document.title
    for redaction in preview.redactions:
        title = re.sub(re.escape(redaction['term']), '[redactat]', title, flags=re.I)
    try:
        return Attachment(share_id=share.id, title=title[:500], source_airport_id=settings.airport_id,
            source_version=share.source_version).model_dump()
    except ValidationError:
        raise DomainError('Titlul copiei conține caractere care nu pot fi transmise. Verifică metadatele înainte de atașare.', 409) from None


def append(db, user, identifier, body, status_change=False):
    require_access(user)
    thread = get_thread(db, identifier, user)
    require_management(user)
    department = thread.requester_department if thread.requester_airport_id == settings.airport_id else thread.recipient_department
    if not thread.requester_contact and not has_role(user, 'director') and (not department or not is_department_head(user, department)):
        raise DomainError('Cererea este adresată conducerii altui departament.', 403)
    request_hash = digest({'action': 'status' if status_change else 'reply', 'thread_id': identifier, **body.model_dump()})
    prior = existing_request(db, user, body.idempotency_key, request_hash)
    connection = synchronize(db, user)
    if prior:
        return present(db, thread, connection, detail=True, user=user)
    require_exchange(db, connection, thread)
    db.commit(); db.execute(text('BEGIN IMMEDIATE'))
    prior = existing_request(db, user, body.idempotency_key, request_hash)
    if prior:
        db.commit()
        return present(db, thread, connection, detail=True, user=user)
    require_access(user)
    get_thread(db, identifier, user)
    require_exchange(db, connection, thread)
    if status_for(events_for(db, thread)) != 'open':
        raise DomainError('Cererea este deja închisă. Istoricul rămâne disponibil.', 409)
    if status_change:
        if ((body.status == 'resolved' and thread.requester_airport_id != settings.airport_id)
            or (body.status == 'declined' and thread.recipient_airport_id != settings.airport_id)):
            raise DomainError('Doar inițiatorul poate marca rezolvarea; doar destinatarul poate declina cererea.', 403)
        message = body.body or ('Cererea a fost rezolvată.' if body.status == 'resolved' else 'Cererea a fost declinată.')
        add_local_event(db, user, thread, body.status, message, body.idempotency_key, request_hash)
    else:
        attachment = approved_attachment(db, user, body.share_id, partner_id(thread))
        add_local_event(db, user, thread, 'reply', body.body, body.idempotency_key, request_hash, attachment)
    return present(db, thread, connection, detail=True, user=user)

