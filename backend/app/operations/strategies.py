"""Reviewable SOP proposals using explicit deterministic counterfactual assumptions."""
import hashlib
import io
import json
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from sqlalchemy import select, text

from app.config import settings
from app.core.audit import now, record
from app.core.exceptions import DomainError
from app.core.security import has_role, can_read
from app.documents.models import Document
from app.documents.service import store_version, serialize
from app.operations import ledger

RULES = [
    {'id':'gate-reserve','title':'Agent de rezervă confirmat înainte de deschiderea porții',
     'sop_code':'SOP-GATE-01','cause':'late_staff',
     'problem':'Absența agentului alocat este observată abia la ora deschiderii; înlocuitorul ajunge prea târziu.',
     'current_rule':'Scenariu de referință: prezența se verifică la deschiderea porții; rezerva se caută după constatarea absenței.',
     'proposed_rule':'Cu 10 minute înainte de deschiderea porții, coordonatorul verifică pontajul și confirmă agentul alocat sau rezerva. O lipsă de confirmare escaladează imediat.',
     'changes':['T−10 min: verificare pontaj și confirmare de post pentru fiecare poartă.',
                'T−8 min: desemnare explicită a unui înlocuitor disponibil și calificat.',
                'T−5 min: confirmare de preluare; escaladare la coordonator dacă lipsește.',
                'Deschiderea porții și identitatea operatorului rămân în jurnal; săptămânal se revizuiesc abaterile.'],
     'assumptions':['Rezerva este disponibilă, calificată și poate ajunge la poartă înainte de ora planificată.',
                    'Întârzierea etichetată „personal” este integral atribuibilă deschiderii porții în setul demonstrativ.',
                    'Alte constrângeri (ATC, meteo, securitate, încărcare) rămân neschimbate; impactul nu este o garanție.']},
    {'id':'equipment-readiness','title':'Verificarea echipamentelor înainte de îmbarcare',
     'sop_code':'SOP-RAMP-02','cause':'equipment',
     'problem':'Echipamentul indisponibil este identificat prea aproape de începutul îmbarcării.',
     'current_rule':'Scenariu de referință: verificarea se face cu 5 minute înainte de deschiderea porții.',
     'proposed_rule':'Verificarea funcțională și confirmarea echipamentului de rezervă se fac cu 20 de minute înainte de deschiderea porții.',
     'changes':['T−20 min: listă scurtă de verificări funcționale, cu operator și moment înregistrate.',
                'T−15 min: înlocuire sau remediere; notificare către coordonatorul rotației.',
                'T−5 min: disponibilitate reconfirmată și abatere escaladată dacă nu s-a rezolvat.'],
     'assumptions':['O verificare mai devreme identifică aceeași defecțiune.',
                    'Echipamentul de rezervă și tehnicianul sunt disponibili înainte de îmbarcare.',
                    'Economia este un contrafactual pe istoricul demonstrativ; se validează printr-un pilot local.']},
]


def allowed(user):
    return has_role(user,'director') or (has_role(user,'reviewer') and user.department=='Conformitate')


def document_id(airport,run_id,strategy_id,evidence,baseline):
    fingerprint=json.dumps({'evidence':evidence,'baseline':baseline},sort_keys=True,ensure_ascii=False)
    return 'doc-sop-'+hashlib.sha256(f'{airport}:{run_id}:{strategy_id}:{fingerprint}'.encode()).hexdigest()[:20]


def proposals(db,user):
    data=ledger.get_ledger(db,user)
    groups=[group for day in data['days'] for group in day['flights'] if group['category']=='flight' and group.get('direction','departure')=='departure']
    completed=[group for group in groups if group['actual_at']]
    items=[]
    for rule in RULES:
        evidence=[group for group in completed if group['cause']==rule['cause'] and (group['delay_minutes'] or 0)>0]
        saved=sum(group['delay_minutes'] for group in evidence)
        ontime=sum((group['delay_minutes'] or 0)==0 for group in completed)
        evidence_rows=[{'group_id':g['id'],'callsign':g['callsign'],'date':g['scheduled_at'][:10],'delay_minutes':g['delay_minutes']} for g in evidence]
        baseline={'delay_minutes':data['metrics']['delay_minutes'],'on_time_percent':data['metrics']['on_time_percent']}
        doc=db.get(Document,document_id(user.airport_id,data['current_run_id'],rule['id'],evidence_rows,baseline))
        items.append({**{key:value for key,value in rule.items() if key!='cause'},'evidence_count':len(evidence),
            'evidence':evidence_rows,'baseline':baseline,
            'estimate':{'delay_minutes':max(0,data['metrics']['delay_minutes']-saved),
                        'on_time_percent':round(100*(ontime+len(evidence))/len(completed),1) if completed else None,'minutes_saved':saved},
            'document_id':doc.id if doc and can_read(user,doc) else None})
    return {'items':items,'can_draft':allowed(user),'current_run_id':data['current_run_id'],
            'notice':'Propuneri pe reguli explicite și dovezi din jurnalul demonstrativ. Impactul este estimat, nu măsurat. Aprobarea SOP și partajarea se fac prin fluxul documentar existent.'}


def render_pdf(proposal,airport_name):
    fonts=Path(__file__).resolve().parents[1]/'assets'/'fonts'
    for name,file in [('FlyLeafSOP','DejaVuSans.ttf'),('FlyLeafSOPBold','DejaVuSans-Bold.ttf')]:
        if name not in pdfmetrics.getRegisteredFontNames(): pdfmetrics.registerFont(TTFont(name,str(fonts/file)))
    styles=getSampleStyleSheet()
    styles.add(ParagraphStyle(name='SOPTitle',fontName='FlyLeafSOPBold',fontSize=20,leading=26,textColor=colors.HexColor('#173C36'),spaceAfter=16))
    styles.add(ParagraphStyle(name='SOPBody',fontName='FlyLeafSOP',fontSize=10,leading=15,spaceAfter=9))
    styles.add(ParagraphStyle(name='SOPHead',fontName='FlyLeafSOPBold',fontSize=12,leading=16,spaceBefore=12,spaceAfter=7))
    P=lambda value,style='SOPBody':Paragraph(escape(str(value)),styles[style])
    content=[P('FlyLeaf · '+airport_name),P('PROPUNERE SOP · NECESITĂ AVIZARE'),P(proposal['title'],'SOPTitle'),P(proposal['sop_code']+' · revizie propusă · '+settings.reference_date.isoformat()),P('Problemă observată','SOPHead'),P(proposal['problem']),P('Regula de referință','SOPHead'),P(proposal['current_rule']),P('Regula propusă','SOPHead'),P(proposal['proposed_rule'])]
    content += [P(f'{i+1}. {change}') for i,change in enumerate(proposal['changes'])]
    content += [P('Dovezi și impact contrafactual','SOPHead'),P(f"{proposal['evidence_count']} rotații afectate. Întârziere cumulată: {proposal['baseline']['delay_minutes']} min; estimare după intervenție: {proposal['estimate']['delay_minutes']} min; economie ipotetică: {proposal['estimate']['minutes_saved']} min.")]
    if proposal['evidence']:
        rows=[[P('Zbor'),P('Data'),P('Întârziere')]]+[[P(e['callsign']),P(e['date']),P(str(e['delay_minutes'])+' min')] for e in proposal['evidence']]
        table=Table(rows,colWidths=[55*mm,55*mm,45*mm],repeatRows=1)
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#EAF1ED')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),0.5,colors.HexColor('#AEC8BF'))]))
        content.append(table)
    content += [P('Ipoteze și validare','SOPHead'),*[P('• '+a) for a in proposal['assumptions']],P('Propunerea nu modifică procedurile în vigoare. Responsabilul local verifică resursele și siguranța, obține avizarea independentă și stabilește un pilot. Se măsoară punctualitatea off-block, minutele de întârziere și abaterile de poartă înainte și după pilot.'),P('Scenariu demonstrativ; nu este o instrucțiune operațională aprobată.')]
    output=io.BytesIO()
    def footer(canvas,doc):
        canvas.setFont('FlyLeafSOP',8);canvas.setFillColor(colors.HexColor('#61716D'));canvas.drawString(22*mm,13*mm,'FlyLeaf · propunere pentru revizuire umană');canvas.drawRightString(188*mm,13*mm,str(doc.page))
    SimpleDocTemplate(output,rightMargin=22*mm,leftMargin=22*mm,topMargin=20*mm,bottomMargin=23*mm,title=proposal['title'],author='FlyLeaf').build(content,onFirstPage=footer,onLaterPages=footer)
    return output.getvalue()


def draft(db,user,strategy_id):
    if not allowed(user): raise DomainError('Propunerea de procedură poate fi creată de director sau de conformitate.',403)
    values=proposals(db,user)
    proposal=next((item for item in values['items'] if item['id']==strategy_id),None)
    if proposal is None: raise DomainError('Strategia nu există.',404)
    if not proposal['evidence_count']: raise DomainError('Nu există încă dovezi pentru această propunere.',409)
    identifier=document_id(user.airport_id,values['current_run_id'],strategy_id,proposal['evidence'],proposal['baseline'])
    content=render_pdf(proposal,settings.airport_name)
    # Serialize creation so repeated taps cannot create duplicate drafts/versions.
    db.commit()
    db.execute(text('BEGIN IMMEDIATE'))
    existing=db.get(Document,identifier)
    if existing:
        if not can_read(user,existing): raise DomainError('Propunerea există deja; solicită acces prin fluxul documentar.',403)
        db.commit()
        return {'document_id':existing.id,'file_url':f'/api/documents/{existing.id}/file','title':existing.title,'status':existing.status}
    title='Propunere '+proposal['sop_code']+' · '+proposal['title']
    metadata={'operations_strategy_id':strategy_id,'operations_run_id':values['current_run_id'],'evidence':proposal['evidence'],
              'baseline':proposal['baseline'],'estimate':proposal['estimate'],'assumptions':proposal['assumptions'],'proposal_only':True}
    document=Document(id=identifier,title=title,number=f"SOP-{settings.reference_date.year}-{identifier[-6:].upper()}",category='Procedură',department='Conformitate',status='draft',
        created_at=now(),updated_at=now(),owner=user.name,owner_id=user.id,created_by=user.id,confidentiality='internal',summary=proposal['problem'],
        searchable_text='\n'.join([title,proposal['problem'],proposal['proposed_rule'],*proposal['changes']]),version=1,validated=False,airport_id=user.airport_id,
        extra={'filename':proposal['sop_code']+'-propunere.pdf','metadata':metadata,'tags':['SOP','Propunere','Operațiuni'],'related_ids':[],
               'source_refs':[{'title':'EUROCONTROL A-CDM specification','url':'https://www.eurocontrol.int/publication/eurocontrol-specification-airport-collaborative-decision-making-cdm'}]})
    db.add(document);db.flush()
    store_version(db,document,content,document.extra['filename'],user,'Propunere bazată pe jurnal; necesită avizare.',snapshot=serialize(document))
    from app.tasks.service import on_new_version
    on_new_version(db,document,user)
    record(db,user,'Propunere SOP generată',document,f"{proposal['evidence_count']} rotații; impact estimat {proposal['estimate']['minutes_saved']} min; neaprobată.")
    db.commit()
    return {'document_id':document.id,'file_url':f'/api/documents/{document.id}/file','title':document.title,'status':document.status}
