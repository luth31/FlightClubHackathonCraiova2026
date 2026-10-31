#!/usr/bin/env python3
"""Reproducible local timings + synthetic scan word recall; never calls AI.
Run with backend/.venv/bin/python scripts/benchmark_extraction.py.
Optional --compare requires pdf-inspector==1.25.2 and kreuzberg==4.10.4.
"""
import argparse, io, json, platform, re, statistics, sys, time, unicodedata
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import fitz
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from app.extraction.engine import extract

ROOT=Path(__file__).resolve().parents[1]
TEXT=['Raport de mentenanță - Aeroportul Dunărea', 'Furnizor: Servicii Aeroportuare SRL',
      'Valabil până la: 2027-05-12', 'Valoare totală: 12500 RON',
      'Responsabil: Elena Popa', 'Echipament: scară pasageri SP-02',
      'Email: contact@aeroport.example', 'Cont IBAN: RO49AAAA1B31007593840000',
      'Inspecție efectuată. Frâne, roți și instalații verificate.',
      'DOCUMENT FICTIV - NUMAI PENTRU TESTAREA OCR']

def fixtures(folder):
    folder.mkdir(parents=True,exist_ok=True)
    font=next((p for p in [Path('/System/Library/Fonts/Supplemental/Arial.ttf'),Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')] if p.exists()),None)
    if not font: raise RuntimeError('Install Arial or DejaVu Sans for Romanian fixture text')
    pdfmetrics.registerFont(TTFont('Fixture',str(font)))
    stream=io.BytesIO(); c=canvas.Canvas(stream,pagesize=(595,842));c.setFont('Fixture',13)
    for i,line in enumerate(TEXT):c.drawString(45,780-i*36,line)
    c.save();native=fitz.open(stream=stream.getvalue(),filetype='pdf');native.save(folder/'native.pdf')
    for name,dpi in [('scan',200),('low-resolution',90)]:
        doc=fitz.open();p=doc.new_page(width=595,height=842)
        p.insert_image(p.rect,stream=native[0].get_pixmap(dpi=dpi).tobytes('png'));doc.save(folder/f'{name}.pdf');doc.close()
    mixed=fitz.open(folder/'scan.pdf');mixed[0].insert_text((45,25),'Digital registration heading');mixed.save(folder/'mixed-page.pdf')
    hybrid=fitz.open();hybrid.insert_pdf(native);hybrid.insert_pdf(mixed);hybrid.save(folder/'hybrid.pdf')
    for name in ('native','scan','low-resolution','mixed-page','hybrid'):
        with fitz.open(folder/f'{name}.pdf') as pdf: pdf[0].get_pixmap(dpi=100).save(folder/f'{name}.png')


def words(text):return re.findall(r'\w+',text.casefold())

def folded(text):
    return ''.join(c for c in unicodedata.normalize('NFD',text) if not unicodedata.combining(c))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--compare',action='store_true');args=parser.parse_args()
    folder=ROOT/'.runtime/ocr-benchmark';fixtures(folder)
    out={'platform':platform.platform(),'processor':platform.processor(),'corpus_documents':148,'fixtures':{},'engines':{}}
    from collections import Counter
    expected=Counter(words('\n'.join(TEXT)))
    for name in ('native','scan','low-resolution','mixed-page','hybrid'):
        result=extract(folder/f'{name}.pdf',ROOT/'data/tessdata')
        actual=Counter(words(result['pages'][-1]['text']))
        out['fixtures'][name]={'elapsed_ms':result['elapsed_ms'],'methods':[p['method'] for p in result['pages']],
                               'exact_word_recall':round(sum((actual & expected).values())/sum(expected.values()),4),
                               'accent_folded_word_recall':round(sum((Counter(words(folded(result['pages'][-1]['text']))) & Counter(words(folded('\n'.join(TEXT))))).values()) / sum(expected.values()),4)}
        (folder/f'{name}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    engines={'integrated':lambda p:extract(p,ROOT/'data/tessdata')}
    if args.compare:
        import pdf_inspector,kreuzberg
        engines.update({'pymupdf':lambda p:'\n'.join(q.get_text(sort=True) for q in fitz.open(p)),
          'pdf-inspector':lambda p:pdf_inspector.process_pdf(str(p)).markdown,
          'kreuzberg':lambda p:kreuzberg.extract_file_sync(str(p),config=kreuzberg.ExtractionConfig(use_cache=False,disable_ocr=True)).content})
    for name,fn in engines.items():
        runs=[]
        for iteration in range(3):
            times=[]
            for path in sorted((ROOT/'data/pdfs').glob('*.pdf')):
                start=time.perf_counter();fn(path);times.append(time.perf_counter()-start)
            runs.append({'total_seconds':round(sum(times),3),'median_document_ms':round(statistics.median(times)*1000,3)})
        out['engines'][name]=runs
    target=folder/'results.json';target.write_text(json.dumps(out,ensure_ascii=False,indent=2));print(target);print(json.dumps(out,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
