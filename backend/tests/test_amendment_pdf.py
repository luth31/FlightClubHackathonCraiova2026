from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

import fitz
from pypdf import PdfReader
import pytest
import reportlab

from app.contracts import pdf
from app.core.exceptions import DomainError


def proposal(**changes):
    values = {
        'title': 'Clarificări privind scările mobile și recepția',
        'source_version': 3,
        'revision': 2,
        'reason': 'Raportarea lunară trebuie să identifice intervenția și perioada.',
        'clause_reference': 'Articolul 4.2 — Raportarea intervențiilor',
        'current_wording': 'Raportul se transmite lunar.',
        'proposed_wording': 'Raportul va identifica utilajul și perioada intervenției.',
        'proposed_effective_date': '2026-11-19',
    }
    values.update(changes)
    return SimpleNamespace(**values)


def contract():
    return SimpleNamespace(
        number='AD-2026-0001', supplier='Exemplu Tehnic SRL',
        extra={'supplier_iban': 'SecretAccount123'},
    )


def render(draft):
    return pdf.render_amendment_pdf(
        contract(), draft, 'Aeroportul Dunărea', 'PROIECT-2026-0001',
    )


def extracted(content):
    return '\n'.join(page.extract_text() for page in PdfReader(BytesIO(content)).pages)


def test_template_embeds_romanian_text_and_identifies_its_source():
    draft = proposal(proposed_wording='ĂÂÎȘȚ ăâîșț — verificări și recepții.')
    content = render(draft)
    text = extracted(content)
    assert 'PROIECT DE ACT ADIȚIONAL' in text
    assert 'ĂÂÎȘȚ ăâîșț' in text
    assert 'Aeroportul Dunărea' in text
    assert 'AD-2026-0001 · versiunea 3' in text
    assert 'PROIECT-2026-0001' in text
    assert 'Exemplu Tehnic SRL' in text
    assert '19.11.2026' in text
    assert 'Document generat ca proiect pentru avizare.' in text
    assert 'nu modifică' in text
    assert 'Pagina 1' in text
    assert 'Contract sursă · v3 | Propunere · r2' in text
    assert 'SecretAccount123' not in text
    assert content == render(draft)
    fonts = PdfReader(BytesIO(content)).pages[0]['/Resources']['/Font']
    assert any(font.get_object().get('/ToUnicode') for font in fonts.values())


def test_plain_text_markup_and_line_breaks_remain_visible():
    text = '<b>Text & observații</b>\r\nA doua linie\rA treia linie'
    content = render(proposal(
        reason=text,
        proposed_wording='<link href="https://example.test">Fără legătură activă</link>',
    ))
    visible = extracted(content)
    assert '<b>Text & observații</b>\nA doua linie\nA treia linie' in visible
    assert '<link href="https://example.test">' in visible
    reader = PdfReader(BytesIO(content))
    assert all(not page.get('/Annots') for page in reader.pages)
    assert '/OpenAction' not in reader.trailer['/Root']


def test_maximum_length_clauses_paginate_and_wrap_unbroken_tokens():
    token = 'https://example.test/' + 'ABCDEFGHIJ' * 998
    token = token[:10000]
    content = render(proposal(
        reason=('Motiv și explicație.\n' * 250)[:5000],
        current_wording=('Clauză actuală.\n' * 667)[:10000],
        proposed_wording=token,
    ))
    reader = PdfReader(BytesIO(content))
    assert len(reader.pages) > 3
    body_parts = []
    for index, page in enumerate(reader.pages, 1):
        page_text = page.extract_text()
        assert f'Pagina {index}' in page_text
        assert 'Contract sursă · v3 | Propunere · r2' in page_text
        for frame_text in (
            'AeroDesk / Proiect de act adițional',
            'Contract sursă · v3 | Propunere · r2',
            f'Pagina {index}',
        ):
            page_text = page_text.replace(frame_text, '')
        body_parts.append(''.join(page_text.split()))
    assert token in ''.join(body_parts)
    with fitz.open(stream=content, filetype='pdf') as document:
        for page in document:
            for x0, y0, x1, y1, *_ in page.get_text('words'):
                assert x0 >= 55
                assert x1 <= page.rect.width - 55
                assert y0 >= 20
                assert y1 <= page.rect.height - 20


def test_optional_current_wording_and_date_are_not_invented():
    visible = extracted(render(proposal(current_wording='', proposed_effective_date=None)))
    assert 'Textul actual, transcris de inițiator' not in visible
    assert 'Nestabilită în acest proiect' in visible


@pytest.mark.parametrize('unsupported_font', [False, True])
def test_font_missing_or_without_romanian_glyphs_fails_clearly(monkeypatch, unsupported_font):
    path = Path(reportlab.__file__).parent / 'fonts' / 'Vera.ttf'
    if not unsupported_font:
        path = Path('missing-amendment-font.ttf')
    pdf._register_fonts.cache_clear()
    monkeypatch.setattr(pdf, '_font_candidates', lambda: [(path, path)])
    try:
        with pytest.raises(DomainError) as failure:
            render(proposal())
        assert failure.value.status == 503
        assert 'diacritice românești' in failure.value.message
    finally:
        pdf._register_fonts.cache_clear()
