@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Precifica Desktop - Gerar EXE

echo ==================================================
echo        PRECIFICA DESKTOP 2.0 - GERADOR DE EXE
echo ==================================================
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    set "PYTHON=py"
) else (
    where python >nul 2>nul
    if errorlevel 1 goto :sem_python
    set "PYTHON=python"
)

if not exist "app.py" goto :sem_arquivos
if not exist "requirements.txt" goto :sem_arquivos
if not exist "precifica\ui.py" goto :sem_arquivos

if not exist ".venv\Scripts\python.exe" (
    echo [1/5] Criando ambiente virtual .venv...
    %PYTHON% -m venv ".venv"
    if errorlevel 1 goto :erro
) else (
    echo [1/5] Ambiente virtual encontrado.
)
set "VPY=%~dp0.venv\Scripts\python.exe"

echo [2/5] Atualizando pip...
"%VPY%" -m pip install --upgrade pip
if errorlevel 1 goto :erro

echo [3/5] Instalando dependencias (inclui reportlab e pillow) e PyInstaller...
"%VPY%" -m pip install --upgrade -r "requirements.txt"
if errorlevel 1 goto :erro

echo [4/5] Limpando compilacoes anteriores...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"

set "ICONE="
if exist "icone.ico" set "ICONE=--icon icone.ico"

echo [5/5] Gerando PrecificaDesktop.exe (pode levar alguns minutos)...
"%VPY%" -m PyInstaller --noconfirm --clean --onefile --windowed --name "PrecificaDesktop" %ICONE% ^
    --collect-all customtkinter ^
    --collect-all matplotlib ^
    --collect-data reportlab ^
    --hidden-import PIL._tkinter_finder ^
    --exclude-module PyQt5 --exclude-module PySide6 --exclude-module IPython ^
    "app.py"
if errorlevel 1 goto :erro

echo.
echo ==================================================
echo EXE GERADO COM SUCESSO
echo Arquivo: %~dp0dist\PrecificaDesktop.exe
echo O cliente NAO precisa de Python nem de Excel para usar o .exe.
echo ==================================================
start "" "%~dp0dist"
pause
exit /b 0

:sem_python
echo [ERRO] Python nao encontrado. Instale Python 3.11 ou superior.
pause
exit /b 1

:sem_arquivos
echo [ERRO] Arquivos do aplicativo nao encontrados.
echo Este BAT precisa ficar na mesma pasta de app.py, requirements.txt
echo e da pasta "precifica".
pause
exit /b 1

:erro
echo.
echo [ERRO] Nao foi possivel gerar o executavel.
echo Consulte as mensagens acima para identificar a causa.
pause
exit /b 1
