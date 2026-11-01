"""Additive leave examples, installed only by the explicit local demo launcher."""
from sqlalchemy import select
from app.config import settings
from app.people.models import LeaveRequest, User
from app.people import leave_documents
from app.people.leave_routing import leave_routes


def install_demo_leave(db, airport_id):
    if settings.auth_mode != 'demo' or settings.airport_id != airport_id:
        return
    director = db.get(User, 'admin')
    if not director or not director.active or director.airport_id != airport_id:
        return
    definitions = [
        ('technician','2026-11-09','2026-11-13','approved'),
        ('tech-baggage' if airport_id == 'craiova' else 'technical-head','2026-11-12','2026-11-16','pending'),
        ('reviewer','2026-11-17','2026-11-20','approved'),
        ('finance','2026-11-23','2026-11-25','pending'),
    ]
    created_files = []
    try:
        with db.begin_nested():
            for user_id, start, end, status in definitions:
                identifier = f'leave-calendar-{airport_id}-{user_id}'
                if db.get(LeaveRequest,identifier):
                    continue
                person = db.get(User,user_id)
                if not person or not person.active or person.airport_id != airport_id:
                    continue
                conflict = db.scalar(select(LeaveRequest.id).where(LeaveRequest.user_id == user_id,
                    LeaveRequest.status.in_(('pending','approved')), LeaveRequest.starts_at <= end,
                    LeaveRequest.ends_at >= start).limit(1))
                if conflict:
                    continue
                leave = LeaveRequest(id=identifier,user_id=user_id,starts_at=start,ends_at=end,
                    reason='Concediu de odihnă',status='pending')
                db.add(leave)
                leave_documents.write_request(db,person,leave,person,created_files)
                if status == 'approved':
                    routes = leave_routes(db, person)
                    if routes:
                        approver = routes[0].reviewer
                        leave.status='approved';leave.approver_id=approver.id
                        leave_documents.write_decision(db,approver,leave,person,'Aprobat după verificarea acoperirii echipei.',created_files)
    except Exception:
        leave_documents.discard_files(created_files)
        raise
