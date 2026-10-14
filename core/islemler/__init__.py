# -*- coding: utf-8 -*-
"""Araç modülleri: her modül kaydol(YONTEMLER) ile yöntemlerini ekler."""
from . import notlar
from . import yapisal
from . import yazi_tanima


def kaydol(yontemler):
    notlar.kaydol(yontemler)
    yapisal.kaydol(yontemler)
    yazi_tanima.kaydol(yontemler)
    try:
        from . import araclar
        araclar.kaydol(yontemler)
        # Dosya biçimi dönüştürme (0.2.6): çatı ve TIFF ↔ PDF; UDF ve Word dönüştürücüleri donustur'un kaydına kendileri eklenir
        from . import donustur
        donustur.kaydol(yontemler)
        # UDF ↔ PDF (0.2.6): dönüştürücüleri donustur'un kaydına modül yüklenirken eklenir (UDE köprüsü, PDF → UDF yazıcısı)
        from . import udf  # noqa: F401
        # Word ↔ PDF (0.2.6): Word → PDF Word'ün kendisiyle (ya da LibreOffice), PDF → Word pdf2docx ile; ikisi de donustur'un kaydına
        from . import word  # noqa: F401
        from . import pdf_word  # noqa: F401
    except ImportError:
        pass
