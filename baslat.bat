@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "IP=%%a"
  set IP=!IP:~1!
  goto :found
)
:found

start "Gider Takip" /D "%~dp0" cmd /k "python -m http.server 8080"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8080/"

echo.
echo [TELEFONDAN ERISIM]
echo Telefon ve bilgisayar AYNI Wi-Fi aginda olmali.
echo Telefon tarayicisinda su adrese git:
if defined IP (echo   http://%IP%:8080/) else (echo   http://BILGISAYAR-IP:8080/)
echo.
pause
