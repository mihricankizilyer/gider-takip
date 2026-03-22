@echo off
chcp 65001 >nul

echo Sunucu ayri bir pencerede aciliyor...
start "Gider Takip - sunucu" /D "%~dp0" cmd /k "echo Adres: http://127.0.0.1:8080  ^| Kapatmak icin Ctrl+C && python -m http.server 8080"

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8080/"

echo Tarayici acildi. Sunucuyu durdurmak icin "Gider Takip - sunucu" penceresinde Ctrl+C basin.
pause
