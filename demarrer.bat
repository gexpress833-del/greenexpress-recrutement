@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo Dossier: %CD%
echo Demarrage de Green Express...
echo.
node server.js
echo.
pause
