# -*- coding: utf-8 -*-
"""Değiştirilerek PDEfe'ye alınmış üçüncü taraf kaynakları (lisansları kendi klasörlerinde; THIRD_PARTY.md).

pdf2docx 0.5.13 (MIT, Artifex): PDF → Word (islemler/pdf_word.py). Değişiklikler (her biri kodda "PDEfe:" notuyla):
  - opencv kaldırıldı: kontur ağacı (common/algorithm.py contour_tree; findContours RETR_TREE ile aynı ağaç, kutular ve sıra), gri ton ve
    eşik (image/ImagesExtractor.py; cvtColor'ın tam sayı katsayıları), görüntü döndürme (Pillow), pixmap → dizi (numpy);
  - `import fitz` yerine `import pymupdf as fitz` (fitz kısayolu içe aktarılırken ileti basıyor ve kaldırılacak);
  - converter.py: PyMuPDF sürüm denetimi (SystemExit) ve logging.basicConfig (kök günlükçü) kaldırıldı; PDF filetype="pdf" ile açılır;
  - günlük iletileri kök günlükçü yerine modülün günlükçüsüne; common/docx.py'deki print (stdout: çekirdeğin JSON kanalı) günlükçüye;
  - page/RawPageFitz.py: OCR seçeneğindeki SystemExit yerine ValueError;
  - yorumlardaki bir yazı tipi biçimi adı ve bir başvuru bağlantısı marka adı geçmeyecek biçimde yeniden yazıldı;
  - alınmayanlar: main.py (komut satırı, fire), gui/ (tkinter).
"""
