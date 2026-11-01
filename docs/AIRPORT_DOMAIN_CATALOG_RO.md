# FlyLeaf — catalog de domeniu aeroportuar și corpus propus

**Data cercetării: 1 noiembrie 2026.** Document de produs pentru hackathon și pregătirea unui pilot. Inventarul, fluxurile, câmpurile, prioritățile și exemplele propuse mai jos sunt ale echipei; nu reprezintă un manual de aerodrom, o certificare sau un inventar legal exhaustiv.

## 1. Decizia de produs

FlyLeaf are deja o bază de documente, versiuni, aprobări și schimb controlat. Extensia cu cel mai mare potențial este un **dosar de problemă care leagă documentele, constatarea, acțiunea, dovada rezolvării și lecția reutilizabilă**:

> Observație → dovezi → evaluare umană → acțiune → verificarea rezultatului → lecție partajabilă → adaptare locală.

Unitatea utilă de lucru este cazul, nu PDF-ul izolat. Un utilizator trebuie să poată răspunde rapid: „Ce s-a întâmplat? Ce știm sigur? Ce lipsește? Cine trebuie să facă următorul pas? Cum vom verifica rezultatul?”.

Prevenția pe care o poate demonstra aplicația este reducerea pierderii de informație, a folosirii unor documente depășite și a acțiunilor uitate. Nu trebuie să promită că un model lingvistic previne accidente sau certifică siguranța unei operațiuni.

## 2. Ce există și ce propunem

Inventar verificat în [CORPUS_RESEARCH.md](CORPUS_RESEARCH.md), [SOP_OPTIMIZATION.md](SOP_OPTIMIZATION.md), [AIRPORT_OPERATIONS.md](AIRPORT_OPERATIONS.md) și `data/seed-manifest.json`.

| Componentă | Există acum | Extensie propusă |
|---|---|---|
| Corpus documentar | 148 PDF-uri fictive; 120 provin din 20 dosare × contract, referat, caiet de sarcini, factură, recepție și raport de mentenanță | Dosare de problemă care reutilizează corpusul și adaugă dovada verificării rezultatului |
| Proceduri | 10 documente de procedură în corpus; separat, 12 șabloane SOP de lucru | Aplicabilitate locală, responsabil de implementare, confirmări relevante și verificarea eficacității |
| Operațiuni | Registru cu evenimente, date sintetice, simulare, indicatori calculați | Separarea unei observații de o evaluare, de o ipoteză cauzală și de o acțiune |
| AI pentru SOP | Dovezi selectate, referințe validate, ipoteze, riscuri, pilot; ciornă cu aprobare | Dovezi contradictorii, informații lipsă și stare explicită „nu pot recomanda încă” |
| Colaborare | Copie revizuită/redactată, destinatar, acces, expirare, revocare | Pachet de învățare, evaluare la destinatar, adaptare, pilot, rezultat și proveniență între versiuni |
| Conformitate | Documente, aprobări și audit | Legătura cerință–dovadă–constatare–acțiune, după validarea cerințelor în pilot |
| Mentenanță | Rapoarte și dosare de achiziție | Identitate stabilă de activ, ordin de lucru și verificare documentată, distinctă de statusul „reparat” |
| Raportare de safety | Șablon SOP și evenimente în registru | Obiect distinct pentru raport, triere și decizie umană privind tratamentul/raportarea externă |

Nu este necesară încă o bibliotecă generală de SOP-uri pentru a obține aceste beneficii. Este necesară legătura dintre utilizarea unei proceduri și rezultatul documentat.

## 3. Baza de domeniu și aplicabilitatea surselor

EASA descrie managementul operatorului de aerodrom prin responsabilități, identificarea pericolelor, evaluarea și tratarea riscurilor, monitorizare și verificarea eficacității măsurilor. Această bază susține un flux complet al cazului; nu validează automat produsul. [EASA — ADR.OR.D, ediția martie 2026](https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-aerodromes-regulation-eu?erules-id=ERULES-1963177438-2628)

Documentația aerodromului trebuie controlată și accesibilă persoanelor relevante. Un manual poate avea părți separate și poate face trimitere la alte documente controlate. În produs, aceasta susține versiuni, aplicabilitate, responsabilități și acces în funcție de rol. [EASA — ADR.OR.E, manual și documentație](https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-aerodromes-regulation-eu?erules-id=ERULES-1963177438-18154)

**Limită temporală:** ediția EASA consultată include și dispoziții cu aplicabilitate viitoare. În particular, cadrul nou pentru ground handling are data principală de aplicare **27 martie 2028**. Nu îl prezentăm ca fiind deja aplicabil integral la 1 noiembrie 2026. Orice cerință introdusă în produs trebuie să aibă versiune, domeniu și dată de aplicabilitate verificate separat. [EASA — Ground Handling, articolul 7](https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-ground-handling?erules-id=ERULES-1963177438-23635)

GAPPRI susține schimbul lecțiilor obținute din analiza evenimentelor, inclusiv prin echipe locale, depozite de cunoștințe și buletine de siguranță. Acesta este fundamentul de domeniu pentru colaborarea propusă. Un exemplu din alt aeroport nu devine automat o procedură autorizată la destinatar. [EUROCONTROL/Flight Safety Foundation — GAPPRI, recomandarea ADR5](https://www.eurocontrol.int/sites/default/files/2024-08/eurocontrol-fsf-global-action-plan-prevention-runway-incursions-gappri.pdf)

A-CDM privește coordonarea între aeroport, operatori aerieni, handling și furnizorul de servicii de navigație, în special pentru turnaround și preplecare. Folosește etape semnificative pentru actualizarea estimărilor. **Colaborarea între două aeroporturi pentru adoptarea unui SOP este un alt proces.** Simularea FlyLeaf nu constituie prin ea însăși o implementare A-CDM. [EUROCONTROL — specificația A-CDM, 30 ianuarie 2025](https://www.eurocontrol.int/publication/eurocontrol-specification-airport-collaborative-decision-making-cdm)

În România, raportarea internă și mecanismul național de raportare sunt distincte. Produsul poate documenta decizia și dovada transmiterii; nu trebuie să pretindă că un status intern echivalează cu îndeplinirea unei obligații externe. [Portal Legislativ — cadrul românesc de raportare a evenimentelor](https://legislatie.just.ro/Public/DetaliiDocument/217770)

Registrul EASA indică și o actualizare din 2026 a listei de evenimente raportabile. Textul consolidat aplicabil trebuie reverificat înaintea implementării unor reguli obligatorii de clasificare sau termen. Cercetarea de față nu automatizează asemenea reguli. [EASA — reglementări privind evenimentele raportabile](https://www.easa.europa.eu/en/regulations/list-classifying-occurrences-civil-aviation-be-mandatorily-reported-according-regulation-eu-no)

**Surse cu acces limitat:** pagina AIAS nu a fost accesibilă prin instrumentul de cercetare; PDF-ul AACR PNSA 2024–2026 a returnat o verificare anti-bot. Conținutul lor nu este tratat aici ca dovadă verificată. Nu sunt inventate constatări despre incidente reale din România.

## 4. Responsabilități și limite organizaționale

Într-un dosar comun pot exista mai multe organizații. „Aeroportul” nu trebuie modelat ca proprietar și autoritate universală asupra tuturor documentelor.

| Actor | Perspectiva de produs | Control important |
|---|---|---|
| Operator aeroportuar | Documente, infrastructură, oameni și procese aflate în responsabilitatea sa | Responsabilitatea concretă se configurează pentru aeroportul pilot |
| Handler / furnizor de servicii | Confirmări și documente pentru activitățile proprii | Nu primește automat acces la arhiva aeroportului |
| Companie aeriană / echipaj | Evidențe și decizii din propria sferă | FlyLeaf nu substituie deciziile ori documentele autorizate ale operatorului aerian |
| Safety | Trierea și analiza cazurilor, potrivit mandatului local | AI sugerează; rolul competent validează clasificarea și măsurile |
| Conformitate | Cerințe aplicabile, dovezi, constatări, verificări | Nu confundăm conformitatea documentară cu demonstrarea siguranței |
| Tehnic / mentenanță | Active, lucrări, documente de intervenție și verificare | Închiderea unui ticket nu echivalează automat cu disponibilitatea operațională |
| Coordonator de tură | Preluarea sarcinilor, excepții, escaladări | Nu primește implicit motive medicale/HR sau acces la întregul dosar personal |
| ROMATSA / ATS / AIS | Interfețe și informații în responsabilitatea organizației respective | Separare clară de sistemul intern al aeroportului |
| AIAS / AACR | Autorități distincte, cu mandate proprii | Nu emitem documente fictive în numele autorității și nu simulăm aprobarea sa |
| Aeroport partener | Referințe autorizate și lecții revizuite | Aplicabilitatea și aprobarea locală nu se transferă odată cu PDF-ul |

ROMATSA/AIS asigură produse de informare aeronautică; FlyLeaf poate păstra referința, sursa, intervalul de valabilitate și istoricul unei cereri, fără a se prezenta ca emitent de NOTAM. [AIS România — prezentarea serviciului](https://aisro.ro/aboutais/about.php)

## 5. Taxonomia propusă pentru catalog

**P0:** necesar pentru povestea de hackathon. **P1:** pilot cu un aeroport și roluri validate. **P2:** extensie după validarea utilității. Prioritățile sunt decizii de produs, nu obligații legale.

Tabelele sunt o schemă propusă de organizare a datelor. Ele nu prescriu frecvențe de inspecție, praguri operaționale, proceduri de intervenție, termene legale sau criterii de autorizare.

| Document / obiect | Proprietar propus | Declanșator | Date esențiale | Relații | Control | KPI propus | Prioritate |
|---|---|---|---|---|---|---|---|
| Procedură / SOP controlat | Responsabil de proces | Creare sau schimbare aprobată | Cod, versiune, scop, aplicabilitate, autor, aprobator | Proces, roluri, formulare, cazuri | Versiune curentă și istoric; ciorna distinctă | Timp de găsire a versiunii aplicabile | P0 |
| Aviz de schimbare procedurală | Responsabil de proces | SOP revizuit | Ce se schimbă, pentru cine, data aplicabilității | Versiune anterioară/nouă, instruire | Confirmări numai pentru rolurile relevante | Confirmări complete / confirmări necesare | P1 |
| Raport de observație / eveniment | Raportor; apoi rol de triere | Observație sau eveniment | Fapte, timp, zonă, surse, informație lipsă | Activ, proces, documente, cazuri similare | Identitate protejată; clasificare umană | Completitudine și timp până la triere | P0 |
| Fișă de pericol | Safety / responsabil desemnat | Evaluare a unei situații | Context, consecințe analizate, măsuri, proprietar | Observații, evaluări, schimbări | Ipotezele separate de fapte | Măsuri cu verificare documentată | P1 |
| Fișă de evaluare / decizie | Persoană competentă | Caz pregătit pentru evaluare | Dovezi folosite, lipsuri, decizie, motiv | Raport, SOP aplicabil, acțiuni | Decizia semnată/înregistrată pe versiune | Cazuri fără justificare documentată | P0 |
| Plan de acțiune | Responsabil de caz | Decizie validată | Sarcină, proprietar, termen, dovadă cerută | Caz, activ, procedură | Responsabil explicit și schimbări urmărite | Acțiuni scadente fără proprietar | P0 |
| Dovadă de implementare | Responsabil de acțiune | Acțiune declarată efectuată | Ce s-a făcut, când, documente/fișiere | Acțiune, lucrare, instruire | „Efectuat” distinct de „verificat” | Acțiuni cu dovadă completă | P0 |
| Verificare a rezultatului | Verificator desemnat | Dovada disponibilă / data evaluării | Criteriu, observație, rezultat, limite | Acțiune și reper inițial | Acceptare, respingere sau informație insuficientă | Acțiuni verificate la termen | P0 |
| Inspecție / checklist completat | Responsabil de inspecție | Plan local sau verificare cerută | Formular/versiune, zonă, constatări, atașamente | Active, lucrări, cazuri | Nu inventăm frecvențe sau criterii tehnice | Dovezi complete / inspecții înregistrate | P1 |
| Fișă de activ | Tehnic | Introducere sau schimbare activ | ID stabil, tip, proprietar, documente asociate | Contracte, mentenanță, incidente | Identificare univocă și drepturi | Dosare fără activ identificabil | P1 |
| Ordin / raport de mentenanță | Tehnic / prestator | Defect sau activitate planificată | Activ, lucrare, constatări, documente | Fișă activ, contract, recepție, caz | Trasabilitate între intervenție și verificare | Defecte recurente contextualizate | P0 |
| Dosar de schimbare / lucrare | Manager de schimbare | Modificare de proces/infrastructură | Scop, impact evaluat, avize, predare | Active, proceduri, informări | Aprobări și verificare conform procesului local | Schimbări cu evaluare/documente complete | P1 |
| Predare de tură | Coordonator de tură | Predare de responsabilitate | Restanțe, excepții, proprietar, confirmare | Sarcini, evenimente, procedură | Preluarea este explicită; acces HR separat | Restanțe fără preluare confirmată | P0 |
| Înregistrare de etapă operațională | Actorul responsabil de etapă | Eveniment confirmat | Planificat, observat, sursă, moment | Activitate/zbor, sarcină, dependențe | Proiecția distinctă de observație | Întârzieri observate, cu numitor definit | P0 |
| Evidență de competență / instruire | Responsabil instruire / HR | Instruire, evaluare, reînnoire | Rol, obiect, versiune, rezultat, valabilitate | Persoană, sarcină, SOP | Date personale limitate la scop | Eligibilitate verificată înaintea alocării | P1 |
| Dosar de exercițiu | Coordonator desemnat | Exercițiu planificat | Participanți autorizați, observații, acțiuni | Pregătire, proceduri, verificări | Separat de evenimente reale | Lecții cu acțiune și verificare | P2 |
| Referință AIS / cerere de actualizare | Responsabil local desemnat | Informație nouă / revizie | Sursă oficială, versiune, valabilitate | Zonă, schimbare, comunicări | Sursa oficială prevalează; fără emitere automată | Referințe fără proveniență/valabilitate | P2 |
| Contract / obligație / recepție | Achiziții, tehnic, financiar | Achiziție, livrare, scadență | Obiect, obligație, dovadă, rezervă | Activ, prestator, factură, lucrare | Separare verificare tehnică–financiară | Obligații scadente fără dovadă | P0 |
| Sesizare de serviciu / terminal | Responsabil serviciu | Sesizare sau abatere SLA | Serviciu, impact, răspuns, dovadă | Furnizor, contract, ticket | Fără clasificare automată drept safety | Timp de răspuns/rezolvare contextualizat | P2 |
| Raport de mediu | Responsabil mediu | Măsurare / raportare aplicabilă | Parametru, perioadă, sursă, rezultat | Autorizație, contract, acțiune | Cerințe verificate în pilot | Dovezi lipsă la raportare | P2 |
| Indisponibilitate IT / continuitate | IT + proprietar proces | Întrerupere / incident informațional | Sistem, interval, impact, restaurare | Procese, cazuri, documente | Evaluare separată a impactului de safety | Timp de restaurare și verificare | P1 |
| Lecție / pachet de colaborare | Proprietar caz + aprobator partajare | Rezultat evaluat | Context, măsură, dovezi, limite, resurse | Caz sursă, versiune SOP, rezultate | Redactare și drepturi explicite | Adoptări locale verificate | P0 |
| Evaluare de aplicabilitate locală | Aeroport destinatar | Primire pachet | Diferențe, condiții, roluri, lacune | Pachet sursă, SOP local, pilot | Fără transfer implicit al aprobării | Pachete evaluate / pachete primite | P0 |
| Raport de pilot / eficacitate | Proprietar pilot | Încheiere perioadă definită | Reper, rezultat, eșantion, confuzori, limite | Adaptare, măsurători, decizie | Rezultat negativ/neutru permis | Piloți cu concluzie justificată | P0 |

## 6. Eveniment, pericol, defect și problemă administrativă

| Tip de obiect | Întrebarea pe care o rezolvă | Exemplu fictiv | Ce nu presupunem automat |
|---|---|---|---|
| Observație | Ce a remarcat persoana? | Fotografie și descriere a unui obiect găsit | Că avem deja o cauză sau un eveniment raportabil |
| Pericol | Ce situație poate conduce la un rezultat nedorit? | Condiție repetată care necesită evaluare | Că rezultatul nedorit s-a produs |
| Eveniment | Ce s-a întâmplat efectiv? | Contact raportat între echipament și aeronavă | Clasificarea legală ori vinovăția |
| Near miss / situație evitată | Ce apropiere de un rezultat nedorit a fost observată? | Raport care necesită triere competentă | Gravitatea formală stabilită de AI |
| Defect / mentenanță | Ce activ necesită atenție tehnică? | Echipament cu aceeași defecțiune raportată | Că orice defect este incident de aviație |
| Constatare de conformitate | Ce cerință sau dovadă este neîndeplinită? | Lipsește documentul de verificare cerut | Că lipsa documentului dovedește singură un risc materializat |
| Problemă administrativă | Ce obligație/document/flux este incomplet? | Factură necorelată cu recepția | Că trebuie inclusă în statistica de safety |
| Problemă de serviciu | Ce rezultat pentru utilizator/partener a fost afectat? | Sesizare privind un serviciu terminal | Că orice nemulțumire este eveniment de safety |

„Incident grav” și alte încadrări formale trebuie stabilite în procesul autorizat, nu printr-un scor generat de model. Terminologia inițială a raportorului poate fi păstrată separat de clasificarea validată.

## 7. Maparea cazurilor către prevenție și dovezi

Măsurile de mai jos sunt funcții de gestionare a informației și a lucrului. Ele nu sunt proceduri operaționale de intervenție.

| Caz de cercetat | Dovezi de legat | Rol care evaluează | Funcția utilă a aplicației | Verificarea rezultatului |
|---|---|---|---|---|
| FOD repetat în aceeași zonă | Rapoarte, fotografii, lucrări recente | Rolul local de safety/operațiuni | Grupează observații și păstrează ipotezele separate | Măsura decisă are proprietar și dovadă verificată |
| Observații de faună / wildlife strike | Rapoarte și contextul lor | Responsabil desemnat | Găsește lipsuri și istoric relevant | Evaluare documentată; fără concluzii automate despre controlul faunei |
| Defect recurent la echipament | Istoric activ, intervenții, recepții | Tehnic | Evidențiază repetiția și dovezile lipsă | Verificarea documentată distinct de intervenție |
| Deteriorare la sol | Cronologie, activ, observații, documente | Responsabilii organizațiilor implicate | Dosar comun cu acces controlat | Concluzie și măsuri aprobate de rolurile competente |
| Abatere de circulație la sol | Raport, instruire, procedură aplicabilă | Rol competent | Pregătește dovezile pentru analiză | Evaluare umană; fără instrucțiuni AI de trafic |
| Predare de tură incompletă | Restanță, destinatar, confirmare | Coordonator | Arată exact sarcina fără preluare | Confirmarea preluării și verificarea procesului |
| Versiune depășită folosită | Copie, versiune curentă, destinatari | Proprietar document | Identifică discrepanța și persoanele relevante | Documentul aplicabil poate fi găsit și schimbarea confirmată |
| Competență neclară pentru sarcină | Rol, cerință locală, evidență instruire | Responsabil autorizat | Cere clarificare și evidență | Eligibilitate validată conform procesului local |
| Lucrare închisă fără dovadă | Ordin, raport, recepție, verificare | Tehnic / verificator | Menține separat „efectuat” și „verificat” | Dovada este acceptată sau se cere completare |
| Întrerupere IT cu impact operațional | Ticket, interval, procese afectate | IT și proprietar proces | Leagă efectele și evaluarea impactului | Restaurare și verificare înregistrate |
| Exercițiu cu măsuri restante | Observații, responsabil, termen | Coordonator exercițiu | Transformă lecțiile în sarcini | Verificarea măsurii, nu doar închiderea exercițiului |
| Recepție/factură necorelată | Contract, rezervă, intervenție, factură | Tehnic și financiar | Arată afirmațiile contradictorii cu pagina sursă | Discrepanța este rezolvată prin documente și decizie |

## 8. Contract minim pentru un dosar de problemă

Obiectele recomandate sunt `case`, `evidence_reference`, `assessment`, `action`, `verification`, `learning_package` și `local_adoption`. Denumirile sunt propuneri de model, nu entități implementate.

Un caz are: ID stabil; aeroport; organizații implicate; activitate/zonă/activ; momentul producerii; momentul raportării; descriere factuală; tip inițial; clasificare validată; sensibilitate; responsabil de triere; stare și istoric.

O referință de dovadă are: document și versiune sau eveniment; pagină/fragment relevant; autor/sursă; moment; proveniență; drepturi; starea extragerii; observație dacă textul provine din OCR. Un fragment extras nu trebuie desprins de documentul verificabil.

O evaluare are: fapte confirmate; afirmații contradictorii; ipoteze; informație lipsă; decizie; motiv; persoană competentă; versiunea pachetului evaluat. „Nu avem date suficiente” este un rezultat valid.

O acțiune are: responsabil; termen local justificat; rezultat așteptat; dovadă necesară; stări distincte `propusă`, `aprobată`, `în lucru`, `implementată`, `în verificare`, `acceptată` / `neacceptată`; motiv la schimbări. Termenele de demonstrație sunt ale scenariului, nu termene legale.

O verificare are: criteriu stabilit anterior; rezultat observat; eșantion/perioadă; limitări; verificator; concluzie. Dacă datele sunt insuficiente, cazul poate rămâne deschis sau poate necesita o nouă evaluare.

## 9. Corpus suplimentar propus: 18 documente legate, trei scenarii

**Aceste documente nu au fost generate sau încărcate.** Identificatorii `PROP-*` sunt referințe de planificare. Nu se reutilizează ID-urile corpusului existent. Pe fiecare pagină viitoare: „Date fictive pentru demonstrație”. Numele aeroporturilor sunt etichete ale demo-ului, nu afirmații despre probleme reale la Craiova ori Sibiu.

Corpusul nou se atașează bazei existente; nu modifică PDF-uri aprobate și nu inventează certificate sau aprobări ale autorităților. Fiecare document conține scop, autor fictiv, dată de scenariu, versiune, legături și sensibilitate. Nu sunt incluse detalii de acces fizic, planuri de securitate sau instrucțiuni de intervenție reale.

### A. SP-02 — dovada lipsă între recepție și verificarea intervenției

Reutilizează dosarul existent: `doc-001` contract, `doc-003` caiet de sarcini, `doc-004` factură, `doc-005` recepție și `doc-006` mentenanță. Noua situație este o **extensie fictivă separată**, nu o afirmație că documentele existente au deja exact contradicția descrisă. Nu rescriem sursele pentru a forța povestea.

| ID propus | Document | Legături | Conținut distinctiv | Stare demonstrată |
|---|---|---|---|---|
| PROP-SP02-01 | Fișă de observație documentară | Dosarul SP-02 și versiunile verificate | Se cere clarificarea unei dovezi de verificare; citări exacte stabilite la redactare | În triere |
| PROP-SP02-02 | Notă de evaluare a documentelor | `01`, documentele existente | Ce este confirmat, ce lipsește; fără concluzie automată despre disponibilitatea echipamentului | Validată de persoana competentă |
| PROP-SP02-03 | Plan de completare și verificare | `02` | Responsabil, dovada solicitată, criteriu documentar, termen de scenariu | Aprobat |
| PROP-SP02-04 | Răspuns și dovadă de completare | `03`, raportul relevant | Fișier/înregistrare fictivă care răspunde explicit solicitării | Implementat, încă neverificat |
| PROP-SP02-05 | Fișă de verificare a dosarului | `03`, `04` | Acceptare sau cerere de completare cu justificare | Verificat |
| PROP-SP02-06 | Lecție pentru verificarea recepțiilor | `01`–`05` | Formular revizuit propus, condiții de utilizare, dovezi și limite | Ciornă pentru aprobare și partajare |

**Momentul AI:** „Nu pot confirma existența dovezii cerute. Aceste două documente spun X și Y; următorul pas este clarificarea de către rolul desemnat.” Nu „Echipamentul este sigur/nesigur” și nu „factura este frauduloasă”.

**Ce măsurăm:** timpul pentru a găsi sursele și completitudinea dosarului înainte/după. Nu pretindem reducerea riscului de accident din acest exemplu.

### B. FOD — observații repetate și analiză fără cauză inventată

Scenariul folosește o zonă fictivă nespecifică, „Zona demonstrativă Z”, și un dosar fictiv de lucrări. Nu reproduce configurația unei zone operaționale reale. Fotografiile, dacă sunt adăugate, sunt marcate drept demonstrație.

| ID propus | Document | Legături | Conținut distinctiv | Stare demonstrată |
|---|---|---|---|---|
| PROP-FOD-01 | Registru cu trei observații | Trei înregistrări distincte și anexele lor | Momente, zonă, descrieri factuale; autorii protejați | Raportat |
| PROP-FOD-02 | Fișă de context a lucrării fictive | `01` | Perioada și existența lucrării; nu afirmă cauzalitate | Document de context |
| PROP-FOD-03 | Notă de analiză preliminară | `01`, `02` | Asociere temporală, explicații alternative, date lipsă | În evaluare umană |
| PROP-FOD-04 | Plan de acțiune aprobat | `03` | Măsură definită/validată de specialist, proprietar, dovadă cerută | Aprobat; fără procedură tehnică inventată |
| PROP-FOD-05 | Raport de verificare a măsurii | `04` | Implementare, perioadă observată, limite; rezultat poate fi neconcludent | Evaluat |
| PROP-FOD-06 | Buletin de lecție pentru partener | `03`–`05` | Context redactat, măsură, aplicabilitate, ce nu știm | Aprobat pentru schimb controlat |

**Momentul AI:** „Observațiile sunt apropiate temporal de lucrare. Această asociere nu demonstrează cauza. Lipsesc următoarele informații pentru evaluare.”

**Ce măsurăm:** existența responsabilului, timpul de pregătire a dosarului și verificarea măsurii. Un interval scurt fără observații noi nu demonstrează că problema a fost eliminată.

### C. Predare de tură — de la povestea Craiova la adaptarea Sibiu

Reutilizează evenimentele sintetice ale demonstrației de poartă. Datele individuale de HR și presupunerile despre motivele absenței nu intră în pachetul pentru partener. Întârzierea observată și explicația cauzală sunt lucruri distincte.

| ID propus | Document | Legături | Conținut distinctiv | Stare demonstrată |
|---|---|---|---|---|
| PROP-TURA-01 | Dosar de excepție și cronologie | ID-uri de evenimente ale unei rulări salvate | Planificat/observat, sarcină și preluare; fără atribuirea automată a vinovăției | Evaluat |
| PROP-TURA-02 | Propunere de revizie SOP | `01`, versiune SOP sursă | Schimbarea propusă, motiv, resurse, ipoteze, risc și pilot | Ciornă |
| PROP-TURA-03 | Fișă de aprobare și distribuire a pachetului | `02` | Versiune aprobată, dovada revizuirii, ce se partajează și cu cine | Aprobat pentru schimb |
| PROP-TURA-04 | Evaluare de aplicabilitate la Sibiu | `03` | Roluri locale, resurse, diferențe și informație lipsă | În evaluare locală |
| PROP-TURA-05 | Adaptare locală și plan de pilot | `04` | SOP local, proprietar, criterii, perioadă, eșantion, indicatori | Aprobat local |
| PROP-TURA-06 | Raport de pilot și decizie | `05` | Rezultat simulat, numitor, limitări și decizia de continuare/modificare | Evaluat; sursă pentru feedback |

**Momentul AI:** la destinatar, „Nu poți prelua direct această procedură: rolul X nu există în configurația locală și resursa Y nu este confirmată.” Propunerea devine valoroasă prin detectarea nepotrivirii, nu prin rescriere fluentă.

**Ce măsurăm:** sarcini fără preluare, completitudinea confirmărilor, timp administrativ și punctualitate observată în condiții explicit definite. Valorile demo rămân etichetate „simulate”; nu sunt rezultat de pilot real.

### Legături și verificări pentru toate cele 18 documente

- Fiecare document are `scenario_id`, `case_id`, `document_type`, `version`, `owner_role`, `source_refs`, `related_ids`, `confidentiality` și `demo=true`.
- ID-urile sunt stabile; relațiile rezolvă către documentul și versiunea potrivite.
- Sursele externe justifică familia de documente și conceptul, nu conținutul fictiv al cazului.
- Datele și stările sunt coerente: dovada nu precedă acțiunea, iar verificarea nu precedă dovada pe care o evaluează.
- Un document „aprobat în scenariu” nu primește automat o semnătură criptografică reală; rămâne clară diferența dintre fixture și aprobarea executată în aplicație.
- Se poate demonstra și o dovadă insuficientă, o adaptare respinsă sau un pilot neconcludent. Corpusul nu conține doar povești cu succes garantat.
- Reprezentările PDF trebuie să fie lizibile, cu diacritice, referințe și text extraibil; documentele sensibile nu primesc acces mai larg prin metadate sau rezumatul AI.

## 10. Colaborarea care produce rezultate

Pachetul partajat trebuie să răspundă la șapte întrebări: ce problemă a existat; în ce context; ce s-a schimbat; ce dovezi avem; ce resurse au fost necesare; unde nu se aplică; ce trebuie verificat local.

Flux propus:

1. **Pregătește lecția.** Se selectează un caz și o versiune aprobată. Datele brute sensibile nu sunt incluse implicit.
2. **Revizuiește pachetul.** Proprietarul confirmă conținutul, dovezile și limitele; persoana autorizată aprobă partajarea.
3. **Primește ca referință.** Destinatarul vede proveniența, condițiile și versiunea sursă.
4. **Evaluează local.** Se completează rolurile, resursele, diferențele și riscurile specifice.
5. **Adaptează și aprobă.** Se creează o versiune locală cu relație explicită față de sursă.
6. **Rulează un pilot autorizat.** Criteriile și măsurătorile sunt stabilite înainte de interpretarea rezultatului.
7. **Verifică și răspunde.** Sunt acceptate rezultate pozitive, neutre, negative sau insuficiente.

Stări distincte: `primit`, `citit`, `în evaluare`, `neaplicabil`, `adaptare propusă`, `aprobat local`, `în pilot`, `evaluat`. O revizie nouă a sursei solicită verificarea adaptării locale; nu suprascrie automat SOP-ul destinatarului.

Nu recomandăm un clasament al aeroporturilor după numărul brut de incidente, descărcări sau „scor AI”. Valoarea colaborării este calitatea adaptării și verificării, nu popularitatea pachetului.

## 11. Indicatori, dovezi și limite de interpretare

ICAO recomandă selectarea indicatorilor în funcție de obiectiv și context și revizuirea relevanței lor. Catalogul ICAO oferă un cadru de referință, fără a face obligatoriu fiecare indicator inclus. [ICAO — managementul performanței](https://www.icao.int/safety-management/SMI/SMM/Chapter%204), [ICAO — catalogul indicatorilor](https://www.icao.int/safety/Indicator-Catalogue)

Propuneri de măsurare pentru FlyLeaf:

| Indicator | Definiție | Protecție împotriva interpretării greșite |
|---|---|---|
| Găsirea dovezii | Mediană și p90 pentru aceeași sarcină de căutare | Comparație cu un reper măsurat, fără ore „economisite” inventate |
| Completitudinea cazului | Dovezi prezente / dovezi cerute pentru tipul respectiv de caz | Numărul PDF-urilor nu este completitudine |
| Acțiuni verificate la termen | Acțiuni cu verificare acceptată la termen / acțiuni scadente | Statusul „închis” nu este suficient |
| Preluarea sarcinilor | Sarcini cu preluare confirmată / sarcini care cer preluare | Confirmarea nu dovedește singură execuția corectă |
| Recurență | Evenimente comparabile într-o perioadă și expunere definite | Nu comparăm numere brute între aeroporturi |
| Adoptare de cunoștințe | Pachete cu adaptare locală evaluată și rezultat documentat | Descărcările nu reprezintă adoptare |
| Calitatea AI | Afirmații susținute, erori factuale, abțineri corecte, nepotriviri detectate | Nu folosim un procent de încredere autodeclarat de model |
| Punctualitate | Plecări finalizate și perioada/criteriul definite | Riscurile și estimările nu intră ca rezultate observate |

Mai multe raportări după introducerea unui instrument mai simplu pot reflecta o captare mai bună, nu neapărat o deteriorare a siguranței. Mai puține raportări nu demonstrează automat îmbunătățire. Interpretarea cere expunere, severitate, context și calitatea raportării.

Pentru orice afirmație „SOP-ul a îmbunătățit KPI-ul”, raportul trebuie să arate: definiția KPI, reperul inițial, perioada, numitorul, schimbările simultane, datele lipsă și limitele atribuirii cauzale. Un demo simulat arată funcționarea mecanismului, nu efectul real asupra aeroportului.

## 12. România și demonstrația recomandată

Nu avem în această cercetare dovada că aeroporturile românești sunt în general nedigitalizate. Ipoteza de pilot este mai precisă: documentele, responsabilitățile și rezultatele pot fi fragmentate între hârtie, fișiere, foi de calcul și aplicații diferite. Se verifică prin interviuri și sarcini observate, nu prin afirmații generale în pitch.

Oportunități de produs: interfață clară în română; OCR local și surse vizibile; import din arhive existente; legarea documentelor fără înlocuirea imediată a tuturor sistemelor; acces în funcție de rol; colaborare cu context și adaptare locală. Acestea sunt ipoteze de valoare de testat, nu rezultate comerciale demonstrate.

Pentru hackathon, ordinea recomandată este:

1. **SP-02:** utilizatorul găsește o discrepanță documentară, vede paginile sursă și rezolvă cazul prin responsabil și dovadă. Arată utilitatea imediată.
2. **Predare de tură:** aceeași infrastructură produce o lecție care ajunge la Sibiu, unde AI detectează o diferență locală înaintea adoptării. Arată diferențiatorul de colaborare.
3. **FOD:** scenariu de extensie pentru conversația cu specialiștii; evidențiază că sistemul gestionează incertitudinea și nu inventează cauze.

Simularea vizuală poate rămâne o anexă demonstrativă. Povestea principală trebuie să încapă într-o cronologie lizibilă: **problema, dovezile, decizia, rezultatul și ce poate învăța partenerul**.
