# FlyLeaf — prezentare de cinci minute

10 slide-uri principale, inclusiv 75 de secunde pentru demonstrație; 2 anexe pentru întrebări. Timpii sunt repere de repetiție.

## 1. FlyLeaf

00:00–00:15. Suntem Flight Club. Construim FlyLeaf pentru echipele care țin aeroportul în mișcare. Legăm documentele de responsabilități și de ce se întâmplă efectiv în operațiuni.
Proveniență: implementarea din acest repository, 1 noiembrie 2026. Datele prezentării sunt din corpusul și istoricul sintetic al aplicației.

## 2. 18 minute întârziere. Unde s-a rupt fluxul?

00:15–00:35. În exemplul nostru, FL634 pleacă cu 18 minute întârziere. Un KPI roșu semnalează problema, dar echipa trebuie să afle ce s-a întâmplat și ce schimbă pentru data viitoare. Dacă documentele, pontajul și responsabilitățile rămân separate, investigația devine încă o sarcină administrativă.
Dovadă: captura ledger.png, registru complet filtrat FL634, 27 octombrie. Acesta este un caz sintetic, nu un incident atribuit unui aeroport real. Nu extrapola procentul afișat pentru un singur zbor la întregul aeroport.

## 3. Un dosar complet, cu următorul pas la vedere

00:35–01:00. Digitalizarea începe cu un lucru concret: documentul corect și persoana care trebuie să decidă. Aici vedem dosarul unei scări pentru pasageri. Contractul, raportul de prestare, recepția și factura sunt legate. OCR-ul local face scanările căutabile. Aprobarea aparține unei versiuni, iar absența unui coleg poate fi acoperită prin delegare. Reducerea timpului este obiectivul pe care îl vom măsura în pilot, nu o economie deja demonstrată.
Surse: backend/app/documents, extraction, workflows, tasks; captura document-flow.png. Corpusul de bază și scenariile suplimentare includ 170 PDF-uri sursă. Numărul vizibil depinde de acces.

## 4. Fiecare acțiune are autor, moment și context

01:00–01:30. Deschidem evenimentul, nu ne oprim la culoarea zborului. Poarta trebuia deschisă la 12:20 și s-a deschis la 12:38. Vedem operatorul de rezervă și pontajul care precedă acțiunea. Putem merge la istoricul porții, al persoanei sau al zborului. Alimentarea și curățenia pot rula simultan, dar plecarea are condiții explicite. Asta face registrul util pentru verificare, nu doar pentru o listă de mesaje.
Surse: docs/ATOMIC_OPERATIONS_LEDGER.md; backend/app/operations/event_rules.py și atomic_ledger.py; captura operation-fact.png. Ora originală de înregistrare a istoricului generat nu este inventată.

## 5. O abatere poate îmbunătăți procedura

01:30–02:00. SOP înseamnă procedură standard de operare. Biblioteca arată când începe fiecare pas, cine îl execută și ce dovadă rămâne. În cazul porții, putem evalua o confirmare mai timpurie a înlocuitorului. Este o schimbare de analizat local. FlyLeaf creează o ciornă și o duce prin avizare; nu rescrie în tăcere procedura aprobată.
Surse: docs/SOP_OPTIMIZATION.md, operations/procedures/catalog.py. Cele 12 modele sunt originale, de lucru, nu manuale certificate ale aeroporturilor. Captura sop.png.

## 6. Luna propune. Echipa verifică și decide.

02:00–02:25. Luna analizează la cerere dovezile selectate și procedura relevantă. Propune pași, riscuri și un pilot, cu referințe pe care le putem deschide. Serverul verifică structura și referințele. Omul verifică interpretarea și aprobă ciorna. Rezultatele se păstrează, iar schimbarea dovezilor le marchează ca necesitând reanalizare. O citare validă nu garantează că modelul a interpretat corect situația.
Surse: backend/app/llm/service.py, operations/procedures/engine.py și service.py, docs/SOP_OPTIMIZATION.md. Acesta este fluxul implementat, nu un rezultat LLM inventat pentru prezentare.

## 7. Experiența se poate împărtăși cu grijă

02:25–02:50. O procedură utilă poate conține informații care nu trebuie trimise partenerului. Selectăm ce mascăm sau cerem sugestii contextualizate de la Luna. Verificăm copia și autorizăm explicit destinatarul și expirarea. Originalul rămâne intact. Revocarea oprește accesul ulterior prin platformă, dar nu poate retrage o copie deja descărcată.
Surse: docs/LUNA_REDACTION.md; backend/app/sharing/studio.py, suggestions.py, service.py. Captura redaction.png arată editorul real. Mascarea este o decizie umană, nu o garanție automată de conformitate.

## 8. O lecție locală poate ajuta alt aeroport

02:50–03:15. Craiova poate transmite o procedură către un contact eligibil din Sibiu. Participarea este voluntară, iar fiecare aeroport își păstrează baza de date și documentele. Mesajele au destinatari nominali; documentul atașat are propriul drept de acces. Ideea poate servi și aeroporturi administrate de aceeași organizație. Adaptarea și aprobarea locală rămân necesare.
Surse: docs/PARTNER_COORDINATION_API.md și backend/app/collaboration. Partenerii sunt configurați explicit, nu descoperiți automat pe internet. Sincronizarea este pornită de sesiuni autorizate vizibile/API reads. Un mesaj personal nu restrânge un grant documentar deja autorizat pentru aeroport.

## 9. O problemă. Dovezile. O procedură mai bună.

03:15–04:30. Treci în aplicație. 20 secunde: deschide FL634 din 27 octombrie, apoi Poartă deschisă și legătura la operator/pontaj. 25 secunde: arată o analiză Luna deja salvată, spune că este salvată, deschide o dovadă și ciorna SOP. 20 secunde: arată copia revizuită într-un mesaj și documentul primit de partener. Păstrează 10 secunde pentru tranziții. Pregătește grantul, aprobările și ambele sesiuni înainte. Nu genera AI pe scenă și nu promite că scenariul istoric se schimbă când scanezi un card. NFC poate fi un scurt intro separat, cu stația deja autentificată.
Surse: README.md, docs/OPERATIONS_DEMO.md și PARTNER_COORDINATION_API.md. Dacă nu există o analiză salvată validă, arată biblioteca și fluxul de ciornă, fără să prezinți text scris manual drept răspuns AI.

## 10. Avantajul FlyLeaf: decizia păstrează legătura cu dovada

04:30–05:00. Avantajul pe care vrem să îl demonstrăm este continuitatea: găsim dovada, înțelegem responsabilitatea, propunem o procedură și o putem transmite controlat unui partener. Căutăm un aeroport și un partener pentru un pilot pe un singur flux. Măsurăm timpul până la documentul corect, durata aprobării și erorile factuale din sugestii. Suntem Flight Club, iar acesta este FlyLeaf.
Aceasta este poziționarea produsului, nu o comparație exhaustivă cu toate produsele concurente. Nu afirmăm economii sau rezultate operaționale încă nemăsurate.

## 11. Același registru alimentează rapoartele

ANEXĂ, în afara celor 5 minute. Rapoartele folosesc documentele, sarcinile, granturile și evenimentele operaționale existente. Filtrele duc la surse, monedele rămân separate, iar zborurile neîncheiate nu devin plecări la timp. Pagina nu generează date doar pentru grafice.
Surse: docs/REPORTS.md, backend/app/reports; captura reports.png. Valorile sunt din setul sintetic local.

## 12. O bază comună pentru echipele aeroportului

ANEXĂ pentru întrebări tehnice. Fiecare aeroport are propriile date și identități. Tailscale este o intrare HTTPS suplimentară către aceeași instalare Docker. Fluxurile se sprijină pe versiuni și sarcini explicite, iar OCR-ul local rămâne disponibil fără LLM. Semnăturile folosesc certificate demonstrative. Nu există integrare reală ATC, bancară sau e-Factura.
Surse: docs/TECH_STACK_AND_CONCEPTS.md, docs/MODULE_ARCHITECTURE.md și lockfile-urile proiectului.
