from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import Session

from app.database import Base
from app.people.models import User
from app.equipment.models import Equipment, EquipmentIncident, EquipmentTeam, EquipmentTeamMember


def test_demo_equipment_is_additive_and_preserves_followup_and_accounts(tmp_path, monkeypatch):
    source = Path(__file__).resolve().parents[2] / 'scripts' / 'demo_equipment.py'
    spec = spec_from_file_location('demo_equipment_seed_test', source)
    module = module_from_spec(spec); spec.loader.exec_module(module)
    monkeypatch.setattr(module, 'hash_password', lambda password:'test-hash')
    engine = create_engine('sqlite:///' + str(tmp_path / 'demo-equipment.db'))
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        for uid in ('technical-head','technician'):
            db.add(User(id=uid,name=uid,email=uid+'@craiova.example',department='Tehnic',department_id='dept-tehnic',
                role='Tehnician',roles=['technician'],airport_id='craiova',active=True,password_hash='kept-password'))
        db.add(Equipment(id='existing-asset',airport_id='craiova',code='BB-02',name='Nume păstrat',category='Bagaje',
            location='Locație păstrată',department='Tehnic',status='out_of_service',supplier='',revision=4,
            created_at='2026-10-01',updated_at='2026-10-01'))
        db.commit()
        module.install_demo_equipment(db,'craiova'); db.commit()
        assert db.scalar(select(func.count()).select_from(Equipment)) == 8
        assert db.scalar(select(func.count()).select_from(EquipmentTeam)) == 4
        assert db.scalar(select(func.count()).select_from(User)) == 6
        existing = db.get(Equipment,'existing-asset')
        assert existing.name == 'Nume păstrat' and existing.status == 'out_of_service' and existing.revision == 4
        assert existing.support_team_id
        existing.support_team_id = None
        member=db.get(User,'tech-baggage');member.name='Nume actualizat';member.active=False
        incident=db.scalar(select(EquipmentIncident));incident.status='resolved'
        before_members=db.scalar(select(func.count()).select_from(EquipmentTeamMember))
        db.commit()
        module.install_demo_equipment(db,'craiova');db.commit()
        assert db.scalar(select(func.count()).select_from(Equipment)) == 8
        assert db.scalar(select(func.count()).select_from(EquipmentTeamMember)) == before_members
        assert existing.support_team_id is None
        assert member.name == 'Nume actualizat' and not member.active
        assert incident.status == 'resolved'
        assert db.get(User,'technician').password_hash == 'kept-password'
    engine.dispose()
