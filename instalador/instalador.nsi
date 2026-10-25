; ==========================================================================
;  Precifica Desktop - instalador (NSIS 3.x, Unicode)
;  Como gerar: 1) rode gerar_exe.bat  (cria dist\PrecificaDesktop.exe)
;              2) rode gerar_instalador.bat  (ou compile este arquivo no NSIS)
;  Resultado: Instalador_PrecificaDesktop_<versao>.exe
; ==========================================================================
Unicode true
SetCompressor /SOLID lzma

!ifndef APP_VERSION
  !define APP_VERSION "2.0.0"
!endif
!define APP_NAME      "Precifica Desktop"
!define APP_PUBLISHER "EG3 Empresa Jr."
!define APP_EXE       "PrecificaDesktop.exe"
!define APP_REGKEY    "Software\PrecificaDesktop"
!define UNINST_KEY    "Software\Microsoft\Windows\CurrentVersion\Uninstall\PrecificaDesktop"
!define SRC_EXE       "..\dist\PrecificaDesktop.exe"
!define SRC_ICON      "..\icone.ico"

Name "${APP_NAME} ${APP_VERSION}"
OutFile "..\Instalador_PrecificaDesktop_${APP_VERSION}.exe"
BrandingText "${APP_PUBLISHER}"

; Instala so para o usuario atual: nao pede senha de administrador.
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
InstallDirRegKey HKCU "${APP_REGKEY}" "InstallDir"

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

; ---- informacoes do arquivo .exe do instalador
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey /LANG=1046 "ProductName"     "${APP_NAME}"
VIAddVersionKey /LANG=1046 "CompanyName"     "${APP_PUBLISHER}"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador do ${APP_NAME}"
VIAddVersionKey /LANG=1046 "FileVersion"     "${APP_VERSION}"
VIAddVersionKey /LANG=1046 "ProductVersion"  "${APP_VERSION}"
VIAddVersionKey /LANG=1046 "LegalCopyright"  "${APP_PUBLISHER}"

; ---- aparencia
!define MUI_ICON   "${SRC_ICON}"
!define MUI_UNICON "${SRC_ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Bem-vindo ao ${APP_NAME}"
!define MUI_WELCOMEPAGE_TEXT "Este assistente instala o ${APP_NAME} ${APP_VERSION} no seu computador.$\r$\n$\r$\nO programa calcula quanto cobrar pelos seus servicos, gera tabela de precos, propostas e relatorios em PDF e nao precisa de Excel.$\r$\n$\r$\nClique em Avancar para continuar."
!define MUI_FINISHPAGE_TITLE "Instalacao concluida"
!define MUI_FINISHPAGE_TEXT "O ${APP_NAME} foi instalado.$\r$\n$\r$\nNa primeira abertura um tutorial mostra como usar cada tela."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o ${APP_NAME} agora"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"

; ---- impede duas execucoes do instalador ao mesmo tempo
Function .onInit
  System::Call 'kernel32::CreateMutex(p 0, i 0, t "PrecificaDesktopInstaller") p .r1 ?e'
  Pop $0
  ${If} $0 = 183
    MessageBox MB_OK|MB_ICONEXCLAMATION "O instalador do ${APP_NAME} ja esta aberto."
    Abort
  ${EndIf}
FunctionEnd

; ---- verifica se o programa esta aberto (instalacao e desinstalacao)
!macro CHECK_RUNNING PREFIX
  Function ${PREFIX}CheckRunning
    check:
    nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq ${APP_EXE}" /NH | find /I "${APP_EXE}"'
    Pop $0
    ${If} $0 = 0
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "O ${APP_NAME} esta aberto.$\r$\nFeche o programa e clique em Repetir para continuar." /SD IDCANCEL IDRETRY check
      Abort
    ${EndIf}
  FunctionEnd
!macroend
!insertmacro CHECK_RUNNING ""
!insertmacro CHECK_RUNNING "un."

; ---- instalacao
Section "${APP_NAME} (obrigatorio)" SecMain
  SectionIn RO
  Call CheckRunning
  SetOutPath "$INSTDIR"
  SetOverwrite on
  File "${SRC_EXE}"
  File "${SRC_ICON}"
  WriteUninstaller "$INSTDIR\Desinstalar.exe"

  ; menu Iniciar
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\icone.ico"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Desinstalar ${APP_NAME}.lnk" "$INSTDIR\Desinstalar.exe"

  ; registro (Configuracoes > Aplicativos)
  WriteRegStr HKCU "${APP_REGKEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName"          "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion"       "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher"            "${APP_PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon"          "$INSTDIR\icone.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation"      "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString"      '"$INSTDIR\Desinstalar.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Desinstalar.exe" /S'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

Section "Atalho na Area de Trabalho" SecDesktop
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\icone.ico"
SectionEnd

; ---- desinstalacao
Section "Uninstall"
  Call un.CheckRunning
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Desinstalar ${APP_NAME}.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"
  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\icone.ico"
  Delete "$INSTDIR\Desinstalar.exe"
  RMDir  "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "${APP_REGKEY}"

  ; os dados do cliente (cadastros, propostas, backups) ficam guardados, a menos que ele peca para apagar
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Deseja tambem apagar seus dados (cadastros, propostas e backups)?$\r$\n$\r$\nEscolha Nao para manter os dados caso volte a instalar o programa.$\r$\nOs PDFs na pasta Documentos nao sao apagados." /SD IDNO IDNO manter
    RMDir /r "$LOCALAPPDATA\PrecificaDesktop"
  manter:
SectionEnd
