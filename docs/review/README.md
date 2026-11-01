# FlyLeaf — ghid pentru evaluare

FlyLeaf leagă documentele, persoanele responsabile și activitățile aeroportului, astfel încât informația găsită să poată deveni o decizie sau o acțiune urmărită. Flight Club este echipa; FlyLeaf este produsul.

## Ordinea recomandată

| Întrebarea evaluatorului | Unde găsește răspunsul |
| --- | --- |
| Ce problemă rezolvă, pentru cine și de ce ar plăti? | [Produs, cazuri de utilizare și pilot](PRODUCT_AND_PILOT.md) |
| Cum îl prezentăm? | [Prezentarea actuală HTML](../presentation/index.html) · [PDF](../presentation/FlyLeaf-product.pdf) |
| Cum este construit și ce trebuie verificat? | [Ghid tehnic scurt](ENGINEERING.md) |
| Care sunt modulele și relațiile dintre ele? | [Arhitectura detaliată](../MODULE_ARCHITECTURE.md) |
| De ce am ales aceste tehnologii? | [Tehnologii și concepte](../TECH_STACK_AND_CONCEPTS.md) |
| Cum pornesc aplicația și cu ce conturi? | [Instalare](../../README.md) · [Conturi locale](../demo/ACCOUNTS.md) |

## Ce merită inspectat în produs

1. **Documente:** căutare și filtre, responsabil, valabilitate, versiune și traseul aprobării. Un document returnat reia verificarea; o versiune nouă nu moștenește aprobarea celei vechi.
2. **Echipamente și Acasă:** incident, alegerea responsabilului, acțiune personală, executare și verificare. Pagina personală reunește lucrul atribuit.
3. **Operațiuni → Registru:** activități independente în paralel, dependențe, stări, ore și dovezi. Starea executării și întârzierea sunt informații distincte.
4. **Echipă:** ierarhie, contact și calendarul concediilor; vizibilitatea unui interval nu echivalează cu aprobarea concediului.
5. **Colaborare:** participare voluntară, contacte autorizate, conversație și copie partajată cu acces explicit. Un aeroport poate folosi produsul și fără parteneri.

Documentația separă funcțiile din cod de ipotezele comerciale. Pilotul, prețul și economiile sunt propuneri de validat. Starea verificării tehnice este explicată în [ENGINEERING.md](ENGINEERING.md); acest dosar nu înlocuiește rezultatul testelor pe commitul final.
