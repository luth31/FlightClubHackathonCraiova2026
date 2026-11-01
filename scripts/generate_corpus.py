#!/usr/bin/env python3
"""Build the deterministic, fictional FlyLeaf Romanian airport corpus.

Requires reportlab and pypdf. No network, credentials or real personal data.
Run from any directory: python scripts/generate_corpus.py
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data"
PDFS = OUT / "pdfs"
REF = date(2026, 10, 30)
AIRPORT = "Aeroportul Craiova"
DEMO = "Date fictive pentru demonstrație"
INK, GREEN, MUTED = colors.HexColor("#20342F"), colors.HexColor("#2D6B58"), colors.HexColor("#65756F")
PALE, LINE = colors.HexColor("#F0F4F0"), colors.HexColor("#D9E1DA")

SOURCES = [
    {"id":"S01","title":"EASA - Easy Access Rules for Aerodromes, March 2026","url":"https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-aerodromes-regulation-eu?erules-id=ERULES-1963177438-1846","scope":"Document control, training, records and maintenance families; not copied operational instructions."},
    {"id":"S02","title":"AACR - PAC-AD-CADC, edition 1/2023","url":"https://caa.ro/uploads/pages/2023.06.16%20D488-2013%20aprobare%20PAC-AD-CADC%20ed%201-2023.pdf","scope":"Certification evidence and controlled aerodrome documentation."},
    {"id":"S03","title":"Portal Legislativ - Legea nr. 99/2016, achiziții sectoriale","url":"https://legislatie.just.ro/Public/DetaliiDocument/200898","scope":"Sector procurement context; no procedure thresholds or legal determinations encoded."},
    {"id":"S04","title":"ANAP - Completarea referatului de necesitate","url":"https://achizitiipublice.gov.ro/workflows/view/212","scope":"Need identification before procurement documentation."},
    {"id":"S05","title":"Portal Legislativ - Legea Arhivelor Naționale nr. 16/1996","url":"https://legislatie.just.ro/Public/DetaliiDocument/263510","scope":"Inventory and transfer record document families; retention periods require local validation."},
    {"id":"S06","title":"Portal Legislativ - Codul muncii, Legea nr. 53/2003","url":"https://legislatie.just.ro/Public/DetaliiDocumentAfis/128646","scope":"Leave and personnel administration context; fictional records contain no payroll or medical information."},
    {"id":"S07","title":"Aerosimple - Document Management","url":"https://www.aerosimple.com/solutions/document-management","scope":"Public product inspiration: searchable repository, approvals, versions, access and expiry alerts. Vendor claims not independently tested."},
    {"id":"S08","title":"CN Aeroporturi București - Regulament de organizare și funcționare, rev. 20","url":"https://bucharestairports.ro/storage/2026/03/ROF-CNAB-Rev.20_1-Noiembrie-2024.pdf","scope":"Airport department responsibilities and maintenance documentation context; not an organizational clone."},
]

# Every case has its own business reason, acceptance evidence and realistic scope.
# Amounts and periods are invented scenario parameters, never market estimates.
CASES = [
 ("Scări pasageri mobile SP-02", "Portalis Service Demo SRL", "Tehnic", 86400, 20, "SP-02", "revizii planificate și piese de uzură pentru scara mobilă", "Fișa de exploatare indică joc la mâna curentă și uzură neuniformă a două roți. Sunt planificate patru vizite în perioada contractuală.", ["Fișă de verificare mecanică și fotografii de atelier", "Trasabilitatea pieselor montate, pe lot și serie", "Proces-verbal semnat de responsabilul utilajului"], "Două roți înlocuite; balustrada ajustată. Raportul de atelier este atașat recepției.", "Achiziții"),
 ("Autospecială intervenție AS-04", "Argint Tehnic Demo SRL", "Tehnic", 142800, 51, "AS-04", "service preventiv al autospecialei de intervenție", "Planul de întreținere intern rezervă o fereastră de atelier pentru verificarea sistemelor auxiliare și înlocuirea consumabilelor.", ["Lista operațiunilor realizate conform documentației producătorului", "Identificarea consumabilelor și confirmarea compatibilității", "Confirmarea predării către responsabil, fără autorizare operațională prin acest PDF"], "Consumabilele au fost înlocuite. O piesă suplimentară rămâne în ofertare și nu este facturată.", "Achiziții"),
 ("Bandă de bagaje BB-01", "Rulment Verde Demo SRL", "Tehnic", 126000, 8, "BB-01", "mentenanță a benzii de bagaje și a componentelor de antrenare", "Registrul de mentenanță arată opriri scurte recurente. Contractul propus include diagnostic, piese agreate și un raport lunar al indisponibilității.", ["Jurnal al intervenției și identificarea modulului", "Dovada testului în atelier executat de personal competent", "Recepție cu lista observațiilor rămase"], "Modul de antrenare înlocuit; observarea în exploatare este atribuită tehnicianului local.", "Achiziții"),
 ("Balizaj - stoc piese de schimb", "Lumen Pista Demo SRL", "Tehnic", 198000, 91, "BAL-STOC", "furnizare de piese de schimb pentru instalația de balizaj", "Inventarul de magazie arată stoc sub nivelul intern propus pentru mai multe repere. Loturile trebuie recepționate separat și asociate documentelor de conformitate.", ["Aviz de livrare cu coduri și cantități", "Documente de conformitate aferente loturilor", "Verificarea cantitativă în magazie"], "Lotul A este complet. Un reper din lotul B are eticheta neclară și este ținut separat până la clarificare.", "Achiziții"),
 ("Echipament deszăpezire DZ-03", "Nord Utilaje Demo SRL", "Tehnic", 112500, 34, "DZ-03", "pregătirea sezonieră și revizia utilajului de deszăpezire", "Pregătirea sezonului rece cere închiderea lucrărilor din atelier înainte de schimbarea programului intern. Documentul nu stabilește parametri de operare pe pistă.", ["Lista pieselor consumate", "Raport de atelier pentru ansamblul revizuit", "Planificarea intervenției următoare"], "Ansamblul hidraulic revizuit; o garnitură a fost înlocuită din stoc contractual.", "Achiziții"),
 ("Climatizare terminal - zona publică", "Aer Curat Demo SRL", "Tehnic", 96000, -12, "HVAC-PUB", "întreținerea instalațiilor de climatizare din zona publică", "Ultimul interval de service a ajuns la final. Un nou dosar de achiziție este deschis; expirarea nu anulează serviciile recepționate în intervalul anterior.", ["Fișe per unitate și consumabile", "Raport privind intervențiile și recomandările", "Recepție pe perioada facturată"], "Filtre schimbate în patru unități. Contractul s-a încheiat la termen, fără prelungire automată.", "Achiziții"),
 ("Grup electrogen GE-02", "Volt Continuu Demo SRL", "Tehnic", 74000, 123, "GE-02", "service pentru sursa de rezervă administrativă", "A fost solicitat un contract cu evidența pieselor, trasabilitatea intervențiilor și responsabilități explicite. Testele reale rămân în documentația tehnică autorizată.", ["Raport de service identificat prin serie", "Lista materialelor și manoperei", "Confirmarea predării documentației"], "Revizie documentată; acumulatorul este propus pentru înlocuire într-o comandă separată.", "Achiziții"),
 ("UPS și arhivă digitală", "Nod Sigur Demo SRL", "Tehnic", 58500, 42, "IT-UPS-01", "mentenanță UPS și verificarea restaurării arhivei de test", "Circuitul documentelor depinde de accesul local. Se cere o probă de restaurare pe date fictive, fără acces la sisteme de producție aeroportuare.", ["Inventarul echipamentelor acoperite", "Raport de restaurare cu amprente de fișiere", "Lista excepțiilor și responsabilul remediării"], "Restaurarea a recuperat toate cele 40 de fișiere din setul de test; o alertă de baterie rămâne deschisă.", "Achiziții"),
 ("Servicii curățenie terminal", "Clar Terminal Demo SRL", "Operațiuni", 324000, 62, "SERV-CUR", "servicii de curățenie pentru spații publice și administrative", "Responsabilul de clădire a separat spațiile, frecvențele și evidențele de prestare pentru a permite recepția lunară pe zone.", ["Centralizator lunar pe zone", "Fișe de consum materiale", "Proces-verbal de recepție cu eventuale rezerve"], "Prestarea din perioada demonstrativă este acceptată; un consum de material cere document justificativ suplimentar.", "Achiziții"),
 ("Colectare deșeuri nepericuloase", "Circuit Verde Demo SRL", "Conformitate", 48000, 180, "MED-REC", "colectare separată și evidență a deșeurilor nepericuloase", "Compartimentul de mediu solicită documente pe flux și cântărire; documentația nu include deșeuri periculoase sau operațiuni reglementate care necesită avize suplimentare.", ["Bonuri de cântărire fictive", "Centralizator pe tip de material", "Dovada preluării de către prestator"], "Trei transporturi reconciliate cu centralizatorul. O diferență de rotunjire a fost explicată în anexă.", "Achiziții"),
 ("Monitorizare zgomot ambiental", "Ecou Analitic Demo SRL", "Conformitate", 67500, 75, "MED-ZG", "campanie documentară de monitorizare ambientală", "Comparația anuală necesită raport, trasabilitatea echipamentului și limitele măsurării. Nu se deduce conformitatea reală din valorile fictive.", ["Raport de măsurare cu metodă declarată", "Identificarea instrumentelor utilizate", "Fișier de date și observații privind acoperirea"], "Raportul a fost primit. Două ferestre fără date sunt explicate și excluse din comparația demonstrativă.", "Achiziții"),
 ("Control vegetație perimetrală", "Orizont Verde Demo SRL", "Operațiuni", 92000, 150, "SERV-VEG", "întreținere vegetație în zone administrative autorizate", "Planul de lucrări delimitează numai zone demonstrative, fără hărți, rute sau detalii de acces la un aeroport real.", ["Fișă de lucrare și suprafață declarată", "Evidența predării zonei", "Recepție de către responsabilul desemnat"], "Lucrarea din zona administrativă este recepționată; resturile vegetale sunt evidențiate separat.", "Achiziții"),
 ("Calibrare instrumente atelier", "Etalon Sud Demo SRL", "Tehnic", 36400, 16, "MET-AT", "calibrare și evidență certificate pentru instrumente", "Trei instrumente ajung la termenul intern de verificare. Se solicită certificate identificabile individual și decizie documentată asupra rezultatului.", ["Certificat per instrument și serie", "Rezultate și incertitudini în documentul prestatorului", "Decizie de acceptare de către responsabilul competent"], "Două instrumente acceptate; al treilea este retras din utilizarea demonstrativă până la clarificare.", "Achiziții"),
 ("Uși automate terminal", "Prag Mobil Demo SRL", "Tehnic", 45500, 210, "USI-T1", "service al ușilor automate din terminal", "Registrul clădirii conține două sesizări de funcționare intermitentă. Dosarul asociază fiecare sesizare cu intervenția și recepția sa.", ["Fișe pe ușă identificată", "Piese utilizate și recomandări", "Raport de închidere a sesizărilor"], "Senzorul unei uși a fost înlocuit; a doua sesizare a fost închisă după diagnostic documentat.", "Achiziții"),
 ("Iluminat interior LED", "Linie Luminoasă Demo SRL", "Tehnic", 138600, 274, "LED-T1", "înlocuire corpuri de iluminat interior și recepție", "Proiectul urmărește înregistrarea corpurilor înlocuite și a documentației de livrare; nu se estimează economii fără măsurare comparabilă.", ["Inventar al corpurilor livrate", "Documente tehnice și garanții", "Recepție cantitativă și observații"], "Livrarea este completă; consumul după schimbare urmează să fie măsurat separat.", "Achiziții"),
 ("Consumabile atelier tehnic", "Atelier Logic Demo SRL", "Tehnic", 42750, 105, "MAG-AT", "livrare eșalonată de consumabile de atelier", "Cererile interne sunt agregate pentru a evita comenzile duplicate. Recepția se face pe cod și unitate, nu numai pe valoarea facturii.", ["Comandă cu repere și cantități", "Aviz și loturi", "Notă de recepție și diferențe"], "Un reper a fost livrat parțial. Diferența este menținută deschisă și nu intră în suma acceptată.", "Achiziții"),
 ("Instruire personal tehnic", "Competență Aero Demo SRL", "Resurse umane", 28800, 32, "TRN-TECH", "servicii de instruire documentară a personalului tehnic", "Programul demonstrativ urmărește participarea, evaluarea și reînnoirea competențelor fără să confere o autorizare aeronautică reală.", ["Agendă și material didactic", "Lista participării cu identificatori interni fictivi", "Raport de evaluare și necesar de reluare"], "Șapte participanți au încheiat sesiunea; unul are reevaluare programată.", "Achiziții"),
 ("Digitizare arhivă contractuală", "Fila Clară Demo SRL", "Conformitate", 81000, 96, "ARH-2026", "digitizare, indexare și control de calitate pentru dosare", "Proiectul testează căutarea și asocierea versiunilor pe un fond fictiv. Originalele demonstrative rămân conservate, iar eliminarea nu este automatizată.", ["Inventar sursă și țintă", "Control de pagini și metadate", "Raport al excepțiilor de lizibilitate"], "Lotul de test conține toate paginile așteptate; trei câmpuri ilizibile sunt marcate pentru verificare umană.", "Achiziții"),
 ("Asigurare echipamente administrative", "Pavilion Asigurări Demo SRL", "Financiar", 52000, 26, "POL-ADM", "acoperire contractuală fictivă pentru bunuri administrative", "Lista bunurilor și perioada de acoperire trebuie verificate separat de factura de primă. Nu se formulează recomandări de asigurare.", ["Anexă cu bunurile acoperite", "Perioadă și excluderi vizibile", "Confirmarea corespondenței cu factura"], "Anexa bunurilor este reconciliată; două poziții fără serie au fost returnate pentru completare.", "Achiziții"),
 ("Închiriere spațiu comercial C-04", "Cafenea Altitudine Demo SRL", "Financiar", 156000, 365, "SP-C04", "administrare contract de închiriere pentru spațiu comercial", "Dosarul separă chiria, garanția și obligațiile de predare. Nu include date reale despre amplasament, securitate sau acces.", ["Proces-verbal de predare a spațiului fictiv", "Inventar bunuri și observații", "Calendarul obligațiilor contractuale"], "Predarea este consemnată cu două observații de finisaj și termen de remediere.", "Financiar"),
]

def money(value):
    return f"{Decimal(str(value)):,.2f}".replace(",", " ").replace(".", ",") + " RON"

def romanian_date(value):
    return date.fromisoformat(str(value)[:10]).strftime("%d.%m.%Y")

def font_setup():
    candidates = [
        (Path('C:/Windows/Fonts/arial.ttf'), Path('C:/Windows/Fonts/arialbd.ttf')),
        (Path('/System/Library/Fonts/Supplemental/Arial.ttf'), Path('/System/Library/Fonts/Supplemental/Arial Bold.ttf')),
        (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')),
    ]
    for regular,bold in candidates:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont('Aero', str(regular)))
            pdfmetrics.registerFont(TTFont('AeroBold', str(bold)))
            pdfmetrics.registerFontFamily('Aero', normal='Aero', bold='AeroBold')
            return
    raise RuntimeError('Install Arial or DejaVu Sans for Romanian diacritics.')

def styles():
    return {
      'title': ParagraphStyle('title',fontName='AeroBold',fontSize=22,leading=27,textColor=INK,spaceAfter=12),
      'kicker': ParagraphStyle('kicker',fontName='AeroBold',fontSize=9,leading=12,textColor=GREEN,spaceAfter=10),
      'h': ParagraphStyle('h',fontName='AeroBold',fontSize=12,leading=16,textColor=INK,spaceBefore=14,spaceAfter=7,keepWithNext=True),
      'body': ParagraphStyle('body',fontName='Aero',fontSize=10,leading=15,textColor=INK,spaceAfter=9),
      'small': ParagraphStyle('small',fontName='Aero',fontSize=8.3,leading=12,textColor=MUTED,spaceAfter=5),
      'cell': ParagraphStyle('cell',fontName='Aero',fontSize=9,leading=13,textColor=INK),
      'label': ParagraphStyle('label',fontName='AeroBold',fontSize=8.5,leading=12,textColor=MUTED),
    }

def p(text, style='body'):
    return Paragraph(escape(str(text)).replace('\n','<br/>'), STYLES[style])

def table(rows,widths=None):
    content = [[p(v,'label' if i==0 else 'cell') for i,v in enumerate(row)] for row in rows]
    result=Table(content,colWidths=widths or [132,343],hAlign='LEFT')
    result.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(0,-1),PALE),('LINEBELOW',(0,0),(-1,-1),0.4,LINE),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
    return result

def section(title, body):
    return [p(title,'h'),p(body)]

def footer(canvas,doc):
    canvas.saveState()
    w,h=A4
    canvas.setFillColor(GREEN);canvas.rect(0,h-9,w,9,fill=1,stroke=0)
    canvas.setFont('AeroBold',10);canvas.setFillColor(INK);canvas.drawString(60,h-43,"FlyLeaf / " + AIRPORT)
    canvas.setFont('Aero',8);canvas.setFillColor(MUTED);canvas.drawRightString(w-60,h-43,"ARHIVĂ DEMONSTRATIVĂ")
    canvas.setStrokeColor(LINE);canvas.line(60,48,w-60,48)
    canvas.setFont('Aero',7.5);canvas.drawString(60,34,DEMO)
    canvas.drawRightString(w-60,34,f"{doc.record['number']}  |  {doc.page}")
    canvas.restoreState()

def render(record, pages):
    target=PDFS/record['filename']
    doc=SimpleDocTemplate(str(target),pagesize=A4,rightMargin=60,leftMargin=60,topMargin=77,bottomMargin=64,title=record['title'],author='FlyLeaf - synthetic corpus',subject=DEMO,invariant=1)
    doc.record=record
    story=[]
    for index,blocks in enumerate(pages):
        if index: story.append(PageBreak())
        story.extend(blocks)
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    return target

def heading(record, subtitle=None):
    status={'draft':'Ciornă','in_review':'În avizare','approved':'Aprobat în scenariu','archived':'Arhivat în scenariu'}[record['status']]
    return [p(record['category'].upper()+' / '+record['number'],'kicker'),p(subtitle or record['title'],'title'),p(f"{DEMO}. {status}. Nicio semnătură reală sau calificare juridică nu este reprezentată.",'small'),Spacer(1,9)]

def evidence(record,case=None):
    refs = ', '.join(s['id'] for s in record['source_refs'])
    blocks=section('Proveniență și limite',f"Conținut original, sintetic, creat pentru FlyLeaf. Familiile documentare au fost informate de sursele {refs}, descrise în catalogul corpusului. Numele, prețurile, datele și constatările sunt fictive. Referințele publice nu validează acest document și nu constituie aprobare de autoritate.")
    blocks += [p('Referințe publice','h')]
    for s in record['source_refs']:
        blocks += [p(s['id']+' · '+s['title'],'small'),p(s['url'],'small')]
    return blocks

def workflow(record, steps=None):
    return table(steps or [('Inițiator',record['owner']),('Verificare',record['department']+' - verificarea documentului și a anexelor'),('Decizie','Aprobarea aparține persoanei autorizate în circuitul aplicației.'),('Versiune','v1. Modificarea conținutului necesită reavizare; istoricul nu se șterge.')])

def base_record(title,category,department,status,created,expires=None,supplier=None,value=None,owner=None,confidentiality='internal',tags=None,metadata=None,source_ids=('S01',)):
    idx=len(DOCS)+1
    owner=owner or {'Achiziții':'Mihai Dumitrescu','Tehnic':'Andrei Neagu','Financiar':'Radu Marinescu','Resurse umane':'Ioana Stancu','Conformitate':'Elena Popa','Operațiuni':'Ana Ionescu'}.get(department,'Mihai Dumitrescu')
    record={'id':f'doc-{idx:03d}','title':title,'number':f'AD-{2026}-{idx:04d}','category':category,'department':department,'status':status,'created_at':created.isoformat()+'T09:00:00Z','expires_at':expires.isoformat() if expires else None,'supplier':supplier,'value':value,'currency':'RON','owner':owner,'confidentiality':confidentiality,'tags':tags or [],'summary':'','filename':f'doc-{idx:03d}.pdf','related_ids':[],'workflow':{'steps':[{'label':'Înregistrare','status':'complete'},{'label':'Verificare metadate','status':'pending' if status=='draft' else 'complete'},{'label':'Aprobare','status':'complete' if status in ('approved','archived') else 'pending'}],'current_step':'Verificare metadate' if status=='draft' else ('Aprobare' if status=='in_review' else 'Finalizat')},'metadata':metadata or {},'source_refs':[s for s in SOURCES if s['id'] in source_ids],'validated':status!='draft'}
    DOCS.append(record)
    return record

def build_case(index,case):
    name,supplier,dept,value,offset,asset,scope,reason,criteria,finding,contract_dept=case
    case_id=f'ACH-2026-{index:03d}'
    end=REF+timedelta(days=offset)
    start=date(2026,2,1)+timedelta(days=(index-1)*4)
    doc_date=start-timedelta(days=15)
    contact=f'contracte@furnizor{index:02d}.example'
    bban=f'DEMO{index:04d}000000000000'
    numeric=''.join(str(ord(c)-55) if c.isalpha() else c for c in bban+'RO00')
    compact=f'RO{98-int(numeric)%97:02d}'+bban
    iban=' '.join(compact[i:i+4] for i in range(0,len(compact),4)) # fictitious DEMO bank code, valid checksum
    meta={'case_id':case_id,'procurement_ref':case_id,'asset_code':asset,'effective_date':start.isoformat(),'notice_days':60,'supplier_contact':contact,'supplier_iban':iban,'supplier_tax_id':f'DEMO-CUI-{1000+index}','retention_policy':'De stabilit prin nomenclatorul aprobat; fără eliminare automată','amount_excludes_tax':True,'payment_days':30,'demo_iban_valid_checksum':True}
    tags=[asset,'dosar complet',dept.lower(), 'demonstrație']
    stages=[]
    contract_status='in_review' if index in (1,3,5,13) else ('draft' if index==18 else 'approved')
    contract=base_record(f'Contract - {name}','Contract',contract_dept,contract_status,start,end,supplier,value,tags=tags,metadata=meta.copy(),source_ids=('S03','S08'))
    stages.append(contract)
    contract['summary']=f"Contract pentru {scope}, cu plafon de {money(value)} fără TVA. Valabilitate {romanian_date(start)} - {romanian_date(end)}; preaviz intern propus 60 de zile. {reason}"
    contract['metadata']['source_fields']=[{'field':key,'value':val,'page':1,'excerpt':label,'reviewed':contract['validated']} for key,val,label in [('supplier',supplier,f'Furnizor: {supplier}'),('value',value,f'Valoare fără TVA: {money(value)}'),('expires_at',end.isoformat(),f'Data expirării: {romanian_date(end)}')]]
    c1=heading(contract)+[table([('Beneficiar',AIRPORT+' - scenariu demonstrativ'),('Furnizor',supplier),('Dosar / activ',case_id+' / '+asset),('Interval',romanian_date(start)+' - '+romanian_date(end)),('Valoare fără TVA',money(value)),('Data expirării',romanian_date(end)),('Contact contractual',contact)])]+section('1. Obiectul contractului',f"Părțile din scenariu convin {scope}. Dosarul cuprinde cerințele, documentele de prestare, recepția și factura aferentă. {reason}")+section('2. Preț și facturare',f"Plafonul demonstrativ este {money(value)}, fără TVA. Facturarea se face pentru prestațiile recepționate, pe baza anexelor. Scenariul nu stabilește un tratament fiscal real. O diferență de preț sau de cont bancar cere verificare umană.")
    c2=[p('Obligații și controlul executării','title')]+section('3. Livrabile și acceptare','Responsabilul verifică următoarele dovezi. O recepție cu rezerve nu echivalează cu acceptarea automată a tuturor sumelor facturate.')+[table([(f'Criteriu {i+1}',v) for i,v in enumerate(criteria)])]+section('4. Urmărirea termenelor',f"Alerta de reînnoire din scenariu se propune cu 60 de zile înainte de {romanian_date(end)}. Data trebuie confirmată în aplicație. Preavizul și durata unei noi achiziții sunt câmpuri distincte, de validat pe contractul real.")+section('5. Modificări și incidente','Orice schimbare de obiect, preț, perioadă sau cont de plată se documentează separat, păstrând versiunea anterioară. Prestatorul nu poate schimba unilateral registrul de furnizori printr-un e-mail. Un alt angajat verifică independent o modificare bancară.')+[table([('IBAN de test',iban+' - checksum valid, cod bancar fictiv DEMO; nu se utilizează pentru plăți'),('Verificare contact','Contactul .example este fictiv și nu primește mesaje.'),('Limită','Aplicația nu inițiază plăți; aprobarea documentară nu confirmă dreptul la plată.')])]
    c3=[p('Circuit și anexe','title')]+[workflow(contract)]+section('6. Legături în dosar','Referatul de necesitate justifică cererea; caietul de sarcini descrie livrabilele; raportul confirmă activitatea; procesul-verbal consemnează acceptarea; factura solicită plata. Documentele sunt legate prin același număr de dosar.')+section('7. Semnarea','Acest fișier nu conține o semnătură aplicată de un furnizor. Starea „aprobat” din datele inițiale este un eveniment fictiv al scenariului. Semnarea criptografică de demonstrație se execută separat în aplicație, asupra versiunii aprobate.')+evidence(contract)
    render(contract,[c1,c2,c3])
    need=base_record(f'Referat de necesitate - {name}','Referat de necesitate',dept,'approved',doc_date,None,supplier,value,tags=tags,metadata=meta.copy(),source_ids=('S03','S04'))
    stages.append(need);need['summary']=reason
    n1=heading(need)+[table([('Solicitant',dept),('Dosar',case_id),('Activ / serviciu',asset),('Estimare internă fără TVA',money(value)),('Data solicitării',romanian_date(doc_date))])]+section('Necesitatea identificată',reason)+section('Rezultatul urmărit',f"Obținerea documentată a serviciului: {scope}. Solicitarea include responsabil, buget orientativ și criterii de recepție, pentru ca dosarul să poată fi urmărit fără căutarea anexelor în e-mailuri.")+section('Alternativa analizată','Amânarea și folosirea exclusivă a resurselor interne au fost analizate în scenariu. Compartimentul solicitant cere serviciu extern deoarece capacitatea de atelier sau competența documentară nu acoperă toate livrabilele. Aceasta este o ipoteză de test, nu o evaluare a unui aeroport real.')
    n2=[p('Planificare și responsabilități','title')]+[table([('Sursă bugetară','Buget demonstrativ 2026 - poziție '+f'B{index:03d}'),('Prioritate','Continuitatea serviciului și trasabilitatea documentelor'),('Condiție de lansare','Verificarea încadrării și aprobarea necesității de către persoanele competente'),('Data propusă',romanian_date(start))])]+section('Documente de pregătit','Caiet de sarcini, estimare documentată, verificare a încadrării achiziției și circuit de avizare. Prezentul set nu pretinde că reprezintă întreaga documentație legală de atribuire.')+[workflow(need)]+evidence(need)
    render(need,[n1,n2])
    spec=base_record(f'Caiet de sarcini - {name}','Caiet de sarcini',dept,'approved',doc_date+timedelta(days=4),None,supplier,value,tags=tags,metadata=meta.copy(),source_ids=('S03','S01'))
    stages.append(spec);spec['summary']=f"Cerințe documentare și criterii de recepție pentru {scope}. " + ' '.join(criteria)
    s1=heading(spec)+[table([('Dosar',case_id),('Obiect',scope),('Activ',asset),('Responsabil',dept)])]+section('Domeniu și limite',f"Cerințele din acest exemplu privesc livrabilele și circuitul documentelor pentru {name.lower()}. Instrucțiunile de operare, accesul în zone restricționate, reglajele și parametrii de siguranță nu sunt incluse.")+section('Livrabile verificabile','Fiecare livrare trebuie identificată prin număr, dată, emitent și activ. O anexă ilizibilă sau absentă lasă recepția în așteptare, fără completarea automată a rezultatului.')+[table([(f'Livrabil {i+1}',v) for i,v in enumerate(criteria)])]
    s2=[p('Acceptare și evidențe','title')]+section('Criterii de acceptare','Se verifică legătura cu obiectul comandat, perioada, cantitățile și autoritatea persoanei care recepționează. Diferențele se consemnează cu responsabil și termen. Formatul electronic trebuie să permită citirea și păstrarea versiunii originale.')+[table([('Conform','Dovezile sunt complete și se referă la activul corect.'),('Cu rezerve','Lipsesc clarificări; se descrie exact partea neacceptată.'),('Respins','Livrabilul nu corespunde cerinței; motivul se înregistrează.'),('Modificare','Cerințele noi se avizează înainte de includerea într-un contract.')])]+section('Controlul versiunilor','Acest caiet este v1. O nouă anexă nu înlocuiește tacit conținutul aprobat. Dosarul trebuie să arate ce versiune a fost folosită la recepție.')+evidence(spec)
    render(spec,[s1,s2])
    service_date=min(REF-timedelta(days=7+(index%6)),end-timedelta(days=3))
    invoice_value=round(value/12,2)
    invoice=base_record(f'Factură - {name}','Factură','Financiar','in_review' if index in (1,4,8,16) else 'approved',service_date+timedelta(days=2),service_date+timedelta(days=32),supplier,invoice_value,owner='Radu Marinescu',confidentiality='restricted',tags=tags+['plată de verificat'],metadata={**meta,'service_date':service_date.isoformat(),'invoice_total':invoice_value,'payment_status':'not_exported','invoice_number':f'DEMO-F-{index:03d}'},source_ids=('S03',))
    stages.append(invoice);invoice['summary']=f"Factură demonstrativă pentru {scope}; bază {money(invoice_value)}, fără calcul fiscal. Serviciu la {romanian_date(service_date)}, legat de contractul {contract['number']}."
    i1=heading(invoice)+[table([('Emitent',supplier),('Client',AIRPORT),('Număr factură',f'DEMO-F-{index:03d}'),('Contract',contract['number']),('Data serviciului',romanian_date(service_date)),('Scadență',romanian_date(service_date+timedelta(days=32))),('Bază scenariu',money(invoice_value)),('Tratament fiscal','TVA necalculat în acest set demonstrativ')])]+section('Descrierea serviciului facturat',f"Tranșă documentară aferentă contractului pentru {scope}. Valoarea reprezentată este o bază de test, nu o factură fiscală și nu un mesaj RO e-Factura.")+section('Referința dovezilor',f"Raportul de prestare și procesul-verbal din dosarul {case_id} trebuie verificate înainte de aprobarea internă. {finding}")
    i2=[p('Verificare înainte de export','title')]+[table([('Furnizor',supplier),('Cont declarat',iban+' - cont fictiv, nu se utilizează pentru plată'),('Contact',contact),('Control perioadă',f'Serviciul din {romanian_date(service_date)} se compară cu intervalul contractului.'),('Control valoare','Suma acceptată se reconciliază cu recepția, nu numai cu plafonul contractului.'),('Rezultat inițial','Neexportat. Nicio tranzacție financiară nu este executată.')])]+section('Gestionarea diferențelor','Un cont diferit, o dublură sau o lipsă a recepției deschide un caz de verificare. Un IBAN care respectă formatul nu dovedește titularul. Persoana care propune schimbarea nu poate aproba singură utilizarea sa.')+section('Observație pentru test','Conturile din corpus au checksum corect și codul bancar fictiv DEMO. Validitatea formatului nu confirmă existența contului sau titularul. Acest document nu este o instrucțiune de plată.')+evidence(invoice)
    render(invoice,[i1,i2])
    accept=base_record(f'Proces-verbal de recepție - {name}','Proces-verbal',dept,'in_review' if index in (4,16) else 'approved',service_date+timedelta(days=1),None,supplier,invoice_value,owner='Andrei Neagu',tags=tags,metadata={**meta,'service_date':service_date.isoformat(),'reception_result':'with_reservations' if index in (4,16) else 'accepted'},source_ids=('S03','S01'))
    stages.append(accept);accept['summary']=finding
    a1=heading(accept)+[table([('Dosar / contract',case_id+' / '+contract['number']),('Activ / serviciu',asset),('Data verificării',romanian_date(service_date+timedelta(days=1))),('Prestator',supplier),('Responsabil recepție','Andrei Neagu - identitate fictivă')])]+section('Documente examinate','Caietul de sarcini, raportul de prestare și anexele de identificare ale livrabilelor. Verificarea din scenariu privește consistența dosarului, nu certificarea funcționării unui echipament real.')+section('Constatări',finding)+[table([(f'Dovadă {i+1}',v) for i,v in enumerate(criteria)])]
    a2=[p('Decizie și urmărire','title')]+section('Decizia comisiei din scenariu','Recepție cu rezerve; partea neclarificată rămâne deschisă.' if index in (4,16) else 'Recepție documentară acceptată în scenariu, în limitele livrabilelor enumerate. Această mențiune nu este o semnătură reală.')+[table([('Valoare de reconciliat',money(invoice_value)),('Responsabil observații',dept),('Termen intern de răspuns',romanian_date(service_date+timedelta(days=14))),('Dovadă de închidere','Anexă corectată, verificată și legată de aceeași versiune a recepției.')])]+section('Legătura cu factura','Financiarul verifică aceleași perioade și livrabile. Închiderea observațiilor nu modifică factura fără un document justificativ. Plata externă rămâne în afara platformei de demonstrație.')+evidence(accept)
    render(accept,[a1,a2])
    report=base_record(f'Raport de mentenanță / prestare - {name}','Raport de mentenanță',dept,'approved',service_date,None,supplier,invoice_value,owner='Andrei Neagu',tags=tags,metadata={**meta,'service_date':service_date.isoformat(),'work_order':f'OT-{index:03d}-2026'},source_ids=('S01','S08'))
    stages.append(report);report['summary']=f"{finding} Raportul este asociat activului {asset} și dosarului {case_id}."
    r1=heading(report)+[table([('Ordin de lucru',f'OT-{index:03d}-2026'),('Activ',asset),('Contract',contract['number']),('Data prestării',romanian_date(service_date)),('Prestator',supplier)])]+section('Cererea de intervenție',reason)+section('Activitatea consemnată',finding)+section('Consumabile și dovezi','Anexa prestatorului identifică materialele și eventualele piese. Pentru serviciile fără piese, se păstrează raportul de activitate și identificarea livrabilului. Nu se inventează serii sau rezultate de test pentru completarea dosarului.')
    r2=[p('Predare și următoarea acțiune','title')]+[table([('Dovezi predate','\n'.join(criteria)),('Recomandare','Responsabilul local verifică observațiile și planifică următorul termen documentar.'),('Stare documentară','Raport primit; recepția este un pas distinct.'),('Istoric','Înregistrarea rămâne legată de activ chiar dacă furnizorul sau contractul se schimbă.')])]+section('Separarea responsabilităților','Prestatorul descrie lucrarea; responsabilul verifică și recepționează; financiarul reconciliază suma. Acest raport nu autorizează repunerea în serviciu a unui activ aeroportuar și nu înlocuiește procedurile competente.')+evidence(report)
    render(report,[r1,r2])
    ids=[d['id'] for d in stages]
    for d in stages:
        d['related_ids']=[i for i in ids if i!=d['id']]
        d['metadata']['contract_id']=contract['id']
    CASE_RECORDS.append((case,contract,stages))

def build_amendments():
    for n in [1,3,8,13]:
        case,contract,stages=CASE_RECORDS[n-1]
        name,supplier,dept,value,*_=case
        rec=base_record('Act adițional propus - '+name,'Act adițional','Achiziții','in_review',REF-timedelta(days=n%5),None,supplier,value,metadata={'case_id':contract['metadata']['case_id'],'contract_id':contract['id'],'change_type':'clarification','effective_only_after_approval':True},tags=['modificare','neintrat în vigoare'],source_ids=('S03',))
        rec['related_ids']=[d['id'] for d in stages];contract['related_ids'].append(rec['id'])
        rec['summary']='Propunere de clarificare a livrabilelor și a responsabilului de notificare. Valoarea și expirarea contractului rămân neschimbate până la o decizie documentată.'
        pages=[heading(rec)+[table([('Contract de bază',contract['number']),('Furnizor',supplier),('Data propunerii',romanian_date(REF-timedelta(days=n%5))),('Stare','În avizare - nu produce efecte în scenariu')])]+section('Motivul propunerii',f"În dosarul pentru {name.lower()}, responsabilul solicită clarificarea identificării anexelor și a destinatarului notificărilor. Propunerea păstrează obiectul, valoarea {money(value)} și data expirării {romanian_date(contract['expires_at'])}.")+section('Text propus','Fiecare raport va indica numărul contractului, activul și perioada. O anexă corectată primește versiune distinctă; observațiile și documentul inițial rămân vizibile. Schimbările de cont bancar sunt excluse din acest act.')+[table([('Înainte','Anexele se transmit responsabilului contractual.'),('Propus','Anexele se înregistrează în dosarul contractului și se notifică responsabilul desemnat.')])], [p('Avizare și control de efecte','title')]+section('Verificări necesare','Juridicul și achizițiile verifică încadrarea schimbării pe contractul real. Scenariul nu concluzionează că o modificare este permisă legal. Aprobarea internă și semnarea sunt pași distincți.')+[workflow(rec)]+section('Metadate','Nu se actualizează automat valoarea, expirarea sau datele furnizorului. Orice schimbare confirmată trebuie să păstreze sursa, versiunea și persoana care a validat-o.')+evidence(rec)]
        render(rec,pages)

EXTRAS = [
 ('Procedură de control al documentelor','Procedură','Conformitate','approved','internal','Circuitul documentelor controlate', [('Înregistrare','Autorul indică titlul, tipul, responsabilul și departamentul; originalul se păstrează.'),('Revizuire','Metadatele sunt comparate cu sursa. Câmpurile neclare rămân propuse.'),('Aprobare','Decizia se referă la o versiune precisă. Un fișier schimbat cere reavizare.'),('Publicare','Doar versiunea aprobată este prezentată drept curentă; cele anterioare rămân în istoric.')], 'La audit s-a identificat o anexă fără număr de versiune. Măsura demonstrativă este validarea câmpului înainte de trimiterea la avizare.',('S01','S05')),
 ('Procedură de partajare între aeroporturi','Procedură','Conformitate','approved','internal','Partajarea unei copii revizuite', [('Selectare','Se alege un document și o versiune, un aeroport destinatar și o dată de expirare.'),('Redactare','Se elimină efectiv conținutul sensibil dintr-o copie; mascarea metadatelor nu modifică PDF-ul.'),('Revizuire umană','Responsabilul inspectează copia rezultată, inclusiv textul extractibil, înainte de autorizare.'),('Revocare','Accesul viitor în platformă este blocat; o copie deja descărcată nu poate fi retrasă tehnic.')], 'Exemplul permite trimiterea unui șablon către Aeroportul Sibiu. Numele angajaților, valorile și conturile nu trebuie să apară în copia publicabilă.',('S01','S05')),
 ('Procedură de verificare metadate contractuale','Procedură','Achiziții','approved','internal','Metadate cu dovezi de sursă', [('Furnizor','Denumirea se leagă de pagina și versiunea contractului.'),('Valoare','Moneda, baza și perioada se verifică separat; nu se adună contracte în monede diferite.'),('Expirare','Data se confirmă din clauză, fără a confunda termenul de plată cu valabilitatea.'),('Validare','Persoana consemnează confirmarea; potrivirea cu documentul nu dovedește autenticitatea furnizorului.')], 'Contractul SP-02 este exercițiul de referință. Câmpurile IBAN și expirare cer verificare individuală înainte de utilizare.',('S03','S04')),
 ('Procedură de revizuire a datelor bancare','Procedură','Financiar','approved','restricted','Două persoane pentru o schimbare', [('Propunere','Datele noi rămân separate de registrul aprobat.'),('Verificare independentă','Se folosește un contact cunoscut dinainte; e-mailul nou nu confirmă singur schimbarea.'),('Aprobare distinctă','O altă persoană autorizată aprobă utilizarea după examinarea dovezii.'),('Trasabilitate','Versiunea veche, motivul și persoanele implicate rămân în jurnal.')], 'Un mesaj de la un expeditor cunoscut poate conține un cont schimbat. Scenariul deschide o verificare, fără verdict automat de fraudă și fără transfer financiar.',('S03',)),
 ('Procedură de inventariere și transfer în arhivă','Procedură','Conformitate','approved','internal','Arhivă cu inventar și responsabil', [('Clasificare','Fiecare dosar primește o categorie de păstrare validată de organizație.'),('Inventar','Se enumeră documentele și versiunile, perioadele și eventualele lipsuri.'),('Transfer','Predarea și primirea se consemnează într-un proces-verbal.'),('Eliminare','Nicio regulă demonstrativă nu autorizează distrugerea documentelor reale.')], 'Termenele din nomenclator nu sunt inventate de aplicație. Corpusul lasă politica de retenție ca element de configurat și aprobat.',('S05',)),
 ('Procedură pentru evidența mentenanței','Procedură','Tehnic','approved','internal','Un dosar pentru fiecare activ', [('Identificare','Raportul include activul, contractul, prestatorul și data.'),('Dovezi','Piesele, materialele și documentele se leagă de lucrarea concretă.'),('Recepție','Responsabilul consemnează acceptarea sau rezervele.'),('Termen următor','Se preia numai dintr-o sursă tehnică aprobată și se confirmă uman.')], 'Documentul descrie evidența administrativă. Nu furnizează intervale reale de mentenanță, instrucțiuni de reparație sau permisiuni de operare.',('S01','S08')),
 ('Procedură de recuperare a arhivei demonstrative','Procedură','Tehnic','approved','internal','Continuitatea accesului la documente', [('Copie','Setul de test este copiat într-un spațiu separat și identificat prin amprente.'),('Restaurare','Se recuperează într-un mediu de test, fără conectare la infrastructura aeroportuară.'),('Verificare','Numărul de fișiere, amprentele și legăturile se compară cu inventarul.'),('Raport','Excepțiile au responsabil și termen; succesul nu se presupune din existența copiei.')], 'Exercițiul reflectă nevoia relatată de continuitate a intranetului. Nu este un plan de răspuns pentru un aeroport real.',('S01','S05')),
 ('Procedură veche de avizare a contractelor - v0','Procedură','Achiziții','archived','internal','Versiune înlocuită, păstrată în istoric', [('Situație anterioară','Documentele erau trimise succesiv prin e-mail.'),('Limită observată','Absența managerului nu avea delegat și termen vizibile.'),('Înlocuire','Circuitul curent cere delegare limitată în timp și aprobare pe versiune.'),('Acces','Acest document este istoric și nu este prezentat drept procedură curentă.')], 'Exemplul permite verificarea filtrului Arhivate și a separării versiunilor. Data arhivării este o stare de scenariu, nu un act administrativ real.',('S01',)),
 ('Audit intern - completitudinea dosarului SP-02','Audit','Conformitate','in_review','internal','Constatări și măsuri documentare', [('Eșantion','Contractul și cele cinci documente conexe pentru SP-02.'),('Constatare','Metadatele sunt propuse, dar termenul de reînnoire nu este încă validat.'),('Măsură','Responsabilul compară data cu clauza și confirmă sursa.'),('Dovadă cerută','Eveniment de validare și versiunea contractului în jurnal.')], 'Constatarea este una demonstrativă de proces; nu reprezintă o neconformitate AACR și nu evaluează siguranța unui aeroport.',('S01',)),
 ('Audit intern - acces la documentele HR','Audit','Conformitate','approved','restricted','Control de acces pe atribuții', [('Eșantion','Cerere de concediu și înregistrare de delegare fictivă.'),('Test','Un tehnician caută titlul și încearcă accesul direct la fișier.'),('Rezultat așteptat','Dosarul personal nepermis nu apare în căutare, export sau răspuns asistat.'),('Remediere','Orice diferență de comportament trebuie corectată înainte de demonstrație.')], 'Rezultatele reale ale aplicației se consemnează separat de acest scenariu de test. Documentul nu pretinde că verificarea tehnică a fost efectuată.',('S06',)),
 ('Inventar de transfer - dosare contractuale 2025','Audit','Conformitate','approved','internal','Inventar de arhivă demonstrativ', [('Lot','ARH-DEMO-2025, trei dosare istorice fictive.'),('Conținut','Contracte, anexe, recepții și corespondență de închidere.'),('Lipsă declarată','Un aviz de livrare este menționat în opis, dar lipsește din lot.'),('Acțiune','Solicitare de completare; lipsa rămâne vizibilă în inventar.')], 'Predarea nu șterge dosarul din registrul de căutare. Categoria de păstrare și termenul real se aprobă prin politica organizației.',('S05',)),
 ('Raport de control - termene contractuale','Audit','Achiziții','approved','internal','Reînnoiri și termene de notificare', [('Referință','30 octombrie 2026; aceeași dată se utilizează în indicatorii demonstrației.'),('Orizont','Contracte care expiră în următoarele 60 de zile.'),('Responsabil','Fiecare contract are un proprietar și o acțiune următoare.'),('Limită','Expirarea nu explică motivul neprelungirii și nu anulează o prestație anterioară.')], 'Raportul indică metodologia; valorile dinamice se calculează din registrul accesibil utilizatorului, nu sunt inventate de asistent.',('S03',)),
 ('Cerere de concediu - Elena Marin','Resurse umane','Resurse umane','in_review','restricted','Cerere individuală, scenariu HR', [('Angajat','Elena Marin, ID intern EMP-DEMO-014.'),('Interval solicitat','02.11.2026 - 06.11.2026; cinci zile lucrătoare în scenariu.'),('Predare','Sarcinile de registratură se predau persoanei desemnate de manager.'),('Decizie','Cererea este în avizare; nu se presupune aprobare prin depășirea unui termen.')], 'Documentul nu include CNP, adresă, date medicale sau salariu. Soldul real de concediu trebuie confirmat într-un sistem autorizat.',('S06',)),
 ('Decizie de delegare temporară - avizare tehnică','Resurse umane','Resurse umane','approved','restricted','Continuitatea avizării pe perioada absenței', [('Titular','Mihai Dumitrescu, manager fictiv.'),('Delegat','Andrei Neagu, responsabil fictiv.'),('Interval','30.10.2026 - 06.11.2026.'),('Domeniu','Avizare documentară Tehnic; fără drept automat de semnare sau modificare bancară.')], 'Delegatul acționează sub propria identitate. Delegarea expiră la termen și nu poate extinde drepturile asupra documentelor personale.',('S06',)),
 ('Fișă de atribuții - responsabil registratură','Resurse umane','Resurse umane','approved','restricted','Rol și limite de acces', [('Titular fictiv','Elena Marin / EMP-DEMO-014.'),('Responsabilități','Înregistrare, clasificare, verificarea completitudinii și repartizare.'),('Limite','Nu aprobă singură contracte și nu aplică semnătura altor persoane.'),('Înlocuire','Predarea sarcinilor necesită desemnare explicită și interval.')], 'Fișa este un exemplu pentru legarea angajaților de circuit; nu reprezintă un contract de muncă sau o fișă juridică validată.',('S06',)),
 ('Programare concedii - compartiment documente','Resurse umane','Resurse umane','draft','restricted','Propunere de programare și acoperire', [('Perioadă','Noiembrie - decembrie 2026, eșantion demonstrativ.'),('Consultare','Propunerile angajaților fictivi sunt centralizate pentru manager.'),('Acoperire','Minimum un responsabil de registratură disponibil în scenariu.'),('Validare','Programarea nu este finală înainte de verificarea HR și decizia competentă.')], 'Regulile de acoperire sunt o ipoteză de produs. Nu se deduc drepturile salariaților din acest tabel și nu se automatizează refuzuri.',('S06',)),
 ('Fișă de instruire - controlul documentelor','Instruire','Resurse umane','approved','restricted','Participare și verificarea înțelegerii', [('Participant','EMP-DEMO-021, identitate fictivă.'),('Teme','Versiuni, metadate, căutare și aprobarea documentului corect.'),('Exercițiu','Identificarea contractului curent într-un dosar cu anexă revizuită.'),('Rezultat','Exercițiul a fost parcurs în scenariu; nu conferă autorizare profesională.')], 'Reevaluarea demonstrativă este stabilită la 15.11.2026. Termenul este o valoare de test, nu un interval legal sau operațional.',('S01','S06')),
 ('Registru de instruire - personal atelier','Instruire','Resurse umane','approved','restricted','Evidență pe competență și persoană', [('Grup','Opt identificatori fictivi EMP-DEMO-031 până la EMP-DEMO-038.'),('Curs','Documentarea lucrărilor și a consumabilelor.'),('Dovezi','Prezență, material și evaluare individuală.'),('Excepție','EMP-DEMO-038 necesită reluarea unei secțiuni; nu se marchează automat complet.')], 'Registrul nu arată clasamente de personal și nu conține date sensibile de evaluare individuală în afara rolurilor HR permise.',('S01','S06')),
 ('Plan de instruire - reînnoiri noiembrie','Instruire','Resurse umane','in_review','restricted','Calendarul dovezilor de instruire', [('Scop','Reunirea termenelor din fișele validate.'),('Responsabil','Compartimentul Resurse umane, cu avizul șefului de departament.'),('Termen','15.11.2026 pentru primul grup demonstrativ.'),('Notificare','Persoana și managerul primesc o sarcină în aplicație, nu un certificat nou.')], 'Un termen apropiat nu indică automat lipsa competenței. Situația se confirmă din dovada aplicabilă.',('S01','S06')),
 ('Confirmare luare la cunoștință - procedură v1','Instruire','Operațiuni','approved','internal','Versiunea citită este identificată explicit', [('Document','Procedură de control al documentelor, versiunea 1.'),('Cititor','EMP-DEMO-041, identitate fictivă.'),('Data','29.10.2026.'),('Domeniu','Confirmare de primire și citire; nu este semnătură calificată.')], 'Când apare versiunea 2, confirmarea versiunii 1 rămâne istorică și nu se transferă automat.',('S01',)),
 ('Șablon partajabil - proces-verbal de recepție','Procedură','Conformitate','approved','public','Model fără furnizori sau valori', [('Identificare','Număr dosar, document de referință și versiune.'),('Examinare','Lista livrabilelor și documentele consultate.'),('Constatări','Conform, cu rezerve sau respins, cu motiv explicit.'),('Urmărire','Responsabil, termen și dovada închiderii observațiilor.')], 'Model destinat schimbului de practici cu Aeroportul Sibiu. Nu include date de personal, contracte sau conturi bancare; fiecare aeroport îl adaptează și aprobă local.',('S03','S05')),
 ('Acord demonstrativ de partajare cu Aeroportul Sibiu','Procedură','Conformitate','in_review','internal','Acces limitat la o versiune și un scop', [('Destinatar','Aeroportul Sibiu - scenariu demonstrativ.'),('Obiect','Șablonul de proces-verbal, versiunea 1.'),('Durată','Acces propus până la 30.11.2026.'),('Drepturi','Vizualizare; descărcarea se decide separat și nu poate fi revocată retrospectiv.')], 'Originalul rămâne local. Copia redactată necesită revizuire umană, iar acordul nu conferă acces la alte documente sau la registrul de furnizori.',('S01','S05')),
 ('Caz de verificare - cont bancar schimbat','Audit','Financiar','in_review','restricted','Mesaj importat, fără conectare la e-mail', [('Furnizor','Portalis Service Demo SRL.'),('Sursă','Mesaj fictiv importat de la contracte@furnizor01.example.'),('Diferență','Contul propus diferă de contul etichetat DEMO din contract.'),('Decizie inițială','Necesită verificare independentă; exportul financiar nu este autorizat.')], 'Expeditorul cunoscut nu dovedește singur autenticitatea cererii. Nu există o concluzie de fraudă și nu este efectuată nicio plată.',('S03',)),
 ('Caz de verificare - factură duplicată posibilă','Audit','Financiar','in_review','restricted','Aceeași referință, importuri repetate', [('Furnizor','Rulment Verde Demo SRL.'),('Referință','DEMO-F-003.'),('Semnal','Același număr și aceeași sumă au fost întâlnite într-un al doilea import.'),('Acțiune','Financiarul compară documentele și păstrează ambele urme de import înainte de decizie.')], 'Un semnal de dublură nu dovedește o plată dublă. Platforma verifică documentele disponibile și nu afirmă economii financiare realizate.',('S03',)),
]

def build_extras():
    for index, (title,category,dept,status,confidential,subhead,rows,context,refs) in enumerate(EXTRAS):
        created=REF-timedelta(days=1+index%14)
        expiry=REF+timedelta(days=16) if category=='Instruire' else (date(2026,11,6) if 'delegare' in title.lower() else None)
        rec=base_record(title,category,dept,status,created,expiry,owner='Ioana Stancu' if dept=='Resurse umane' else 'Mihai Dumitrescu',confidentiality=confidential,tags=['procedură' if category=='Procedură' else category.lower(),'demonstrație'],metadata={'scope':'documentary-demonstration','retention_policy':'De stabilit prin nomenclatorul aprobat','personal_data':'fictional-only'},source_ids=refs)
        rec['summary']=context
        page1=heading(rec)+section(subhead,context)+[table(rows)]+section('Aplicare în demonstrație','Documentul se înregistrează în departamentul indicat, cu versiune, responsabil și nivel de acces. Sarcinile și deciziile trebuie să poată fi urmărite în jurnal, fără a deduce aprobarea din simpla existență a fișierului.')
        page2=[p('Responsabilități și control','title')]+[workflow(rec)]+section('Dovada deciziei','O persoană autorizată verifică informațiile și anexele relevante. Dacă solicită o corecție, motivul rămâne vizibil. O versiune nouă nu moștenește tacit confirmarea documentului anterior.')+section('Utilizare și limite','Acesta este un document de lucru fictiv pentru testarea circuitului. Nu este emis de un aeroport, de AACR, de EASA sau de o autoritate publică. Nu conține instrucțiuni pentru operarea infrastructurii și nu constituie consultanță juridică ori certificat profesional.')+evidence(rec)
        render(rec,[page1,page2])
    # Connect the control procedure, shareable model and grant case.
    for indexes in [(124,125,144,145),(136,137,138,139),(140,141,142,143)]:
        ids=[DOCS[i]['id'] for i in indexes]
        for i in indexes:DOCS[i]['related_ids']=[x for x in ids if x!=DOCS[i]['id']]
    DOCS[146]['related_ids']=[DOCS[0]['id'],DOCS[3]['id']]
    DOCS[147]['related_ids']=[DOCS[12]['id'],DOCS[15]['id']]

def validate():
    failures=[];counts=Counter();pages=0;word_counts=[]
    ids={d['id'] for d in DOCS}
    for d in DOCS:
        path=PDFS/d['filename'];reader=PdfReader(path)
        text='\n'.join(page.extract_text() or '' for page in reader.pages)
        page_count=len(reader.pages);pages+=page_count
        if page_count<2 or page_count>4:failures.append(f"{d['id']}: {page_count} pages")
        if any(DEMO not in (page.extract_text() or '') for page in reader.pages):failures.append(f"{d['id']}: missing demo footer")
        for expected in [d['number'],d['title'],AIRPORT]:
            if ' '.join(expected.split()) not in ' '.join(text.split()):failures.append(f"{d['id']}: missing text {expected}")
        if any(i not in ids for i in d['related_ids']):failures.append(f"{d['id']}: broken relation")
        if '\ufffd' in text or '\u25a0' in text:failures.append(f"{d['id']}: missing glyph")
        d['page_count']=page_count;d['sha256']=hashlib.sha256(path.read_bytes()).hexdigest();d['text_length']=len(text)
        counts[d['category']]+=1;word_counts.append(len(text.split()))
    if len(DOCS)!=148:failures.append(f'Expected 148 documents, got {len(DOCS)}')
    if failures:raise RuntimeError('\n'.join(failures))
    return {'documents':len(DOCS),'pages':pages,'procurement_cases':len(CASE_RECORDS),'categories':dict(counts),'statuses':dict(Counter(d['status'] for d in DOCS)),'minimum_words':min(word_counts),'maximum_words':max(word_counts),'total_words':sum(word_counts),'checks':{'page_count_2_to_4':True,'demo_label_each_page':True,'required_text_present':True,'all_relations_resolve':True,'no_replacement_glyphs':True},'visual_review':'Representative rendered pages are reviewed separately; see docs/CORPUS_RESEARCH.md for actual review evidence.'}

if __name__=='__main__':
    OUT.mkdir(exist_ok=True);PDFS.mkdir(exist_ok=True)
    font_setup();STYLES=styles();DOCS=[];CASE_RECORDS=[]
    for n,case in enumerate(CASES,1):build_case(n,case)
    build_amendments();build_extras()
    qa=validate()
    manifest={'schema_version':1,'reference_date':REF.isoformat(),'airport':{'id':'airport-craiova','name':AIRPORT,'fictional':False,'scenario':'synthetic'},'demo_label':DEMO,'sources':SOURCES,'documents':DOCS}
    (OUT/'seed-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    (OUT/'corpus-validation.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n')
    (OUT/'sources.json').write_text(json.dumps(SOURCES,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(qa,ensure_ascii=False,indent=2))
