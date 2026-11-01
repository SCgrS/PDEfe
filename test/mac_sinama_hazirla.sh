#!/bin/bash
# macOS sınamasının hazırlığı (yayim.yml'in mac işleri, 0.3.1): Örnek belgeler, DMG'den Uygulamalar'a kurulum, dosyaya yazan sınama yazıcısı.
# Kullanım: bash test/mac_sinama_hazirla.sh <PDEfe-Mac.dmg>     Örnekler $RUNNER_TEMP/ornekler'e.
# Yazıcı zorunlu değil: Genel PostScript sürücülü CUPS kuyruğu dosyaya yazar, PDEfe'nin sessiz yazdırması gerçek Mac yolundan geçer (test/mac_duman.mjs "Gerçek baskı"). Kurulamazsa o bölüm atlanır.
# Süzgeçsiz kuyruk olmaz: Electron'un deviceName doğrulaması onu reddeder (ölçüldü).
set -e
DMG="$1"
python -m pip install "pymupdf==1.28.2" "pillow==12.3.0"
mkdir -p "$RUNNER_TEMP/ornekler"
python -c "import sys; sys.path.insert(0, 'test'); import ornek_pdf_uret as o, tanima_pdf_uret as t; o.uret(sys.argv[1] + '/not.pdf', 2, 'Deneme belgesi', True); t.uret(sys.argv[1])" "$RUNNER_TEMP/ornekler"
python test/duman_ornekleri_uret.py "$RUNNER_TEMP/ornekler"
hdiutil attach -nobrowse -mountpoint /Volumes/PDEfe "$DMG"
ls -la /Volumes/PDEfe
ditto /Volumes/PDEfe/PDEfe.app /Applications/PDEfe.app
hdiutil detach /Volumes/PDEfe
du -sh /Applications/PDEfe.app

set +e
BASKI=/private/tmp/pdefe-baski
mkdir -p "$BASKI" && chmod 777 "$BASKI"
sudo sh -c "sed -i '' '/^FileDevice/d' /etc/cups/cups-files.conf; echo 'FileDevice Yes' >> /etc/cups/cups-files.conf"
sudo launchctl kickstart -k system/org.cups.cupsd
sleep 5
sudo lpadmin -p PDEfe_Sinama -E -v "file://$BASKI/cikti.ps" -m drv:///sample.drv/generic.ppd
sudo lpadmin -d PDEfe_Sinama
lpstat -p -d
if lpstat -p PDEfe_Sinama >/dev/null 2>&1; then
  echo "PDEFE_BASKI_DOSYASI=$BASKI/cikti.ps" >> "$GITHUB_ENV"
  echo "Sınama yazıcısı kuruldu: $BASKI/cikti.ps"
else
  echo "Sınama yazıcısı kurulamadı: Gerçek baskı atlanır."
fi
exit 0
