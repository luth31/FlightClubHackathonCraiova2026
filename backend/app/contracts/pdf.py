from datetime import date
from functools import lru_cache
from io import BytesIO
import os
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont, TTFError
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from app.core.exceptions import DomainError


FONT_NORMAL = 'AeroDeskAmendment'
FONT_BOLD = 'AeroDeskAmendmentBold'
INK = colors.HexColor('#20342F')
GREEN = colors.HexColor('#2D6B58')
MUTED = colors.HexColor('#65756F')
LINE = colors.HexColor('#D9E1DA')


def _font_candidates():
    windows_fonts = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'
    return [
        (windows_fonts / 'arial.ttf', windows_fonts / 'arialbd.ttf'),
        (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
         Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')),
        (Path('/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf'),
         Path('/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf')),
        (Path('/usr/share/fonts/TTF/DejaVuSans.ttf'),
         Path('/usr/share/fonts/TTF/DejaVuSans-Bold.ttf')),
        (Path('/System/Library/Fonts/Supplemental/Arial.ttf'),
         Path('/System/Library/Fonts/Supplemental/Arial Bold.ttf')),
    ]


@lru_cache(maxsize=1)
def _register_fonts():
    # Embed fonts with Romanian glyphs instead of silently losing diacritics.
    required = 'ăâîșțĂÂÎȘȚ'
    for regular_path, bold_path in _font_candidates():
        if not regular_path.is_file() or not bold_path.is_file():
            continue
        try:
            regular = TTFont(FONT_NORMAL, str(regular_path))
            bold = TTFont(FONT_BOLD, str(bold_path))
        except (OSError, TTFError):
            continue
        if not all(font.face.charToGlyph.get(ord(char), 0)
                   for font in (regular, bold) for char in required):
            continue
        pdfmetrics.registerFont(regular)
        pdfmetrics.registerFont(bold)
        return
    raise DomainError(
        'Generarea PDF necesită Arial sau DejaVu Sans cu diacritice românești. '
        'Instalați unul dintre aceste fonturi pe server.',
        status=503,
    )


def _paragraph(value, style):
    # Form values are plain text, including strings that resemble PDF markup.
    text = str(value).replace('\r\n', '\n').replace('\r', '\n')
    return Paragraph(escape(text).replace('\n', '<br/>'), style)


def render_amendment_pdf(contract, draft, airport_name, document_number) -> bytes:
    _register_fonts()
    styles = {
        'kicker': ParagraphStyle(
            'AmendmentKicker', fontName=FONT_BOLD, fontSize=10, leading=14,
            textColor=GREEN, spaceAfter=10, splitLongWords=1,
        ),
        'title': ParagraphStyle(
            'AmendmentTitle', fontName=FONT_BOLD, fontSize=21, leading=27,
            textColor=INK, spaceAfter=14, splitLongWords=1,
        ),
        'label': ParagraphStyle(
            'AmendmentLabel', fontName=FONT_BOLD, fontSize=9, leading=13,
            textColor=MUTED, spaceBefore=7, spaceAfter=3, keepWithNext=True,
        ),
        'heading': ParagraphStyle(
            'AmendmentHeading', fontName=FONT_BOLD, fontSize=12, leading=17,
            textColor=GREEN, spaceBefore=15, spaceAfter=7, keepWithNext=True,
        ),
        'body': ParagraphStyle(
            'AmendmentBody', fontName=FONT_NORMAL, fontSize=10, leading=15,
            textColor=INK, spaceAfter=8, splitLongWords=1,
            allowWidows=0, allowOrphans=0,
        ),
        'small': ParagraphStyle(
            'AmendmentSmall', fontName=FONT_NORMAL, fontSize=9, leading=13,
            textColor=MUTED, spaceAfter=8, splitLongWords=1,
        ),
    }
    story = [
        _paragraph('PROIECT DE ACT ADIȚIONAL', styles['kicker']),
        _paragraph(draft.title, styles['title']),
        _paragraph(
            'Document generat ca proiect pentru avizare. Generarea acestui PDF nu modifică '
            'documentul de bază și nu reprezintă aprobare, semnare sau intrare '
            'în vigoare a propunerii.',
            styles['small'],
        ),
        Spacer(1, 5),
    ]
    source = f'{contract.number} · versiunea {draft.source_version}'
    effective_date = draft.proposed_effective_date
    if effective_date:
        effective_date = date.fromisoformat(str(effective_date)).strftime('%d.%m.%Y')
    else:
        effective_date = 'Nestabilită în acest proiect'

    for label, value in (
        ('Numărul proiectului', document_number),
        ('Contractul de bază', source),
        ('Aeroport', airport_name),
        ('Furnizor', contract.supplier or 'Nespecificat în contractul de bază'),
        ('Revizia propunerii', str(draft.revision)),
        ('Data propusă pentru intrarea în vigoare', effective_date),
    ):
        story.extend([
            _paragraph(label, styles['label']),
            _paragraph(value, styles['body']),
        ])

    sections = [
        ('Motivul propunerii', draft.reason),
        ('Clauza vizată', draft.clause_reference),
    ]
    if draft.current_wording:
        sections.append(('Textul actual, transcris de inițiator', draft.current_wording))
    sections.append(('Textul propus', draft.proposed_wording))
    # Keep long clauses in splittable paragraphs, so valid drafts can span pages.
    for heading, text in sections:
        story.extend([
            _paragraph(heading, styles['heading']),
            _paragraph(text, styles['body']),
        ])

    def page_frame(canvas, document):
        canvas.saveState()
        width, height = A4
        canvas.setFillColor(GREEN)
        canvas.rect(0, height - 8, width, 8, fill=1, stroke=0)
        canvas.setFillColor(MUTED)
        canvas.setFont(FONT_NORMAL, 8)
        canvas.drawString(56, height - 35, 'AeroDesk / Proiect de act adițional')
        canvas.setStrokeColor(LINE)
        canvas.line(56, 48, width - 56, 48)
        canvas.drawString(
            56, 33,
            f'Contract sursă · v{draft.source_version} | Propunere · r{draft.revision}',
        )
        canvas.drawRightString(width - 56, 33, f'Pagina {document.page}')
        canvas.restoreState()

    output = BytesIO()
    document = SimpleDocTemplate(
        output, pagesize=A4, leftMargin=56, rightMargin=56,
        topMargin=60, bottomMargin=65,
        title=draft.title, author='AeroDesk',
        subject=f'Proiect de act adițional pentru {source}',
        invariant=1,
    )
    document.build(story, onFirstPage=page_frame, onLaterPages=page_frame)
    return output.getvalue()
