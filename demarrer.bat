@echo off
title OCP Pointage
cd /d "C:\ocpdahsboard"

echo Demarrage de l'application...
call pm2 describe ocp-pointage >nul 2>&1
if errorlevel 1 (
  call pm2 start ecosystem.config.js
) else (
  call pm2 restart ocp-pointage
)

echo.
call pm2 status
echo.
echo Ouverture du navigateur dans quelques secondes...
timeout /t 8 /nobreak >nul
start "" http://localhost:3000

echo.
echo L'application tourne en arriere-plan. Vous pouvez fermer cette fenetre.
pause