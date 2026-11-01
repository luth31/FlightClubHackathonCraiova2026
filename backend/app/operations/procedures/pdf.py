"""Readable, versioned procedure documents using the application's embedded fonts."""
import io
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, KeepTogether


def render(procedure, airport_name, proposal=None):
    fonts = Path(__file__).resolve().parents[2] / 'assets' / 'fonts'
    for name, file in [('SOPRegular', 'DejaVuSans.ttf'), ('SOPBold', 'DejaVuSans-Bold.ttf')]:
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(fonts / file)))
    body = ParagraphStyle('Body', fontName='SOPRegular', fontSize=10, leading=15, spaceAfter=8, textColor=colors.HexColor('#243744'))
    heading = ParagraphStyle('Heading', parent=body, fontName='SOPBold', fontSize=12, leading=17, spaceBefore=14, spaceAfter=8, keepWithNext=True)
    title = ParagraphStyle('Title', parent=heading, fontSize=23, leading=29, spaceAfter=15)
    caption = ParagraphStyle('Caption', parent=body, fontSize=8, leading=12, textColor=colors.HexColor('#566B78'))
    def p(value, style=body): return Paragraph(escape(str(value)), style)
    content = [p('FlyLeaf  /  ' + airport_name, caption), p(procedure['title'], title),
        p(f"{procedure['code']}  ·  Revizie {procedure['revision']}  ·  Procedură operațională", heading),
        p('Responsabil: ' + procedure['owner']),
        p('Starea de avizare și versiunea valabilă se verifică în registrul FlyLeaf. Aplicarea necesită validare locală, avizare, data intrării în vigoare și instruire.', caption)]
    sections = [('1. Scop', [procedure['purpose']]), ('2. Domeniu și declanșare', [procedure['trigger']]),
        ('3. Condiții înainte de începere', procedure['prerequisites'])]
    for name, values in sections:
        content += [p(name, heading), *[p(value) for value in values]]
    content.append(p('4. Pași și responsabilități', heading))
    for index, step in enumerate(procedure['steps'], 1):
        content.append(KeepTogether([p(f"{index:02d}  {step['when']}  /  {step['owner']}", heading), p(step['action']), p('Dovadă înregistrată: ' + step['record'], caption)]))
    for name, values in [('5. Excepții și escaladare', procedure['escalation']), ('6. Înregistrări păstrate', procedure['records']),
                         ('7. Indicatori de verificat', procedure['metrics']), ('8. Validare locală', procedure['local_validation']),
                         ('9. Revizuire și control', [procedure['review']])]:
        content += [p(name, heading), *[p('• ' + value) for value in values]]
    if proposal:
        content += [p('10. Motivul reviziei și planul de verificare', heading), p(proposal['problem']), p(proposal['rationale']),
                    p('Propunere: ' + proposal['proposed_rule']), p('Pilot: ' + proposal['pilot']), p('Criteriu de succes: ' + proposal['success_criteria'])]
        content += [p('Ipoteză: ' + value) for value in proposal['assumptions']]
        content += [p('Risc de verificat: ' + value) for value in proposal['risks']]
        impact = proposal['impact']
        content += [p(f"Dovezi: {len(proposal['evidence'])} evenimente. Întârziere observată pe plecările citate: {impact['observed_delay_minutes']} min. Nu reprezintă minute recuperabile garantate."),
                    p('Referințe în registrul operațional', heading)]
        for item in proposal['evidence']:
            content.append(KeepTogether([p(f"{item['callsign']} · {item['title']} · {item['actual_at']} · +{item['delay_minutes']} min", caption), p(item['event_id'], caption)]))
    content.append(p('Surse de structură și context', heading))
    for source in procedure['source_refs']:
        content.append(KeepTogether([p(source['title']), p(source['url'], caption)]))
    content += [Spacer(1, 8*mm), p('Conținut original de demonstrație. Reperele temporale sunt ale modelului local, nu limite sau instrucțiuni stabilite de sursele citate.', caption)]
    output = io.BytesIO()
    def footer(canvas, doc):
        canvas.setStrokeColor(colors.HexColor('#CBD6DB')); canvas.line(20*mm, 19*mm, 190*mm, 19*mm)
        canvas.setFont('SOPRegular', 8); canvas.setFillColor(colors.HexColor('#566B78'))
        canvas.drawString(20*mm, 13*mm, procedure['code'] + ' · Stare și revizie: registrul FlyLeaf')
        canvas.drawRightString(190*mm, 13*mm, str(doc.page))
    SimpleDocTemplate(output, pagesize=(210*mm, 297*mm), rightMargin=20*mm, leftMargin=20*mm,
        topMargin=19*mm, bottomMargin=25*mm, title=procedure['title'], author='FlyLeaf').build(content, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()
