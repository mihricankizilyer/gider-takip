@echo off
chcp 65001 >nul
title GitHub'a yukle

cd /d "%~dp0"

echo [1] GitHub oturumu kontrol ediliyor...
gh auth status 2>nul
if errorlevel 1 (
    echo.
    echo GitHub'a giris yapmaniz gerekiyor. Tarayici acilacak...
    gh auth login -w -p https -h github.com
    if errorlevel 1 (
        echo Giris iptal edildi veya basarisiz.
        pause
        exit /b 1
    )
)

echo.
echo [2] GitHub reposu olusturuluyor ve kod gonderiliyor...
git branch -M main 2>nul
gh repo create gider-takip --public --source=. --remote=origin --push --description "Harcama takip uygulamasi - her kullanici kendi verisini gorur"

if errorlevel 1 (
    echo.
    echo Repo zaten varsa: gh repo create yerine asagidaki komutlari kullanin:
    echo   git remote add origin https://github.com/KULLANICI_ADINIZ/gider-takip.git
    echo   git branch -M main
    echo   git push -u origin main
    pause
    exit /b 1
)

echo.
echo Tamamlandi.
echo GitHub sayfanizda depo adresini goruntuleyebilirsiniz.
pause
