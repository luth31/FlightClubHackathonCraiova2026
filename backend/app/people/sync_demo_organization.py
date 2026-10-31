"""Add the new demo head to an existing realm without resetting existing users."""
from app.config import settings
from app.database import SessionLocal
from app.core.exceptions import DomainError
from app.people.models import User
from app.identity import provisioning


def sync_technical_head(db):
    if settings.auth_mode != 'oidc': return {'status': 'skipped'}
    person = db.get(User, 'technical-head')
    if not person or not person.active or person.airport_id != settings.airport_id:
        raise DomainError('Contul demonstrativ de șef tehnic nu este activ.', 409)
    base, headers = provisioning.connection()
    if person.identity_subject:
        from urllib.parse import quote
        response = provisioning.request('GET', base + '/' + quote(person.identity_subject, safe=''), headers=headers)
        if response.status_code == 404:
            # Seeded UUID5 subjects are absent in realms imported before this account existed.
            from uuid import NAMESPACE_URL, uuid5
            seeded = str(uuid5(NAMESPACE_URL, f'aerodesk:{person.airport_id}:technical-head'))
            if person.identity_subject != seeded:
                raise DomainError('Identitatea asociată lipsește; verifică realm-ul înainte de a continua.', 409)
            person.identity_subject, person.identity_issuer = None, None
            person.provisioning_status = 'pending'
            db.commit()
        elif response.status_code != 200:
            raise DomainError('Identitatea Keycloak nu a putut fi verificată.', 502)
    existing = provisioning.owned_user(base, headers, person)
    if existing and person.provisioning_status == 'ready':
        person.identity_subject, person.identity_issuer = existing['id'], settings.oidc_issuer
        db.commit()
        return {'status': 'existing', 'username': existing['username']}
    person.provisioning_status = 'pending'
    db.commit()
    try:
        result = provisioning.provision(person)
    except DomainError as error:
        if getattr(error, 'identity_subject', None):
            person.identity_subject, person.identity_issuer = error.identity_subject, settings.oidc_issuer
        person.provisioning_status = 'failed'
        db.commit()
        raise
    person.identity_subject, person.identity_issuer = result['subject'], settings.oidc_issuer
    person.provisioning_status = 'failed' if result.get('invitation_status') == 'failed' else 'ready'
    db.commit()
    return {'status': 'created', 'username': provisioning.username(person), **result}


def main():
    with SessionLocal() as db:
        try:
            result = sync_technical_head(db)
        except DomainError as error:
            db.rollback()
            raise SystemExit(error.message) from error
    print(f"{settings.airport_id}: technical-head {result['status']}", flush=True)
    if result.get('temporary_password'):
        print(f"Cont: {result['username']} · Parola inițială: {result['temporary_password']}", flush=True)
        print('Schimbă parola la prima conectare. Datele existente au fost păstrate.', flush=True)
    if result.get('invitation_status') == 'failed':
        raise SystemExit('Cont creat; instrucțiunile de activare nu au putut fi livrate. Reîncearcă din Echipă.')


if __name__ == '__main__':
    main()
