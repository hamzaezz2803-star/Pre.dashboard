@echo off
title OCP Pointage - Demarrage du serveur

cd /d "%~dp0"

echo ================================================================
echo           OCP POINTAGE - SUIVI DES PRESENCES
echo ================================================================
echo.

echo [*] Verification et nettoyage du port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [*] Detection de votre adresse IP reseau (Wi-Fi / LAN)...
set LOCAL_IP=127.0.0.1
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127*' -and $_.IPAddress -notlike '169.254*' } | Select-Object -First 1).IPAddress"') do (
    set LOCAL_IP=%%i
)

if not exist ".next" (
    echo [*] Premiere execution : compilation Next.js en cours...
    call npm run build
)

echo [*] Lancement du serveur Next.js en arriere-plan...
start "OCP Pointage - Serveur Backend" /min cmd /c "npm run start -- -H 0.0.0.0 -p 3000"

echo [*] Initialisation en cours...
ping 127.0.0.1 -n 4 >nul

echo [*] Ouverture de l'application dans votre navigateur...
start "" http://localhost:3000

echo.
echo ================================================================
echo  Serveur OCP Pointage demarre avec succes !
echo.
echo  - Sur ce PC             : http://localhost:3000
echo  - Sur telephones / Wi-Fi : http://%LOCAL_IP%:3000
echo.
echo  Pour arreter le serveur :
echo  - Double-cliquez sur le raccourci "Arreter OCP Pointage"
echo  - OU fermez "OCP Pointage - Serveur Backend" dans la barre des taches.
echo ================================================================
echo.
echo Vous pouvez reduire ou fermer cette fenetre.
pause