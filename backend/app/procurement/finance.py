"""Exact gross invoice reconciliation and append-only cash ledger interpretation."""
from sqlalchemy import select
from app.procurement.catalog import money
from app.procurement.evidence import ZERO
from app.procurement.models import ProcurementPayment


def ledger(db, case):
    return list(db.scalars(select(ProcurementPayment).where(ProcurementPayment.case_id == case.id)
                          .order_by(ProcurementPayment.created_at, ProcurementPayment.id)))


def net_paid(entries, invoice_id=None):
    entries_by_id = {entry.id: entry for entry in entries}
    result = ZERO
    for entry in entries:
        if invoice_id and entry.invoice_id != invoice_id: continue
        amount = money(entry.amount)
        if entry.kind == 'payment': result += amount
        elif entry.kind == 'refund': result -= amount
        elif entry.kind == 'reversal':
            original = entries_by_id.get(entry.reversed_entry_id)
            if original: result += -amount if original.kind == 'payment' else amount
    return result


def balances(db, case, evidence):
    entries = ledger(db, case)
    rows = []
    for association in evidence.typed('invoice'):
        ident = association.document_id
        doc = evidence.records[ident]
        gross = money(doc.value or '0.00')
        credit = ZERO
        for note in evidence.typed('credit_note'):
            parents = evidence.related(note.document_id, 'credits_invoice', ('invoice',))
            if (evidence.approved(note) and len(parents) == 1 and parents[0].document_id == ident and
                    evidence.matches_award(note.document_id)):
                credit += money(evidence.fields(note.document_id).get('credit_amount', '0.00'))
        net = gross - credit
        paid = net_paid(entries, ident)
        rows.append(dict(document_id=ident, title=doc.title, gross=gross, credit=credit, net=net, paid=paid,
                         outstanding=max(net-paid, ZERO), overpaid=max(paid-net, ZERO)))
    totals = dict(committed=money(case.committed_value), accepted=evidence.accepted_total(),
                  invoiced=sum((r['gross'] for r in rows), ZERO), credited=sum((r['credit'] for r in rows), ZERO),
                  paid=net_paid(entries), outstanding=sum((r['outstanding'] for r in rows), ZERO),
                  overpaid=sum((r['overpaid'] for r in rows), ZERO))
    totals['invoices'] = [{key: format(value, '.2f') if key not in ('document_id', 'title') else value
                           for key, value in row.items()} for row in rows]
    return {key: format(value, '.2f') if key != 'invoices' else value for key, value in totals.items()}
