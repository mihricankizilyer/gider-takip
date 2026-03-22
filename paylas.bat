@echo off
chcp 65001 >nul
title Gider Takip
start "Sunucu" cmd /k "cd /d "%~dp0" & python -m http.server 8765"
timeout /t 2 /nobreak >nul
start "Tunel" cmd /k "ssh -o StrictHostKeyChecking=accept-new -R 80:127.0.0.1:8765 nokey@localhost.run"
pause
