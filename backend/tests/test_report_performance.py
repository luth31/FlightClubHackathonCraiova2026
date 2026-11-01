"""Keep dashboard query growth tied to source data, not duplicated card rendering."""
from copy import deepcopy
from uuid import uuid4

from sqlalchemy import event

from app.database import engine
from app.documents.models import Document


def test_dashboard_does_not_repeat_document_scans_or_edit_permission_queries(admin, db):
    def measure():
        queries = []

        def capture(connection, cursor, statement, parameters, context, executemany):
            queries.append(' '.join(statement.lower().split()))

        event.listen(engine, 'before_cursor_execute', capture)
        try:
            response = admin.get('/api/reports/briefing')
        finally:
            event.remove(engine, 'before_cursor_execute', capture)
        assert response.status_code == 200, response.text
        return response.json(), queries

    before, baseline_queries = measure()
    template = db.get(Document, 'test-tech')
    fields = {column.key: deepcopy(getattr(template, column.key)) for column in Document.__table__.columns if column.key != 'id'}
    added = [Document(id='report-perf-'+uuid4().hex, **deepcopy(fields)) for _ in range(24)]
    try:
        db.add_all(added)
        db.commit()
        after, queries = measure()
        assert after['summary']['documents'] == before['summary']['documents'] + len(added)
        assert len(after['reports']) == len(before['reports'])
        # A read-only document contributes data, not per-card edit-authority checks.
        department_queries = lambda statements: sum('from departments ' in sql for sql in statements)
        assert department_queries(queries) <= department_queries(baseline_queries) + 4
        document_scans = [sql for sql in queries if 'from documents where documents.airport_id =' in sql]
        assert len(document_scans) == 1
    finally:
        for document in added:
            db.delete(document)
        db.commit()
