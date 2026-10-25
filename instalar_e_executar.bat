@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Precifica Desktop - Instalacao

echo ==================================================
echo        PRECIFICA DESKTOP 2.0 - AMBIENTE VIRTUAL
echo ==================================================
echo.

rem Localiza o Python
where py >nul 2>nul
if %errorlevel%==0 (
    set "PYTHON=py"
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo [ERRO] Python nao foi encontrado no computador.
        echo Instale o Python 3.11 ou superior e marque a opcao
        echo "Add Python to PATH" durante a instalacao.
        echo.
        pause
        exit /b 1
    )
    set "PYTHON=python"
)

rem Confere se os arquivos necessarios estao na mesma pasta
if not exist "app.py" goto :sem_arquivos
if not exist "requirements.txt" goto :sem_arquivos
if not exist "precifica\ui.py" goto :sem_arquivos

rem Cria o ambiente virtual somente se ele ainda nao existir
if not exist ".venv\Scripts\python.exe" (
    echo [1/4] Criando ambiente virtual em .venv...
    %PYTHON% -m venv ".venv"
    if errorlevel 1 goto :erro_venv
) else (
    echo [1/4] Ambiente virtual existente encontrado.
)

rem Usa diretamente o Python da venv, sem depender do comando activate
set "VENV_PYTHON=%~dp0.venv\Scripts\python.exe"

echo [2/4] Atualizando o pip da venv...
"%VENV_PYTHON%" -m pip install --upgrade pip
if errorlevel 1 goto :erro_dependencias

echo [3/4] Instalando/atualizando os requerimentos (customtkinter, matplotlib,
echo       openpyxl, reportlab, pillow e pyinstaller)...
"%VENV_PYTHON%" -m pip install --upgrade -r "requirements.txt"
if errorlevel 1 goto :erro_dependencias

echo [4/4] Iniciando o Precifica Desktop...
echo.
"%VENV_PYTHON%" "app.py"
if errorlevel 1 goto :erro_aplicativo

exit /b 0

:sem_arquivos
echo [ERRO] Arquivos do aplicativo nao encontrados.
echo Este BAT precisa ficar na mesma pasta de app.py, requirements.txt
echo e da pasta "precifica".
echo.
pause
exit /b 1

:erro_venv
echo.
echo [ERRO] Nao foi possivel criar o ambiente virtual .venv.
echo Verifique a instalacao do Python e as permissoes da pasta.
pause
exit /b 1

:erro_dependencias
echo.
echo [ERRO] Nao foi possivel instalar as dependencias na venv.
echo Verifique a conexao com a internet e as permissoes da pasta.
pause
exit /b 1

:erro_aplicativo
echo.
echo [ERRO] O aplicativo foi encerrado com erro.
echo As mensagens acima podem indicar a causa. Um registro detalhado fica em
echo %LOCALAPPDATA%\PrecificaDesktop\erros.log
pause
exit /b 1
