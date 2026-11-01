# Dosar Demo - UPS și arhivă digitală

Șapte PDF-uri noi, legate între ele, pentru parcurgerea completă a dosarului în aplicație. Fișierele folosesc convenția `Demo_<tip_document>.pdf` și se încarcă individual din dosarul **Demo**.

Furnizor: **Nod Sigur Demo SRL**. Monedă: **RON**. Valoare totală cu TVA: **70.785,00 RON**. Bază: 58.500,00 RON; TVA de scenariu 21%: 12.285,00 RON. Contractul, recepția și factura acoperă aceeași sumă integrală.

| Pas | Fișier | Tip de ales în aplicație | Număr |
| --- | --- | --- | --- |
| 1. Pregătire | Demo_referat_necesitate.pdf | Referat de necesitate | DEMO-NEC-001 |
| 1. Pregătire | Demo_caiet_sarcini.pdf | Caiet de sarcini | DEMO-CS-001 |
| 2. Achiziție | Demo_contract.pdf | Contract | DEMO-CON-001 |
| 3. Recepție | Demo_document_livrare.pdf | Document de livrare | DEMO-LIV-001 |
| 3. Recepție | Demo_raport_servicii.pdf | Raport de servicii | DEMO-SRV-001 |
| 3. Recepție | Demo_proces_verbal_receptie.pdf | Proces-verbal de recepție | DEMO-PVR-001 |
| 4. Plată | Demo_factura.pdf | Factură | DEMO-FAC-001 |

## Cum le folosești

1. Deschide **Documente → Dosare achiziții → Demo**. Dacă dorești, setează valoarea anticipată la `70785.00` în **Avansat → Editează dosarul**.
2. Încarcă cele două documente de pregătire din cardurile lor. Verifică valorile extrase și trimite spre aprobare. Confirmă legătura dintre caiet și referat, apoi **Trimite în verificare**.
3. Încarcă și aprobă contractul; confirmă-l ca principal, apoi **Angajează achiziția**.
4. La livrare, alege **Document de livrare** și încarcă `Demo_document_livrare.pdf`, apoi procesul-verbal de recepție. Verifică și aprobă documentele, confirmă livrare → contract și recepție → livrare; apoi **Confirmă recepția**, folosind un cont autorizat. Alternativ, poți alege **Raport de servicii** și confirma raport → contract și recepție → raport. Ambele documente descriu același pachet, fără o valoare suplimentară de recepționat.
5. Încarcă factura și verifică valorile. În dosar, confirmă factura → contract, factura → recepție și suma de `70785.00` alocată recepției. Finalizează aprobarea facturii, apoi **Confirmă facturile**.
6. Înregistrează plata demonstrativă de `70785.00`, cu data și o referință distinctă, apoi **Închide ca plătit**. Platforma înregistrează operația; nu trimite bani.

Documentele pornesc de la exemplul UPS existent în `data/pdfs/doc-043.pdf` până la `doc-048.pdf`. Sunt documente noi pentru un singur pachet complet, cu valori inclusiv TVA, date consecvente și observații rezolvate. Nu trebuie amestecate cu documentele inițiale, care folosesc un plafon anual și o tranșă parțială.

Toate datele sunt fictive. PDF-urile nu includ aprobări sau semnături aplicate; acestea se efectuează în circuitul aplicației.

## Încărcare și semnare automată în registru

Cu aplicația pornită în Docker, rulează din rădăcina proiectului:

```bash
bash scripts/upload_demo_documents.sh
```

În PowerShell poți rula direct scriptul Python:

```powershell
python scripts/upload_demo_documents.py
```

Scriptul încarcă cele șapte PDF-uri ca documente independente în Craiova, așteaptă extragerea, validează câmpurile obligatorii și înregistrează aprobarea și semnătura prin serviciile aplicației, folosind persoanele desemnate. Nu creează dosare și nu asociază documentele. Apoi le poți selecta din **Alege din registru** în orice dosar accesibil.

O nouă rulare reia documentele independente pregătite de script. Dacă le-ai asociat deja unui dosar, creează un nou set pentru asociere. Documentele existente în alte dosare rămân intacte. `--dry-run` afișează fișierele fără modificări; `--airport sibiu` pregătește setul în Sibiu. Raportul cu ID-uri este salvat în `.runtime/procurement-register/<aeroport>.json`.
