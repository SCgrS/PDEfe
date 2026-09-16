import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
n = s.count("${ext}")
s = s.replace("${ext}", "\\${ext}")
open(p, "w", encoding="utf-8").write(s)
print("düzeltildi:", n)
