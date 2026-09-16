# -*- coding: utf-8 -*-
"""Araç modülleri: her modül kaydol(YONTEMLER) ile yöntemlerini ekler."""
from . import notlar
from . import yapisal


def kaydol(yontemler):
    notlar.kaydol(yontemler)
    yapisal.kaydol(yontemler)
    try:
        from . import araclar
        araclar.kaydol(yontemler)
    except ImportError:
        pass
