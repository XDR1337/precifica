@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Precifica Desktop - Gerar instalador

echo ==================================================
echo      PRECIFICA DESKTOP - GERADOR DO INSTALADOR
echo ==================================================
echo.

if not exist "dist\PrecificaDesktop.exe" (
    echo [ERRO] dist\PrecificaDesktop.exe nao encontrado.
    echo Rode primeiro o gerar_exe.bat.
    pause
    exit /b 1
)

set "MAKENSIS="
where makensis >nul 2>nul && set "MAKENSIS=makensis"
if not defined MAKENSIS if exist "%ProgramFiles(x86)%\NSIS\makensis.exe" set "MAKENSIS=%ProgramFiles(x86)%\NSIS\makensis.exe"
if not defined MAKENSIS if exist "%ProgramFiles%\NSIS\makensis.exe" set "MAKENSIS=%ProgramFiles%\NSIS\makensis.exe"
if not defined MAKENSIS (
    echo [ERRO] NSIS nao encontrado. Instale em https://nsis.sourceforge.io/Download
    pause
    exit /b 1
)

set "VERSAO=2.0.0"
for /f "tokens=2 delims==" %%v in ('findstr /B /C:"APP_VERSION" "precifica\core.py"') do set "VERSAO=%%~v"
set "VERSAO=%VERSAO: =%"
set "VERSAO=%VERSAO:"=%"
echo Versao: %VERSAO%
echo.

"%MAKENSIS%" /DAPP_VERSION=%VERSAO% "instalador\instalador.nsi"
if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao compilar o instalador.
    pause
    exit /b 1
)

echo.
echo ==================================================
echo INSTALADOR GERADO: %~dp0Instalador_PrecificaDesktop_%VERSAO%.exe
echo ==================================================
start "" "%~dp0"
pause
exit /b 0
