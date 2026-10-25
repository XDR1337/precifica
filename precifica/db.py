# -*- coding: utf-8 -*-
"""Persistencia em SQLite (arquivo unico em %LOCALAPPDATA%\\PrecificaDesktop\\precifica.db)."""
from __future__ import annotations

import csv
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

from . import seed
from .core import data_dir, backup_dir, fnum

SCHEMA = {
    "config": "chave TEXT PRIMARY KEY, valor TEXT",
    "insumos": ("id INTEGER PRIMARY KEY AUTOINCREMENT, descricao TEXT NOT NULL, unidade TEXT DEFAULT 'Unidade', "
                "qtde_bruta REAL DEFAULT 1, qtde_liquida REAL DEFAULT 1, custo REAL DEFAULT 0, "
                "categoria TEXT DEFAULT '', obs TEXT DEFAULT ''"),
    "equipe": ("id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, salario REAL DEFAULT 0, "
               "setor TEXT DEFAULT 'Produtivo', cargo TEXT DEFAULT '', contratacao TEXT DEFAULT 'CLT', "
               "vale_transporte REAL DEFAULT 0, vale_refeicao REAL DEFAULT 0, convenio REAL DEFAULT 0, "
               "carga_horaria REAL DEFAULT 176"),
    "custos_fixos": "id INTEGER PRIMARY KEY AUTOINCREMENT, descricao TEXT NOT NULL, valor REAL DEFAULT 0",
    "imobilizado": ("id INTEGER PRIMARY KEY AUTOINCREMENT, descricao TEXT NOT NULL, valor REAL DEFAULT 0, "
                    "vida_util REAL DEFAULT 10"),
    "servicos": ("id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, descricao TEXT DEFAULT '', "
                 "unidade TEXT DEFAULT 'Serviço', preco REAL DEFAULT 0, imposto_pct REAL DEFAULT 0, "
                 "cartao_pct REAL DEFAULT 0, app_pct REAL DEFAULT 0, comissao_pct REAL DEFAULT 0, "
                 "previsao REAL DEFAULT 0"),
    "ficha_mod": ("id INTEGER PRIMARY KEY AUTOINCREMENT, servico_id INTEGER NOT NULL, equipe_id INTEGER NOT NULL, "
                  "horas REAL DEFAULT 0"),
    "ficha_insumo": ("id INTEGER PRIMARY KEY AUTOINCREMENT, servico_id INTEGER NOT NULL, insumo_id INTEGER NOT NULL, "
                     "quantidade REAL DEFAULT 0"),
    "revenda": ("id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, unidade TEXT DEFAULT 'Unidade', "
                "qtde REAL DEFAULT 1, custo REAL DEFAULT 0, preco REAL DEFAULT 0, imposto_pct REAL DEFAULT 0, "
                "cartao_pct REAL DEFAULT 0, app_pct REAL DEFAULT 0, comissao_pct REAL DEFAULT 0, previsao REAL DEFAULT 0"),
    "clientes": ("id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, documento TEXT DEFAULT '', "
                 "endereco TEXT DEFAULT '', complemento TEXT DEFAULT '', bairro TEXT DEFAULT '', cidade TEXT DEFAULT '', "
                 "uf TEXT DEFAULT '', cep TEXT DEFAULT '', email TEXT DEFAULT '', telefone TEXT DEFAULT '', "
                 "contato TEXT DEFAULT '', obs TEXT DEFAULT ''"),
    "propostas": ("id INTEGER PRIMARY KEY AUTOINCREMENT, numero INTEGER, data TEXT, validade_dias INTEGER DEFAULT 30, "
                  "status TEXT DEFAULT 'Rascunho', cliente_id INTEGER, cliente_nome TEXT DEFAULT '', "
                  "cliente_documento TEXT DEFAULT '', cliente_endereco TEXT DEFAULT '', cliente_complemento TEXT DEFAULT '', "
                  "cliente_bairro TEXT DEFAULT '', cliente_cidade TEXT DEFAULT '', cliente_uf TEXT DEFAULT '', "
                  "cliente_cep TEXT DEFAULT '', cliente_email TEXT DEFAULT '', cliente_telefone TEXT DEFAULT '', "
                  "desconto_valor REAL DEFAULT 0, forma_pagamento TEXT DEFAULT '', detalhes_pagamento TEXT DEFAULT '', "
                  "observacoes TEXT DEFAULT '', criado_em TEXT, atualizado_em TEXT, "
                  # --- proposta tecnica e comercial (modelo ACRS)
                  "titulo TEXT DEFAULT '', aos_cuidados TEXT DEFAULT '', objeto TEXT DEFAULT '', "
                  "escopo_intro TEXT DEFAULT '', escopo_json TEXT DEFAULT '', escopo_nota TEXT DEFAULT '', "
                  "secoes_pre_json TEXT DEFAULT '', secoes_pos_json TEXT DEFAULT '', parcelas_json TEXT DEFAULT '', "
                  "fecho TEXT DEFAULT '', assinatura1 TEXT DEFAULT '', assinatura2 TEXT DEFAULT '', "
                  "invest_nova_pagina INTEGER DEFAULT 1"),
    "proposta_itens": ("id INTEGER PRIMARY KEY AUTOINCREMENT, proposta_id INTEGER NOT NULL, ordem INTEGER DEFAULT 0, "
                       "descricao TEXT DEFAULT '', quantidade REAL DEFAULT 1, unidade TEXT DEFAULT '', "
                       "valor_unit REAL DEFAULT 0, origem TEXT DEFAULT ''"),
}

ORDER = {
    "insumos": "descricao COLLATE NOCASE", "equipe": "nome COLLATE NOCASE", "custos_fixos": "id",
    "imobilizado": "id", "servicos": "nome COLLATE NOCASE", "revenda": "nome COLLATE NOCASE",
    "clientes": "nome COLLATE NOCASE", "propostas": "numero DESC", "proposta_itens": "ordem, id",
    "ficha_mod": "id", "ficha_insumo": "id",
}


class Database:
    def __init__(self, path: Path | None = None):
        self.path = Path(path) if path else data_dir() / "precifica.db"
        new = not self.path.exists()
        self.con = sqlite3.connect(str(self.path))
        self.con.row_factory = sqlite3.Row
        self.con.execute("PRAGMA foreign_keys = ON")
        self._create()
        self._ensure_config()
        if new:
            self.seed_initial()
            self.migrate_old_csv()

    # ------------------------------------------------------------ estrutura
    def _create(self):
        for t, cols in SCHEMA.items():
            self.con.execute(f"CREATE TABLE IF NOT EXISTS {t} ({cols})")
        # colunas adicionadas em versoes futuras: ALTER TABLE seguro
        for t, cols in SCHEMA.items():
            existing = {r[1] for r in self.con.execute(f"PRAGMA table_info({t})")}
            for col in cols.split(", "):
                name = col.split()[0]
                if name not in existing and "PRIMARY KEY" not in col:
                    self.con.execute(f"ALTER TABLE {t} ADD COLUMN {col}")
        self.con.commit()

    def _ensure_config(self):
        cur = self.config()
        for k, v in seed.CONFIG_PADRAO.items():
            if k not in cur:
                self.con.execute("INSERT INTO config(chave, valor) VALUES(?, ?)", (k, str(v)))
        self.con.commit()

    def seed_initial(self):
        if not self.all("insumos"):
            self.con.executemany(
                "INSERT INTO insumos(descricao, unidade, qtde_bruta, qtde_liquida, custo, categoria) VALUES(?,?,?,?,?,?)",
                [(d, u, 1, 1, v, "Referência de mercado") for d, u, v in seed.PRECOS_REFERENCIA])
        if not self.all("custos_fixos"):
            self.con.executemany("INSERT INTO custos_fixos(descricao, valor) VALUES(?, 0)",
                                 [(d,) for d in seed.CUSTOS_FIXOS_PADRAO])
        if not self.all("imobilizado"):
            self.con.executemany("INSERT INTO imobilizado(descricao, valor, vida_util) VALUES(?, 0, ?)",
                                 seed.IMOBILIZADO_PADRAO)
        self.con.commit()

    # ------------------------------------------------------------ CRUD
    def all(self, table: str, where: str = "", params: tuple = ()) -> list[dict]:
        sql = f"SELECT * FROM {table}"
        if where:
            sql += f" WHERE {where}"
        if table in ORDER:
            sql += f" ORDER BY {ORDER[table]}"
        return [dict(r) for r in self.con.execute(sql, params)]

    def get(self, table: str, id_) -> dict | None:
        r = self.con.execute(f"SELECT * FROM {table} WHERE id = ?", (id_,)).fetchone()
        return dict(r) if r else None

    def save(self, table: str, row: dict) -> int:
        cols = [c.split()[0] for c in SCHEMA[table].split(", ")]
        data = {k: v for k, v in row.items() if k in cols and k != "id"}
        id_ = row.get("id")
        if id_:
            sets = ", ".join(f"{k} = ?" for k in data)
            self.con.execute(f"UPDATE {table} SET {sets} WHERE id = ?", (*data.values(), id_))
        else:
            keys = ", ".join(data)
            qs = ", ".join("?" for _ in data)
            cur = self.con.execute(f"INSERT INTO {table} ({keys}) VALUES ({qs})", tuple(data.values()))
            id_ = cur.lastrowid
        self.con.commit()
        return int(id_)

    def delete(self, table: str, id_):
        cascades = {
            "servicos": [("ficha_mod", "servico_id"), ("ficha_insumo", "servico_id")],
            "equipe": [("ficha_mod", "equipe_id")],
            "insumos": [("ficha_insumo", "insumo_id")],
            "propostas": [("proposta_itens", "proposta_id")],
        }
        for t, col in cascades.get(table, []):
            self.con.execute(f"DELETE FROM {t} WHERE {col} = ?", (id_,))
        self.con.execute(f"DELETE FROM {table} WHERE id = ?", (id_,))
        self.con.commit()

    def execute(self, sql: str, params: tuple = ()):
        cur = self.con.execute(sql, params)
        self.con.commit()
        return cur

    # ------------------------------------------------------------ config
    def config(self) -> dict:
        return {r["chave"]: r["valor"] for r in self.con.execute("SELECT chave, valor FROM config")}

    def cfg(self, key: str, default=None):
        r = self.con.execute("SELECT valor FROM config WHERE chave = ?", (key,)).fetchone()
        return r[0] if r else default

    def cfg_num(self, key: str, default: float = 0.0) -> float:
        return fnum(self.cfg(key), default)

    def set_cfg(self, key: str, value):
        self.con.execute("INSERT INTO config(chave, valor) VALUES(?, ?) "
                         "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", (key, str(value)))
        self.con.commit()

    def set_many(self, values: dict):
        for k, v in values.items():
            self.con.execute("INSERT INTO config(chave, valor) VALUES(?, ?) "
                             "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", (k, str(v)))
        self.con.commit()

    # ------------------------------------------------------------ propostas
    def next_proposal_number(self) -> int:
        n = int(self.cfg_num("proposta_proximo_numero", 1))
        r = self.con.execute("SELECT MAX(numero) FROM propostas").fetchone()[0] or 0
        return max(n, int(r) + 1)

    def save_proposal(self, prop: dict, itens: list[dict]) -> int:
        now = datetime.now().isoformat(timespec="seconds")
        prop = dict(prop)
        prop["atualizado_em"] = now
        if not prop.get("id"):
            prop["criado_em"] = now
            if not prop.get("numero"):
                prop["numero"] = self.next_proposal_number()
        pid = self.save("propostas", prop)
        self.con.execute("DELETE FROM proposta_itens WHERE proposta_id = ?", (pid,))
        for i, it in enumerate(itens):
            it = {k: v for k, v in it.items() if k != "id"}
            it.update(proposta_id=pid, ordem=i)
            self.save("proposta_itens", it)
        numero = int(prop.get("numero") or 0)
        if numero >= self.cfg_num("proposta_proximo_numero", 1):
            self.set_cfg("proposta_proximo_numero", numero + 1)
        self.con.commit()
        return pid

    def proposal_items(self, pid) -> list[dict]:
        return self.all("proposta_itens", "proposta_id = ?", (pid,))

    # ------------------------------------------------------------ backup
    def backup(self, dest: Path | None = None) -> Path:
        dest = Path(dest) if dest else backup_dir() / f"precifica_{datetime.now():%Y%m%d_%H%M%S}.db"
        out = sqlite3.connect(str(dest))
        with out:
            self.con.backup(out)
        out.close()
        return dest

    def restore(self, src: Path):
        self.backup()  # seguranca: copia antes de substituir
        self.con.close()
        shutil.copyfile(src, self.path)
        self.con = sqlite3.connect(str(self.path))
        self.con.row_factory = sqlite3.Row
        self._create()
        self._ensure_config()

    def reset_all(self):
        self.backup()
        tut = self.cfg("tutorial_nao_mostrar", "0")
        for t in SCHEMA:
            if t != "config":
                self.con.execute(f"DELETE FROM {t}")
        self.con.execute("DELETE FROM config")
        self.con.commit()
        self._ensure_config()
        self.seed_initial()
        self.set_cfg("tutorial_nao_mostrar", tut)

    # ------------------------------------------------------------ exemplo
    def load_example(self):
        """Carrega o cenario didatico (eletricista autonomo + instalacao de chuveiro)."""
        ex = seed.EXEMPLO
        emp_ids = {}
        for e in ex["equipe"]:
            found = [r for r in self.all("equipe") if r["nome"] == e["nome"]]
            emp_ids[e["nome"]] = found[0]["id"] if found else self.save("equipe", dict(e))
        for desc, val in ex["custos_fixos"].items():
            found = [r for r in self.all("custos_fixos") if r["descricao"] == desc]
            if found:
                self.save("custos_fixos", {"id": found[0]["id"], "valor": val})
            else:
                self.save("custos_fixos", {"descricao": desc, "valor": val})
        insumos = {r["descricao"]: r["id"] for r in self.all("insumos")}
        for s in ex["servicos"]:
            if any(r["nome"] == s["nome"] for r in self.all("servicos")):
                continue
            sid = self.save("servicos", {k: v for k, v in s.items() if k not in ("mod", "insumos")})
            for nome, h in s["mod"]:
                self.save("ficha_mod", {"servico_id": sid, "equipe_id": emp_ids[nome], "horas": h})
            for desc, q in s["insumos"]:
                if desc in insumos:
                    self.save("ficha_insumo", {"servico_id": sid, "insumo_id": insumos[desc], "quantidade": q})

    # ------------------------------------------------------------ migracao v1 (CSV)
    def migrate_old_csv(self) -> int:
        """Importa os dados da versao anterior (CSV em %LOCALAPPDATA%\\PrecificaDesktop\\dados)."""
        old = data_dir() / "dados"
        if not old.exists():
            return 0

        def read(name):
            p = old / f"{name}.csv"
            if not p.exists():
                return []
            try:
                with p.open("r", encoding="utf-8-sig", newline="") as fh:
                    return [r for r in csv.DictReader(fh, delimiter=";")
                            if "[EXEMPLO]" not in " ".join(str(v) for v in r.values())]
            except (OSError, csv.Error):
                return []

        n = 0
        ins_map, emp_map, srv_map = {}, {}, {}
        for r in read("insumos"):
            ins_map[r.get("id")] = self.save("insumos", dict(
                descricao=r.get("descricao", ""), unidade=r.get("unidade", "Unidade"),
                qtde_bruta=fnum(r.get("qtde_bruta"), 1) or 1, qtde_liquida=fnum(r.get("qtde_liquida"), 1) or 1,
                custo=fnum(r.get("custo_compra")), categoria="Importado da versão 1")); n += 1
        for r in read("funcionarios"):
            emp_map[r.get("id")] = self.save("equipe", dict(
                nome=r.get("nome", ""), salario=fnum(r.get("salario")),
                setor="Administrativo" if "adm" in r.get("setor", "").lower() else "Produtivo",
                cargo=r.get("cargo", ""), contratacao=r.get("contratacao") or "CLT",
                vale_transporte=fnum(r.get("vale_transporte")), vale_refeicao=fnum(r.get("vale_refeicao")),
                convenio=fnum(r.get("convenio_medico")), carga_horaria=fnum(r.get("carga_horaria_mensal"), 176) or 176)); n += 1
        for r in read("custos_fixos"):
            self.save("custos_fixos", dict(descricao=r.get("descricao", ""), valor=fnum(r.get("valor_mensal")))); n += 1
        for r in read("imobilizados"):
            self.save("imobilizado", dict(descricao=r.get("descricao", ""), valor=fnum(r.get("valor")),
                                          vida_util=fnum(r.get("vida_util_anos"), 10) or 10)); n += 1
        prev = {(r.get("tipo"), r.get("item_id")): fnum(r.get("previsao_vendas")) for r in read("simulacao")}
        for r in read("servicos"):
            srv_map[r.get("id")] = self.save("servicos", dict(
                nome=r.get("nome", ""), preco=fnum(r.get("preco_venda")), imposto_pct=fnum(r.get("imposto_pct")),
                cartao_pct=fnum(r.get("cartao_pct")), app_pct=fnum(r.get("aplicativo_pct")),
                comissao_pct=fnum(r.get("comissao_pct")), previsao=prev.get(("servico", r.get("id")), 0))); n += 1
        for r in read("revendas"):
            self.save("revenda", dict(
                nome=r.get("nome", ""), unidade=r.get("unidade", "Unidade"), qtde=fnum(r.get("quantidade_compra"), 1) or 1,
                custo=fnum(r.get("custo_compra")), preco=fnum(r.get("preco_venda")), imposto_pct=fnum(r.get("imposto_pct")),
                cartao_pct=fnum(r.get("cartao_pct")), app_pct=fnum(r.get("aplicativo_pct")),
                comissao_pct=fnum(r.get("comissao_pct")), previsao=prev.get(("revenda", r.get("id")), 0))); n += 1
        for r in read("ficha_mao_obra"):
            if r.get("servico_id") in srv_map and r.get("funcionario_id") in emp_map:
                self.save("ficha_mod", dict(servico_id=srv_map[r["servico_id"]], equipe_id=emp_map[r["funcionario_id"]],
                                            horas=fnum(r.get("horas"))))
        for r in read("ficha_insumos"):
            if r.get("servico_id") in srv_map and r.get("insumo_id") in ins_map:
                self.save("ficha_insumo", dict(servico_id=srv_map[r["servico_id"]], insumo_id=ins_map[r["insumo_id"]],
                                               quantidade=fnum(r.get("quantidade"))))
        return n
