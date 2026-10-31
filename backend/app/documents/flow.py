from collections import Counter

from app.documents import service
from app.documents.classification import STAGES, case_id, classify, normalize


def document_flow(db, user, q='', category='', status='', department='', selected_case=''):
    visible = service.visible_documents(db, user)
    permitted_ids = {document.id for document in visible}
    documents = visible
    if q:
        matching = service.matching_document_ids(db, q)
        documents = [document for document in documents if document.id in matching]
    if category:
        documents = [document for document in documents if normalize(document.category) == normalize(category)]
    if status:
        documents = [document for document in documents if document.status == status
            or (status == 'approved' and document.status == 'signed')]
    if department:
        documents = [document for document in documents if normalize(document.department) == normalize(department)]

    cases = Counter(case_id(document) for document in documents if case_id(document))
    if selected_case:
        documents = [document for document in documents if case_id(document) == selected_case]

    stages = [{**stage, 'count': 0, 'items': []} for stage in STAGES]
    by_stage = {stage['id']: stage for stage in stages}
    for document in documents:
        classification = classify(document)
        if not classification:
            continue
        item = service.serialize(document, user=user)
        item['related_ids'] = [related_id for related_id in item.get('related_ids', [])
            if related_id in permitted_ids]
        by_stage[classification['stage']]['items'].append(item)
    for stage in stages:
        stage['count'] = len(stage['items'])
    classified = sum(stage['count'] for stage in stages)
    return {
        'stages': stages,
        'total': len(documents),
        'classified_total': classified,
        'unclassified_total': len(documents) - classified,
        'cases': [{'id': identifier, 'label': identifier, 'count': count}
            for identifier, count in sorted(cases.items())],
        'categories': service.CATEGORIES,
        'departments': service.DEPARTMENTS,
    }
