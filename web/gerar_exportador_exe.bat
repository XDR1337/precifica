@echo off
rem Gera web\ExportarDadosParaWeb.exe (exportador dos dados do Precifica Desktop para a versao web).
setlocal
cd /d "%~dp0.."
set "PY=.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" -m PyInstaller --noconfirm --clean --onefile --console --name ExportarDadosParaWeb --icon "%CD%\icone.ico" --paths . --distpath web --workpath build\exportador --specpath build\exportador --exclude-module matplotlib --exclude-module tkinter --exclude-module customtkinter --exclude-module numpy --exclude-module openpyxl --exclude-module reportlab web\exportar_dados_para_web.py
if errorlevel 1 (echo Falhou. & pause & exit /b 1)
echo Pronto: web\ExportarDadosParaWeb.exe
