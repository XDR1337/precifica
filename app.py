# -*- coding: utf-8 -*-
"""Precifica Desktop - alternativa à Planilha de Precificação EG3 para quem não tem Excel.

Executar:  python app.py   (ou use instalar_e_executar.bat)
Gerar .exe: gerar_exe.bat

Estrutura do código (pasta precifica/):
    core.py      utilitários, caminhos e formatação pt-BR
    seed.py      dados iniciais (96 preços de referência, encargos, custos fixos padrão, exemplo)
    db.py        banco SQLite (%LOCALAPPDATA%\\PrecificaDesktop\\precifica.db), backup e migração da v1
    engine.py    motor de cálculo (mesmas fórmulas da planilha R02)
    importer.py  importação da planilha .xlsm
    pdfs.py      relatórios e proposta técnica e comercial (modelo ACRS) em PDF (reportlab)
    assets.py    logotipos embutidos (ACRS e EG3)
    widgets.py   componentes visuais (tema ACRS, tabela, formulários, cartões)
    ui.py        telas do aplicativo
"""
import sys


def _windows_setup():
    if not sys.platform.startswith("win"):
        return
    try:
        import ctypes
        # icone proprio na barra de tarefas (em vez do icone do Python)
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("EG3.PrecificaDesktop.2")
    except Exception:
        pass


def main():
    _windows_setup()
    try:
        from precifica.ui import main as run
    except ImportError as ex:  # dependencia faltando: avisa de forma amigavel
        try:
            import tkinter as tk
            from tkinter import messagebox
            root = tk.Tk()
            root.withdraw()
            messagebox.showerror("Precifica Desktop",
                                 f"Não foi possível iniciar: {ex}.\n\nExecute o arquivo instalar_e_executar.bat "
                                 "para instalar as bibliotecas necessárias.")
        except Exception:
            print(f"Erro ao iniciar: {ex}. Execute instalar_e_executar.bat.")
        raise SystemExit(1)
    run()


if __name__ == "__main__":
    main()
