@echo off
setlocal

set "APP_NAME=TPVPrintRelay"
set "INSTALL_DIR=C:\Program Files\TPVPrintRelay"

echo Eliminando auto-arranque...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "%APP_NAME%" /f >nul 2>nul

if exist "%INSTALL_DIR%" (
  echo Eliminando carpeta de instalacion...
  rmdir /S /Q "%INSTALL_DIR%"
)

echo Desinstalacion completada.
exit /b 0
