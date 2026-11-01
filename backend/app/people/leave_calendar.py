"""A minimal absence projection for planning, separate from private leave files."""
from sqlalchemy import select
from app.core.exceptions import DomainError
from app.people.models import LeaveRequest, User


def calendar(db, user, starts_at, ends_at):
    if ends_at < starts_at or (ends_at - starts_at).days > 366:
        raise DomainError('Alege un interval de cel mult un an pentru calendar.', 422)
    rows = db.execute(select(LeaveRequest, User).join(User, User.id == LeaveRequest.user_id).where(
        User.airport_id == user.airport_id, User.active == True,
        LeaveRequest.status.in_(('pending', 'approved')),
        LeaveRequest.starts_at <= ends_at.isoformat(), LeaveRequest.ends_at >= starts_at.isoformat()
    ).order_by(LeaveRequest.starts_at, User.name, LeaveRequest.id)).all()
    return {'starts_at': starts_at.isoformat(), 'ends_at': ends_at.isoformat(), 'items': [
        {'id': leave.id, 'user_id': person.id, 'name': person.name, 'department': person.department,
         'starts_at': leave.starts_at, 'ends_at': leave.ends_at, 'status': leave.status}
        for leave, person in rows
    ]}
