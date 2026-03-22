@echo off
chcp 65001 >nul
title Gider Takip - paylasim

echo.
echo [1] Sunucu penceresi aciliyor (8765)...
start "Gider Takip - sunucu" cmd /k "cd /d "%~dp0" & echo Yerel: http://127.0.0.1:8765 & echo Kapatmak icin Ctrl+C & python -m http.server 8765"

timeout /t 2 /nobreak >nul

echo [2] TUNEL penceresi aciliyor...
echo     Asagidaki satirda gorunecek https://.... adresini arkadasina gonder.
echo     Bu bilgisayar acik kaldigi surece link calisir.
echo.
start "Gider Takip - HTTPS tunel (URL burada)" cmd /k "ssh -o StrictHostKeyChecking=accept-new -R 80:127.0.0.1:8765 nokey@localhost.run"

echo.
echo Kalici link icin (hesapsiz surukle-birak): https://app.netlify.com/drop
echo Bu klasoru surukleyip birakin; Netlify size kalici https adresi verir.
echo.
echo --- Arkadasin AYNI verileri gorsun ---
echo "Disa aktar" ile JSON indir, bu klasorde "paylasilan-veri.json" adiyla kaydet.
echo.
pause
