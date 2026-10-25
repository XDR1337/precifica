# -*- coding: utf-8 -*-
"""Utilitarios comuns: caminhos, conversao e formatacao de numeros no padrao brasileiro."""
from __future__ import annotations

import os
import sys
from pathlib import Path

APP_NAME = "Precifica Desktop"
APP_VERSION = "2.0.0"
APP_AUTHOR = "EG3 Empresa Jr."


def data_dir() -> Path:
    """Pasta de dados do usuario (fora da pasta do .exe, para nao perder dados ao atualizar)."""
    base = os.getenv("LOCALAPPDATA") or os.getenv("APPDATA") or str(Path.home())
    p = Path(base) / "PrecificaDesktop"
    p.mkdir(parents=True, exist_ok=True)
    return p


def backup_dir() -> Path:
    p = data_dir() / "backups"
    p.mkdir(parents=True, exist_ok=True)
    return p


def pdf_dir() -> Path:
    docs = Path.home() / "Documents"
    if not docs.exists():
        docs = Path.home()
    p = docs / "Precifica Desktop"
    p.mkdir(parents=True, exist_ok=True)
    return p


def resource_path(rel: str) -> Path:
    """Caminho de recurso compativel com PyInstaller (--onefile)."""
    base = getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent)
    return Path(base) / rel


# ---------------------------------------------------------------- numeros
def fnum(v, default: float = 0.0) -> float:
    """Converte texto digitado pelo usuario em float.
    Aceita '1.234,56', '1234,56', '1234.56', 'R$ 10', '15%'."""
    if v is None:
        return default
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("R$", "").replace("%", "").replace(" ", "").replace(" ", "")
    if not s:
        return default
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return default


def _br(v: float, dec: int) -> str:
    s = f"{v:,.{dec}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def money(v, dec: int = 2) -> str:
    v = fnum(v)
    sign = "-" if v < 0 else ""
    return f"{sign}R$ {_br(abs(v), dec)}"


def num(v, dec: int = 2) -> str:
    return _br(fnum(v), dec)


def pct(v, dec: int = 1) -> str:
    """Recebe percentual em fracao (0,15) e formata '15,0%'."""
    return f"{_br(fnum(v) * 100, dec)}%"


def pct_n(v, dec: int = 2) -> str:
    """Recebe percentual ja em pontos (15) e formata '15,00%'."""
    return f"{_br(fnum(v), dec)}%"


def num_input(v, dec: int = 2) -> str:
    """Formata numero para exibir em campo editavel (sem separador de milhar)."""
    v = fnum(v)
    if abs(v - round(v)) < 1e-9:
        return str(int(round(v)))
    s = f"{v:.{dec}f}".rstrip("0").rstrip(".")
    return s.replace(".", ",")


def safe_div(a: float, b: float, default: float = 0.0) -> float:
    try:
        return a / b if b else default
    except ZeroDivisionError:
        return default
