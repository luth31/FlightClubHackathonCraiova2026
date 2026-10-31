# Furnizori — analiză și starea implementării

## Actualizare: branch `suppliers-improvements`, 31 octombrie 2026

Cele șapte sarcini din planul cu impact semnificativ sunt implementate:

| Livrare | Funcționalități disponibile |
|---|---|
| A — Context și controale | Data prestației, moneda și referința contractuală persistate; cinci controale explicite; date lipsă marcate; validarea locală a e-mailului; blocarea deciziilor pe referințe învechite |
| A — Trasabilitate | Actorii și momentele deciziilor, inclusiv aprobări fără comentariu; istoric bancar; reevaluări legate și deduplicate; cazurile vechi rămân nemodificate |
| A — Consultare | Căutare după nume, e-mail, IBAN și ID, normalizarea diacriticelor/spațiilor; filtre stare/risc/perioadă; paginare; export CSV cu aceleași drepturi și filtre |
| B — Registru | Identitate stabilă, CUI pentru furnizori noi, adresă/categorie, activ/suspendat; fișă și contracte multiple asociate explicit; alegerea contractului verificat |
| B — Înregistrare inițială | Dosar cu contract și 1–10 dovezi versionate; metodă/persoană/contact/notă; confirmare umană și aprobare de altă persoană; crearea atomică a furnizorului și istoricului inițial |
| C — Responsabilitate | Atribuire și termen de către director, istoric și revizie concurentă; „Ale mele”; indicarea termenului depășit și reatribuirii după dezactivare ori confirmare de către responsabil |

Datele sunt limitate pe server la aeroport și documentele accesibile. Atribuirea este organizatorică și nu acordă autoritate de aprobare. Datele bancare din documente încărcate nu devin automat de încredere. Migrațiile păstrează ID-urile și deciziile existente; câmpurile istorice lipsă rămân neînregistrate. Furnizorii vechi pot avea CUI nul; editarea identității fiscale sau a contactului verificat nu este inclusă.

**Backlog rămas:** contacte/conturi multiple și schimbarea contactului verificat, atașamente structurate pentru verificările bancare existente (dovezile versionate sunt disponibile la înregistrarea inițială), registru de facturi și consum contractual cumulat, import PDF/EML, OCR/AI, integrare e-Factura/ERP și notificări programate. Monedele diferite sunt semnalate fără conversie; validarea bancară rămâne RO.

Rezultatele proaspete și limitele verificării sunt în [VERIFICATION.md](VERIFICATION.md). Verificarea vizuală desktop/390 px a noilor ecrane rămâne neexecutată: browserul automatizat nu a fost disponibil, iar accesul nativ la Chrome a fost refuzat.

**Secțiunile 1–6 de mai jos păstrează analiza inițială, înaintea implementării.** Problemele 3.1, 3.2, 3.3 și 3.5 au fost rezolvate; 3.4 rămâne backlog. Constatările despre lipsa CUI-ului, contractelor multiple, înregistrării, atribuirii și filtrelor descriu versiunea inițială.

**Data analizei:** 31 octombrie 2026.

**Aplicație:** AeroDesk.

**Metodă:** analiză a interfeței React, API-ului, modelelor de date, inițializării registrului și documentației; executarea testelor dedicate și reproducerea separată a cinci cazuri-limită.

## 1. Evaluare generală

Modulul Furnizori este, în prezent, un **registru demonstrativ de date bancare și un flux de verificare a solicitărilor de modificare**. Utilizatorul introduce informațiile primite, aplicația le compară cu registrul și contractul, apoi păstrează confirmarea umană și decizia unei alte persoane.

Punctele puternice sunt separarea verificatorului de aprobator, validarea IBAN-ului, explicațiile pentru neconcordanțe și protecția împotriva aprobării pe baza unui contract sau cont bancar modificat între timp.

Nu există încă administrarea completă a furnizorilor: înregistrare inițială, date fiscale, mai multe contacte, alegerea între mai multe contracte, dosar cu dovezi și urmărirea facturilor. Următorul pas recomandat este consolidarea trasabilității și a fluxului de lucru, urmată de extinderea registrului.

## 2. Funcționalități existente

### 2.1. Acces și interfață

- Secțiunea este disponibilă rolurilor **director** și **finance / Financiar**. Restricția există atât în navigare, cât și în API.
- Datele sunt limitate la aeroportul utilizatorului și la documentele pe care acesta le poate consulta.
- Sunt disponibile două file: **Verificări** și **Registru furnizori**.
- Indicatorii afișează solicitările de verificat, cazurile verificate care așteaptă o altă persoană și numărul furnizorilor disponibili.
- Căutarea locală filtrează după numele furnizorului și adresa expeditorului/contactului. Nu caută după IBAN sau identificatorul cazului și nu normalizează diacriticele.
- Lista verificărilor este ordonată descrescător după momentul creării. Prezintă furnizorul, prima neconcordanță, data și starea.
- Există stări de încărcare, mesaje de eroare cu reîncercare, liste goale și notificări după acțiuni.

### 2.2. Registrul furnizorilor

Pentru fiecare furnizor disponibil sunt afișate:

- denumirea;
- IBAN-ul de referință, grupat pentru lizibilitate;
- contactul cunoscut;
- proveniența demonstrativă sau aprobarea independentă a modificării;
- legătura către contractul sursă;
- numărul versiunilor de cont păstrate.

**Cum se formează registrul:** inițializarea folosește contractele demonstrative și metadatele lor, cu IBAN valid și contact cunoscut. Datele extrase dintr-un document încărcat de utilizator nu devin automat date bancare de încredere.

**Limită:** există istoric bancar în baza de date și în răspunsul API, dar interfața afișează doar numărul versiunilor. Nu există formular sau API pentru crearea, editarea generală ori dezactivarea furnizorului.

Lista disponibilă în UI include doar furnizorii al căror contract sursă este accesibil, validat și în starea `approved` sau `signed`. Nu reprezintă toate înregistrările din baza de date.

### 2.3. Înregistrarea unei solicitări

Formularul „Verifică o solicitare” permite:

| Informație | Comportament actual |
|---|---|
| Furnizor | Alegere din registrul disponibil; contractul sursă este preluat automat |
| Adresa expeditorului | Obligatorie; formularul folosește un câmp HTML de tip e-mail |
| IBAN comunicat | Obligatoriu; comparat cu IBAN-ul din registru |
| Valoare factură | Opțională; interfața o prezintă în RON |
| Data prestației | Opțională; folosită la verificarea perioadei contractuale |
| Conținutul solicitării | Text introdus manual; păstrat și afișat în detalii |

Sunt disponibile trei exemple demonstrative: aceleași date, contact cunoscut cu IBAN diferit și adresă asemănătoare cu IBAN diferit.

API-ul permite și introducerea unui nume fără contract, pentru a semnala un furnizor necunoscut. **Această posibilitate nu este expusă în formularul curent**, care necesită selectarea unui furnizor existent.

Nu există import efectiv de factură/PDF/EML în acest formular și nici extragere automată din textul solicitării. Regulile folosesc câmpurile structurate introduse separat.

### 2.4. Reguli automate de verificare

| Regulă | Ce verifică | Limită practică |
|---|---|---|
| `iban_mismatch` | IBAN-ul primit diferă de cel din registru | Detectează diferența, fără verificarea proprietarului contului |
| `invalid_iban` | Structura IBAN-ului românesc și suma de control MOD 97 | Sunt acceptate doar IBAN-uri RO; codul băncii nu este verificat într-un registru extern |
| `lookalike_sender` | Adresa diferă, dar seamănă cu contactul cunoscut | Similaritate textuală cu prag de 0,75; fără analiză SPF/DKIM/DMARC |
| `unknown_sender` | Adresa diferă de contact și nu trece pragul de similaritate | Există un singur contact de referință per furnizor |
| `unknown_supplier` | Furnizorul nu are înregistrare în registru | Nu există încă flux de înregistrare inițială |
| `source_not_approved` | Contractul lipsește, nu este validat sau nu este aprobat/semnat | Nu echivalează cu verificarea tuturor documentelor necesare plății |
| `amount_above_contract` | Suma unei facturi depășește valoarea contractului | Nu cumulează facturile și nu gestionează moneda/TVA în dosarul verificării |
| `outside_service_period` | Data este înainte de început sau după expirarea contractului | Se execută doar când data este furnizată, folosind limitele disponibile |

IBAN-urile sunt normalizate prin eliminarea spațiilor și conversia în majuscule; adresele sunt curățate la capete și convertite în litere mici.

API-ul calculează un nivel orientativ: `high` pentru IBAN diferit/invalid, `medium` pentru alte neconcordanțe și `low` în lipsa lor. Interfața nu afișează acest nivel ca indicator separat. Acesta nu este un scor de probabilitate a fraudei.

### 2.5. Stări și decizii

| Stare | Semnificație și acțiuni |
|---|---|
| `clear` — Fără diferențe | Nu au fost găsite diferențe prin regulile executate; nu trece prin confirmare și aprobare |
| `needs_review` — Necesită verificare | Există neconcordanțe; se poate respinge sau înregistra o confirmare dacă furnizorul este cunoscut și IBAN-ul valid |
| `verified` — Verificat independent | Este păstrată confirmarea umană; poate fi respins sau aprobat de altă persoană dacă nu rămân probleme contractuale/de factură |
| `approved` — Aprobat intern | Decizia este înregistrată; IBAN-ul din registru se actualizează dacă diferă |
| `rejected` — Respins | Decizie finală cu motiv obligatoriu; registrul bancar nu se actualizează |

Confirmarea independentă necesită contactul cunoscut din registru și o notă de minimum 10 caractere după eliminarea spațiilor de la capete. Aplicația înregistrează declarația persoanei; nu contactează automat furnizorul.

La aprobare:

- verificatorul nu își poate aproba propria confirmare;
- atât directorul, cât și utilizatorul Financiar pot verifica sau aproba, cu condiția să fie persoane diferite;
- contractul trebuie să fie încă aprobat/semnat în versiunea verificată;
- IBAN-ul de referință nu trebuie să fi fost modificat între timp;
- problemele de sursă, plafon, perioadă, furnizor necunoscut sau IBAN invalid blochează aprobarea;
- schimbarea contului adaugă o versiune în istoricul bancar, cu verificator, aprobator, caz sursă și moment;
- comentariul aprobării este opțional; motivul respingerii este obligatoriu.

Creatorul solicitării poate fi și verificatorul. Regula existentă separă **verificatorul de aprobator**, fără să impună trei persoane distincte.

### 2.6. Trasabilitate și protecții

- Cazul păstrează contractul și versiunea sa, IBAN-ul/contactul de referință, informațiile primite, motivele, actorii, momentele și notele deciziilor.
- Evenimentele de creare, confirmare, aprobare și respingere sunt înregistrate în jurnalul aplicației.
- Solicitările identice sunt deduplicate. Amprenta include și contextul contractului și registrului; reimportul după schimbarea acestora produce o evaluare nouă.
- Scrierile sunt serializate prin tranzacții SQLite `BEGIN IMMEDIATE`. Două aprobări concurente pentru conturi diferite nu pot suprascrie succesiv aceeași referință veche.
- Jurnalul este administrat de aplicație; nu există o arhivă de audit independentă și imuabilă.

**Delimitare funcțională:** modulul nu citește căsuțe de e-mail, nu verifică titularul contului și nu execută sau blochează plăți externe. „Fără diferențe” și „Aprobat intern” nu sunt autorizații de plată.

## 3. Probleme și limite confirmate

Primele, a treia și a cincea constatare sunt probleme de trasabilitate, validare sau interfață. Celelalte descriu verificări care sunt intenționat parțiale în implementarea actuală, dar au nevoie de explicații mai clare sau de extindere.

### 3.1. Data prestației nu se păstrează în dosarul verificării

**Reproducere:** pentru un contract demonstrativ cu expirare la `2026-11-15`, o solicitare cu `service_date: 2026-11-16` primește motivul `outside_service_period`. Data nu există însă în răspunsul cazului și nici ca atribut în modelul persistent `SupplierReview`.

**Cauză:** câmpul există în schema de intrare și în calculul regulilor/amprentei, dar lipsește din modelul de stocare și serializare.

**Impact:** la consultarea ulterioară nu poate fi identificată exact data care a provocat neconcordanța. Amprenta nu permite recuperarea valorii.

**Recomandare:** păstrarea datei și afișarea ei lângă perioada contractuală folosită la verificare; păstrarea explicită a valorii, monedei și limitelor contractuale evaluate. Pentru cazurile istorice fără dată, afișarea „neînregistrată”, fără reconstruire presupusă.

### 3.2. „Fără diferențe” poate însemna că unele verificări nu s-au executat

**Reproducere:** IBAN și expeditor identice cu registrul, contract validat/aprobat, fără sumă și fără dată → `clear`, fără motive.

**Cauză:** suma și data sunt opționale, iar regulile lor se execută condiționat. Nu există rezultate separate pentru controale neefectuate.

**Impact:** utilizatorul vede aceeași stare pentru o verificare cu date complete și una limitată la cont/contact/sursă.

**Recomandare:** afișarea controalelor „executat / neefectuat / neaplicabil”. Pentru o verificare de factură, solicitarea sumei, monedei și datei; pentru verificarea exclusivă a contului, păstrarea unui formular mai simplu cu rezultat explicit delimitat.

### 3.3. Validarea formatului e-mailului există în formular, dar nu în API

**Reproducere:** `sender_email: "not-an-email"` este acceptat de API și produce `unknown_sender`.

**Cauză:** schema backend folosește un șir cu limite de lungime, fără validare de adresă. Câmpul HTML `type="email"` poate fi ocolit prin apelarea directă a API-ului.

**Recomandare:** validare pe server pentru expeditor și contactele înregistrate, cu erori clare. Validarea sintaxei nu trebuie prezentată drept autentificarea expeditorului.

### 3.4. Plafonul contractual este verificat separat pentru fiecare solicitare

**Reproducere:** două solicitări distincte de câte 700 RON, pe un contract de 1.000 RON, primesc fiecare `clear` dacă celelalte date coincid.

**Cauză:** regula compară fiecare sumă cu `Document.value`; nu există registru de facturi și total utilizat al contractului.

**Impact:** funcția actuală nu detectează depășirea cumulată. Solicitările de verificare nu trebuie însumate automat, deoarece pot reprezenta reevaluări sau mesaje despre aceeași factură.

**Recomandare:** introducerea unei entități Factură cu număr, emitent, monedă și stare, apoi calculul consumului contractual din facturile relevante, ținând cont de anulări, stornări și acte adiționale.

### 3.5. Opțiunea de aprobare poate rămâne disponibilă pentru un caz învechit

**Reproducere:** o persoană confirmă cazul pe versiunea 1; contractul este modificat la versiunea 2; alt utilizator primește în listă `can_approve: true`, însă acțiunea de aprobare răspunde cu HTTP `409`.

**Cauză:** `case_dict()` calculează disponibilitatea din starea și motivele cazului, fără verificarea referinței curente. Endpointul `approve()` verifică separat această referință.

**Impact:** protecția serverului funcționează, dar interfața oferă o acțiune care va eșua.

**Recomandare:** evaluarea referințelor curente și la citire, mesaj „Contractul/registrul s-a modificat”, plus acțiune de creare a unei verificări noi, fără editarea cazului istoric.

### 3.6. Alte limite constatate prin citirea codului

- **Un contract sursă per furnizor:** modelul are un singur `document_id`, iar inițializarea nu mai adaugă o înregistrare pentru același nume/aeroport. Formularul nu permite alegerea altui contract al aceluiași furnizor.
- **Identitate bazată pe nume:** identificatorul este derivat din aeroport și denumire, fără CUI; variațiile de denumire și schimbările numelui necesită un model mai robust.
- **Dovezi doar ca text:** nu există atașamente, metodă de contact structurată, persoană contactată sau document justificativ legat de caz.
- **Decizii afișate incomplet:** blocul deciziei depinde de existența `decision_note`. O aprobare fără comentariu nu afișează acel bloc, deși actorul și momentul există în date; pentru alți utilizatori pot apărea ID-uri în locul numelor.
- **Cazuri blocate fără remediere ghidată:** furnizorul necunoscut sau problemele de contract/factură nu au un flux propriu de corectare și reevaluare din UI.
- **Fără responsabil și termen:** verificările nu sunt conectate la modulul de sarcini; nu există atribuire, termen, notificare sau escaladare.
- **Liste fără paginare și filtre avansate:** API-ul returnează toate cazurile, iar căutarea se face în browser. Nu există filtre după stare, perioadă, risc sau responsabil și nici export dedicat.

## 4. Funcționalități și îmbunătățiri propuse

Priorități: **P0** = consolidarea comportamentului existent; **P1** = următoarea extindere funcțională; **P2** = extinderi după stabilizarea fluxului. Efortul este relativ: mic / mediu / mare, fără estimare calendaristică.

| Prioritate | Propunere | Beneficiu concret | Efort |
|---|---|---|---|
| P0 | Persistarea datei prestației și a referințelor contractuale evaluate | Dosarul explică exact rezultatul, inclusiv după modificări ulterioare | Mediu |
| P0 | Rezultate distincte pentru fiecare control și marcarea informațiilor lipsă | „Fără diferențe” nu sugerează că suma/perioada au fost verificate când lipsesc | Mediu |
| P0 | Acțiuni disponibile calculate din referințele curente | Cazurile învechite sunt explicate înainte de o aprobare eșuată | Mediu |
| P0 | Validarea server-side a adreselor și afișarea completă a actorilor/momentelor | Intrări coerente și decizii vizibile chiar fără comentariu | Mic–mediu |
| P1 | Fișă furnizor: CUI, denumire legală, adresă, categorie, stare activ/suspendat | Registrul poate fi folosit și pentru furnizori noi, nu doar demonstrații | Mare |
| P1 | Înregistrare inițială cu dovezi și aprobare independentă | Furnizorii necunoscuți au un traseu controlat spre registru | Mare |
| P1 | Mai multe contacte verificate și flux separat de schimbare a contactului | Confirmarea rămâne posibilă când se schimbă reprezentantul furnizorului | Mediu–mare |
| P1 | Relație furnizor–contracte și alegerea contractului verificat | Suma și perioada sunt comparate cu contractul relevant | Mediu |
| P1 | Istoric bancar complet, cu diferențe și link către caz | Se poate vedea cine a schimbat contul, când și pe ce bază | Mic–mediu |
| P1 | Dosar de verificare cu atașamente și date structurate de contact | Confirmarea poate fi revizuită pe baza unor dovezi consultabile | Mediu–mare |
| P1 | Atribuire către Financiar, termen și notificări în aplicație | Cazurile în așteptare au responsabil și pot fi urmărite | Mediu–mare |
| P1 | Filtre, sortare, paginare și export al verificărilor | Financiarul găsește și raportează rapid cazurile relevante | Mediu |
| P1 | Acțiune „Verificare nouă pe baza acestui caz” și legătură între reevaluări | Problemele se remediază fără rescrierea deciziilor istorice | Mediu |
| P2 | Registru de facturi, detecția duplicatelor și consum contractual cumulat | Detectează depășiri între mai multe facturi și dublarea aceleiași facturi | Mare |
| P2 | Import PDF/EML/CSV cu propuneri de câmpuri și confirmare umană | Reduce introducerea manuală și păstrează sursa informației | Mare |
| P2 | Integrare e-Factura/ERP și verificări fiscale din surse autorizate | Corelează documentele cu evidența financiară reală | Mare |
| P2 | Conturi în alte monede și IBAN-uri internaționale, dacă există această nevoie | Acoperă furnizorii externi și evită comparațiile între monede diferite | Mare |
| P2 | Rapoarte de risc explicabil și durată de soluționare | Arată tiparele de neconcordanțe și blocajele de proces | Mediu |

La introducerea mai multor contacte sau conturi, și amprenta/revalidarea trebuie extinse la versiunea întregii referințe verificate. Modificarea contactului nu trebuie confirmată exclusiv prin noua adresă comunicată în aceeași solicitare.

Importul automat și eventualele sugestii AI ar trebui să propună informații cu sursă verificabilă. Nu ar trebui să promoveze singure conturi în registru sau să decidă aprobarea unei modificări.

## 5. Ordine recomandată de dezvoltare

1. **Consolidarea fluxului curent:** data prestației, controale neefectuate, validarea e-mailului, acțiuni pentru cazuri învechite și afișarea completă a deciziilor.
2. **Registru utilizabil în afara demonstrației:** fișă furnizor, înregistrare inițială, contacte verificate, mai multe contracte și istoricul bancar complet.
3. **Lucru în echipă:** responsabil, termen, notificări, dovezi atașate, filtre/export și reevaluări legate de cazul inițial.
4. **Control financiar și automatizare:** facturi distincte, consum contractual, importuri și integrări externe.

Pentru o extindere scurtă cu impact vizibil, aș alege: **istoricul bancar complet, filtrele după stare, data prestației în detalii și mesajul explicit pentru verificările învechite**. Pentru o extindere mai amplă, prioritatea este înregistrarea unui furnizor nou cu CUI, dovezi și aprobare independentă.

## 6. Verificări executate și limitele analizei

### Rezultate ale analizei inițiale

| Verificare | Rezultat |
|---|---|
| `test_suppliers.py` și `test_supplier_review_boundaries.py` | **13 teste trecute**, 2 avertismente de depreciere în bibliotecile de test |
| Data prestației în afara perioadei | Regula se execută; data nu se păstrează în model/răspuns |
| Solicitare fără sumă și dată | `clear` când celelalte referințe coincid |
| Expeditor fără format de e-mail | Acceptat de API; marcat `unknown_sender` |
| Două solicitări de 700 pe contract de 1.000 | Ambele `clear`; controlul este individual |
| Aprobare după modificarea contractului | Opțiunea rămâne permisă în datele listei, dar serverul refuză cu `409` |

Testele au rulat pe codul local montat doar pentru citire într-un container temporar. Configurația de test creează baze de date, corpus și spațiu de fișiere temporare; nu au fost modificate datele aplicației în funcțiune.

Comanda de reproducere a suitei dedicate, din rădăcina proiectului pe Windows:

```powershell
docker compose run --rm --no-deps -e AERODESK_AUTH_MODE=demo -e AERODESK_EXCHANGE_URL= -v "${PWD}/backend:/app/backend:ro" dunarea-api python -m pytest tests/test_suppliers.py tests/test_supplier_review_boundaries.py -q -p no:cacheprovider
```

Aceste teste acoperă IBAN-ul, diferențele de expeditor, deduplicarea, verificarea prin contactul cunoscut, separarea persoanelor, restricțiile de rol, neconcordanțele de sumă și referințele modificate, inclusiv concurența aprobărilor.

Analiza interfeței din acest raport este bazată pe cod. Nu au fost repetate testele manuale în browser, suita completă a aplicației, build-ul frontend sau auditul dependențelor. Verificările anterioare sunt documentate separat în [VERIFICATION.md](VERIFICATION.md); rezultatele lor nu sunt prezentate aici ca rezultate noi.

### Surse din repository

- [Interfața Furnizori](../frontend/src/features/suppliers/index.tsx): `SuppliersPage`, `NewReview`, `ReviewDetail`.
- [Reguli și tranziții](../backend/app/suppliers/service.py): `seed_suppliers`, `case_dict`, `create_review`, `verify`, `approve`, `reject`.
- [Modele persistente](../backend/app/suppliers/models.py) și [scheme de intrare](../backend/app/suppliers/schemas.py).
- [Rute API](../backend/app/suppliers/router.py) și [contract API](../backend/API_CONTRACT.md).
- [Autorizare](../backend/app/core/security.py) și [jurnal](../backend/app/core/audit.py).
- [Teste funcționale](../backend/tests/test_suppliers.py) și [teste de referințe/concurență](../backend/tests/test_supplier_review_boundaries.py).
- [Contextul aplicației](../PROJECT_OVERVIEW.md), [verificări anterioare](VERIFICATION.md) și [corpus demonstrativ](CORPUS_RESEARCH.md).
