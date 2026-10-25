"""Leva os dados do Precifica Desktop (SQLite) para a versao web.

Gera um arquivo .json que a versao web restaura em Configuracoes > Restaurar backup.
Uso:
    python web/exportar_dados_para_web.py                      # usa o banco padrao e salva em Documentos
    python web/exportar_dados_para_web.py caminho/precifica.db saida.json
"""
from __future__ import annotations

import base64
import io
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from precifica.core import data_dir          # noqa: E402
from precifica.db import SCHEMA              # noqa: E402


def logo_data_url(path: str) -> str:
    """O logotipo escolhido no desktop e' um arquivo; na web ele vai embutido (reduzido) no proprio backup."""
    try:
        p = Path(path)
        if not (path and p.exists()):
            return ""
        try:
            from PIL import Image
            im = Image.open(p)
            im.thumbnail((600, 600))
            buf = io.BytesIO()
            im.save(buf, "PNG")
            raw = buf.getvalue()
        except Exception:
            raw = p.read_bytes()
        return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")
    except OSError:
        return ""


def export(db_path: Path, out_path: Path) -> Path:
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    tables = {t: [dict(r) for r in con.execute(f"SELECT * FROM {t}")] for t in SCHEMA if t != "config"}
    config = {r["chave"]: r["valor"] for r in con.execute("SELECT chave, valor FROM config")}
    con.close()
    config["empresa_logo"] = logo_data_url(config.get("empresa_logo", ""))
    seq = {t: max([r["id"] for r in rows] + [0]) for t, rows in tables.items()}
    state = {"v": 1, "config": config, "t": tables, "seq": seq}
    doc = {"app": "PrecificaWeb", "version": 1, "exported_at": datetime.now().isoformat(timespec="seconds"), "data": state}
    out_path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return out_path


def main(argv):
    db_path = Path(argv[1]) if len(argv) > 1 else data_dir() / "precifica.db"
    if not db_path.exists():
        print(f"Banco de dados nao encontrado: {db_path}")
        return 1
    if len(argv) > 2:
        out = Path(argv[2])
    else:
        docs = Path.home() / "Documents"
        out = (docs if docs.exists() else Path.home()) / f"precifica_para_web_{datetime.now():%Y%m%d}.json"
    export(db_path, out)
    print(f"Pronto: {out}\nNa versao web: Configuracoes > Restaurar backup > escolha este arquivo.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
