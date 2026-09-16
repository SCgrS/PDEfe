# Heredoc'tan kaynaklanan gerçek satır sonu hatalarını düzeltir: split('<NL>') → split('\n'), join('<NL>') → join('\n')
import re, sys
for p in ["src/renderer/uygulama.js", "test/surucu.mjs"]:
    s = open(p, encoding="utf-8").read()
    yeni = re.sub(r"\('\n'\)", r"('\\n')", s)
    if yeni != s:
        open(p, "w", encoding="utf-8").write(yeni)
        print("düzeltildi:", p, s.count("('\n')"), "yer")
    else:
        print("değişiklik yok:", p)
