@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo [GECICI UZAK ERISIM - ngrok]
echo.
echo Bilgisayarda baslat.bat calistirilmis olmali (sunucu acik olmali).
echo.
where ngrok >nul 2>&1
if errorlevel 1 (
    echo ngrok yuklu degil.
    echo Indir: https://ngrok.com/download
    echo Yukleyip PATH'e ekledikten sonra bu dosyayi tekrar calistir.
    pause
    exit /b 1
)

echo ngrok tuneli baslatiliyor...
echo (Once baslat.bat ile sunucuyu ac. Bilgisayar kapali olunca erisim kesilir.)
echo.
ngrok http 8080
pause
