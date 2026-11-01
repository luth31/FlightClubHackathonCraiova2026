# Calendarul concediilor

Deschide **Echipă → Concedii**. Calendarul păstrează vizualizările lună/săptămână, barele care acoperă întreaga absență și filtrul pe persoană. Poți filtra și după departament sau stare. Numele din calendar deschid profilul persoanei; click pe o absență arată perioada și, numai pentru persoanele autorizate, documentul și opțiunile de revizuire.

Apasă **Cerere nouă** în calendar sau **Cerere de concediu** în pagină. În formular, selectează prima și ultima zi în calendarul de planificare. Aprobările apar în albastru, cererile în așteptare în auriu; lista alăturată arată cine lipsește în intervalul ales, cu avatar și profil la hover. Poți schimba datele și din câmpuri. Cererea generează PDF-ul și urmează aprobarea ierarhică existentă; calendarul nu aprobă automat perioadele fără suprapuneri.

Cu datele inițializate de `scripts/start-collaboration-demo.ps1`, luna noiembrie 2026 conține:

| Cont Craiova | Interval | Stare inițială |
|---|---|---|
| Andrei Neagu | 9–13 noiembrie | Aprobat |
| Irina Dobre | 12–16 noiembrie | În așteptare |
| Elena Popa | 17–20 noiembrie | Aprobat |
| Radu Marinescu | 23–25 noiembrie | În așteptare |

Exemplu: Ana Ionescu deschide noiembrie, filtrează „Tehnic” și vede suprapunerea lui Andrei cu cererea Irinei. Deschide **Cerere nouă** și selectează 12–13 noiembrie în formular pentru a vedea detaliile suprapunerii. Lista de cereri indică aprobatorul curent, inclusiv înlocuitorul disponibil. După decizie, calendarul se actualizează. Un coleg obișnuit vede în calendar numele, departamentul, perioada și starea, fără motive, PDF-uri sau drept de aprobare asupra cererilor altora.

Calendarul se reîmprospătează la 10 secunde cât pagina este vizibilă și când revii în fereastră. Relansarea demonstrației păstrează schimbările, deciziile și documentele existente și nu creează cereri care se suprapun cu cererile existente ale aceleiași persoane.
