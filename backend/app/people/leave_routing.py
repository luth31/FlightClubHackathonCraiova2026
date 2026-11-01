"""Current leave-approval coverage, independent of document signing authority."""
from dataclasses import dataclass

from sqlalchemy import select

from app.config import settings
from app.core.security import has_role
from app.people.models import Delegation, Department, LeaveRequest, User


def hierarchy_reviewers(db, subject):
    def local(person):
        return person and person.airport_id == subject.airport_id

    if subject.manager_id:
        manager = db.get(User, subject.manager_id)
        return [manager] if local(manager) and manager.id != subject.id else []
    if has_role(subject, 'director'):
        return [subject]
    department = db.get(Department, subject.department_id) if subject.department_id else None
    if department and department.airport_id == subject.airport_id and department.head_user_id != subject.id:
        if department.head_user_id:
            head = db.get(User, department.head_user_id)
            return [head] if local(head) else []
    return [person for person in db.scalars(select(User).where(
        User.airport_id == subject.airport_id, User.active == True)) if has_role(person, 'director')]


def can_delegate_approvals(db, person):
    if not person.active or person.airport_id != settings.airport_id:
        return False
    from app.people.management import is_head
    return bool(has_role(person, 'reviewer', 'director', 'department_head') or is_head(db, person)
                or db.scalar(select(User.id).where(User.manager_id == person.id,
                    User.airport_id == person.airport_id, User.active == True).limit(1)))


@dataclass
class LeaveRoute:
    reviewer: User
    principal: User
    via: str = 'direct'

    def summary(self):
        result = {'id': self.reviewer.id, 'name': self.reviewer.name}
        if self.reviewer.id != self.principal.id:
            result.update(delegated_from_id=self.principal.id, delegated_from_name=self.principal.name, via=self.via)
        return result


def leave_routes(db, subject):
    """Use a dated replacement, then the absent principal's own reporting line.

    An active delegation also represents a planned absence without a leave record.
    Chat presence is intentionally not an authorization signal. Never allow a
    delegate to approve their own request or route through a cycle/foreign user.
    """
    today = settings.reference_date.isoformat()
    roots = hierarchy_reviewers(db, subject)
    self_approval = has_role(subject, 'director') and not subject.manager_id

    def resolve(person, seen, escalate=True):
        if (not person or person.airport_id != subject.airport_id or person.id in seen
                or person.id == subject.id and (not self_approval or seen)):
            return []
        visited = seen | {person.id}
        delegations = list(db.scalars(select(Delegation).where(
            Delegation.from_user == person.id, Delegation.active == True,
            Delegation.starts_at <= today, Delegation.ends_at >= today).order_by(Delegation.id)))
        # Offboarding revokes delegations; stale grants from disabled users confer no authority.
        if person.active:
            for delegation in delegations:
                target = db.get(User, delegation.to_user)
                if target and target.active and target.airport_id == subject.airport_id and can_delegate_approvals(db, target):
                    covered = resolve(target, visited, escalate=False)
                    if covered:
                        return [(reviewer, 'delegation') for reviewer, _ in covered]
        on_leave = db.scalar(select(LeaveRequest.id).where(
            LeaveRequest.user_id == person.id, LeaveRequest.status == 'approved',
            LeaveRequest.starts_at <= today, LeaveRequest.ends_at >= today).limit(1)) is not None
        if person.active and not on_leave and not delegations:
            return [(person, 'direct')]
        if escalate:
            return [(reviewer, 'hierarchy') for superior in hierarchy_reviewers(db, person)
                    for reviewer, _ in resolve(superior, visited)]
        return []

    routes = {}
    for principal in roots:
        for reviewer, via in resolve(principal, set()):
            routes.setdefault(reviewer.id, LeaveRoute(reviewer, principal, via))
    return list(routes.values())
