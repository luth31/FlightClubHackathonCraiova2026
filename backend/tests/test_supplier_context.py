from app.database import SessionLocal
from app.suppliers.models import SupplierReview
from test_suppliers import create_case, supplier


def test_service_date_and_contract_snapshot_survive_reload(admin):
    case, _ = create_case(admin, invoice_amount=700, invoice_currency='ron', service_date='2026-11-16')
    assert case['service_date'] == '2026-11-16'
    assert case['invoice_currency'] == 'RON'
    assert case['contract_snapshot']['expires_at'] == '2026-11-15'
    assert case['contract_snapshot']['value'] == '1000.00'
    with SessionLocal() as db:
        saved = db.get(SupplierReview, case['id'])
        assert saved.service_date == case['service_date']
        assert saved.contract_snapshot == case['contract_snapshot']
        assert saved.registry_revision == supplier(admin)['registry_revision']


def test_context_without_amount_does_not_invent_currency(admin):
    case, _ = create_case(admin)
    assert case['invoice_currency'] is None
