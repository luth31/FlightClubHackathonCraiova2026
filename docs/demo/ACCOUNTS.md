# Conturile demo FlyLeaf

Deschide [aplicația](http://127.0.0.1:5184), introdu numele complet din tabel și parola **`FlyLeaf2026!`**. Aceasta este parola tuturor celor 28 de conturi demo de mai jos. Aeroportul este identificat automat din cont, după verificarea parolei.

De exemplu, `Alexandru Mureșan` + `FlyLeaf2026!` deschide spațiul Aeroportului Sibiu. Numele se poate scrie și fără diacritice; majusculele și spațiile suplimentare nu schimbă identificarea. Parola trebuie introdusă exact.

Pentru alt cont, apasă **Ieși din cont**, apoi introdu celălalt nume și parola. Formularul nu afișează liste de persoane sau aeroporturi. O sesiune deja autentificată poate rămâne deschisă după reîncărcarea paginii.

## Numele pentru conectare și aeroportul asociat

| Nume pentru conectare | Aeroport | Funcție |
|---|---|---|
| Ana Ionescu | Craiova | Director aeroport |
| Mihai Dumitrescu | Craiova | Șef achiziții și financiar |
| Elena Popa | Craiova | Responsabil conformitate |
| Radu Marinescu | Craiova | Responsabil financiar |
| Ioana Stancu | Craiova | Responsabil resurse umane |
| Sorin Pavel | Craiova | Șef tehnic și operațiuni |
| Andrei Neagu | Craiova | Tehnician mentenanță |
| Alexandru Mureșan | Sibiu | Director aeroport |
| Mihai Popescu | Sibiu | Șef achiziții și financiar |
| Elena Stan | Sibiu | Responsabil conformitate |
| Radu Pop | Sibiu | Responsabil financiar |
| Irina Luca | Sibiu | Responsabil resurse umane |
| Ioana Rusu | Sibiu | Șef tehnic și operațiuni |
| Robert Ionescu | Sibiu | Tehnician mentenanță |
| Mara Georgescu | Cluj | Director aeroport |
| Daria Marin | Cluj | Șef achiziții și financiar |
| Teodora Dobre | Cluj | Responsabil conformitate |
| Paul Rusu | Cluj | Responsabil financiar |
| Diana Pavel | Cluj | Responsabil resurse umane |
| Vlad Munteanu | Cluj | Șef tehnic și operațiuni |
| Matei Luca | Cluj | Tehnician mentenanță |
| Andrei Constantinescu | Iași | Director aeroport |
| Cristina Matei | Iași | Șef achiziții și financiar |
| Oana Dumitru | Iași | Responsabil conformitate |
| Dan Pavel | Iași | Responsabil financiar |
| Laura Tudor | Iași | Responsabil resurse umane |
| Victor Ilie | Iași | Șef tehnic și operațiuni |
| Mihnea Radu | Iași | Tehnician mentenanță |

## Cazurile de colaborare pregătite

La inițializare, Craiova, Sibiu și Cluj au colaborarea activată. Iași începe cu ea dezactivată; Andrei Constantinescu o poate activa din **Colaborare → Mesagerie**, apăsând pe identitatea propriului aeroport din partea de sus. Modificările acestei opțiuni se păstrează la repornire.

Pentru a găsi un partener, deschide **Aeroporturi**, caută numele sau codul aeroportului și selectează rezultatul ori marcajul de pe hartă. Profilul arată numele, rolul și emailul contactelor, iar iconița de mesaj deschide redactarea cu destinatarul completat. Pentru a vedea Iași înainte de activare, debifează **În colaborare**; contactele sale nu sunt publicate.

În contul **Ana Ionescu**, deschide **Mesaje → Primite → Model pentru recepția serviciilor de mentenanță**. Răspunsul lui Alexandru din Sibiu include un formular PDF real, pe două pagini, cu miniatură, previzualizare și descărcare.

În previzualizare poți descărca PDF-ul sau o copie Word cu text și tabele editabile. Modifică Word-ul local, verifică aranjarea, exportă în PDF și folosește **Încarcă PDF de pe dispozitiv** în mesaj. Fișierul trece prin verificare, aprobare și pregătirea copiei înainte de atașare. Dacă avizarea este atribuită altcuiva, aplicația arată responsabilul; directorul o poate prelua explicit dacă are dreptul de reatribuire. Textul mesajului se păstrează pe parcurs.

Într-un mesaj nou, alegerea aeroportului afișează persoanele disponibile la **Către**, fără să fie nevoie să le cunoști numele. Cardul deschis de pe avatar are și **Copiază emailul**.

Directorii și persoanele numite șefi ai departamentelor principale au acces la colaborare în aeroporturile participante. Tehnicienii nu au acces. Conturile și documentele sunt fictive, destinate demonstrației locale.

Instrucțiunile tehnice de pornire și oprire sunt în [documentația colaborării](../PARTNER_COORDINATION_API.md#four-airport-local-demonstration).
