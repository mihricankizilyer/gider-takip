@echo off
chcp 65001 >nul
start "Gider Takip" /D "%~dp0" cmd /k "python -m http.server 8080"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8080/"
pause
