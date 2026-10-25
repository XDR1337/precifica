@echo off
rem Gera web\Precifica.html e a pasta web\pwa (aplicativo instalavel).
setlocal
set "PY=%~dp0..\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" "%~dp0build_web.py"
if errorlevel 1 (echo Falhou. & pause & exit /b 1)
echo Pronto: web\Precifica.html e web\pwa\
