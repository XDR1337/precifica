@echo off
rem Abre o Precifica Web neste computador e no celular (mesma rede Wi-Fi).
setlocal
set "PY=%~dp0..\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
cd /d "%~dp0pwa"
if not exist index.html (
  echo A pasta pwa ainda nao existe. Rodando build_web.bat...
  call "%~dp0build_web.bat"
  cd /d "%~dp0pwa"
)
echo.
echo  Precifica Web - servidor local
echo  ------------------------------------------------------------
echo  Neste computador:  http://localhost:8000
echo.
echo  No celular (conectado ao mesmo Wi-Fi), abra um destes enderecos:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { '    http://' + $_.IPAddress + ':8000' }"
echo.
echo  Se o Windows perguntar sobre o Firewall, permita o acesso em rede privada.
echo  Feche esta janela para parar o servidor.
echo  ------------------------------------------------------------
"%PY%" -m http.server 8000 --bind 0.0.0.0
