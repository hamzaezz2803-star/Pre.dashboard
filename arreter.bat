@echo off
title OCP Pointage - Arret du serveur

cd /d "%~dp0"

echo ================================================================
echo           OCP POINTAGE - ARRET DU SERVEUR
echo ================================================================
echo.

echo [*] Arret des processus en cours sur le port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo [+] Processus %%a arrete.
)

echo.
echo [OK] Le serveur OCP Pointage est arrete.
echo.
ping 127.0.0.1 -n 3 >nul
