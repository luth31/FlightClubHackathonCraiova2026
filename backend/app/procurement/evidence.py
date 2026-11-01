"""Version-bound evidence resolution and business-stage prerequisites."""
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from sqlalchemy import select
from app.config import settings
from app.documents.models import Document, DocumentVersion
from app.documents.service import file_hash
from app.procurement import catalog
from app.procurement.models import ProcurementCaseDocument, ProcurementDocumentLink, ProcurementInvoiceAllocation

ZERO = Decimal('0.00')


class Evidence:
    def __init__(self, db, case):
        self.case = case
        self.associations = list(db.scalars(select(ProcurementCaseDocument).where(ProcurementCaseDocument.case_id == case.id)))
        self.links = list(db.scalars(select(ProcurementDocumentLink).where(ProcurementDocumentLink.case_id == case.id)))
        self.allocations = list(db.scalars(select(ProcurementInvoiceAllocation).where(ProcurementInvoiceAllocation.case_id == case.id)))
        self.documents = {}
        self.versions = {}
        self.records = {}
        for association in self.associations:
            doc = db.get(Document, association.document_id)
            version = db.scalar(select(DocumentVersion).where(DocumentVersion.document_id == association.document_id,
                                                            DocumentVersion.version == association.version))
            self.documents[association.document_id] = doc
            self.versions[association.document_id] = version
            record = doc
            if doc and version and association.version != doc.version:
                values = {key: getattr(doc, key) for key in ('id', 'title', 'number', 'category', 'supplier', 'value', 'currency', 'expires_at', 'extra')}
                snapshot = version.snapshot or {}
                for key in ('title', 'number', 'category', 'supplier', 'value', 'currency', 'expires_at'):
                    if key in snapshot: values[key] = snapshot[key]
                if 'metadata' in snapshot: values['extra'] = {'metadata': snapshot['metadata']}
                record = SimpleNamespace(**values)
            self.records[association.document_id] = record

    def association(self, ident):
        return next((a for a in self.associations if a.document_id == ident), None)

    def typed(self, *types):
        return [a for a in self.associations if a.template_id in types]

    def fields(self, ident):
        association = self.association(ident)
        return catalog.document_fields(self.records[ident], association.template_id) if association and self.records.get(ident) else {}

    def stale(self, association):
        doc = self.documents.get(association.document_id)
        return not doc or doc.airport_id != self.case.airport_id or doc.version != association.version

    def link_stale(self, link):
        source, target = self.association(link.source_id), self.association(link.target_id)
        return (not source or not target or self.stale(source) or self.stale(target) or
                source.version != link.source_version or target.version != link.target_version)

    def related(self, source, kind, target_types=()):
        targets = []
        for link in self.links:
            target = self.association(link.target_id)
            if (link.source_id == source and link.type == kind and not self.link_stale(link) and target and
                    (not target_types or target.template_id in target_types)):
                targets.append(target)
        return targets

    def errors(self, association, *, approval=True):
        doc = self.documents.get(association.document_id)
        version = self.versions.get(association.document_id)
        if not doc or not version or doc.airport_id != self.case.airport_id: return ['Dovadă indisponibilă.']
        if self.stale(association): return ['Versiune înlocuită; actualizează asocierea și legăturile.']
        errors = catalog.document_errors(doc, association.template_id)
        if catalog.namespace(doc).get('template_id') != association.template_id:
            errors.append('Confirmă șablonul și metadatele documentului.')
        if approval and (doc.status not in ('approved', 'signed', 'archived') or not version.approved_by or not version.approved_at):
            errors.append('Este necesară aprobarea exactă a versiunii asociate.')
        if not Path(version.file_path).is_file() or file_hash(version.file_path) != version.sha256:
            errors.append('Integritatea PDF-ului nu poate fi confirmată.')
        return errors

    def approved(self, association):
        return not self.errors(association)

    def matches_award(self, ident):
        doc, primary = self.records.get(ident), self.records.get(self.case.primary_document_id)
        return bool(doc and primary and doc.currency == self.case.currency and doc.supplier and primary.supplier and
                    doc.supplier.strip().casefold() == primary.supplier.strip().casefold())

    def under_primary(self, association):
        if association.document_id == self.case.primary_document_id: return True
        return (association.template_id == 'purchase_order' and self.matches_award(association.document_id) and any(
            target.document_id == self.case.primary_document_id for target in self.related(association.document_id, 'fulfills_request', ('contract',))))

    def delivery_valid(self, association):
        return self.approved(association) and any(self.approved(parent) and self.under_primary(parent)
            for parent in self.related(association.document_id, 'delivers_against', ('contract', 'purchase_order')))

    def acceptance_valid(self, association):
        fields = self.fields(association.document_id)
        return (self.approved(association) and self.records[association.document_id].currency == self.case.currency and
                fields.get('verdict') in ('accepted', 'reserved') and
                (fields.get('verdict') == 'accepted' or fields.get('resolved') is True) and
                any(self.delivery_valid(delivery) for delivery in self.related(association.document_id, 'accepts_delivery', ('inbound_delivery', 'service_report'))))

    def accepted_total(self):
        return sum((catalog.money(self.fields(a.document_id).get('accepted_amount', '0.00'))
                    for a in self.typed('acceptance') if self.acceptance_valid(a)), ZERO)

    def commitment(self):
        primary = self.association(self.case.primary_document_id)
        errors = []
        if not primary or primary.template_id not in ('contract', 'purchase_order'):
            return ZERO, ['Selectează contractul sau comanda principală.']
        errors += self.errors(primary)
        primary_doc = self.records[primary.document_id]
        if primary_doc.currency != self.case.currency or not primary_doc.supplier:
            errors.append('Contractul / comanda necesită furnizor și moneda dosarului.')
        total = catalog.money(primary_doc.value or '0.00')
        if total <= ZERO: errors.append('Angajamentul principal trebuie să aibă valoare pozitivă.')
        if primary.template_id == 'contract' and self.fields(primary.document_id).get('effective_date', '') > settings.reference_date.isoformat():
            errors.append('Contractul principal nu este încă în vigoare.')
        if primary.template_id == 'purchase_order' and self.related(primary.document_id, 'fulfills_request', ('contract',)):
            errors.append('Comanda principală trebuie să fie autonomă; selectează contractul părinte.')
        for order in self.typed('purchase_order'):
            if order.document_id != primary.document_id and not self.under_primary(order):
                errors.append('Comanda secundară trebuie legată de contractul principal, cu același furnizor și aceeași monedă.')
        for addendum in self.typed('addendum'):
            errors += self.errors(addendum)
            parents = self.related(addendum.document_id, 'amends_contract', ('contract',))
            if len(parents) != 1 or parents[0].document_id != primary.document_id:
                errors.append('Fiecare act adițional trebuie legat de contractul principal.')
            if not self.matches_award(addendum.document_id): errors.append('Actul adițional are furnizor / monedă diferite.')
            fields = self.fields(addendum.document_id)
            if fields.get('effective_date') and fields['effective_date'] <= settings.reference_date.isoformat() and self.approved(addendum):
                total += catalog.money(fields.get('value_delta', '0.00'), signed=True)
        if total <= ZERO: errors.append('Angajamentul rezultat trebuie să fie pozitiv.')
        return total, errors

    def unresolved_branches(self):
        result = []
        for association in self.typed('return_order', 'replacement_order', 'outbound_delivery'):
            if self.errors(association) or self.fields(association.document_id).get('resolved') is not True or not self.related(association.document_id, 'returns_delivery'):
                result.append('Rezolvă documentele de retur / înlocuire și constatări înainte de progresie.')
        for association in self.typed('acceptance'):
            fields = self.fields(association.document_id)
            if fields.get('verdict') == 'rejected' or (fields.get('verdict') == 'reserved' and fields.get('resolved') is not True):
                result.append('Recepția are respingeri sau rezerve nerezolvate.')
        return result

    def invoice_errors(self, ident, *, approval=True):
        invoice = self.association(ident)
        if not invoice or invoice.template_id != 'invoice': return ['Factura nu este asociată dosarului.']
        errors = self.errors(invoice, approval=approval)
        if not self.matches_award(ident): errors.append('Factura trebuie să corespundă furnizorului și monedei angajamentului.')
        if not any(self.under_primary(award) and self.approved(award) for award in self.related(ident, 'invoices_against', ('contract', 'purchase_order'))):
            errors.append('Leagă factura de contractul sau comanda aprobată.')
        accepted = self.related(ident, 'invoices_against', ('acceptance',))
        if not accepted or not all(self.acceptance_valid(a) for a in accepted):
            errors.append('Factura necesită recepții aprobate și rezolvate.')
        allocations = [a for a in self.allocations if a.invoice_id == ident]
        amount = catalog.money(self.records[ident].value or '0.00')
        if amount <= ZERO: errors.append('Factura trebuie să aibă o valoare pozitivă.')
        if sum((catalog.money(a.amount) for a in allocations), ZERO) != amount:
            errors.append('Alocă întreaga valoare brută a facturii către recepții.')
        for allocation in allocations:
            acceptance = self.association(allocation.acceptance_id)
            if (allocation.invoice_version != invoice.version or not acceptance or
                    allocation.acceptance_version != acceptance.version or
                    allocation.acceptance_id not in [a.document_id for a in accepted] or not self.acceptance_valid(acceptance)):
                errors.append('Actualizează versiunile și legăturile alocărilor facturii.')
        for acceptance in self.typed('acceptance'):
            consumed = sum((catalog.money(a.amount) for a in self.allocations if a.acceptance_id == acceptance.document_id), ZERO)
            capacity = catalog.money(self.fields(acceptance.document_id).get('accepted_amount', '0.00'))
            if consumed > capacity: errors.append('Alocările cumulate depășesc valoarea acceptată.')
        return errors

    def credit_errors(self):
        errors = []
        totals = {}
        for credit in self.typed('credit_note'):
            errors += self.errors(credit)
            parents = self.related(credit.document_id, 'credits_invoice', ('invoice',))
            if len(parents) != 1 or not self.matches_award(credit.document_id):
                errors.append('Confirmă factura părinte, furnizorul și moneda notei de credit.')
                continue
            ident = parents[0].document_id
            amount = catalog.money(self.fields(credit.document_id).get('credit_amount', '0.00'))
            if amount <= ZERO: errors.append('Nota de credit trebuie să aibă valoare pozitivă.')
            totals[ident] = totals.get(ident, ZERO) + amount
        for ident, amount in totals.items():
            if amount > catalog.money(self.records[ident].value or '0.00'):
                errors.append('Notele de credit cumulate depășesc valoarea brută a facturii.')
        return errors

    def stage_errors(self, db):
        from app.procurement.finance import balances
        errors = []
        if any(self.stale(a) for a in self.associations): errors.append('Actualizează dovezile înlocuite înainte de progresie.')
        if any(self.link_stale(link) for link in self.links): errors.append('Confirmă legăturile cu versiunile curente.')
        stage = self.case.stage
        if stage in ('paid', 'cancelled'): return ['Dosarul trebuie redeschis pentru modificări.']
        if stage == 'draft':
            for kind in ('necessity', 'specifications'):
                items = self.typed(kind)
                if not items: errors.append('Adaugă referatul de necesitate și caietul de sarcini aprobate.')
                for item in items: errors += self.errors(item)
            for spec in self.typed('specifications'):
                if not self.related(spec.document_id, 'specifies_need', ('necessity',)):
                    errors.append('Leagă caietul de sarcini de necesitate.')
            for necessity in self.typed('necessity'):
                if self.records[necessity.document_id].currency != self.case.currency: errors.append('Moneda necesității diferă de dosar.')
        if stage == 'needs_review':
            commitment, commitment_errors = self.commitment()
            errors += commitment_errors
            financial = balances(db, self.case, self)
            errors += self.credit_errors()
            allocated = sum((catalog.money(a.amount) for a in self.allocations), ZERO)
            credited = sum((min(catalog.money(row['credit']), sum((catalog.money(a.amount) for a in self.allocations
                if a.invoice_id == row['document_id']), ZERO)) for row in financial['invoices']), ZERO)
            if commitment < allocated - credited:
                errors.append('Angajamentul redus contrazice alocările existente; reconciliază înainte.')
            if commitment < catalog.money(financial['paid']): errors.append('Angajamentul redus contrazice plățile; reconciliază înainte.')
        if stage in ('committed', 'accepted', 'invoiced'):
            _, commitment_errors = self.commitment()
            errors += commitment_errors
            if self.commitment()[0] != catalog.money(self.case.committed_value):
                errors.append('Angajamentul s-a schimbat; returnează dosarul pentru o nouă decizie.')
            errors += self.unresolved_branches()
        if stage in ('committed', 'accepted', 'invoiced'):
            if not self.typed('acceptance') or self.accepted_total() < catalog.money(self.case.committed_value):
                errors.append('Valoarea recepționată nu acoperă întregul angajament.')
        if stage in ('accepted', 'invoiced'):
            if not self.typed('invoice'): errors.append('Adaugă facturile aprobate.')
            for invoice in self.typed('invoice'): errors += self.invoice_errors(invoice.document_id)
            errors += self.credit_errors()
            financial = balances(db, self.case, self)
            if catalog.money(financial['invoiced']) - catalog.money(financial['credited']) != catalog.money(self.case.committed_value):
                errors.append('Facturile nete trebuie să corespundă angajamentului; reconciliază valoarea și alocările.')
            if catalog.money(financial['overpaid']) > ZERO: errors.append('Există o supraplată; înregistrează rambursarea reală.')
            if stage == 'invoiced' and catalog.money(financial['outstanding']) > ZERO:
                errors.append('Înregistrează plata integrală înainte de închidere.')
        return list(dict.fromkeys(errors))
