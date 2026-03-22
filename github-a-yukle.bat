@echo off
chcp 65001 >nul
cd /d "%~dp0"
gh auth status 2>nul
if errorlevel 1 (
    gh auth login -w -p https -h github.com
    if errorlevel 1 exit /b 1
)
git branch -M main 2>nul
gh repo create gider-takip --public --source=. --remote=origin --push --description "Harcama takip"
if errorlevel 1 (
    echo Repo mevcut. git remote add origin URL ile baglayip git push -u origin main calistirin.
    pause
    exit /b 1
)
echo Tamamlandi.
pause
