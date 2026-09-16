# main.js'teki bozuk satır sonu regex'ini düzeltir (heredoc kaçış sorunu)
p = "src/main/main.js"
s = open(p, encoding="utf-8", newline="").read()
bozuk_bas = "p.on('exit', () => coz(out.split(/"
i = s.index(bozuk_bas)
j = s.index("/).map((x) => x.trim())", i)
s = s[:i] + "p.on('exit', () => coz(out.split(/\\r?\\n" + s[j:]
open(p, "w", encoding="utf-8", newline="").write(s)
print("düzeltildi")
