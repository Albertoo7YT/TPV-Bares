@echo off
setlocal

set "ROOT=%~dp0"
set "RELEASE_DIR=%ROOT%release"

if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"

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

echo Release generada en "%RELEASE_DIR%".
exit /b 0
