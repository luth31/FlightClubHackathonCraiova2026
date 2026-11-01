# AI verificabil și colaborare SOP în FlyLeaf

**Data analizei:** 1 noiembrie 2026. **Tip:** audit al implementării și propunere de produs; nu descrie funcționalități nou implementate. Codul aplicației nu a fost schimbat în această analiză. Referințele la linii corespund checkoutului citit la această dată și pot migra odată cu editările.

## Decizia de produs

FlyLeaf are deja controale utile pentru documente și recomandări. Lacuna principală este închiderea buclei: **o recomandare justificată devine o schimbare locală testată, cu rezultat măsurat, apoi o practică transferabilă**. Aici merită concentrat demo-ul și următoarea implementare.

Povestea produsului: **document → observație → dovadă → propunere → aprobare → pilot → rezultat → adaptare la alt aeroport**. AI ajută la formularea și verificarea unei ipoteze; autoritatea operațională rămâne la persoanele desemnate, în limitele atribuțiilor lor. Simularea poate demonstra mecanismul, dar rezultatele ei nu demonstrează impact real într-un aeroport.

Recomandările de mai jos sunt alegeri de proiectare, nu afirmații că aplicația este certificată, că un SOP generat este aprobat de o autoritate sau că aceste controale elimină toate erorile.

## 1. Ce este deja construit

| Capacitate verificată în cod | Referință locală | Valoare practică |
|---|---|---|
| Analiza folosește un snapshot salvat de evenimente și proceduri | [engine.py](../backend/app/operations/procedures/engine.py), liniile 87–151 | Utilizatorul poate reconstitui datele pe care s-a bazat recomandarea. |
| Maximum două recomandări; lista poate fi goală | [engine.py](../backend/app/operations/procedures/engine.py), 58–84 | Sistemul nu este obligat să propună ceva pentru a părea util. |
| Numele, identificatorii de card și notele operaționale libere sunt excluse din dovezile operaționale trimise modelului | [engine.py](../backend/app/operations/procedures/engine.py), 94–106 | Analiza se poate concentra pe procese. Aceasta nu garantează că textul unui SOP încărcat nu conține date personale. |
| Validează schema, existența evenimentelor și codurile SOP | [engine.py](../backend/app/operations/procedures/engine.py), 165–175 | Respinge unele rezultate fabricate sau incomplete. |
| Calculează întârzierea o dată pe plecare și nu completează o economie estimată | [engine.py](../backend/app/operations/procedures/engine.py), 177–181 | Nu dublează întârzierea prin însumarea reperelor aceluiași zbor. |
| Folosește textul unui PDF aprobat mai nou în locul pașilor vechi din metadatele template-ului | [engine.py](../backend/app/operations/procedures/engine.py), 110–125 | Revizia documentului contează în analiză. |
| Propunerea produce ciornă, versiune PDF și sarcină de validare | [procedures/service.py](../backend/app/operations/procedures/service.py), 54–82 | AI nu publică direct o procedură. |
| Partajarea cere aprobare, copie verificată, versiune, destinatar și expirare | [sharing/service.py](../backend/app/sharing/service.py), 14–93 | Copia are un traseu controlat. |
| Accesul partenerului verifică revocarea, versiunea, destinatarul și integritatea fișierului | [exchange/service.py](../backend/app/exchange/service.py), 41–53 | Accesul poate fi revocat la sursă; o copie deja descărcată nu poate fi retrasă retroactiv. |
| Asistentul registrului folosește calcule și căutări deterministe pe metadate validate | [assistant/service.py](../backend/app/assistant/service.py), 15–58 | Numărătoarea și totalurile nu depind de generare probabilistică. |

[Testele procedurilor](../backend/tests/test_procedures.py) acoperă referințe inventate, calcul fără dublare, drepturi, versiuni PDF, ciorne și revocare. Acestea verifică **contractul tehnic**, nu calitatea recomandărilor unui model real: adaptorul LLM este substituit în testele de analiză, la liniile 36–43. Nu au fost executate teste noi pentru redactarea acestui document.

## 2. Probleme concrete și remedii

### 2.1. Bias de selecție înainte de model

La [engine.py](../backend/app/operations/procedures/engine.py), linia 90, selecția include numai grupurile cu abateri. La linia 108, aceasta este limitată la primele 120 de evenimente, începând cu rotațiile afectate cele mai recente. Modelul vede cazurile problematice, dar nu primește comparabil rotațiile în care procesul a funcționat. În plus, plafonul pe evenimente poate tăia o rotație între două evenimente, fără a păstra întregul context al acesteia.

**Propus:** selecție la nivel de rotație/caz, cu context complet și buget controlat; sumar determinist al întregii cohorte eligibile; eșantion explicit de cazuri afectate și neafectate. Raportarea trebuie să separe:

- perioada și regula de eligibilitate;
- totalul cazurilor eligibile, complet înregistrate, incomplet înregistrate și excluse;
- cazurile afectate și cele de comparație;
- de ce au fost selectate exemplele prezentate modelului;
- câte cazuri au rămas în afara payloadului și dacă distribuția diferă de cohorta completă;
- disponibilitatea fiecărui câmp folosit în analiză.

Selecția ar trebui stratificată după caracteristicile relevante pentru problema analizată: tip de operațiune, interval, resurse și condiții externe disponibile. Aceste câmpuri sunt în parte **de construit**. Nu presupunem că vremea, constrângerile ATC, competențele echipei sau disponibilitatea echipamentelor sunt deja integrate.

Un exemplu neutru nu este automat un control comparabil. Dacă nu există suficiente observații comparabile, aplicația arată tiparul descriptiv și cere date; nu estimează efectul unei intervenții.

### 2.2. Referință existentă versus afirmație susținută

La [engine.py](../backend/app/operations/procedures/engine.py), linia 172, validarea confirmă existența ID-ului citat. Aceasta nu confirmă că evenimentul susține semantic afirmația „verificarea târzie a provocat întârzierea”. `cause_hypothesis` este furnizat modelului la linia 105 și poate ancora explicația înainte de examinarea alternativelor.

Sunt trei verificări distincte:

1. **Referința există:** evenimentul sau fragmentul este real, accesibil și din versiunea declarată.
2. **Afirmația este susținută:** datele/fragmentul chiar spun ceea ce afirmă răspunsul.
3. **Concluzia este justificată:** chiar dacă faptele sunt corecte, inferența cauzală sau recomandarea poate fi prea puternică.

Backendul poate valida ferm identitatea sursei, versiunile și calculele. Pentru relații simple poate verifica explicit valori și ordine temporală. Un al doilea model poate semnala nepotriviri semantice, dar nu reprezintă o dovadă independentă infailibilă. Cazurile neclare ajung la revizuire competentă.

**Propus:** fiecare afirmație importantă are tipul `observed`, `inferred` sau `proposed`, dovezi precise și limite. O ipoteză include contraexemple și ce observație ar putea-o infirma. Etichetele de cauză existente se prezintă ca ipoteze introduse de sursă, nu drept adevăr demonstrat.

### 2.3. Autoritatea aparentă a surselor generale

[engine.py](../backend/app/operations/procedures/engine.py), liniile 187–190, moștenește referințe generale EASA/CDM când construiește proceduri. Acest lucru nu demonstrează că fiecare pas generat este cerut sau validat de acele surse.

**Propus:** trei categorii distincte în dosarul recomandării:

- **document local aplicabil:** identificator, versiune, statut, paragraf/pagină;
- **cerință externă verificată:** autoritate, ediție, paragraf, data aplicabilității și responsabilul verificării;
- **referință de context:** structură sau bună practică generală, fără pretenția că validează pasul propus.

Nu afișăm „conform EASA” pentru un SOP doar fiindcă are un link EASA în bibliografie. Datele de aplicabilitate și excepțiile nu se deduc din titlul documentului.

### 2.4. Pilotul este încă proză

`pilot` și `success_criteria` sunt șiruri de text în [engine.py](../backend/app/operations/procedures/engine.py), liniile 54–55. Nu există în modelele operaționale o entitate distinctă pentru planul unui pilot, eligibilitate, rezultate sau decizia de închidere.

**Propus:** planul devine un obiect versionat, aprobat înainte de colectarea rezultatelor. Faptul că modelul a scris „măsurăm două săptămâni” nu pornește pilotul și nu dovedește că pilotul a avut loc.

### 2.5. Colaborarea se oprește la vizualizarea PDF-ului

[ReceivedLibrary.tsx](../frontend/src/features/sharing/ReceivedLibrary.tsx), liniile 14–16, listează și deschide copia. [exchange/service.py](../backend/app/exchange/service.py), liniile 65–68, transmite metadate de acces, titlu, versiune și hash. Nu există un dosar structurat de practică, un flux de adaptare, pilot local sau feedback de rezultat.

**Propus:** obiectul partajat devine „practică + context + dovezi + limite”, cu PDF-ul ca document controlat asociat. Destinatarul primește o bază de evaluare, nu o procedură automat aplicabilă.

### 2.6. Cache-ul nu include modelul configurat

[Documentația actuală](SOP_OPTIMIZATION.md) spune că schimbarea modelului marchează analiza ca veche. În cod, fingerprintul include promptul/schema, dar nu modelul configurat: [engine.py](../backend/app/operations/procedures/engine.py), liniile 132–137 și 196–205. Modelul este salvat după răspuns, la linia 223.

**Propus, corecție mică:** includeți în fingerprint modelul efectiv selectat, versiunea contractului, versiunea selectorului de dovezi și definițiile măsurilor. Un model nou nu trebuie să primească automat un rezultat vechi etichetat ca analiză curentă a configurației noi. Reproductibilitatea înseamnă păstrarea intrărilor și configurației, nu promisiunea că orice rerulare LLM produce text identic.

### 2.7. Motorul legacy produce un contrafactual optimist

Endpointurile `/operations/strategies` din [router.py](../backend/app/operations/router.py), liniile 58–65, folosesc [strategies.py](../backend/app/operations/strategies.py), liniile 65–75. Acesta scade întreaga întârziere a zborurilor etichetate cu o anumită cauză într-o estimare contrafactuală. Ipotezele sunt declarate, dar rezultatul nu este impact măsurat. UI nou este mai prudent.

**Propus:** nu amestecați acest contrafactual cu rezultatele pilotului sau cu economii realizate. Decideți dacă endpointul rămâne un instrument separat, explicit demonstrativ, sau este retras după verificarea dependențelor.

### 2.8. Citările asistentului registrului sunt metadate

[assistant/service.py](../backend/app/assistant/service.py), liniile 12–13, returnează `page: 1`, iar extrasul provine din rezumatul documentului. Acesta nu este un fragment verificat de pe prima pagină.

**Propus:** eticheta „sursă: registru/metadate validate” pentru asemenea răspunsuri; link la document fără pagină inventată. Pentru întrebări asupra conținutului, folosiți fragmentul real, pagina, versiunea și ruta de extracție. OCR-ul incert necesită verificare. Un jurat care deschide sursa trebuie să găsească dovada promisă.

## 3. Contractul propus pentru o recomandare

### Prezentarea implicită

Cardul trebuie să răspundă la patru întrebări: **ce am observat, ce propunem, de ce merită verificat, ce trebuie făcut acum**. Detaliile apar la cerere.

Exemplu exclusiv ilustrativ; numerele nu sunt rezultate măsurate în proiect:

> **Observație:** 4 din 18 rotații eligibile au confirmat disponibilitatea echipamentului după reperul planificat.  
> **Propunere:** evaluarea unei confirmări mai devreme, printr-un pilot aprobat local.  
> **Motiv:** 3 dintre cele 4 rotații au avut ulterior întârziere la poartă; succesiunea nu dovedește cauza.  
> **Lipsește:** disponibilitatea echipamentului de rezervă în cele patru cazuri.  
> **Următorul pas:** responsabilul tehnic verifică această informație.

Acțiuni: „Vezi dovezile”, „Compară modificarea”, „Pregătește pilotul”. Nu afișăm implicit toate ipotezele, toate etapele SOP și toată bibliografia într-un singur card.

### Contract tehnic orientativ, de implementat

```text
Recommendation
  id, status, airport_id
  provenance
    model_id, analysis_contract_version, evidence_selector_version
    input_snapshot_id, input_fingerprint, created_at
  observation
    metric_definition_id, numerator, denominator, period
    eligibility_rule, missing_count, excluded_count
    calculated_value, calculation_version
  claims[]
    text, kind: observed | inferred | proposed
    evidence_refs[], support_status, reviewer_note
  evidence[]
    source_type: event | document | register | external_reference
    source_id, version, sha256, page_or_field, exact_span
    occurred_at, recorded_at, extraction_method, review_status
  hypothesis
    explanation, alternatives[], counterexamples[]
    disconfirming_observation, causal_status
  local_fit
    required_roles[], qualifications[], resources[], conditions[]
    verified_conditions[], missing_conditions[], blocking_conditions[]
  proposed_delta
    base_sop_id, base_version, changed_steps[], preserved_controls[]
  constraints[]
    origin, reference, applicability, verification_status
  pilot_plan_id
  review
    decision, reason_codes[], rationale, actor_id, reviewed_at
```

Acest contract nu cere ca toate câmpurile să fie vizibile permanent. În MVP, structura poate fi mai mică, dar nu trebuie să amestece observația, ipoteza și rezultatul.

Datele cantitative și denominatorii sunt calculate în backend, nu inventate de model. `support_status` trebuie să reflecte verificări explicite, nu o probabilitate autoestimată de LLM. Nu afișăm „încredere 92%” fără definiție și calibrare măsurată.

Stări utile pentru oameni: **date insuficiente**, **surse în conflict**, **ipoteză netestată**, **gata pentru revizuire**, **pilot aprobat**, **rezultat observat**, **neconcludent**, **respins**. „Aprobat” descrie o decizie umană și versiunea ei, nu certitudinea științifică a efectului.

### Când sistemul se abține

| Condiție | Comportament util |
|---|---|
| Lipsește un câmp critic | Cere verificarea acelui câmp, cu responsabil și legătura la caz. |
| Documente curente contradictorii | Semnalează conflictul și cere rezolvarea de către responsabil. |
| SOP de bază depășit | Reanalizează după identificarea versiunii aplicabile. |
| Nu există cohortă comparabilă | Arată observația; nu estimează beneficiul. |
| Resursa presupusă nu există | Nu propune implementarea în forma respectivă. |
| Recomandarea depășește atribuțiile aeroportului | Identifică actorul competent și limitează propunerea la coordonare/documentare. |
| Extracție OCR incertă pentru un detaliu decisiv | Cere confirmarea din original. |
| Nu există dovadă pentru o schimbare | Returnează zero recomandări și explică ce ar justifica reluarea analizei. |

Un refuz util arată ce lipsește și următorul pas. Nu lasă utilizatorul cu un mesaj generic de eroare.

## 4. Flux tehnic propus și bariere de verificare

1. **Ingestie:** original, versiune, hash, proveniență, control de acces, text/pagini și starea OCR.
2. **Validare a datelor:** câmpurile folosite pentru calcule sunt confirmate; lipsurile rămân explicite.
3. **Definire cohortă:** eligibilitatea și definițiile măsurilor se fixează înaintea interpretării.
4. **Selectare dovezi:** sumar complet + exemple comparabile, cu criterii de selecție salvate.
5. **Generare limitată:** modelul propune cel mult câteva ipoteze și modificări locale; sursele sunt date neîncrezute, nu instrucțiuni.
6. **Verificări deterministe:** schemă, permisiuni, identitate/versiune a sursei, cifre, cronologie și referințe.
7. **Verificare semantică:** fiecare afirmație importantă este comparată cu sursa; rezultatele incerte sunt marcate. Un verifier AI suplimentar poate ajuta, dar nu înlocuiește dovezile.
8. **Verificare de aplicabilitate:** resurse, competențe, limite, conflicte cu documentele locale.
9. **Revizuire umană:** decizie explicată și asociată versiunii; separarea inițiatorului de avizator acolo unde fluxul local o cere.
10. **Pilot și rezultat:** numai o stare aprobată permite trecerea la pilot; numai datele înregistrate produc rezultate măsurate.

Protecția împotriva instrucțiunilor introduse în documente trebuie testată. Promptul existent declară conținutul neîncredere, dar această instrucțiune nu este o garanție. Parserul, selectarea documentelor și acțiunile disponibile modelului trebuie limitate; generarea textului nu primește autoritatea de a modifica stări sau trimite documente.

## 5. Colaborarea: dosar transferabil și adaptare locală

### Obiectul de schimb

O **fișă de practică** propusă conține:

- problema și scopul;
- contextul aeroportului, cu minimum de date necesare;
- documentul controlat, versiunea și schimbarea exactă;
- resurse, competențe și condiții necesare;
- procedura de pilot și definițiile indicatorilor;
- rezultatele, numărătorii/numitorii și calitatea datelor;
- limitele, condițiile de neaplicabilitate și rezultatele negative;
- starea: propunere, pilot, adoptată local, retrasă sau în revizuire;
- responsabilul, istoricul versiunilor, drepturile de utilizare/adaptare;
- relația cu practicile din care a fost derivată.

Nu se transmite implicit istoricul individual al angajaților sau jurnalul brut complet pentru a demonstra că o practică a funcționat.

### Fluxul destinatarului

CTA principal în „Primite”: **Evaluează pentru aeroportul nostru**.

1. Compară condițiile sursei cu cele locale.
2. Marchează „aplicabil”, „necesită adaptare” sau „nu este potrivit”, cu motiv.
3. Adaptează rolurile, resursele și documentele de referință.
4. Creează o ciornă locală cu proveniență păstrată.
5. Obține validarea și aprobarea locală.
6. Aprobă și urmărește un pilot local.
7. Închide pilotul cu rezultat pozitiv, negativ, mixt sau neconcludent.
8. Partajează înapoi, după revizuire, un rezultat agregat și limitele sale.

Aprobarea aeroportului sursă nu se transferă. Propunerea nu transformă dreptul actual de vizualizare a PDF-ului într-un drept implicit de creare a copiilor derivate. Pachetul partajat trebuie să exprime explicit drepturile de utilizare și păstrare.

### Versiuni, revocare și modificări la sursă

Revocarea oprește accesul viitor la sursă. Nu poate șterge retroactiv fișiere deja descărcate. Dacă o adaptare locală a fost creată legal într-un flux care permitea păstrarea, politica trebuie să stabilească soarta acelei adaptări; nu o presupunem identică cu o simplă vizualizare remote.

O revizie a practicii sursă creează o sarcină de evaluare pentru adoptatori. Nu suprascrie automat procedura locală. O retragere de siguranță trebuie diferențiată de o schimbare editorială, cu responsabil și traseu de notificare stabilite de organizații. Acest traseu este **de proiectat**, nu există în schimbul actual de PDF-uri.

### Descoperire fără clasamente înșelătoare

Filtre utile: problemă, tip de operațiune, resurse necesare, compatibilitate, nivel de dovezi, limite și data revizuirii. Nu recomandăm feed, like-uri sau „cel mai bun aeroport”. Popularitatea și prestigiul sursei nu demonstrează aplicabilitatea.

Rezultatele negative trebuie păstrate: „a funcționat la Craiova, nu a fost fezabil la Sibiu din cauza resursei X” poate fi mai valoros decât un PDF declarat universal bun. Fără rezultate negative, biblioteca acumulează bias de publicare.

## 6. Model minim de date, propus

| Entitate nouă | Conținut minim | Regula principală |
|---|---|---|
| `PracticeDossier` | problemă, context, SOP/version, proveniență, drepturi, stare | Nu confundă ciorna cu practica validată local. |
| `ApplicabilityReview` | aeroport destinatar, condiții, diferențe, decizie, responsabil | Copia primită nu devine automat procedură locală. |
| `LocalAdaptation` | sursă, ciornă locală, diferențe, avizări | Păstrează legătura și versiunea exactă a sursei. |
| `PilotPlan` | eligibilitate, baseline, măsuri, perioadă/eșantion, responsabil, oprire | Se aprobă înainte de evaluarea rezultatelor. |
| `PilotObservation` | caz eligibil, date, proveniență, lipsuri | Datele lipsă nu se transformă în zero. |
| `PilotOutcome` | rezultat calculat, limite, decizie, revizuit de | Poate fi negativ sau neconcludent. |
| `PracticeFeedback` | rezultat agregat, context local, vizibilitate, avizare | Nu partajează automat datele brute. |

Stări orientative: `draft → applicability_review → local_review → approved_for_pilot → running → outcome_review → adopted / rejected / inconclusive / withdrawn`. Acestea nu înlocuiesc fluxul documentar existent; fiecare tranziție leagă documentul și versiunea relevante.

## 7. Măsurare și evitarea concluziilor false

Principii pentru pilot:

- Afișăm numărător și numitor, nu doar procent: „4/18 rotații”.
- Definim înainte ce înseamnă rotație eligibilă și ce excludem.
- Comparam perioade/cohorte suficient de asemănătoare; notăm schimbările de trafic, echipă, handling, vreme și constrângeri externe atunci când avem date verificate.
- Raportăm distribuția întârzierilor, de exemplu mediană și extreme relevante, nu doar totalul. Totalul se schimbă și odată cu volumul traficului.
- Separăm întârzierea observată de întârzierea atribuibilă intervenției. Un înainte/după simplu poate fi descriptiv, fără a demonstra cauzalitate.
- Lipsa unei înregistrări nu dovedește că verificarea nu s-a făcut.
- Scăderea raportărilor de incidente poate însemna subraportare; nu o recompensăm automat.
- „Zero incidente în 20 de rotații” nu demonstrează siguranța procedurii.
- Monitorizăm controale omise, încărcare de lucru, rework și near misses. Economisirea timpului nu trebuie să rezulte din eliminarea unui control necesar.
- Nu clasăm aeroporturile după rate brute fără context și definiții comune.

Pentru primul pilot, măsura principală poate fi apropiată de schimbarea propusă: de exemplu, confirmarea documentată a disponibilității înainte de un reper definit local. Punctualitatea devine rezultat secundar. Alegerea reperului și a eșantionului trebuie validată local; nu este o limită operațională furnizată de acest document.

Datele sintetice pot demonstra că aplicația calculează corect și urmărește stările. Nu pot susține o promisiune comercială de reducere a incidentelor sau întârzierilor într-un aeroport real.

## 8. Evaluare AI și reducerea bias-ului

### Set de evaluare pentru MVP

Propunere practică de 24 de cazuri, nu standard statistic și nu scor deja obținut:

| Familie | Exemple | Ce verificăm |
|---|---|---|
| 8 cazuri cu recomandare posibilă | tipar repetat, comparație disponibilă, resursă confirmată | relevanță, specificitate, diferența propusă și fezabilitate |
| 8 cazuri insuficiente/contradictorii | date lipsă, SOP conflictual, versiune veche, cohortă nepotrivită | abținere și următorul pas util |
| 8 cazuri adversariale | citare reală dar irelevantă, OCR greșit, prompt injection în PDF, selecție convenabilă a rezultatelor | rezistență la fabricație, utilizare greșită a surselor și bias |

Metrici: referințe valide; afirmații susținute; cifre corecte; abținere corectă; fezabilitate locală; erori importante care scapă; timp de verificare; numărul și tipul corecțiilor cerute de oameni. Un scor agregat nu trebuie să ascundă o eroare critică. Pragurile de acceptare și severitatea erorilor se definesc înainte de rulare.

Păstrăm separat cazurile de dezvoltare și cazurile de evaluare. Rulăm aceleași cazuri după schimbarea modelului, promptului, selecției dovezilor sau extragerii. Salvăm rezultatul și configurația. Nu pretindem că simpla trecere a 24 de exemple validează un sistem pentru exploatare aeroportuară.

### Oamenii pot introduce bias chiar cu AI bine limitat

- Folosim aceeași rubrică pentru o propunere umană și una AI.
- Într-un experiment de evaluare cu participanți informați, autorul poate fi ascuns și ordinea randomizată. În produs, proveniența rămâne transparentă.
- Evaluatorii notează independent înainte de discuția comună.
- Păstrăm dezacordurile și motivele; un vot majoritar nu dovedește corectitudinea tehnică.
- Separăm verdictul asupra dovezilor de preferința pentru soluție.
- Testăm limbi, calități de scanare și contexte de aeroport diferite.
- Respingerea de către un reviewer devine feedback verificabil, nu etichetă de antrenare automat corectă.
- Nu afișăm clasamente individuale ale angajaților bazate pe etichete de întârziere.

NIST identifică riscuri precum confabulația, aversiunea față de AI, încrederea excesivă și automation bias; explicațiile sau citările aparent convingătoare pot fi și ele eronate. Acesta justifică o abordare bazată pe dovezi și evaluare, fără promisiunea eliminării erorilor. Sursa este un cadru voluntar general, nu certificarea FlyLeaf. [NIST AI 600-1, iulie 2024](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)

EASA urmărește o abordare centrată pe om. Anunțul din 3 iunie 2026 descrie Issue 03 drept propunere de Concept Paper pentru consultare; nu îl prezentăm ca aprobare a aplicației sau a SOP-urilor generate. [EASA, anunț Issue 03](https://www.easa.europa.eu/en/newsroom-and-events/news/easa-releases-latest-issue-its-concept-paper-artificial-intelligence)

### Mentori și jurați

Nu putem elimina bias-ul evaluatorilor. Putem face concluzia mai ușor de verificat: aceeași sarcină înainte/după, criterii legate de regulamentul real al hackathonului, date și limite vizibile, timp măsurat, un succes și un refuz justificat. Nu presupunem criteriile concursului în lipsa regulamentului și nu prezentăm simularea drept pilot real.

## 9. Date personale, acces și schimb între aeroporturi

Actualul snapshot operațional exclude mai multe identificatoare, dar textul PDF-ului aprobat poate fi transmis ca atare în analiză. O politică de minimizare trebuie aplicată tuturor surselor, inclusiv documentelor, nu doar câmpurilor jurnalului.

**Propus:** clasificare a datelor înainte de analiză, câmpuri permise pentru fiecare scop, autorizare la sursă și la citare, eliminarea identificatorilor nenecesari, segregare pe aeroport și revizuirea rezultatelor înainte de partajare. Pseudonimizarea nu trebuie prezentată drept anonimizare garantată.

Pentru rezultate comune, preferăm agregate cu contexte suficiente pentru interpretare, dar fără grupuri atât de mici încât persoanele să fie ușor deduse. Pragurile de agregare și regulile de retenție trebuie stabilite de organizațiile implicate; nu sunt definite juridic de acest document. Un aeroport păstrează acces doar la dovezile pentru care este autorizat, inclusiv când primește o recomandare derivată.

Adaptorul actual trimite `store: false` în cererea către model ([llm/service.py](../backend/app/llm/service.py), liniile 23–27). Această setare tehnică nu înlocuiește evaluarea acordurilor cu furnizorul, a politicilor de retenție aplicabile contului și a temeiului de prelucrare. Nu afirmați „datele nu părăsesc aeroportul” pentru funcțiile care apelează un serviciu extern.

## 10. Priorități de implementare

| Prioritate | Livrabil propus | Criteriu concret de acceptare |
|---|---|---|
| P0 | Corectarea citărilor și provenancei | Un link conduce la câmpul/pagina/versiunea care susține afirmația; rezumatul registrului nu pretinde pagină exactă. |
| P0 | Fingerprint complet și selecție de dovezi mai corectă | Schimbarea modelului invalidează cache-ul; cohorta și comparațiile sunt vizibile; cazurile trunchiate nu sunt prezentate drept complete. |
| P0 | Fișa dovezii compactă | Utilizatorul vede observația, propunerea, lipsurile și următorul pas fără a citi SOP-ul complet. |
| P1 | „Evaluează pentru aeroportul nostru” | Destinatarul poate documenta aplicabilitatea și crea o ciornă locală autorizată, cu proveniență. |
| P1 | Pilot urmărit în aplicație | Există plan aprobat, observații, rezultat calculat și decizie; textul AI singur nu mută starea. |
| P1 | Rezultat agregat partajat | Sunt păstrate rezultate negative și limite, cu revizuire și drepturi explicite. |
| P2 | Evaluare sistematică și notificări de revizie | Regresiile sunt măsurate, iar modificarea sursei creează evaluare locală, nu suprascriere. |

Ordinea recomandată pentru hackathon este **fișa dovezii → adaptarea locală → pilotul**. Se reutilizează registrul, versiunile, avizările și gateway-ul deja construite. Mai multe animații sau mai multe SOP-uri generate nu închid singure bucla de valoare.

## 11. Ce putem demonstra cinstit

Un traseu scurt:

1. Deschidem un caz și documentul care îl susține.
2. Arătăm un tipar calculat și cazurile comparabile.
3. AI propune o schimbare și spune ce nu știe.
4. Un responsabil verifică sursa și diferența propusă.
5. Aplicația creează ciorna și planul de pilot, în stări distincte.
6. Un rezultat demonstrativ este etichetat ca sintetic.
7. Aeroportul partener evaluează aplicabilitatea și creează propria adaptare.
8. Într-un al doilea caz, datele sunt insuficiente și sistemul refuză să estimeze un beneficiu.

Pașii privind cohortele comparabile, obiectul de pilot și adaptarea locală sunt **propuși, nu funcționalități existente** la data auditului. Demo-ul trebuie să distingă clar implementarea funcțională, prototipul vizual și roadmapul.

## Surse și documente conexe

- [Documentația implementării SOP](SOP_OPTIMIZATION.md)
- [Documentația operațiunilor](AIRPORT_OPERATIONS.md)
- [Prezentarea repositoryului](../README.md)
- [NIST AI 600-1: Generative Artificial Intelligence Profile, 2024](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)
- [EASA: Artificial Intelligence Roadmap](https://www.easa.europa.eu/en/domains/research-innovation/ai)
- [EASA: Proposed Issue 03, anunț din 3 iunie 2026](https://www.easa.europa.eu/en/newsroom-and-events/news/easa-releases-latest-issue-its-concept-paper-artificial-intelligence)

Sursele externe susțin contextul privind riscurile AI și abordarea centrată pe om. Contractele, fluxurile și prioritățile din acest document sunt propuneri de proiectare rezultate din auditul codului, nu cerințe prescrise textual de aceste surse.
