@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Precifica Desktop - Gerar EXE

echo ==================================================
echo          PRECIFICA DESKTOP - GERADOR DE EXE
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

if not exist "app.py" (
    echo [ERRO] O arquivo app.py nao foi encontrado nesta pasta.
    pause
    exit /b 1
)
if not exist "requirements.txt" (
    echo [ERRO] O arquivo requirements.txt nao foi encontrado nesta pasta.
    pause
    exit /b 1
)

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

echo [3/5] Instalando dependencias e PyInstaller...
"%VPY%" -m pip install -r "requirements.txt"
if errorlevel 1 goto :erro

echo [4/5] Limpando compilacoes anteriores...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
if exist "PrecificaDesktop.spec" del /q "PrecificaDesktop.spec"

echo [5/5] Gerando PrecificaDesktop.exe...
"%VPY%" -m PyInstaller --noconfirm --clean --onefile --windowed --name "PrecificaDesktop" --collect-all customtkinter --collect-all matplotlib "app.py"
if errorlevel 1 goto :erro

echo.
echo ==================================================
echo EXE GERADO COM SUCESSO
echo Arquivo: %~dp0dist\PrecificaDesktop.exe
echo ==================================================
start "" "%~dp0dist"
pause
exit /b 0

:sem_python
echo [ERRO] Python nao encontrado. Instale Python 3.11 ou superior.
pause
exit /b 1

:erro
echo.
echo [ERRO] Nao foi possivel gerar o executavel.
echo Consulte as mensagens acima para identificar a causa.
pause
exit /b 1
