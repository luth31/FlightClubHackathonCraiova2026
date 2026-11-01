#!/usr/bin/env python3
"""Generate additive, fictional procurement dossiers with explicit document relationships.

Run: python scripts/generate_procurement_scenarios.py
Existing corpus records and user edits are never overwritten by the application seed.
"""
import hashlib
import json
from collections import Counter

import generate_corpus as corpus
from pypdf import PdfReader


def source(identifier, kind='flow', label=''):
    return {'source_id': identifier, 'kind': kind, 'label': label}


def scenarios():
    # Local identifiers resolve within their dossier, never between unrelated cases.
    return [
        ('01', 'Balizaj · livrare parțială și retur', 'Două loturi, o recepție returnată și o corecție de factură.', [
            ('contract', 'Contract', 'Piese pentru balizaj', 'approved', [],
             'Contract fictiv pentru 32 de repere, livrate în două loturi: 24 în lotul A și 8 în lotul B.'),
            ('delivery-a', 'Livrare de intrare', 'Lot A · 24 repere', 'approved', [source('contract')],
             'Aviz pentru cele 24 de repere din lotul A. Documentul însoțește prima livrare.'),
            ('delivery-b', 'Livrare de intrare', 'Lot B · 8 repere', 'approved', [source('contract')],
             'Aviz pentru 8 repere din lotul B. Conformitatea este stabilită separat la recepție.'),
            ('receipt-a', 'Proces-verbal de recepție', 'Lot A · acceptat', 'approved', [source('delivery-a')],
             'Toate cele 24 de repere din lotul A sunt acceptate în scenariu; cantitățile și anexele sunt complete.'),
            ('receipt-b', 'Proces-verbal de recepție', 'Lot B · neconform', 'rejected', [source('delivery-b')],
             'Recepția lotului B este returnată: etichetele celor 8 repere nu corespund anexelor. Documentarea returului este în curs.'),
            ('return-order', 'Comandă de retur', 'Retur lot B', 'in_review', [source('receipt-b', 'correction', 'Retur lot B')],
             'Propunere de retur pentru cele 8 repere neacceptate. Comanda este în aprobare; expedierea nu este confirmată.'),
            ('return-delivery', 'Livrare de ieșire', 'Expediere retur · propusă', 'draft', [source('return-order')],
             'Aviz de retur în ciornă pentru lotul B. Nu reprezintă dovada unei expedieri deja efectuate.'),
            ('invoice', 'Factură', 'Loturile A + B · de reconciliat', 'in_review', [source('receipt-a'), source('receipt-b'), source('contract', 'reference', 'Contract')],
             'Factura cuprinde ambele loturi. Recepția neacceptată a lotului B trebuie reconciliată înaintea unei decizii; aplicația nu execută plăți.'),
            ('credit', 'Notă de credit', 'Corecție lot B · propusă', 'draft', [source('invoice', 'correction', 'Corecție factură')],
             'Notă de credit în ciornă, propusă pentru pozițiile lotului B din factură. Documentul inițial rămâne în dosar.'),
        ]),
        ('02', 'Arhivă digitală · recepție comună', 'Două livrabile independente reunite într-o singură recepție.', [
            ('contract', 'Contract', 'UPS și restaurare arhivă', 'approved', [],
             'Contract fictiv cu două livrabile: revizia UPS și verificarea restaurării arhivei de test.'),
            ('amendment', 'Act adițional', 'Anexe de trasabilitate', 'in_review', [source('contract', 'related', 'Act adițional')],
             'Propunere privind identificarea anexelor. Nu modifică automat contractul aprobat.'),
            ('ups', 'Raport de prestare', 'Revizie UPS', 'approved', [source('contract')],
             'Raport separat pentru revizia UPS; identifică echipamentul și documentele predate.'),
            ('restore', 'Raport de prestare', 'Restaurare · 40 fișiere', 'approved', [source('contract')],
             'Raport separat: toate cele 40 de fișiere fictive din setul de test au fost restaurate.'),
            ('receipt', 'Proces-verbal de recepție', 'UPS + arhivă · acceptate', 'approved', [source('ups'), source('restore')],
             'Recepție comună, bazată pe ambele rapoarte: UPS și restaurare. Niciun raport nu este omis din justificare.'),
            ('invoice', 'Factură', 'Servicii recepționate', 'approved', [source('receipt'), source('contract', 'reference', 'Contract')],
             'Factura fictivă reunește cele două servicii recepționate. Aprobarea documentară nu reprezintă o plată.'),
        ]),
        ('03', 'Terminal · avans și factură finală', 'Avans contractual separat de decontul celor două livrări.', [
            ('contract', 'Contract', 'Echipamente pentru terminal', 'approved', [],
             'Contract fictiv cu două livrări și o factură de avans, urmată de un decont final.'),
            ('advance', 'Factură', 'Avans contractual · 20%', 'approved', [source('contract', 'reference', 'Avans contractual')],
             'Factură de avans pentru 20% din valoarea scenariului, emisă în baza contractului, înainte de recepții.'),
            ('delivery-a', 'Livrare de intrare', 'Mobilier · prima livrare', 'approved', [source('contract')],
             'Prima livrare cuprinde mobilierul zonei publice. Se recepționează separat de echipamente.'),
            ('delivery-b', 'Livrare de intrare', 'Echipamente · a doua livrare', 'approved', [source('contract')],
             'A doua livrare cuprinde echipamentele zonei publice și anexele de identificare.'),
            ('receipt-a', 'Proces-verbal de recepție', 'Mobilier · acceptat', 'approved', [source('delivery-a')],
             'Recepția mobilierului este acceptată în scenariu.'),
            ('receipt-b', 'Proces-verbal de recepție', 'Echipamente · în verificare', 'in_review', [source('delivery-b')],
             'Documentele echipamentelor sunt în verificare. Recepția mobilierului rămâne distinctă.'),
            ('balance', 'Factură', 'Decont final · avans dedus', 'draft', [source('receipt-a'), source('receipt-b'), source('advance', 'reference', 'Avans de dedus')],
             'Decont final în ciornă, cu referință la cele două recepții și la factura de avans. Nu declară recepția finală sau plata realizată.'),
        ]),
    ]


def build_records():
    records = []
    for code, name, summary, documents in scenarios():
        case_id = f'ACH-2026-000{code}'
        for index, (local_id, category, caption, status, links, detail) in enumerate(documents, 1):
            identifier = f'flow-{code}-{local_id}'
            financial = category in ('Factură', 'Notă de credit')
            department = 'Financiar' if financial else ('Achiziții' if category in ('Contract', 'Act adițional', 'Comandă de retur') else 'Tehnic')
            records.append({
                'id': identifier, 'title': f'{category} - {caption}', 'number': f'FL-{code}-{index:03d}',
                'category': category, 'department': department, 'status': status,
                'created_at': f'2026-10-{min(10 + index, 29):02d}T09:00:00Z',
                'owner': 'Radu Marinescu' if financial else 'Mihai Dumitrescu',
                'supplier': f'Furnizor Scenariu {code} Demo SRL', 'confidentiality': 'restricted' if financial else 'internal',
                'filename': f'{identifier}.pdf', 'summary': detail, 'tags': ['demonstrație', 'flux achiziții'],
                'metadata': {'case_id': case_id, 'document_type': category, 'flow_case_name': name,
                    'flow_case_summary': summary, 'flow_caption': caption, 'flow_demo': True,
                    'flow_links': [{**link, 'source_id': f"flow-{code}-{link['source_id']}"} for link in links]},
                'related_ids': [f"flow-{code}-{link['source_id']}" for link in links],
                'source_refs': [], 'validated': status in ('approved', 'in_review'),
            })
    return records


def main():
    corpus.font_setup()
    corpus.STYLES = corpus.styles()
    records = build_records()
    by_id = {item['id']: item for item in records}
    for item in records:
        for link in item['metadata']['flow_links']:
            assert by_id[link['source_id']]['metadata']['case_id'] == item['metadata']['case_id']
        blocks = [corpus.p('SCENARIU DE ACHIZIȚII / ' + item['number'], 'kicker'),
            corpus.p(item['title'], 'title'), corpus.p(corpus.DEMO, 'small'),
            corpus.table([('Dosar', item['metadata']['case_id']), ('Scenariu', item['metadata']['flow_case_name']),
                ('Stare inițială', item['status']), ('Furnizor fictiv', item['supplier'])]),
            *corpus.section('Conținutul documentului', item['summary']),
            *corpus.section('Context', item['metadata']['flow_case_summary'])]
        if item['metadata']['flow_links']:
            blocks += [corpus.p('Documente de referință', 'h'), corpus.table([
                (by_id[link['source_id']]['number'], by_id[link['source_id']]['title'])
                for link in item['metadata']['flow_links']])]
        blocks += corpus.section('Limitele scenariului', 'Conținut sintetic pentru demonstrație. Stările și relațiile descriu un exemplu documentar; nu atestă operațiuni, semnături sau plăți reale.')
        path = corpus.render(item, [blocks])
        item['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
        assert item['number'] in ''.join(page.extract_text() or '' for page in PdfReader(path).pages)
    output = {'schema_version': 1, 'demo_label': corpus.DEMO, 'documents': records}
    (corpus.OUT / 'procurement-scenarios.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'documents': len(records), 'cases': dict(Counter(item['metadata']['case_id'] for item in records))}))


if __name__ == '__main__':
    main()
