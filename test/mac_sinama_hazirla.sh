#!/bin/bash
# macOS sınamasının hazırlığı (yayim.yml'in mac işleri, 0.3.1): Örnek belgeler, DMG'den Uygulamalar'a kurulum, dosyaya yazan sınama yazıcısı.
# Kullanım: bash test/mac_sinama_hazirla.sh <PDEfe-Mac.dmg>     Örnekler $RUNNER_TEMP/ornekler'e.
# Yazıcı zorunlu değil: CUPS'ın süzgeçsiz kuyruğu dosyaya yazar, PDEfe'nin sessiz yazdırması gerçek Mac yolundan geçer (test/mac_duman.mjs "Gerçek baskı"). Kurulamazsa o bölüm atlanır.
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
sudo sh -c "grep -q '^FileDevice' /etc/cups/cups-files.conf || echo 'FileDevice Yes' >> /etc/cups/cups-files.conf"
sudo launchctl kickstart -k system/org.cups.cupsd
sleep 3
sudo lpadmin -p PDEfe_Sinama -E -v "file://$BASKI/cikti.pdf"
sudo lpadmin -d PDEfe_Sinama
# Karşılaştırma için sürücülü (PPD) kuyruk: Süzgeçsiz kuyrukla farkı "Gerçek baskı"nın bilgi satırlarında
sudo lpadmin -p PDEfe_Surucu -E -v "file://$BASKI/surucu.ps" -m drv:///sample.drv/generic.ppd || sudo lpadmin -p PDEfe_Surucu -E -v "file://$BASKI/surucu.ps" -P /System/Library/Frameworks/ApplicationServices.framework/Versions/A/Frameworks/PrintCore.framework/Versions/A/Resources/Generic.ppd
lpinfo -m 2>/dev/null | head -5
lpstat -p -d
if lpstat -p PDEfe_Sinama >/dev/null 2>&1; then
  echo "PDEFE_BASKI_DOSYASI=$BASKI/cikti.pdf" >> "$GITHUB_ENV"
  echo "Sınama yazıcısı kuruldu: $BASKI/cikti.pdf"
else
  echo "Sınama yazıcısı kurulamadı: Gerçek baskı atlanır."
fi
exit 0
