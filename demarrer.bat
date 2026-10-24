@echo off
title OCP Dashboard
cd /d "C:\ocpdahsboard"

rem Arrete un ancien serveur encore actif sur le port 3001
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

rem Lance le serveur de developpement dans une fenetre reduite
start "OCP Dashboard Server" /min cmd /c "npm run dev -- -p 3001"

rem Laisse le temps au serveur de demarrer, puis ouvre le navigateur
timeout /t 10 /nobreak >nul
start "" http://localhost:3001
exit