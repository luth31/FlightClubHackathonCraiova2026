"""Document lifecycle vocabulary shared by guards and the read-only diagram."""
ACTION_STATES = {
    'validate':('draft','in_review'), 'submit':('draft',), 'approve':('in_review',),
    'reject':('in_review',), 'sign':('approved',), 'archive':('approved','signed'),
}
LABELS = {'draft':'Ciornă', 'in_review':'În avizare', 'approved':'Aprobat', 'signed':'Semnat', 'archived':'Arhivat'}
ACTION_LABELS = {'validate':'Validare metadate', 'submit':'Trimite spre avizare', 'approve':'Aprobă',
    'reject':'Returnează pentru corectare', 'sign':'Semnează', 'archive':'Arhivează'}
TARGETS = {'submit':'in_review','approve':'approved','reject':'draft','sign':'signed','archive':'archived'}
CONDITIONS = {
    'validate':'Responsabilul sarcinii verifică metadatele versiunii curente.',
    'submit':'Metadatele trebuie validate; trimiterea deschide sarcina de avizare.',
    'approve':'Avizator autorizat și desemnat, în departamentul documentului; metadate validate.',
    'reject':'Avizatorul introduce un motiv. Metadatele revin la nevalidate și sarcina de validare se redeschide.',
    'sign':'Semnatarul desemnat semnează exact versiunea aprobată, după verificarea integrității fișierului.',
    'archive':'Director sau avizator cu acces de editare. Sarcinile rămase se anulează; semnătura existentă se păstrează.',
}


def diagram(document, version):
    transitions = [
        {'source':source, 'target':TARGETS.get(action,source), 'label':ACTION_LABELS[action],
         'action':action, 'condition':CONDITIONS[action]}
        for action,sources in ACTION_STATES.items() for source in sources
    ]
    return {'current':document.status, 'states':[{'id':key,'label':label} for key,label in LABELS.items()],
        'transitions':transitions, 'metadata_validated':document.validated,
        'version_signed':bool(version.signed_path),
        'version_note':'Încărcarea unei versiuni noi sau modificarea metadatelor creează o ciornă nouă. Validarea și aprobarea se reiau pentru noua versiune.'}
