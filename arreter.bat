@echo off
chcp 65001 >nul
title OCP Pointage - Arrêt du serveur

echo ================================================================
echo           OCP POINTAGE - ARRÊT DU SERVEUR
echo ================================================================
echo.

echo [*] Arrêt du serveur sur le port 3000...
set KILLED=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    set KILLED=1
)

echo.
if "%KILLED%"=="1" (
    echo [✓] Le serveur OCP Pointage a été arrêté avec succès.
) else (
    echo [i] Aucun serveur actif n'a été détecté sur le port 3000.
)
echo.
timeout /t 3 >nul
