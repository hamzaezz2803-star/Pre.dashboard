@echo off
chcp 65001 >nul
title OCP Pointage - Démarrage du serveur

cd /d "C:\ocpdahsboard"

echo ================================================================
echo           OCP POINTAGE - SUIVI DES PRÉSENCES
echo ================================================================
echo.

rem 1. Arrêt d'un ancien serveur encore actif sur le port 3000
echo [*] Nettoyage du port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

rem 2. Détection dynamique de l'adresse IP locale du réseau Wi-Fi / LAN
set LOCAL_IP=127.0.0.1
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127*' -and $_.IPAddress -notlike '169.254*' } | Select-Object -First 1).IPAddress"') do (
    set LOCAL_IP=%%i
)

rem 3. Vérification que le build de production (.next) existe
if not exist ".next" (
    echo [*] Première exécution détectée : compilation de l'application en cours...
    call npm run build
)

rem 4. Démarrage du serveur Next.js en arrière-plan (accessible sur localhost et réseau local)
echo [*] Démarrage du serveur Next.js sur 0.0.0.0:3000...
start "OCP Pointage - Serveur Backend" /min cmd /c "npm run start -- -H 0.0.0.0 -p 3000"

rem 5. Attente de l'initialisation du serveur
echo [*] Initialisation en cours...
timeout /t 3 /nobreak >nul

rem 6. Ouverture automatique du navigateur
echo [*] Ouverture de l'application dans votre navigateur...
start "" http://localhost:3000

echo.
echo ================================================================
echo  [✓] Serveur démarré avec succès !
echo.
echo  - Sur ce PC             : http://localhost:3000
echo  - Sur téléphones / Wi-Fi : http://%LOCAL_IP%:3000
echo.
echo  Pour arrêter le serveur :
echo  - Double-cliquez sur "arreter.bat"
echo  - OU fermez "OCP Pointage - Serveur Backend" dans la barre des tâches.
echo ================================================================
echo.
echo Appuyez sur une touche pour fermer cette fenêtre d'information.
pause >nul