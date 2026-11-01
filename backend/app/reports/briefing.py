"""Permission-scoped daily management briefing. No synthetic operational KPIs."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import select

from app.config import settings
from app.core.models import AuditEvent
from app.reports import service

BUCHAREST = ZoneInfo('Europe/Bucharest')


local_day = service.calendar_day


def build(db, user, department='', today=None):
    today = today or datetime.now(BUCHAREST).date()
    catalog = service.catalog(db, user)
    reports = {definition['id']: service.report(db, user, definition['id'], 90, department, reference_date=today)
               for definition in catalog['items']}
    documents = reports['documents']['rows']
    tasks = reports['approvals']['rows']
    pending = [r for r in tasks if r['status'] == 'pending']
    contracts = reports.get('contracts', {}).get('rows', [])
    live_contracts = [r for r in contracts if r['status'] != 'archived' and r.get('validated')]
    people = reports.get('people', {}).get('rows', [])
    suppliers = reports.get('suppliers', {}).get('rows', [])
    ids = {r['document_id'] for r in documents}
    events = [event for event in db.scalars(select(AuditEvent).where(AuditEvent.airport_id == user.airport_id))
              if event.document_id in ids]
    first_day = today - timedelta(days=29)
    timeline = {str(first_day + timedelta(days=i)): {'date': str(first_day + timedelta(days=i)), 'documents': 0, 'actions': 0} for i in range(30)}
    for row in documents:
        key = str(local_day(row.get('created_at')))
        if key in timeline:
            timeline[key]['documents'] += 1
    for event in events:
        key = str(local_day(event.created_at))
        if key in timeline:
            timeline[key]['actions'] += 1

    def days(row):
        stamp = service.parse_date(row.get('date'))
        return (stamp - today).days if stamp else None

    due_contracts = [r for r in live_contracts if days(r) is not None and 0 <= days(r) <= 30]
    expired_contracts = [r for r in live_contracts if days(r) is not None and days(r) < 0]
    overdue = [r for r in pending if r.get('overdue')]
    priorities = []

    def priority(row, kind, report_id, reason, severity, remaining=None):
        priorities.append(dict(id=f'{kind}-{row["id"]}', document_id=row.get('document_id'),
            title=row['title'], number=row.get('number', ''), owner=row['owner'], department=row['department'],
            report_id=report_id, reason=reason, severity=severity, days=remaining, date=row.get('date'), kind=kind))

    for row in pending:
        remaining = days(row)
        if row.get('assignment_state') == 'needs_reassignment':
            priority(row, 'assignment', 'approvals', 'Fără responsabil eligibil', 'critical', remaining)
        elif remaining is not None and remaining <= 0:
            priority(row, 'decision', 'approvals', 'Decizie întârziată' if remaining < 0 else 'Decizie scadentă azi', 'critical' if remaining < 0 else 'warning', remaining)
    for row in expired_contracts + due_contracts:
        remaining = days(row)
        priority(row, 'contract', 'contracts', 'Termen contractual depășit' if remaining < 0 else 'Contract de reînnoit', 'critical' if remaining < 0 else 'warning', remaining)
    for row in documents:
        if not row.get('validated') and row['status'] != 'archived':
            priority(row, 'validation', 'documents', 'Metadate de validat', 'warning')
        if 'maintenance' in reports and row['department'] == 'Tehnic' and row.get('validated') and row['status'] != 'archived' and days(row) is not None and days(row) < 0 and row['category'] != 'Contract':
            priority(row, 'technical', 'maintenance', 'Termen tehnic depășit', 'critical', days(row))
    for row in suppliers:
        if row['status'] in ('needs_review', 'verified'):
            priority(row, 'supplier', 'suppliers', 'Verificare furnizor deschisă', 'critical' if row['category'] in ('high', 'critical') else 'warning')
    priorities.sort(key=lambda r: (r['severity'] != 'critical', r['days'] if r['days'] is not None else 9999, r['title']))
    workload = []
    for name in sorted({r['department'] for r in documents} | {r['department'] for r in pending}):
        subset = [r for r in pending if r['department'] == name]
        workload.append(dict(name=name, pending=len(subset), overdue=sum(bool(r.get('overdue')) for r in subset),
            documents=sum(r['department'] == name for r in documents)))
    workload.sort(key=lambda item: (-item['pending'], item['name']))

    previews = []
    for identifier, data in reports.items():
        rows = data['rows']
        breakdown_id = {'overview': 'status', 'documents': 'categories', 'contracts': 'status', 'approvals': 'status',
                        'procurement': 'stages', 'suppliers': 'risk', 'people': 'availability', 'sharing': 'status', 'maintenance': 'categories'}[identifier]
        series = next((b['items'] for b in data['breakdowns'] if b['id'] == breakdown_id), [])
        if identifier == 'contracts':
            series = [dict(name='Depășite', value=len(expired_contracts)), dict(name='În 30 zile', value=len(due_contracts)),
                      dict(name='Peste 30 zile', value=sum(days(r) is not None and days(r) > 30 for r in live_contracts)),
                      dict(name='Fără termen validat', value=sum(not r.get('validated') or not r.get('date') for r in rows if r['status'] != 'archived'))]
        previews.append(dict(report=data['report'], total=data['total'], metrics=data['metrics'],
            series=series, currency_totals=data['currency_totals'], highlights=data['highlights']))
    deadlines = sorted([dict(**row, remaining=days(row)) for row in live_contracts if days(row) is not None and 0 <= days(row) <= 30], key=lambda r: r['remaining'])
    return dict(catalog=catalog, airport=settings.airport_name, date=str(today), demo_reference_date=str(settings.reference_date),
        generated_at=datetime.now(timezone.utc).isoformat(), department=department,
        departments=sorted(set(reports['documents']['departments']) | set(reports.get('people', {}).get('departments', []))),
        summary=dict(documents=len(documents), approved=sum(r['status'] in ('approved', 'signed') for r in documents),
            validated=sum(bool(r.get('validated')) for r in documents), new_today=timeline[str(today)]['documents'],
            actions_today=timeline[str(today)]['actions'], pending=len(pending), overdue=len(overdue),
            due_today=sum(r.get('date') == str(today) for r in pending), contracts=len(contracts),
            expiring_contracts=len(due_contracts), expired_contracts=len(expired_contracts),
            people=len(people), available=sum(r['status'] == 'available' for r in people),
            currency_totals=reports.get('contracts', {}).get('currency_totals', []),
            high_risk=sum(r['category'] in ('high', 'critical') and r['status'] in ('needs_review', 'verified') for r in suppliers)),
        timeline=list(timeline.values()), workload=workload, priorities=priorities, deadlines=deadlines, reports=previews,
        analysis=dict(documents=documents, tasks=tasks, contracts=contracts,
            events=[dict(document_id=event.document_id, created_at=event.created_at) for event in events]),
        coverage=dict(dated_contracts=sum(bool(r.get('date')) for r in contracts),
            valued_contracts=sum(r.get('value') is not None for r in contracts),
            scope='Date administrative din FlyLeaf. Indicatorii de trafic aerian nu au o sursă conectată.'))
