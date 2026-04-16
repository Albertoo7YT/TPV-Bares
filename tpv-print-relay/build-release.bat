@echo off
setlocal

set "ROOT=%~dp0"
set "RELEASE_DIR=%ROOT%release"

if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"
if not exist "%RELEASE_DIR%\panel" mkdir "%RELEASE_DIR%\panel"

if exist "%RELEASE_DIR%\TPVPrintRelay.exe" (
  del /F /Q "%RELEASE_DIR%\TPVPrintRelay.exe" >nul 2>nul
  if exist "%RELEASE_DIR%\TPVPrintRelay.exe" (
    echo No se puede sobrescribir "%RELEASE_DIR%\TPVPrintRelay.exe".
    echo Cierre el ejecutable si sigue abierto y vuelva a lanzar este script.
    exit /b 1
  )
)

echo Compilando TypeScript...
call npm run build
if errorlevel 1 exit /b 1

echo Empaquetando ejecutable...
call npx pkg dist/index.js --targets node18-win-x64 --output release/TPVPrintRelay.exe --assets "panel/**/*"
if errorlevel 1 exit /b 1

echo Copiando scripts de instalacion...
copy /Y "%ROOT%scripts\install-service.bat" "%RELEASE_DIR%\install-service.bat" >nul
copy /Y "%ROOT%scripts\uninstall-service.bat" "%RELEASE_DIR%\uninstall-service.bat" >nul
copy /Y "%ROOT%README.txt" "%RELEASE_DIR%\README.txt" >nul
xcopy "%ROOT%panel" "%RELEASE_DIR%\panel" /E /I /Y >nul

echo Release generada en "%RELEASE_DIR%".
exit /b 0
