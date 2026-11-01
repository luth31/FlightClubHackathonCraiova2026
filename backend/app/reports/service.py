import csv
import io
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from importlib import import_module
from importlib.util import find_spec
from zoneinfo import ZoneInfo

from sqlalchemy import desc, select

from app.config import settings
from app.contracts.service import safe_cell
from app.core.exceptions import DomainError
from app.core.models import AuditEvent
from app.core.presentation import operational_text
from app.core.security import has_role
from app.documents.classification import STAGES
from app.documents.service import serialize, visible_documents
from app.people import service as people_service
from app.sharing.models import Share
from app.sharing.service import serialize as serialize_share
from app.suppliers import service as supplier_service
from app.suppliers.query import ReviewFilters, matching_reviews
from app.tasks import service as task_service

# Reports can ship independently; use renewal tracking when that module is installed.
renewal_service = import_module('app.renewals.service') if find_spec('app.renewals') else None


DEFINITIONS = [
    dict(id='overview', title='Imaginea de ansamblu', subtitle='Documente, decizii și termene într-un singur loc.', category='Conducere', theme='violet', icon='overview', roles=['director'], source='Registrul documentelor'),
    dict(id='documents', title='Sănătatea documentelor', subtitle='Volum, validare, distribuție și documente de urmărit.', category='Documente', theme='blue', icon='documents', roles=[], source='Registrul documentelor'),
    dict(id='contracts', title='Portofoliu & reînnoiri', subtitle='Valori contractuale, scadențe și responsabilități.', category='Financiar', theme='mint', icon='contracts', roles=['director', 'reviewer', 'finance'], source='Contracte și urmăriri de reînnoire'),
    dict(id='approvals', title='Sarcini & aprobări', subtitle='Cozi de lucru, întârzieri și încărcarea echipei.', category='Fluxuri de lucru', theme='orange', icon='approvals', roles=[], source='Sarcini atribuite'),
    dict(id='procurement', title='Achiziții de la A la Z', subtitle='Dosare, livrări, recepții și verificarea facturilor.', category='Operațiuni', theme='blue', icon='procurement', roles=['director', 'reviewer', 'finance'], source='Documentele clasificate în fluxul de achiziții'),
    dict(id='suppliers', title='Furnizori & risc', subtitle='Verificări deschise, semnale de risc și decizii.', category='Financiar', theme='orange', icon='suppliers', roles=['director', 'finance'], source='Registrul de verificări furnizori'),
    dict(id='people', title='Echipă & disponibilitate', subtitle='Acoperire pe departamente, absențe și delegări.', category='Echipă', theme='violet', icon='people', roles=['director', 'hr', 'admin'], source='Directorul echipei și cereri de concediu autorizate'),
    dict(id='sharing', title='Colaborare între aeroporturi', subtitle='Accese active, revocări, expirări și destinatari.', category='Colaborare', theme='blue', icon='sharing', roles=['director', 'reviewer'], source='Partajările documentelor accesibile'),
    dict(id='maintenance', title='Monitorizare tehnică', subtitle='Mentenanță, instruire și termene pentru echipa tehnică.', category='Operațiuni', theme='mint', icon='maintenance', roles=['director', 'technician', 'reviewer'], source='Documente tehnice accesibile'),
]


def permitted(user, definition):
    return not definition['roles'] or has_role(user, *definition['roles'])


def catalog(db, user, *, _documents=None):
    documents = visible_documents(db, user) if _documents is None else _documents
    return {'items': [d for d in DEFINITIONS if permitted(user, d)],
            'visible_documents': len(documents), 'roles': user.roles,
            'reference_date': str(settings.reference_date), 'refresh_seconds': 60}


def parse_date(value):
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def calendar_day(value):
    if not value:
        return None
    try:
        text = str(value)
        if len(text) == 10:
            return date.fromisoformat(text)
        stamp = datetime.fromisoformat(text.replace('Z', '+00:00'))
        return (stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)).astimezone(ZoneInfo('Europe/Bucharest')).date()
    except (ValueError, TypeError):
        return None


def metric(identifier, label, value, detail='', tone='neutral', unit=''):
    return dict(id=identifier, label=label, value=value, detail=detail, tone=tone, unit=unit)


def distribution(rows, field):
    counts = Counter(str(row.get(field) or 'Nespecificat') for row in rows)
    return [{'name': name, 'value': value} for name, value in counts.most_common()]


def document_row(item):
    return dict(id=item['id'], document_id=item['id'], title=item['title'], number=item['number'],
                department=item['department'], status=item['status'], owner=item['owner'],
                value=item['value'], currency=item['currency'], date=item['expires_at'],
                created_at=item['created_at'], category=item['category'],
                days_remaining=item['days_remaining'], validated=item['validated'],
                supplier=item['supplier'], version=item['version'],
                flow_stage=(item.get('flow') or {}).get('stage'), case_id=item.get('flow_case_id'))


def currency_totals(items):
    amounts = defaultdict(float)
    for item in items:
        if item.get('value') is not None:
            amounts[item.get('currency') or 'RON'] += item['value']
    return [dict(currency=currency, value=round(value, 2)) for currency, value in sorted(amounts.items())]


def activity_series(rows, days):
    end = max(settings.reference_date, datetime.now(ZoneInfo('Europe/Bucharest')).date())
    start = end - timedelta(days=days - 1)
    buckets = [0] * 12
    for row in rows:
        created = calendar_day(row.get('created_at'))
        if created and start <= created <= end:
            buckets[min(11, (created - start).days * 12 // days)] += 1
    return {'start': start.isoformat(), 'end': end.isoformat(),
            'items': [dict(date=(start + timedelta(days=(i * days + 11) // 12)).isoformat(), value=value)
                      for i, value in enumerate(buckets)], 'total': sum(buckets)}


def document_snapshot(db, user, reference_date):
    """Request-local, permission-filtered rows shared by the dashboard's report cards."""
    documents = [serialize(d, user=user, include_permissions=False) for d in visible_documents(db, user)]
    for document in documents:
        expiry = parse_date(document.get('expires_at'))
        document['days_remaining'] = (expiry - reference_date).days if expiry else None
    return documents


def report(db, user, report_id, days=90, department='', reference_date=None, *, _documents=None):
    reference_date = reference_date or settings.reference_date
    definition = next((d for d in DEFINITIONS if d['id'] == report_id), None)
    if not definition:
        raise DomainError('Raportul nu există.', 404)
    if not permitted(user, definition):
        raise DomainError('Rolurile contului nu permit accesul la acest raport.', 403)
    if days not in (30, 90, 365):
        raise DomainError('Perioada raportului nu este validă.', 422)
    # The briefing passes its own snapshot; no rows are retained across users or requests.
    docs = document_snapshot(db, user, reference_date) if _documents is None else _documents
    selected = [d for d in docs if not department or d['department'] == department]
    rows = [document_row(d) for d in selected]
    breakdowns = []
    highlights = []
    secondary = []
    currency_summary = []
    series_label = 'Documente înregistrate'
    table_title = 'Înregistrări din raport'
    departments = sorted({d['department'] for d in docs})

    if report_id in ('overview', 'documents', 'maintenance', 'contracts', 'procurement'):
        if report_id == 'contracts':
            selected = [d for d in selected if d['category'] == 'Contract']
        elif report_id == 'maintenance':
            selected = [d for d in selected if d['department'] == 'Tehnic']
        elif report_id == 'procurement':
            selected = [d for d in selected if d.get('flow')]
        rows = [document_row(d) for d in selected]
        approved = sum(d['status'] in ('approved', 'signed') for d in selected)
        pending = sum(d['status'] in ('draft', 'in_review') for d in selected)
        expiring = [d for d in selected if d['validated'] and d['status'] != 'archived'
                    and d['days_remaining'] is not None and 0 <= d['days_remaining'] <= 30]
        overdue = [d for d in selected if d['validated'] and d['status'] != 'archived'
                   and d['days_remaining'] is not None and d['days_remaining'] < 0]
        metrics = [metric('total', 'Documente accesibile', len(selected), 'Înregistrări din domeniul tău de acces'),
                   metric('approved', 'Aprobate / semnate', approved, 'Statusul curent al documentelor', 'good'),
                   metric('pending', 'În lucru', pending, 'Ciorne și documente în aprobare', 'warning'),
                   metric('expiring', 'Expiră în 30 zile', len(expiring), 'Doar metadate validate', 'warning')]
        breakdowns = [dict(id='status', title='Starea documentelor', items=distribution(rows, 'status')),
                      dict(id='departments', title='Volum pe departamente', items=distribution(rows, 'department')),
                      dict(id='categories', title='Tipuri de documente', items=distribution(rows, 'category'))]
        secondary = [dict(title='Termene apropiate', items=[document_row(d) for d in sorted(expiring + overdue, key=lambda d: d['days_remaining'])[:8]])]
        highlights = [dict(title='Metadate de verificat', value=sum(not d['validated'] for d in selected), detail='Documente pentru care validarea informațiilor nu este încheiată.'),
                      dict(title='Termene depășite', value=len(overdue), detail='Documente validate cu termen anterior datei de referință.')]
        if report_id == 'contracts':
            currency_summary = currency_totals(selected)
            metrics[0] = metric('total', 'Contracte în portofoliu', len(selected), 'Contracte accesibile, inclusiv arhivate')
            if renewal_service is not None:
                renewals = [r for r in renewal_service.list_renewals(db, user, 'all')['items']
                            if any(d['id'] == r['contract_id'] for d in selected)]
                open_renewals = [r for r in renewals if r['status'] in renewal_service.OPEN_STATUSES]
                metrics[2] = metric('renewals', 'Reînnoiri deschise', len(open_renewals), 'Urmăriri încă nefinalizate', 'warning')
                highlights = [dict(title='Reînnoiri întârziate', value=sum(r['due_date'] < reference_date.isoformat() for r in open_renewals), detail='Urmăriri cu termen depășit, pentru versiunea curentă.'),
                              dict(title='Reatribuire necesară', value=sum(r['assignment_state'] == 'needs_reassignment' for r in open_renewals), detail='Urmăriri fără un responsabil activ și eligibil.')]
                breakdowns.append(dict(id='renewals', title='Starea reînnoirilor', items=distribution(renewals, 'status')))
            table_title = 'Portofoliul contractual'
        elif report_id == 'procurement':
            stage_rows = [dict(stage=d['flow']['stage']) for d in selected]
            names = {s['id']: s['label'] for s in STAGES}
            stages = [dict(name=names[s['id']], value=sum(r['stage'] == s['id'] for r in stage_rows)) for s in STAGES]
            breakdowns.insert(0, dict(id='stages', title='Documente în fiecare etapă', items=stages))
            cases = {d.get('flow_case_id') for d in selected if d.get('flow_case_id')}
            metrics[1] = metric('cases', 'Dosare de achiziție', len(cases), 'Dosare distincte identificate în documente', 'good')
            metrics[3] = metric('invoices', 'Documente de facturare', sum(d['flow']['stage'] == 'invoice_verification' for d in selected), 'Facturi și note de credit')
            highlights[0] = dict(title='Documente fără dosar', value=sum(not d.get('flow_case_id') for d in selected), detail='Clasificate într-o etapă, fără dosar de achiziție identificat.')
        elif report_id == 'maintenance':
            metrics[0]['label'] = 'Documente tehnice'
            table_title = 'Registrul tehnic'

    elif report_id == 'approvals':
        tasks = [t for t in task_service.list_tasks(db, user, 'all')['items'] if not department or t['department'] == department]
        for task in tasks:
            task['overdue'] = task['status'] == 'pending' and task['due_date'] < reference_date.isoformat()
        rows = [dict(id=t['id'], document_id=t['document_id'], title=t['title'], number=t['number'],
                     department=t['department'], status=t['status'], owner=t['assignee'], date=t['due_date'],
                     created_at=t['created_at'], category=t['type'], assignment_state=t['assignment_state'], overdue=t['overdue']) for t in tasks]
        pending = [t for t in tasks if t['status'] == 'pending']
        metrics = [metric('pending', 'Sarcini deschise', len(pending), 'Sarcini pentru documentele accesibile'),
                   metric('overdue', 'Termen depășit', sum(t['overdue'] for t in pending), 'Termen anterior datei de referință', 'warning'),
                   metric('completed', 'Finalizate', sum(t['status'] == 'completed' for t in tasks), 'Istoric al sarcinilor finalizate', 'good'),
                   metric('mine', 'Pot acționa', sum(t['can_act'] for t in pending), 'Atribuite ție sau prin delegare activă')]
        breakdowns = [dict(id='owners', title='Încărcarea responsabililor', items=distribution([r for r in rows if r['status'] == 'pending'], 'owner')),
                      dict(id='types', title='Tipuri de sarcini', items=distribution(rows, 'category')),
                      dict(id='status', title='Starea sarcinilor', items=distribution(rows, 'status'))]
        highlights = [dict(title='Necesită reatribuire', value=sum(t['assignment_state'] == 'needs_reassignment' for t in pending), detail='Responsabilul lipsește sau nu mai este eligibil.'),
                      dict(title='Sarcini delegate', value=sum(t['assignment_state'] == 'delegated' for t in pending), detail='O delegare activă oferă autoritate de aprobare.')]
        table_title, series_label = 'Coada de lucru și istoricul sarcinilor', 'Sarcini create'

    elif report_id == 'suppliers':
        actor_names = supplier_service.actors(db, user)
        all_reviews = [supplier_service.serialize_case(db, user, item, actor_names)
                       for item in matching_reviews(db, user, ReviewFilters())]
        doc_departments = {d['id']: d['department'] for d in docs}
        reviews = [r for r in all_reviews if not department or doc_departments.get(r['document_id']) == department]
        rows = [dict(id=r['id'], document_id=r['document_id'], title=r['supplier_name'], number=r['id'],
                     department=doc_departments.get(r['document_id'], 'Fără contract'), status=r['status'],
                     category=r['risk_level'], owner=r['verified_by'] or r['created_by'], date=r['created_at'],
                     created_at=r['created_at']) for r in reviews]
        metrics = [metric('total', 'Verificări înregistrate', len(reviews), 'Mostre verificate în aplicație'),
                   metric('high', 'Risc ridicat', sum(r['risk_level'] == 'high' for r in reviews), 'Semnale privind IBAN-ul', 'warning'),
                   metric('open', 'Necesită verificare', sum(r['status'] in ('needs_review', 'verified') for r in reviews), 'Verificare sau decizie în așteptare', 'warning'),
                   metric('approved', 'Decizii aprobate', sum(r['status'] == 'approved' for r in reviews), 'Decizii înregistrate', 'good')]
        reasons = Counter(reason['message'] for r in reviews for reason in r['reasons'])
        breakdowns = [dict(id='risk', title='Nivelul de risc', items=distribution(rows, 'category')),
                      dict(id='status', title='Starea verificărilor', items=distribution(rows, 'status')),
                      dict(id='reasons', title='Semnale identificate', items=[dict(name=n, value=v) for n, v in reasons.most_common()])]
        highlights = [dict(title='Verificări fără semnale', value=sum(r['status'] == 'clear' for r in reviews), detail='Detaliile coincid cu registrul verificat.'),
                      dict(title='Decizii respinse', value=sum(r['status'] == 'rejected' for r in reviews), detail='Mostre respinse în procesul de verificare.')]
        table_title, series_label = 'Verificări furnizori', 'Verificări create'

    elif report_id == 'people':
        directory = people_service.directory(db, user, reference_date=reference_date)
        departments = directory['departments']
        persons = [p for p in directory['items'] if not department or p['department'] == department]
        rows = [dict(id=p['id'], document_id=None, title=p['name'], number=p['job_title'], department=p['department'],
                     status=p['availability'], owner=p.get('manager_name') or 'Nespecificat', date=None, category=p['role'], created_at=None) for p in persons]
        leaves = [l for l in directory['leaves'] if not department or l['department'] == department]
        metrics = [metric('total', 'Persoane în director', len(persons), 'Conturi din aeroportul tău'),
                   metric('available', 'Disponibili', sum(p['availability'] == 'available' for p in persons), 'Disponibilitate la data de referință', 'good'),
                   metric('away', 'În absență', sum(p['availability'] == 'away' for p in persons), 'Absențe aprobate în perioada curentă', 'warning'),
                   metric('leave', 'Cereri de decis', sum(l['status'] == 'pending' for l in leaves), 'Doar cererile pe care le poți consulta')]
        breakdowns = [dict(id='departments', title='Acoperire pe departamente', items=distribution(rows, 'department')),
                      dict(id='availability', title='Disponibilitatea echipei', items=distribution(rows, 'status')),
                      dict(id='roles', title='Rolul principal', items=distribution(rows, 'category'))]
        subject_ids = {p['id'] for p in persons}
        delegations = [d for d in directory['delegations'] if d['from_user'] in subject_ids and d['active'] and d['starts_at'] <= str(reference_date) <= d['ends_at']]
        highlights = [dict(title='Conturi inactive', value=sum(not p['active'] for p in persons), detail='Conturi dezactivate în directorul selectat.'),
                      dict(title='Delegări active', value=len(delegations), detail='Delegări valabile la data de referință.')]
        table_title, series_label = 'Disponibilitate și responsabilități', 'Acțiuni accesibile în jurnal'

    elif report_id == 'sharing':
        selected_ids = {d['id'] for d in selected}
        shares = [serialize_share(s, db) for s in db.scalars(select(Share).order_by(desc(Share.created_at))) if s.document_id in selected_ids]
        current_versions = {d['id']: d['version'] for d in selected}
        for share in shares:
            expiry = parse_date(share['expires_at'])
            share['status'] = ('revoked' if share['revoked'] else 'expired' if expiry and expiry < reference_date
                               else 'superseded' if current_versions.get(share['document_id']) != share['source_version'] else 'active')
        doc_departments = {d['id']: d['department'] for d in selected}
        rows = [dict(id=s['id'], document_id=s['document_id'], title=s['document_title'], number=f"v{s['source_version']}",
                     department=doc_departments[s['document_id']], status=s['status'], owner=s['recipient_airport'],
                     category=s['recipient_department'] or 'Toate departamentele', date=s['expires_at'], created_at=s['created_at']) for s in shares]
        metrics = [metric('total', 'Partajări înregistrate', len(shares), 'Documente din domeniul tău de acces'),
                   metric('active', 'Accese active', sum(s['status'] == 'active' for s in shares), 'Versiune curentă, acces valabil', 'good'),
                   metric('revoked', 'Revocate', sum(s['status'] == 'revoked' for s in shares), 'Accese revocate explicit'),
                   metric('expired', 'Expirate / înlocuite', sum(s['status'] in ('expired', 'superseded') for s in shares), 'Accese care nu mai sunt valabile', 'warning')]
        breakdowns = [dict(id='recipients', title='Aeroporturi destinatare', items=distribution(rows, 'owner')),
                      dict(id='status', title='Starea accesului', items=distribution(rows, 'status')),
                      dict(id='departments', title='Departamente sursă', items=distribution(rows, 'department'))]
        highlights = [dict(title='Documente partajate', value=len({s['document_id'] for s in shares}), detail='Documente distincte înregistrate în partajări.'),
                      dict(title='Accese care expiră în 7 zile', value=sum(s['status'] == 'active' and parse_date(s['expires_at']) is not None and 0 <= (parse_date(s['expires_at']) - reference_date).days <= 7 for s in shares), detail='Accese active cu termen apropiat.')]
        table_title, series_label = 'Registrul partajărilor', 'Partajări create'

    permitted_ids = {d['id'] for d in selected}
    events = [e for e in db.scalars(select(AuditEvent).where(AuditEvent.airport_id == user.airport_id).order_by(desc(AuditEvent.created_at), desc(AuditEvent.id)))
              if e.document_id in permitted_ids or (not department and e.actor_id == user.id)]
    recent_activity = [dict(id=e.id, action=operational_text(e.action), actor=operational_text(e.actor), document_id=e.document_id if e.document_id in permitted_ids else None,
                            title=e.document_title if e.document_id in permitted_ids else '', created_at=e.created_at) for e in events[:8]]
    series_rows = [dict(created_at=e.created_at) for e in events] if report_id == 'people' else rows
    return dict(report=definition, metrics=metrics, breakdowns=breakdowns, highlights=highlights,
                rows=rows, total=len(rows), table_title=table_title, secondary=secondary,
                currency_totals=currency_summary, activity=activity_series(series_rows, days),
                activity_label=series_label, recent_activity=recent_activity,
                departments=departments, department=department,
                reference_date=str(reference_date), generated_at=datetime.now(timezone.utc).isoformat(),
                refresh_seconds=60, scope='Înregistrări accesibile contului curent. KPI-urile descriu starea curentă; perioada selectată se aplică graficului de activitate.')


def export_csv(data):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    columns = ['number', 'title', 'department', 'status', 'owner', 'category', 'value', 'currency', 'date', 'document_id']
    writer.writerow(['Număr', 'Titlu', 'Departament', 'Stare', 'Responsabil / destinatar', 'Tip', 'Valoare', 'Monedă', 'Termen / dată', 'ID document'])
    for row in data['rows']:
        writer.writerow([safe_cell(row.get(column)) for column in columns])
    return '\ufeff' + buffer.getvalue()
