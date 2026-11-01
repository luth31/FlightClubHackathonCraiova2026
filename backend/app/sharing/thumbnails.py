import fitz
from app.core.exceptions import DomainError


def pdf_thumbnail(content):
    try:
        with fitz.open(stream=content,filetype='pdf') as pdf:
            if not pdf.page_count:raise ValueError('Empty PDF')
            page=pdf[0]
            scale=360/max(page.rect.width,1)
            return page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False).tobytes('png')
    except (ValueError,RuntimeError):
        raise DomainError('Previzualizarea documentului nu este disponibilă.',422) from None
