@echo off
chcp 65001 >nul
cd /d "%~dp0"

gh auth status 2>nul
if errorlevel 1 (
    gh auth login -w -p https -h github.com
    if errorlevel 1 exit /b 1
)

for /f "delims=" %%u in ('gh api user -q .login 2^>nul') do set "USER=%%u"
if not defined USER (
    echo GitHub kullanici adi alinamadi.
    pause
    exit /b 1
)

echo GitHub Pages aciliyor...
echo {"source":{"branch":"main","path":"/"}} | gh api repos/%USER%/gider-takip/pages -X POST --input - 2>nul
if errorlevel 1 (
    gh api repos/%USER%/gider-takip/pages -X GET 2>nul | findstr "html_url" >nul && (
        echo Pages zaten acik.
    ) || (
        echo Repo bulunamadi veya yetki yok: %USER%/gider-takip
        echo Once github-a-yukle.bat ile repoyu olustur.
        pause
        exit /b 1
    )
) else (
    echo Pages basariyla acildi.
)

echo.
echo Kalici adres (birkaç dakika icinde aktif):
echo   https://%USER%.github.io/gider-takip/
echo.
echo Her yerden bu linke girerek erisebilirsin.
pause
