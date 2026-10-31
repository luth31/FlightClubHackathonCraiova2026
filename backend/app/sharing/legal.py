"""Curated references, reviewed 2026-10-31. Conditions matter: never blanket redaction rules."""
GDPR = 'https://eur-lex.europa.eu/eli/reg/2016/679/oj'
LAW544 = 'https://legislatie.just.ro/Public/DetaliiDocument/31413'
LEGAL_BASES = [
    {'id': 'gdpr-5', 'label': 'RGPD · art. 5(1)(c)', 'url': GDPR,
     'guidance': 'Minimizarea datelor persoanelor fizice: păstrează datele necesare scopului comunicării. Nu impune eliminarea oricărui nume.'},
    {'id': 'gdpr-6', 'label': 'RGPD · art. 6', 'url': GDPR,
     'guidance': 'Comunicarea datelor personale necesită un temei aplicabil. Contextul și rolul destinatarului contează; nu presupune lipsa temeiului.'},
    {'id': 'gdpr-9', 'label': 'RGPD · art. 9', 'url': GDPR,
     'guidance': 'Categoriile speciale de date personale au condiții suplimentare. Un IBAN nu este automat categorie specială; datele unei societăți nu sunt automat date personale.'},
    {'id': 'gdpr-86', 'label': 'RGPD · art. 86', 'url': GDPR,
     'guidance': 'Accesul public la documente oficiale se conciliază cu protecția datelor conform legii aplicabile; transparența poate justifica păstrarea unor date.'},
    {'id': 'law544-12d', 'label': 'Legea 544/2001 · art. 12(1)(d), 14', 'url': LAW544,
     'guidance': 'Pentru accesul public, excepția datelor personale se citește cu art. 14 privind exercitarea funcției publice. Nu se aplică automat oricărui schimb între aeroporturi.'},
    {'id': 'law544-12c', 'label': 'Legea 544/2001 · art. 12(1)(c)', 'url': LAW544,
     'guidance': 'Excepția comercială depinde de prejudicierea proprietății intelectuale/industriale ori concurenței loiale. Numele furnizorului și prețul nu sunt secrete prin simpla lor prezență.'},
]
