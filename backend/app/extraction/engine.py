"""CPU-only parser. Invoked in a disposable process; never contacts a network."""
import hashlib
import json
import math
import sys
import time
from pathlib import Path

import fitz
import pdf_inspector

PIPELINE = 'pdf-inspector-1.25.2_mupdf-1.26.7_tess-fast-8741641_ron-eng_v1'
MAX_WORDS = 500_000
MAX_CHARACTERS = 5_000_000


def extract(path, tessdata):
    start = time.monotonic()
    # Unlike quick classification, this inspects EVERY page, including mixed PDFs.
    routed = pdf_inspector.extract_pages_markdown(str(path))
    routes = {p.page: p for p in routed.pages}
    pages = []
    total_words = total_characters = 0
    with fitz.open(path) as pdf:
        for page in pdf:
            page_start = time.monotonic()
            page.set_rotation(0)  # Same coordinate frame as the redaction preview.
            rect = page.rect
            if min(rect.width, rect.height) <= 0 or not math.isfinite(rect.get_area()):
                raise ValueError('invalid-page-size')
            native = page.get_text('text', sort=True)
            route = routes.get(page.number)
            images = page.get_image_info()
            large_image = any((fitz.Rect(i['bbox']) & rect).get_area() > rect.get_area() * .20 for i in images)
            broken_text = '\ufffd' in native or any(ord(c) < 32 and c not in '\t\r\n' for c in native)
            # A digital header must not conceal a scanned body. Blank/vector pages
            # also get one OCR attempt; an empty result stays explicitly empty.
            use_ocr = bool(not native.strip() or broken_text or large_image or (route and route.needs_ocr))
            reasons = []
            if route and route.needs_ocr: reasons.append(str(route.ocr_reason or 'classifier'))
            if large_image: reasons.append('large-image-region')
            if broken_text: reasons.append('unreliable-text-encoding')
            if use_ocr:
                if not all((Path(tessdata) / f'{lang}.traineddata').is_file() for lang in ('ron', 'eng')):
                    raise ValueError('missing-ocr-models')
                # Cap hostile/oversized pages at 12 megapixels, including OCR's
                # render. No hosted fallback, model download or AI call.
                dpi = min(200, max(1, int(72 * (12_000_000 / rect.get_area()) ** .5)))
                if math.ceil(rect.width*dpi/72) * math.ceil(rect.height*dpi/72) > 12_100_000:
                    raise ValueError('page-render-size-limit')
                tp = page.get_textpage_ocr(language='ron+eng', dpi=dpi, full=True, tessdata=str(tessdata))
                text = page.get_text('text', textpage=tp, sort=True)
                raw_words = page.get_text('words', textpage=tp, sort=True)
            else:
                dpi = None
                text = native
                raw_words = page.get_text('words', sort=True)
            total_words += len(raw_words)
            total_characters += len(text)
            if total_words > MAX_WORDS or total_characters > MAX_CHARACTERS:
                raise ValueError('extraction-size-limit')
            words = [{'id': f'p{page.number+1}-w{i}', 'text': w[4], 'rect': list(w[:4])} for i, w in enumerate(raw_words)]
            pages.append({'number': page.number+1, 'width': rect.width, 'height': rect.height,
                          'text': text, 'words': words, 'method': 'ocr' if use_ocr else 'native',
                          'routing_reasons': reasons, 'dpi': dpi,
                          # The MuPDF text API does not expose calibrated OCR confidence.
                          'confidence': None, 'review_required': use_ocr,
                          'warnings': ['no-readable-text'] if not text.strip() else [],
                          'elapsed_ms': round((time.monotonic()-page_start)*1000, 2)})
    return {'pipeline': PIPELINE, 'languages': ['ron', 'eng'], 'pages': pages,
            'text': '\n\n'.join(p['text'] for p in pages),
            'ocr_pages': sum(p['method'] == 'ocr' for p in pages),
            'elapsed_ms': round((time.monotonic()-start)*1000, 2)}


def main():
    path, expected_hash, tessdata, output = sys.argv[1:]
    def digest(): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    if digest() != expected_hash: raise ValueError('source-integrity')
    result = extract(path, tessdata)
    if digest() != expected_hash: raise ValueError('source-integrity')
    Path(output).write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    main()
