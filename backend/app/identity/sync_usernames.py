"""One-time, idempotent username upgrade for existing Keycloak identities."""
from types import SimpleNamespace
from sqlalchemy import select
from app.config import settings
from app.core.audit import record
from app.core.exceptions import DomainError
from app.database import SessionLocal
from app.people.models import User
from app.identity import provisioning


def main():
    if settings.auth_mode != 'oidc':
        raise SystemExit('Username synchronization requires OIDC configuration.')
    actor = SimpleNamespace(id='system:keycloak-username-sync', name='Sincronizare utilizatori Keycloak')
    changed = checked = failed = 0
    with SessionLocal() as db:
        people = list(db.scalars(select(User).where(User.airport_id == settings.airport_id,
            User.identity_issuer == settings.oidc_issuer, User.identity_subject.is_not(None))))
        for person in people:
            try:
                if provisioning.rename_username(person):
                    changed += 1
                    record(db, actor, 'employee_login_username_updated', detail=f'{person.id}; {provisioning.username(person)}')
                    db.commit()
                checked += 1
            except DomainError as error:
                db.rollback()
                failed += 1
                print(f'{person.id}: {error.message}', flush=True)
    print(f'{settings.airport_id}: verified={checked}, renamed={changed}, failed={failed}', flush=True)
    if failed: raise SystemExit(1)


if __name__ == '__main__':
    main()
