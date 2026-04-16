@echo off
setlocal

set "APP_NAME=TPVPrintRelay"
set "INSTALL_DIR=C:\Program Files\TPVPrintRelay"
set "SOURCE_EXE=%~dp0TPVPrintRelay.exe"
set "TARGET_EXE=%INSTALL_DIR%\TPVPrintRelay.exe"
set "SOURCE_PANEL_DIR=%~dp0panel"
set "TARGET_PANEL_DIR=%INSTALL_DIR%\panel"

if not exist "%SOURCE_EXE%" (
  echo No se encontro TPVPrintRelay.exe junto a este instalador.
  exit /b 1
)

echo Instalando %APP_NAME% en "%INSTALL_DIR%"...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
copy /Y "%SOURCE_EXE%" "%TARGET_EXE%" >nul
if exist "%SOURCE_PANEL_DIR%" xcopy "%SOURCE_PANEL_DIR%" "%TARGET_PANEL_DIR%" /E /I /Y >nul

echo Creando auto-arranque en HKCU\Software\Microsoft\Windows\CurrentVersion\Run...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "%APP_NAME%" /t REG_SZ /d "\"%TARGET_EXE%\"" /f >nul

echo Instalacion completada.
echo Abra http://localhost:9191 para configurar el relay.
exit /b 0
