# FlyLeaf: digitalizare, decizii verificabile și aeroporturi care învață împreună

Analiză de produs — 1 noiembrie 2026. Cercetare și propuneri, nu specificație deja implementată. Codul și browserul au fost inspectate; baza de cod a continuat să se schimbe în paralel. Referință HEAD la încheierea inspecției: `32023d7`.

## 1. Decizia de produs

**FlyLeaf transformă documentele aeroportului în acțiuni urmărite și lecții pe care alte aeroporturi le pot adapta.**

Cele trei straturi se susțin reciproc:

1. **Digitalizare:** găsesc documentul corect, extrag informația, o verific, cunosc versiunea și responsabilul.
2. **Asistență:** observ o lipsă sau o discrepanță; primesc o propunere cu dovezi și limite; decid ce fac.
3. **Colaborare:** documentez schimbarea și rezultatul; alt aeroport evaluează contextul, adaptează și returnează ce a învățat.

Harta și simularea pot explica un eveniment. Nu trebuie să fie primul lucru pe care trebuie să-l înțeleagă un director care caută un contract sau un coleg care are de aprobat un document.

Pentru hackathon, cea mai valoroasă dovadă este un singur flux complet, repetabil. O interfață încărcată cu funcții face mai greu de observat ce funcționează deja.

Această direcție păstrează prioritatea administrativă din [IMPLEMENTATION_SCOPE.md](IMPLEMENTATION_SCOPE.md). Ultima cerere a utilizatorului înlocuiește preferința mai veche pentru cât mai multe simulări și vizualizări, consemnată în `Aero Research.md`.

## 2. Ce am verificat și ce nu

Surse locale: README, navigare, corpus, operațiuni, SOP, partajare, asistent, materialele de submission. Am inspectat prin Chrome DevTools sesiunea de director de la `http://127.0.0.1:5175`, într-un context separat: Acasă, Operațiuni, biblioteca SOP și analiza salvată.

Constatări de interfață:

- Shell-ul oferă zece destinații înainte de submeniuri: [App.tsx](../frontend/src/app/App.tsx).
- Acasă pune patru totaluri și pulsul operațional înaintea lucrurilor de rezolvat.
- Tura curentă combină KPI-uri, comenzi de replay, cronologie, lanț explicativ, hartă și detalii de zbor.
- La viewportul efectiv 1440 × 799 CSS px, ecranul de tură avea numeroase etichete cu dimensiuni calculate de 10–12 px. Aceasta este o observație de stil și lizibilitate, nu un audit complet de accesibilitate.
- Analiza SOP salvată afișa aproximativ 797 de cuvinte în textul paginii principale, cu două recomandări și mai multe secțiuni de detalii. Paragrafele principale aveau 15–16 px; aici problema este mai ales cantitatea și ordinea informației.
- Analiza existentă este mai prudentă decât mesajul general al simulării: precizează că beneficiul se verifică în pilot și că ipotezele de cauză nu sunt confirmări.
- La deschiderea partajării în mediul local a apărut `Failed to fetch`; nu am reverificat în această analiză un transfer complet între aeroporturi. Această observație nu stabilește o defecțiune persistentă a produsului. Capacitățile de transfer sunt fundamentate aici în cod și documentație.

Nu am schimbat codul aplicației, nu am rulat un benchmark nou al modelului și nu am măsurat economii într-un aeroport real. Prototipul de interfață care însoțește analiza este o propunere interactivă cu date fictive.

Prototipul a fost verificat prin Chrome DevTools: toate cele patru etape, blocarea propunerii când lipsește sursa, revenirea după restabilirea sursei, aspect deschis/închis și lățimi de 1024 și 360 px. Nu a apărut overflow orizontal în stările măsurate și nu au fost erori în consolă. Linkurile locale din cele trei documente de cercetare au fost verificate.

## 3. Păstrăm ce este deja valoros

| Bază existentă | De ce contează | Următorul pas firesc |
|---|---|---|
| 148 PDF-uri fictive, legături de dosar, OCR și căutare | Demonstrează o arhivă utilizabilă | Dovezi exacte la nivel de câmp și pagină |
| Metadate validate și versiuni | Datele pot alimenta reguli și registre | Obligații, excepții și sarcini legate de versiune |
| Roluri, delegări și aprobări | Există responsabilitate și control | Responsabil pentru caz și verificator de rezultat |
| Semnături PDF demonstrative | Integritatea versiunii poate fi verificată | Nu le prezentați drept semnături calificate |
| 12 șabloane SOP și recomandări limitate numeric | Punct de plecare concret | Schimbare exactă și plan de pilot structurat |
| Snapshot AI, citări de evenimente și calcule server-side | Analiza poate fi explicată | Acoperire echilibrată și verificarea susținerii afirmațiilor |
| Redactare PDF și partajare controlată | Partenerul primește o copie revizuită | Adaptare locală cu proveniență și drepturi explicite |
| Două aeroporturi independente | Separarea organizațională este demonstrabilă | Feedback autorizat și rezultate comparabile |

Nu promitem că „nu mai trebuie oameni”. Promitem că omul găsește mai repede informația necesară pentru a decide și că decizia nu se pierde între documente și persoane.

## 4. Obiectul lipsă: dosarul de lucru

Un document este o dovadă. Un dosar de lucru explică de ce contează și ce trebuie făcut. Același nucleu poate susține o recepție incompletă, o obligație contractuală, o predare de tură sau o îmbunătățire de proces.

**Problemă → dovezi → evaluare → acțiune → verificare → rezultat → lecție.**

Model minim propus:

| Obiect | Câmpuri necesare | Regula importantă |
|---|---|---|
| Caz | ID, tip, aeroport, titlu, context, owner, stare | Nu numim orice abatere „incident de safety” |
| Dovadă | document/eveniment, versiune, hash, câmp/pagină, moment, drepturi | O versiune nouă nu rescrie dovada istorică |
| Afirmație | fapt / ipoteză / necunoscut, dovezi asociate | Existența sursei nu dovedește concluzia |
| Acțiune | responsabil, termen, criteriu de acceptare, rezultat | „Executat” și „verificat” sunt stări diferite |
| Pilot | eligibilitate, baseline, măsură, perioadă, protecții, decident | Planul se stabilește înainte de rezultat |
| Practică | procedură, context, schimbare, rezultat, limite | Poate avea rezultat neutru sau nefavorabil |
| Adaptare | sursă, diferențe locale, autor, aprobator, pilot local | Aprobarea sursei nu devine aprobare locală |

Stări de caz: **De verificat → Pregătit → În lucru/În pilot → De evaluat → Închis**. Rezultatul este separat: **nemăsurat / promițător / neconcludent / fără efect / nefavorabil**. Închiderea unui caz nu trebuie să însemne automat succes.

Pentru primul increment nu este necesar un motor universal de workflow. Un singur tip de caz, legat de documentele și taskurile existente, este suficient.

## 5. Granularitatea aeroportuară

Catalogul detaliat, actorii, incidentele, prevenția și pachetul propus de documente sunt în [AIRPORT_DOMAIN_CATALOG_RO.md](AIRPORT_DOMAIN_CATALOG_RO.md).

Ordinea recomandată de extindere:

1. **Control documental:** manual, SOP, instrucțiune, formular, revizie, distribuție și confirmarea luării la cunoștință.
2. **Mentenanță și echipamente:** fișă activ, defect, ordin de lucru, intervenție, verificare, recepție, contract și garanție.
3. **Predare de tură:** sarcină deschisă, titular, confirmarea preluării, termen, excepție și escaladare.
4. **Constatări și acțiuni:** raport factual, observație/pericol, evaluare de persoana competentă, măsură și verificarea eficacității.
5. **Conformitate și schimbări:** cerință aplicabilă, constatare de audit, dovadă, aviz, schimbare de procedură, instruire.
6. **Colaborare:** lecție autorizată, context, adaptare, pilot și rezultat local.

Familii de extensie: FOD și inspecții, faună, lucrări airside, exerciții, competențe, terminal/PRM, mediu, continuitate IT, informare aeronautică. Infrastructura poate păstra evidențe și responsabilități; nu trebuie să inventeze proceduri de intervenție sau să preia autoritatea aeroportului, handlerului, companiei aeriene ori serviciilor de navigație.

Sistemul de management descris de EASA leagă identificarea pericolelor, tratarea riscurilor, monitorizarea performanței și documentația. Aceasta susține direcția de produs; nu certifică FlyLeaf. [EASA, Part-ADR.OR](https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-aerodromes-regulation-eu?erules-id=ERULES-1963177438-2628)

Copiile de AIP/NOTAM/METAR/TAF sunt referințe cu sursă și valabilitate, nu documente pe care FlyLeaf le emite sau le validează operațional. Pentru safety reporting, clasificarea și eventuala raportare oficială rămân procese distincte, executate de rolurile și canalele competente.

## 6. Încrederea în AI se construiește prin limite observabile

Specificația detaliată și auditul de cod sunt în [AI_TRUST_AND_SOP_COLLABORATION_RO.md](AI_TRUST_AND_SOP_COLLABORATION_RO.md).

### Corecții cu impact imediat

1. **Cohorta înaintea modelului.** `operations/procedures/engine.py` selectează rotațiile afectate și maximum 120 de evenimente. KPI-urile agregate nu înlocuiesc exemplele comparabile de succes. Furnizați un sumar al tuturor rotațiilor și exemple stratificate, cu criterii de selecție și date lipsă.
2. **Citare exactă.** `assistant/service.py` returnează `page: 1` și extras din metadate. Acestea trebuie numite „sursă din registru”, până există legătura reală către fragmentul PDF. O pagină arbitrară arată mai rău decât o limită spusă clar.
3. **Afirmație versus sursă.** Verificarea că un event ID există nu verifică dacă susține propoziția modelului. Tipizați afirmațiile și verificați separat numere, identități, perioade și unități; lăsați interpretarea cauzală la review.
4. **Reproductibilitate.** Includeți modelul configurat și parametrii relevanți în fingerprint. Păstrați snapshotul și versiunea promptului/contractului.
5. **Cauză versus asociere.** Înlocuiți „Vezi cauza” cu „Vezi firul evenimentelor” până la evaluare. Absența unui pontaj nu dovedește absența persoanei.
6. **Referință normativă precisă.** O pagină generală EASA este context; nu este dovada că fiecare pas generat este cerut sau aprobat de EASA.

### Cardul implicit al propunerii

Un card ar trebui să răspundă rapid la cinci întrebări:

- Ce s-a observat, în ce perioadă și din câte cazuri?
- Ce modificare exactă se propune?
- Ce dovezi susțin observația?
- Ce nu știm și ce ar putea infirma explicația?
- Cine verifică următorul pas?

La cerere: diferența față de SOP-ul curent, riscuri, resurse, pași compleți, plan de pilot și proveniența tehnică. Cititorul nu trebuie să parcurgă două eseuri pentru a descoperi acțiunea principală.

Evitați un scor „92% încredere” produs de model. Folosiți stări verificabile: **date lipsă**, **surse contradictorii**, **ipoteză netestată**, **validat de responsabil**, **rezultat observat în pilot**.

Sistemul trebuie să poată răspunde: „Nu pot recomanda această modificare; lipsește confirmarea disponibilității resursei X.” Acțiunea rezultată este completarea informației, nu un paragraf generic despre instruire și comunicare.

### Reducerea recomandărilor generice

O recomandare nu poate trece la ciornă dacă îi lipsesc problema locală, modificarea exactă, ownerul, resursele, măsura și dovezile. Verificările validează structură și fapte; nu pretind că demonstrează utilitatea viitoare.

Comparați cu procedura existentă înainte de a sugera ceva: dacă pasul există deja, problema poate fi în executare, în înregistrare, în instruire, în resurse sau în lipsa relevanței locale. „Mai mult training” nu este o concluzie implicită.

Propunerile posibile includ **nu schimba procedura**, **clarifică datele** și **verifică aplicarea unui pas existent**. A genera permanent SOP-uri noi ar produce încă o arhivă greu de întreținut.

NIST descrie atât aversiunea față de AI, cât și încrederea excesivă în automatizare și riscul de conținut fabricat. Pentru FlyLeaf, concluzia de design este încredere proporțională cu dovezile și consecința deciziei, nu o promisiune de infailibilitate. [NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)

## 7. Colaborarea trebuie să continue după „Deschide copia”

Fluxul actual este valoros pentru controlul accesului, însă la destinatar se oprește la vizualizarea PDF-ului. Butonul nou cu cea mai mare valoare ar fi **„Evaluează pentru aeroportul nostru”**.

Flux propus:

1. Primesc problema, practica, versiunea și starea dovezilor.
2. Compar condițiile: roluri, handler, volum, program, echipamente, constrângeri și SOP local.
3. Marchez ce se păstrează, se adaptează sau se respinge și motivul.
4. Creez o ciornă locală, legată de sursă, cu owner și aprobator local.
5. Aprob și testez schimbarea prin procesul local aplicabil.
6. Înregistrez rezultatul și o sinteză autorizată pentru partener.

O revizie nouă a sursei deschide o sarcină de evaluare a adaptărilor. Nu suprascrie automat procedurile locale. Dreptul de vizualizare nu trebuie transformat implicit în drept de adaptare sau distribuție; pachetul nou le precizează.

Revocarea accesului nu poate șterge o copie deja descărcată și nu trebuie să distrugă retroactiv evidența unei decizii locale. Politica derivatelor și retenției se definește înainte de lansarea pilotului de colaborare.

### Cum evităm o bibliotecă goală sau un feed inutil

- Pornim cu două aeroporturi și o singură problemă comună, cu responsabili nominalizați.
- Un pachet include problema, condițiile, resursele, schimbarea, rezultatul, limitările și drepturile. Nu este doar un SOP.
- Întâlnirea periodică de evaluare produce o decizie și un owner, nu încă un canal de mesaje.
- Pot fi partajate și rezultate neconcludente sau practici care nu au funcționat.
- Căutarea filtrează compatibilitatea și calitatea dovezilor; nu ordonează după numărul de like-uri.
- Rețeaua este utilă și fără volume mari: un aeroport economisește efortul de a reface evaluarea inițială, păstrând propria responsabilitate.

GAPPRI recomandă schimbul lecțiilor din analiza evenimentelor. Aceasta oferă un fundament de domeniu pentru o bibliotecă de practici cu context. [EUROCONTROL / Flight Safety Foundation, GAPPRI, ADR5](https://www.eurocontrol.int/sites/default/files/2024-08/eurocontrol-fsf-global-action-plan-prevention-runway-incursions-gappri.pdf)

Nu numim acest schimb inter-aeroporturi „A-CDM implementat”. A-CDM vizează coordonarea operatorului aeroportuar cu partenerii operaționali și reperele de turnaround/preplecare. [EUROCONTROL, specificația A-CDM](https://www.eurocontrol.int/publication/eurocontrol-specification-airport-collaborative-decision-making-cdm)

## 8. KPI-uri care ajută decizia

| Nivel | Indicator propus | Ce trebuie afișat |
|---|---|---|
| Digitalizare | Timpul până la găsirea dovezii corecte | Aceeași sarcină, mediană/p90, succes și erori |
| Dosar | Dovezi necesare prezente | Tip de caz și lista cerințelor, nu simplul număr de fișiere |
| Execuție | Acțiuni verificate la termen | Numărător, numitor și ce înseamnă „verificat” |
| AI | Afirmații susținute și abțineri potrivite | Teste separate de răspunsurile folosite în dezvoltare |
| AI | Efort de verificare umană | Timp, corecții necesare, dezacorduri |
| Colaborare | Adaptări ajunse la evaluarea rezultatului | Primit → evaluat → adaptat → pilot → rezultat |
| Proces | Confirmări de predare complete | Toate predările eligibile, inclusiv cele fără probleme |
| Operațional | Distribuția întârzierii și punctualitate | Plecări încheiate, definiția pragului, perioadă, date lipsă |
| Protecție | Verificări omise, rework, încărcare de lucru | Se urmăresc alături de eficiență |

Mai puține raportări de evenimente nu înseamnă automat mai multă siguranță; pot indica subraportare. Zero incidente într-un eșantion mic nu validează siguranța unei schimbări. Mai puțină întârziere într-o săptămână nu dovedește că SOP-ul a produs efectul: traficul, vremea, orarul și alte procese pot diferi.

În primul pilot, măsura principală ar trebui să fie apropiată de intervenție: confirmări complete, documente găsite corect, cazuri fără dovadă restantă. Punctualitatea poate fi secundară. O comparație înainte/după rămâne observațională; cohortele comparabile și analiza factorilor externi îmbunătățesc interpretarea, fără a elimina automat confuzia cauzală.

## 9. Redesign: povestea devine navigarea

Arhitectură de informație propusă, adaptată rolului:

| Destinație | Întrebarea utilizatorului | Ce include |
|---|---|---|
| Azi | Ce trebuie să fac? | Taskuri, termene, delegări, excepții relevante |
| Documente | Care este documentul corect? | Registru, dosare, contracte, furnizori și relații |
| Îmbunătățiri | Ce problemă investigăm? | Cazuri, dovezi, propuneri, acțiuni și pilot |
| Colaborare | Ce putem adapta sau împărtăși? | Practici primite, evaluări locale, feedback |
| Rezultate | Ce s-a schimbat? | KPI definiți, rapoarte și comparații |
| Administrare | Cine poate face ce? | Echipă, roluri, configurare și audit global |

Pentru utilizatorii financiari frecvenți, Contracte/Furnizori pot rămâne scurtături rol-specifice. Reducerea meniului nu trebuie să ascundă munca zilnică a unui rol și nici să schimbe drepturile din backend.

Pagina Azi: un titlu de tipul „Ai 3 lucruri de rezolvat”, trei acțiuni ordonate după urgență și o schimbare relevantă. Totalurile și istoricul se deschid la cerere.

Pagina de caz: **Observăm → Verificăm → Decidem → Învățăm**. Fiecare capitol răspunde la o întrebare și are un pas următor. Harta poate fi deschisă din cronologie când poziția contează. Replay-ul și ADS-B rămân într-un spațiu de demonstrație/investigație, nu în fluxul implicit de lucru.

Reguli de design propuse:

- Text de lucru 16–18 px; metadate în jur de 14 px. Acestea sunt alegeri de produs, nu un prag WCAG universal.
- Un obiect principal și o acțiune principală pe ecran.
- Explicație de maximum câteva rânduri înaintea detaliilor, fără a ascunde condițiile materiale ale deciziei.
- Numere lângă definiție și perioadă; dovezi lângă afirmație.
- Densitate normală implicit, variantă compactă pentru experți.
- Nicio dependență de hover pentru informații esențiale.
- Focus vizibil, navigare cu tastatura, reflow pe telefon și zoom verificat.
- Păstrarea filtrului, poziției și originii când se deschide un document, conform [NAVIGATION.md](NAVIGATION.md).

WCAG cere, între altele, mărirea textului până la 200% fără pierdere de conținut sau funcționalitate; testul nu se reduce la a seta un font mai mare. [W3C, Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)

## 10. Features noi, în ordinea utilității

| Prioritate | Feature/schimbare | Dovada că este terminat |
|---|---|---|
| P0 | Simplificarea ecranului principal și a scenariului | Un coleg găsește următorul pas fără explicația prezentatorului |
| P0 | Igiena dovezilor AI | Referințe corecte, cohortă completă explicată, model în fingerprint, fără cauzalitate automată |
| P0 | Submission sincronizat cu build-ul | Funcțiile reale, limitele și linkul demo sunt corecte |
| P1 | Fișă compactă a dovezii și abținere utilă | Se vede sursa exactă sau motivul concret pentru care analiza se oprește |
| P1 | Evaluează/adaptează local | Copia primită produce o propunere locală cu owner, proveniență și drepturi |
| P1 | Caz cu acțiune și verificator | Implementarea și verificarea au dovezi și stări separate |
| P2 | Pilot structurat | Baseline și eligibilitate fixate, rezultat cu numitor, decizie de continuare/oprire |
| P2 | Dosar de audit la cerere | Se exportă dovezile accesibile și lipsurile explicite pentru un caz |
| P2 | Impactul reviziei unui SOP | Se identifică adaptările locale și persoanele care trebuie informate |
| Ulterior | QR pentru echipament | Fișa activului leagă defectele, lucrările, garanția și contractul |
| Ulterior | Competențe și confirmarea versiunii citite | Sarcina are rol eligibil; citirea nu este echivalată cu instruirea |
| Ulterior | Obligații contractuale și reînnoiri | Termen, owner, dovadă și escaladare persistente |
| Ulterior | Import CSV/Excel și pachete offline controlate | Proveniență, verificare și reconciliere; fără a inventa integrări existente |

Nu aș prioritiza încă un motor 3D, un feed social, mai multe scoruri AI sau un marketplace public de SOP-uri. Valoarea lor depinde de o buclă de execuție care încă nu este închisă.

### Alegerea în funcție de timpul rămas

- **Sub două ore:** claritate vizuală în scenariul ales, corectarea afirmațiilor și materialelor, repetarea demo-ului. Nu restructurați toate rutele.
- **O jumătate de zi:** o singură extensie completă: evaluare locală a unui SOP primit, cu owner și ciornă; sau o fișă de dovadă dacă aceasta este încă fragilă.
- **Una–două zile de lucru ulterior:** caz persistent, pilot structurat și feedback. Estimarea trebuie revizuită după identificarea dependențelor; nu este o promisiune de implementare.

Orice schimbare de navigare păstrează contractul de revenire la listă, filtrare și focus. Orice schimbare AI are teste de date lipsă, surse contradictorii, versiune depășită și acces interzis. După implementare, testați fluxul real în Chrome DevTools la desktop și pe telefon.

## 11. Reducerea bias-ului

### În produs

- Includeți procese reușite și nereușite, nu numai cazurile care confirmă ipoteza.
- Tratați eticheta de cauză ca ipoteză de intrare, nu adevăr verificat.
- Comparați limba română/engleză, scan curat/slab, aeroport mare/mic și contexte operaționale diferite.
- Nu clasați angajații sau aeroporturile după numere brute de întârzieri ori raportări.
- Păstrați propunerile respinse și rezultatele negative; înregistrați motivul.
- Nu considerați aprobarea utilizatorului drept adevăr pentru antrenare: poate fi o greșeală, presiune de timp sau automatism.

Set de evaluare inițial propus: 24 de cazuri — opt cu bază suficientă, opt unde abținerea/clarificarea este corectă, opt cu capcane precum OCR greșit, SOP vechi, citare irelevantă sau instrucțiuni în document. Acesta este un set demonstrativ, insuficient pentru o afirmație generală de siguranță sau acuratețe. Separați exemplele de dezvoltare de cele de evaluare și raportați fiecare tip de eroare.

### Cu mentorii și juriul

Nu putem controla preferințele juriului, însă putem reduce ambiguitatea probei:

1. Aceeași poveste, aceleași date, aceeași demonstrație pentru fiecare mentor.
2. Feedback independent înainte de discuție: problema înțeleasă, utilitatea, dovada, limita și ce a rămas neclar.
3. Întrebări despre utilizare: „Ce decizie ai putut lua?” și „Ce dovadă lipsește?”, nu doar „Îți place AI-ul?”.
4. Într-un experiment de evaluare, comparați propuneri umane/AI anonimizate, cu informarea participanților și ordine randomizată. În produs și în pitch, proveniența rămâne transparentă.
5. Nu modificați direcția pentru fiecare preferință singulară; căutați confuzii recurente și contradicții verificabile.
6. Prezentați un caz reușit și o limită funcțională. Nu alegeți doar rezultatele favorabile și nu ascundeți datele sintetice.

FAQ-ul oficial spune că criteriile sunt comunicate de organizator și pot include originalitate, implementare tehnică, relevanță și demo/pitch. Nu am găsit ponderi oficiale verificabile; nu inventăm o grilă numerică. [Craiova Hackathon, FAQ](https://www.craiovahackathon.ro/faq)

## 12. Demo recomandat: patru minute, un fir

**0:00–0:25 — Problema.** „Documentele există, dar informația se pierde între oameni, versiuni și aeroporturi. FlyLeaf leagă documentul de acțiune și de lecția reutilizabilă.”

**0:25–1:00 — Digitalizare.** Un singur dosar: fie SP-02, fie predarea responsabilității la poartă. Deschideți documentul, câmpul validat, versiunea și responsabilul. Nu faceți turul tuturor meniurilor.

**1:00–1:45 — AI verificabil.** Deschideți o propunere și dovada ei. Arătați ce nu știe. O analiză pregătită dinainte se numește analiză salvată; nu se prezintă drept generare live.

**1:45–2:25 — Decizia.** Responsabilul verifică, adaptează și creează ciorna. Aprobarea privește o versiune identificabilă. Beneficiul rămâne de testat.

**2:25–3:20 — Colaborarea.** Copie revizuită la Sibiu, apoi evaluare pentru contextul local dacă funcția este implementată. Dacă nu este, demonstrați transferul real și prezentați separat fluxul propus; nu simulați execuția lui ca existentă.

**3:20–4:00 — Rezultatul verificabil.** Arătați ce s-a salvat și ce se va măsura: timp de găsire, completitudine, acțiune verificată, adaptare locală. Încheiați cu cererea de pilot și un responsabil de proces.

Scenariu de rezervă: dosarul SP-02 cu o discrepanță fictivă între recepție și dovada intervenției. Este apropiat de corpusul existent și demonstrează utilitate fără o simulare de aeroport. Scenariul FOD repetat după lucrări este bun pentru extinderea corpusului, dar necesită validarea de domeniu înainte de prezentarea unor măsuri.

### Obiecții și răspunsuri

| Obiecție | Răspuns demonstrabil |
|---|---|
| „Este un drive cu AI?” | Arătăm legătura dintre versiune, task, decizie și rezultat; nu doar căutare |
| „De unde știți că sugestia este bună?” | Dovezi, limite și pilot; nu declarăm efectul înainte de măsurare |
| „De ce ar partaja un aeroport?” | Partajează o lecție revizuită, cu destinatari și condiții explicite |
| „Ce faceți când AI greșește?” | Nu publică singur; se poate abține, corecta sau respinge, cu sursa la îndemână |
| „De ce nu un produs existent?” | Demonstrăm potrivirea cu procesul local; nu afirmăm exclusivitate fără comparație |
| „Cât economisește?” | Arătăm măsurători ale sarcinii în demo; impactul real se stabilește în pilot |

## 13. Probleme de prezentare de rezolvat înainte de predare

`deliverables/submission/Submission-copy.txt` descrie NFC, indicatorii și motorul SOP ca extensii viitoare, deși acestea există în build-ul inspectat. Câmpul Demo URL este încă un placeholder. Materialele video/slides trebuie comparate cu același build pe care îl prezentați.

`docs/OPERATIONS_DEMO.md` și UI-ul curent au diferențe în descrierea pontării manuale a celorlalte zboruri. Mențineți o singură poveste de demo. Evitați reveal-ul centrat pe „colegul care a întârziat”; puneți accentul pe preluarea responsabilității și dovezi.

Paragraf propus pentru descrierea implementării, de verificat față de build-ul de predare:

> FlyLeaf include documente PDF cu OCR și căutare, metadate validate, versiuni, aprobări, delegări și partajare controlată între două aeroporturi. Demonstrația folosește date fictive și un registru operațional simulat, cu pontaj NFC și indicatori calculați din evenimente. La cerere, Luna propune schimbări de procedură pe baza unui snapshot de dovezi; acestea devin ciorne pentru validare și avizare umană. Adaptarea unei practici la aeroportul destinatar și măsurarea pilotului reprezintă următoarea etapă a produsului.

## 14. Pilotul comercial și piața din România

Nu avem dovadă că aeroporturile românești sunt, în general, nedigitalizate. Ipoteza de validat este fragmentarea între hârtie, Excel, PDF, email și aplicații existente. FlyLeaf trebuie să poată începe cu importuri și un proces restrâns, fără a cere migrarea întregului aeroport.

Primul pilot propus: două departamente, un owner, un tip de dosar și un partener aeroportuar numai pentru schimbul lecției. Măsurăm situația inițială, configurăm drepturile și criteriile, folosim produsul, apoi evaluăm cu aceiași indicatori. O durată de câteva săptămâni poate testa utilizabilitatea și execuția administrativă; nu demonstrează reducerea accidentelor rare.

Întrebări pentru următoarea discuție cu aeroportul: care dosar consumă cel mai mult timp; unde se pierde predarea; ce aplicații există; cine poate aproba un pilot; ce date sunt disponibile; ce rezultat ar justifica continuarea. Acestea sunt cercetare de produs, nu precondiții pentru recomandările din acest document.

Avantajul competitiv posibil nu este accesul la un LLM. Este combinația dintre date verificate, legături între documente și procese, control local, proveniența adaptărilor și rezultate reutilizabile. Acest avantaj trebuie construit și demonstrat, nu doar declarat în pitch.
