# -*- coding: utf-8 -*-
"""Interface grafica do Precifica Desktop (customtkinter)."""
from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import traceback
from datetime import date, datetime
from pathlib import Path
from tkinter import filedialog

import customtkinter as ctk

from . import pdfs, seed
from .assets import ACRS_LOGO_PNG
from .core import (APP_AUTHOR, APP_NAME, APP_VERSION, data_dir, fnum, money, num, num_input, pct, pct_n, pdf_dir,
                   safe_div)
from .db import Database
from .engine import Engine
from .tutorial import CFG_KEY as TUTORIAL_KEY, Tutorial
from .widgets import (ACCENT, BG, BORDER, CARD, DANGER, F, FIELD, INK, INK2, MUTED, NAVY, NAVY_H, ON_PRIMARY, PRIMARY, PRIMARY_H,
                      SIDEBAR, SIDEBAR_H, SIDEBAR_MUTED, SIDEBAR_TXT, STEEL, SUBTLE, SUCCESS, KPI, Callout, DataTable, Page,
                      Toast, ListEditor,
                      ICON, ask, btn, card, confirm, info, kpi_grid, pick, screen_size, section_title, set_icon,
                      setup_ttk_style)

# ------------------------------------------------------------------ formatadores
M = lambda v: money(v)          # noqa: E731
M4 = lambda v: money(v, 4 if abs(fnum(v)) < 10 else 2)  # noqa: E731
N0 = lambda v: num(v, 0)        # noqa: E731
N2 = lambda v: num(v, 2)        # noqa: E731
PC = lambda v: pct(v)           # noqa: E731


def open_file(path):
    try:
        if sys.platform.startswith("win"):
            os.startfile(str(path))  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)])
    except Exception:
        pass


def ask_pdf_path(master, default_name):
    p = filedialog.asksaveasfilename(parent=master, title="Salvar PDF", defaultextension=".pdf",
                                     initialdir=str(pdf_dir()), initialfile=default_name,
                                     filetypes=[("Documento PDF", "*.pdf")])
    return p or None


def mc_tag(v):
    return "neg" if v < 0 else ("warn" if v < 0.2 else None)


def chart_canvas(master, w=6.4, h=2.8):
    from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
    from matplotlib.figure import Figure
    fig = Figure(figsize=(w, h), dpi=100)
    fig.patch.set_facecolor(CARD)
    cv = FigureCanvasTkAgg(fig, master=master)
    cv.get_tk_widget().configure(bg=CARD, highlightthickness=0, bd=0)
    return fig, cv


# ====================================================================== PAINEL
class DashboardPage(Page):
    title = "Painel"
    subtitle = "Visão geral do mês: quanto você vai faturar, quanto sobra e se os preços cobrem os custos."
    scroll = True

    def build(self):
        btn(self.actions, "Nova proposta", lambda: self.app.pages["Propostas"].new(), "secondary").pack(side="left", padx=4)
        btn(self.actions, "Relatório em PDF", lambda: self.app.show("Exportar PDF")).pack(side="left", padx=4)
        g = kpi_grid(self.body, 5)
        g.pack(fill="x", padx=10, pady=(4, 8))
        self.k_fat = KPI(g, "Faturamento previsto", sub="previsão de vendas do mês")
        self.k_mc = KPI(g, "Margem de contribuição", sub="o que sobra para pagar custos fixos", accent=PRIMARY)
        self.k_luc = KPI(g, "Lucro operacional", sub="depois de todos os custos", accent="#16A34A")
        self.k_pe = KPI(g, "Ponto de equilíbrio", sub="faturamento mínimo para não ter prejuízo", accent=STEEL)
        self.k_cap = KPI(g, "Capacidade vendida", sub="horas vendidas da equipe", accent=PRIMARY)
        for i, k in enumerate([self.k_fat, self.k_mc, self.k_luc, self.k_pe, self.k_cap]):
            k.grid(row=0, column=i, sticky="nsew", padx=5)
        self.callout = Callout(self.body)
        self.callout.pack(fill="x", padx=15, pady=(4, 10))

        row = ctk.CTkFrame(self.body, fg_color="transparent")
        row.pack(fill="x", padx=10)
        row.grid_columnconfigure(0, weight=3)
        row.grid_columnconfigure(1, weight=2)
        c1 = card(row)
        c1.grid(row=0, column=0, sticky="nsew", padx=5, pady=5)
        section_title(c1, "Resultado do mês", "Faturamento, custos e lucro previstos").pack(anchor="w", padx=18, pady=(14, 0))
        self.fig, self.cv = chart_canvas(c1, 6.6, 2.9)
        self.cv.get_tk_widget().pack(fill="both", expand=True, padx=10, pady=10)

        c2 = card(row)
        c2.grid(row=0, column=1, sticky="nsew", padx=5, pady=5)
        section_title(c2, "Primeiros passos", "Complete as etapas para ter preços confiáveis").pack(anchor="w", padx=18, pady=(14, 6))
        self.progress = ctk.CTkProgressBar(c2, progress_color=PRIMARY, fg_color="#E6E9EE", height=10)
        self.progress.pack(fill="x", padx=18, pady=(2, 8))
        self.steps = ctk.CTkFrame(c2, fg_color="transparent")
        self.steps.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        c3 = card(self.body)
        c3.pack(fill="both", expand=True, padx=15, pady=(6, 14))
        hdr = ctk.CTkFrame(c3, fg_color="transparent")
        hdr.pack(fill="x", padx=18, pady=(14, 4))
        section_title(hdr, "Seus preços estão saudáveis?",
                      "Preço atual comparado ao preço sugerido (que cobre custos, impostos, taxas e o lucro desejado). "
                      "Clique duas vezes para abrir a análise.").pack(side="left")
        self.table = DataTable(c3, [
            ("tipo_txt", "Tipo", 90, "w", None), ("nome", "Serviço / produto", 300, "w", None),
            ("preco", "Preço atual", 120, "e", M), ("sug", "Preço sugerido", 130, "e", M),
            ("mc_pct", "Margem contrib.", 120, "e", PC), ("situacao", "Situação", 260, "w", None)],
            height=8, on_double=self._open, stretch_col=1)
        self.table.pack(fill="both", expand=True, padx=12, pady=(4, 12))

    def _open(self, r):
        self.app.pages["Análise de preço"].open_item(r["tipo"], r["id"])

    def refresh(self):
        e = self.eng
        rel = e.relatorio()
        cap = e.capacidade()
        self.k_fat.set(money(rel["faturamento"]), f"{num(rel['qtd_servicos'], 0)} serviços previstos")
        self.k_mc.set(pct(rel["mc_pct"]), money(rel["mc"]) + " no mês")
        self.k_luc.set(money(rel["lucro"]), pct(rel["lucro_pct"]) + " do faturamento",
                       SUCCESS if rel["lucro"] >= 0 else DANGER)
        self.k_pe.set(money(rel["pe"]), "vender pelo menos isto no mês")
        self.k_cap.set(pct(cap["vendidas_pct"]), f"{num(cap['alocadas'], 0)} de {num(cap['efetivas_equipe'], 0)} h efetivas",
                       DANGER if cap["vendidas_pct"] > 1 else NAVY)
        self.callout.set(rel["analise"], rel["nivel"])
        # grafico
        self.fig.clear()
        ax = self.fig.add_subplot(111)
        labels = ["Faturamento", "Deduções", "Custos variáveis", "Custos fixos", "Lucro"]
        vals = [rel["faturamento"], rel["deducoes"], rel["cv"], rel["cf"], rel["lucro"]]
        cols = [PRIMARY, "#94A3B8", NAVY, STEEL, "#16A34A" if rel["lucro"] >= 0 else "#DC2626"]
        bars = ax.bar(labels, vals, color=cols, width=0.6)
        for b, v in zip(bars, vals):
            ax.annotate(money(v, 0), (b.get_x() + b.get_width() / 2, max(v, 0)), ha="center", va="bottom", fontsize=8,
                        xytext=(0, 2), textcoords="offset points", color=INK)
        ax.set_yticks([])
        for s in ("top", "right", "left"):
            ax.spines[s].set_visible(False)
        ax.spines["bottom"].set_color("#C9CFD8")
        ax.tick_params(axis="x", labelsize=8, colors=INK2)
        ax.set_facecolor(CARD)
        self.fig.tight_layout()
        self.cv.draw_idle()
        # checklist
        for w in self.steps.winfo_children():
            w.destroy()
        steps = e.checklist()
        done = sum(1 for _, ok, _ in steps if ok)
        self.progress.set(done / len(steps))
        for i, (txt, ok, page) in enumerate(steps, 1):
            r = ctk.CTkFrame(self.steps, fg_color="transparent")
            r.pack(fill="x", pady=3)
            ctk.CTkLabel(r, text="✓" if ok else str(i), width=28, height=28, corner_radius=14,
                         fg_color=PRIMARY if ok else "#E6E9EE", text_color=ON_PRIMARY if ok else INK2,
                         font=F(12, "bold")).pack(side="left", padx=(4, 10))
            ctk.CTkLabel(r, text=txt, font=F(13), text_color=MUTED if ok else INK, anchor="w").pack(side="left")
            if not ok:
                btn(r, "Abrir", lambda p=page: self.app.show(p), "ghost", width=64, height=28).pack(side="right")
        # tabela
        rows = []
        for it in e.itens():
            sug = e.preco_sugerido(it.tipo, it.id)
            if it.tipo == "servico" and not it.tem_ficha:
                sit, tag = "Sem ficha técnica (custo zerado)", "muted"
            elif it.preco <= 0:
                sit, tag = "Defina o preço atual", "warn"
            elif sug and it.preco < sug * 0.98:
                sit, tag = f"Abaixo do sugerido ({pct(safe_div(it.preco - sug, sug))})", "neg"
            elif it.mc < 0:
                sit, tag = "Prejuízo em cada venda", "neg"
            else:
                sit, tag = "Preço cobre os custos e o lucro", "good"
            rows.append(dict(id=it.id, tipo=it.tipo, tipo_txt="Serviço" if it.tipo == "servico" else "Revenda",
                             nome=it.nome, preco=it.preco, sug=sug, mc_pct=it.mc_pct, situacao=sit, _tag=tag))
        self.table.set_rows(rows, "Cadastre seus serviços em “Serviços e fichas”.")


# ====================================================================== INSUMOS
class InsumosPage(Page):
    title = "Insumos e preços de referência"
    subtitle = ("Materiais, deslocamento, terceiros e preços de mercado usados nas fichas técnicas. "
                "Já vem com 96 preços de referência de serviços elétricos levantados pela EG3 (Curitiba, set/2026).")
    FIELDS = [
        dict(key="descricao", label="Descrição", required=True, span=2),
        dict(key="unidade", label="Unidade de medida", kind="combo", options=seed.UNIDADES),
        dict(key="categoria", label="Categoria", kind="combo", options=["Material", "Mão de obra terceirizada",
                                                                         "Deslocamento", "Referência de mercado", "Outros"]),
        dict(key="custo", label="Custo pago (R$)", kind="money", required=True, min=0,
             help="Quanto você paga pela quantidade bruta."),
        dict(key="qtde_bruta", label="Quantidade bruta", kind="num", min=0,
             help="Quantidade comprada (ex.: rolo de 100 m)."),
        dict(key="qtde_liquida", label="Quantidade líquida (aproveitada)", kind="num", min=0,
             help="O que realmente é usado após perdas (ex.: 95 m)."),
        dict(key="obs", label="Observações", span=2),
    ]

    def build(self):
        btn(self.actions, "+ Novo insumo", self.new).pack(side="left", padx=4)
        bar = ctk.CTkFrame(self.body, fg_color="transparent")
        bar.pack(fill="x", pady=(0, 8))
        self.search = ctk.CTkEntry(bar, placeholder_text="Pesquisar insumo…", width=320, height=36, font=F(13),
                                   border_color=BORDER)
        self.search.pack(side="left")
        self.search.bind("<KeyRelease>", lambda e: self.table.set_filter(self.search.get()))
        for t, cmd, k in (("Excluir", self.delete, "danger"), ("Duplicar", self.dup, "secondary"),
                          ("Editar", self.edit, "secondary")):
            btn(bar, t, cmd, k, width=100).pack(side="right", padx=4)
        self.table = DataTable(self.body, [
            ("descricao", "Descrição", 330, "w", None), ("unidade", "Unidade", 120, "w", None),
            ("qtde_bruta", "Qtd bruta", 90, "e", N2), ("qtde_liquida", "Qtd líquida", 90, "e", N2),
            ("custo", "Custo pago", 110, "e", M), ("fator", "Fator perda", 90, "e", lambda v: num(v, 3)),
            ("custo_medida", "Custo por medida", 130, "e", M4), ("categoria", "Categoria", 170, "w", None)],
            height=18, on_double=lambda r: self.edit())
        self.table.pack(fill="both", expand=True)

    def refresh(self):
        rows = [self.eng.insumo_calc(r) for r in self.eng.insumos.values()]
        self.table.set_rows(rows, "Nenhum insumo cadastrado.")

    def new(self, values=None):
        v = ask(self, "Novo insumo", self.FIELDS, values or dict(unidade="Unidade", qtde_bruta=1, qtde_liquida=1,
                                                                 categoria="Material"),
                "O custo por medida é calculado assim: custo ÷ quantidade bruta × fator de perda.")
        if v:
            v["qtde_bruta"] = v["qtde_bruta"] or 1
            v["qtde_liquida"] = v["qtde_liquida"] or v["qtde_bruta"]
            self.db.save("insumos", v)
            self.app.changed("Insumo salvo")

    def edit(self):
        r = self.table.selected()
        if not r:
            return self.app.toast.show("Selecione um insumo", "warn")
        v = ask(self, "Editar insumo", self.FIELDS, r)
        if v:
            v["id"] = r["id"]
            v["qtde_bruta"] = v["qtde_bruta"] or 1
            v["qtde_liquida"] = v["qtde_liquida"] or v["qtde_bruta"]
            self.db.save("insumos", v)
            self.app.changed("Insumo atualizado")

    def dup(self):
        r = self.table.selected()
        if r:
            self.new(dict(r, descricao=r["descricao"] + " (cópia)"))

    def delete(self):
        r = self.table.selected()
        if r and confirm(self, "Excluir insumo", f"Excluir “{r['descricao']}”? Ele também sai das fichas técnicas.",
                         "Excluir", True):
            self.db.delete("insumos", r["id"])
            self.app.changed("Insumo excluído")


# ====================================================================== EQUIPE
class EquipePage(Page):
    title = "Equipe e pró-labore"
    subtitle = ("Cadastre quem trabalha na empresa, inclusive você (pró-labore). O custo-hora de cada pessoa entra "
                "na ficha técnica dos serviços.")
    FIELDS = [
        dict(key="nome", label="Nome", required=True),
        dict(key="cargo", label="Cargo / função"),
        dict(key="setor", label="Setor", kind="choice", options=seed.SETORES,
             help="Produtivo = executa serviços; Administrativo = entra nos custos fixos."),
        dict(key="contratacao", label="Contratação", kind="choice", options=seed.CONTRATACOES,
             help="CLT: encargos completos · Pró-labore: INSS · PJ/Estágio: sem encargos."),
        dict(key="salario", label="Salário / pró-labore (R$)", kind="money", required=True, min=0),
        dict(key="carga_horaria", label="Carga horária mensal (h)", kind="num", min=1),
        dict(key="vale_transporte", label="Vale-transporte (R$)", kind="money", min=0),
        dict(key="vale_refeicao", label="Vale-refeição (R$)", kind="money", min=0),
        dict(key="convenio", label="Convênio médico (R$)", kind="money", min=0),
    ]

    def build(self):
        btn(self.actions, "+ Novo colaborador", self.new).pack(side="left", padx=4)
        g = kpi_grid(self.body, 4)
        g.pack(fill="x", pady=(0, 10))
        self.k1 = KPI(g, "Custo total da folha")
        self.k2 = KPI(g, "Equipe produtiva", accent=PRIMARY)
        self.k3 = KPI(g, "Equipe administrativa", accent=STEEL)
        self.k4 = KPI(g, "Custo-hora médio produtivo", accent=PRIMARY)
        for i, k in enumerate((self.k1, self.k2, self.k3, self.k4)):
            k.grid(row=0, column=i, sticky="nsew", padx=(0 if i == 0 else 5, 0 if i == 3 else 5))
        bar = ctk.CTkFrame(self.body, fg_color="transparent")
        bar.pack(fill="x", pady=(0, 8))
        ctk.CTkLabel(bar, text="Os percentuais de encargos podem ser ajustados em Configurações › Encargos.",
                     font=F(12), text_color=MUTED).pack(side="left")
        for t, cmd, k in (("Excluir", self.delete, "danger"), ("Editar", self.edit, "secondary")):
            btn(bar, t, cmd, k, width=100).pack(side="right", padx=4)
        self.table = DataTable(self.body, [
            ("nome", "Nome", 200, "w", None), ("cargo", "Cargo", 130, "w", None), ("setor", "Setor", 110, "w", None),
            ("contratacao", "Contratação", 110, "w", None), ("salario", "Salário", 110, "e", M),
            ("encargos", "Encargos", 100, "e", M), ("beneficios", "Benefícios", 100, "e", M),
            ("total", "Custo total", 120, "e", M), ("carga_horaria", "Horas/mês", 80, "e", N0),
            ("valor_hora", "Valor/hora", 100, "e", M), ("custo_hora", "Custo-hora na ficha", 140, "e", M)],
            height=14, on_double=lambda r: self.edit())
        self.table.pack(fill="both", expand=True)

    def refresh(self):
        eq = self.eng.equipe_calc()
        rows = [dict(c, encargos=c["enc_sociais"] + c["enc_trab"]) for c in eq]
        self.table.set_rows(rows, "Cadastre você e sua equipe para calcular o custo da mão de obra.")
        prod = [c for c in eq if c.get("setor") == "Produtivo"]
        adm = [c for c in eq if c.get("setor") != "Produtivo"]
        self.k1.set(money(sum(c["total"] for c in eq)), f"{len(eq)} pessoa(s)")
        self.k2.set(money(sum(c["total"] for c in prod)), f"{len(prod)} pessoa(s) executando serviços")
        self.k3.set(money(sum(c["total"] for c in adm)), "vai para os custos fixos")
        media = safe_div(sum(c["custo_hora"] for c in prod), len(prod))
        self.k4.set(money(media), f"com produtividade de {pct(self.eng.produtividade())}")

    def new(self):
        v = ask(self, "Novo colaborador", self.FIELDS, dict(setor="Produtivo", contratacao="CLT", carga_horaria=176))
        if v:
            self.db.save("equipe", v)
            self.app.changed("Colaborador salvo")

    def edit(self):
        r = self.table.selected()
        if not r:
            return self.app.toast.show("Selecione um colaborador", "warn")
        v = ask(self, "Editar colaborador", self.FIELDS, r)
        if v:
            v["id"] = r["id"]
            self.db.save("equipe", v)
            self.app.changed("Colaborador atualizado")

    def delete(self):
        r = self.table.selected()
        if r and confirm(self, "Excluir colaborador", f"Excluir “{r['nome']}”? As horas dele saem das fichas técnicas.",
                         "Excluir", True):
            self.db.delete("equipe", r["id"])
            self.app.changed("Colaborador excluído")


# ====================================================================== CUSTOS FIXOS
class CustosFixosPage(Page):
    title = "Custos fixos e depreciação"
    subtitle = ("Despesas que existem mesmo sem vender (aluguel, contador, internet…). Elas são rateadas no preço "
                "de cada serviço proporcionalmente ao faturamento previsto.")
    scroll = True

    def build(self):
        g = kpi_grid(self.body, 4)
        g.pack(fill="x", padx=10, pady=(0, 10))
        self.k_tot = KPI(g, "Total de custos fixos", accent=NAVY)
        self.k_man = KPI(g, "Despesas lançadas", accent=PRIMARY)
        self.k_auto = KPI(g, "Pessoal adm. + ociosidade", accent=PRIMARY)
        self.k_dep = KPI(g, "Depreciação mensal", accent=STEEL)
        for i, k in enumerate((self.k_tot, self.k_man, self.k_auto, self.k_dep)):
            k.grid(row=0, column=i, sticky="nsew", padx=5)
        row = ctk.CTkFrame(self.body, fg_color="transparent")
        row.pack(fill="both", expand=True, padx=10)
        row.grid_columnconfigure((0, 1), weight=1, uniform="cf")
        c1 = card(row)
        c1.grid(row=0, column=0, sticky="nsew", padx=5, pady=5)
        h = ctk.CTkFrame(c1, fg_color="transparent")
        h.pack(fill="x", padx=16, pady=(14, 4))
        section_title(h, "Despesas mensais", "Duplo clique para informar o valor").pack(side="left")
        btn(h, "+ Despesa", self.new_cf, width=100).pack(side="right")
        self.t_cf = DataTable(c1, [("descricao", "Descrição", 260, "w", None), ("valor", "Valor mensal", 120, "e", M)],
                              height=16, on_double=self.edit_cf)
        self.t_cf.pack(fill="both", expand=True, padx=10, pady=4)
        b = ctk.CTkFrame(c1, fg_color="transparent")
        b.pack(fill="x", padx=12, pady=(0, 12))
        btn(b, "Excluir", self.del_cf, "danger", width=90).pack(side="right", padx=3)
        btn(b, "Editar", lambda: self.edit_cf(self.t_cf.selected()), "secondary", width=90).pack(side="right", padx=3)

        c2 = card(row)
        c2.grid(row=0, column=1, sticky="nsew", padx=5, pady=5)
        h = ctk.CTkFrame(c2, fg_color="transparent")
        h.pack(fill="x", padx=16, pady=(14, 4))
        section_title(h, "Calculados automaticamente", "Vêm da equipe e do imobilizado").pack(side="left")
        self.t_auto = DataTable(c2, [("descricao", "Descrição", 300, "w", None), ("valor", "Valor mensal", 120, "e", M)],
                                height=3)
        self.t_auto.pack(fill="x", padx=10, pady=4)
        h = ctk.CTkFrame(c2, fg_color="transparent")
        h.pack(fill="x", padx=16, pady=(12, 4))
        section_title(h, "Imobilizado (depreciação)", "Bens da empresa e sua vida útil").pack(side="left")
        btn(h, "+ Bem", self.new_im, width=80).pack(side="right")
        self.t_im = DataTable(c2, [("descricao", "Bem", 190, "w", None), ("valor", "Valor", 100, "e", M),
                                   ("vida_util", "Vida útil", 75, "e", lambda v: f"{num(v, 0)} anos"),
                                   ("taxa", "Taxa/ano", 75, "e", PC), ("mensal", "Por mês", 95, "e", M)],
                              height=8, on_double=self.edit_im)
        self.t_im.pack(fill="both", expand=True, padx=10, pady=4)
        b = ctk.CTkFrame(c2, fg_color="transparent")
        b.pack(fill="x", padx=12, pady=(0, 12))
        btn(b, "Excluir", self.del_im, "danger", width=90).pack(side="right", padx=3)
        btn(b, "Editar", lambda: self.edit_im(self.t_im.selected()), "secondary", width=90).pack(side="right", padx=3)

    def refresh(self):
        cf = self.eng.custos_fixos()
        self.k_tot.set(money(cf["total"]), f"rateio de {pct(self.eng.rateio_pct())} no preço")
        self.k_man.set(money(cf["manuais"]), "despesas desta tela")
        self.k_auto.set(money(cf["adm"] + cf["ociosidade"]),
                        f"ociosidade: {money(cf['ociosidade'])}")
        self.k_dep.set(money(cf["depreciacao"]))
        self.t_cf.set_rows(self.eng.cf_rows)
        self.t_auto.set_rows([dict(descricao=d, valor=v) for d, v, auto in cf["linhas"] if auto])
        self.t_im.set_rows(self.eng.depreciacao())

    CF_FIELDS = [dict(key="descricao", label="Descrição", required=True, span=2),
                 dict(key="valor", label="Valor mensal (R$)", kind="money", min=0)]
    IM_FIELDS = [dict(key="descricao", label="Bem / categoria", required=True, span=2),
                 dict(key="valor", label="Valor do bem (R$)", kind="money", min=0),
                 dict(key="vida_util", label="Vida útil (anos)", kind="num", min=0.1)]

    def new_cf(self):
        v = ask(self, "Nova despesa fixa", self.CF_FIELDS)
        if v:
            self.db.save("custos_fixos", v)
            self.app.changed("Despesa salva")

    def edit_cf(self, r):
        if not r:
            return
        v = ask(self, "Despesa fixa", self.CF_FIELDS, r)
        if v:
            v["id"] = r["id"]
            self.db.save("custos_fixos", v)
            self.app.changed("Despesa atualizada")

    def del_cf(self):
        r = self.t_cf.selected()
        if r and confirm(self, "Excluir despesa", f"Excluir “{r['descricao']}”?", "Excluir", True):
            self.db.delete("custos_fixos", r["id"])
            self.app.changed("Despesa excluída")

    def new_im(self):
        v = ask(self, "Novo bem", self.IM_FIELDS, dict(vida_util=5))
        if v:
            self.db.save("imobilizado", v)
            self.app.changed("Bem salvo")

    def edit_im(self, r):
        if not r:
            return
        v = ask(self, "Bem do imobilizado", self.IM_FIELDS, r)
        if v:
            v["id"] = r["id"]
            self.db.save("imobilizado", v)
            self.app.changed("Bem atualizado")

    def del_im(self):
        r = self.t_im.selected()
        if r and confirm(self, "Excluir bem", f"Excluir “{r['descricao']}”?", "Excluir", True):
            self.db.delete("imobilizado", r["id"])
            self.app.changed("Bem excluído")


# ====================================================================== CAPACIDADE
class CapacidadePage(Page):
    title = "Capacidade produtiva"
    subtitle = ("Quantas horas a equipe produtiva consegue vender no mês. Ninguém produz 100% do tempo: a "
                "produtividade desconta pausas, deslocamentos entre clientes, orçamentos e imprevistos.")
    scroll = True

    def build(self):
        row = ctk.CTkFrame(self.body, fg_color="transparent")
        row.pack(fill="x", padx=10)
        row.grid_columnconfigure(0, weight=2)
        row.grid_columnconfigure(1, weight=3)
        c = card(row)
        c.grid(row=0, column=0, sticky="nsew", padx=5, pady=5)
        section_title(c, "Parâmetros", "Valem para toda a equipe produtiva").pack(anchor="w", padx=18, pady=(16, 8))
        self.e = {}
        for key, label, hint in (("horas_dia", "Horas trabalhadas por dia", "sem almoço"),
                                 ("dias_mes", "Dias trabalhados no mês", "sem domingos e feriados")):
            f = ctk.CTkFrame(c, fg_color="transparent")
            f.pack(fill="x", padx=18, pady=4)
            ctk.CTkLabel(f, text=label, font=F(13, "bold"), text_color=INK2).pack(anchor="w")
            ctk.CTkLabel(f, text=hint, font=F(11), text_color=SUBTLE).pack(anchor="w")
            en = ctk.CTkEntry(f, height=34, font=F(13), border_color=BORDER)
            en.pack(fill="x", pady=(2, 0))
            self.e[key] = en
        f = ctk.CTkFrame(c, fg_color="transparent")
        f.pack(fill="x", padx=18, pady=(10, 4))
        self.lbl_prod = ctk.CTkLabel(f, text="Produtividade: 75%", font=F(13, "bold"), text_color=INK2)
        self.lbl_prod.pack(anchor="w")
        self.slider = ctk.CTkSlider(f, from_=30, to=100, number_of_steps=70, button_color=PRIMARY,
                                    progress_color=PRIMARY, command=lambda v: self.lbl_prod.configure(
                                        text=f"Produtividade: {int(v)}%"))
        self.slider.pack(fill="x", pady=6)
        btn(c, "Salvar parâmetros", self.save).pack(anchor="e", padx=18, pady=(8, 18))

        c2 = card(row)
        c2.grid(row=0, column=1, sticky="nsew", padx=5, pady=5)
        section_title(c2, "Resultado", "Calculado com a equipe produtiva e a previsão de vendas").pack(anchor="w", padx=18,
                                                                                                    pady=(16, 8))
        g = kpi_grid(c2, 2)
        g.pack(fill="x", padx=12)
        self.ks = {}
        for i, (k, t) in enumerate((("colaboradores", "Colaboradores produtivos"), ("horas_max", "Horas máximas da equipe"),
                                    ("efetivas_membro", "Horas efetivas por pessoa"), ("efetivas_equipe", "Horas efetivas da equipe"),
                                    ("alocadas", "Horas vendidas (previsão)"), ("ociosidade_pct", "Ociosidade"))):
            kp = KPI(g, t, accent=PRIMARY if i % 2 == 0 else STEEL)
            kp.grid(row=i // 2, column=i % 2, sticky="nsew", padx=5, pady=5)
            self.ks[k] = kp
        self.bar = ctk.CTkProgressBar(c2, height=14, progress_color=PRIMARY, fg_color="#E6E9EE")
        self.bar.pack(fill="x", padx=18, pady=(10, 4))
        self.callout = Callout(c2)
        self.callout.pack(fill="x", padx=18, pady=(6, 18))

    def refresh(self):
        e = self.eng
        for k in ("horas_dia", "dias_mes"):
            self.e[k].delete(0, "end")
            self.e[k].insert(0, num_input(e.c(k)))
        p = e.c("produtividade_pct", 75)
        self.slider.set(p)
        self.lbl_prod.configure(text=f"Produtividade: {int(round(p))}%")
        cap = e.capacidade()
        self.ks["colaboradores"].set(num(cap["colaboradores"], 0))
        self.ks["horas_max"].set(f"{num(cap['horas_max'], 0)} h")
        self.ks["efetivas_membro"].set(f"{num(cap['efetivas_membro'], 1)} h")
        self.ks["efetivas_equipe"].set(f"{num(cap['efetivas_equipe'], 1)} h")
        self.ks["alocadas"].set(f"{num(cap['alocadas'], 1)} h", f"{pct(cap['vendidas_pct'])} da capacidade")
        self.ks["ociosidade_pct"].set(pct(cap["ociosidade_pct"]))
        self.bar.set(min(1, cap["vendidas_pct"]))
        self.bar.configure(progress_color=DANGER if cap["vendidas_pct"] > 1 else PRIMARY)
        self.callout.set(cap["status"], cap["nivel"])

    def save(self):
        self.db.set_many(dict(horas_dia=fnum(self.e["horas_dia"].get(), 8), dias_mes=fnum(self.e["dias_mes"].get(), 22),
                              produtividade_pct=int(self.slider.get())))
        self.app.changed("Parâmetros salvos")


# ====================================================================== SERVICOS + FICHA TECNICA
class ServicosPage(Page):
    title = "Serviços e fichas técnicas"
    subtitle = ("Cadastre cada serviço e monte a ficha técnica: horas de mão de obra + insumos. "
                "O app calcula o custo direto e o preço sugerido na hora.")

    def build(self):
        btn(self.actions, "+ Novo serviço", self.new).pack(side="left", padx=4)
        self.body.grid_columnconfigure(1, weight=1)
        self.body.grid_rowconfigure(0, weight=1)
        left = card(self.body, width=330)
        left.grid(row=0, column=0, sticky="nsw", padx=(0, 10))
        self.search = ctk.CTkEntry(left, placeholder_text="Pesquisar serviço…", height=36, font=F(13),
                                   border_color=BORDER)
        self.search.pack(fill="x", padx=12, pady=(12, 6))
        self.search.bind("<KeyRelease>", lambda e: self.list.set_filter(self.search.get()))
        self.list = DataTable(left, [("nome", "Serviço", 210, "w", None), ("preco", "Preço", 90, "e", M)],
                              height=20, on_select=self._select)
        self.list.pack(fill="both", expand=True, padx=8)
        b = ctk.CTkFrame(left, fg_color="transparent")
        b.pack(fill="x", padx=10, pady=10)
        btn(b, "Duplicar", self.dup, "secondary", width=95).pack(side="left", padx=2)
        btn(b, "Excluir", self.delete, "danger", width=95).pack(side="left", padx=2)

        self.right = ctk.CTkScrollableFrame(self.body, fg_color=BG, corner_radius=0, scrollbar_button_color="#C9CFD8")
        self.right.grid(row=0, column=1, sticky="nsew")
        self.empty = ctk.CTkLabel(self.right, text="Selecione um serviço à esquerda ou clique em “+ Novo serviço”.",
                                  font=F(14), text_color=MUTED)
        self.detail = ctk.CTkFrame(self.right, fg_color="transparent")
        self._build_detail(self.detail)
        self.current = None

    def _build_detail(self, d):
        # resumo
        g = kpi_grid(d, 4)
        g.pack(fill="x", pady=(0, 8))
        self.k_custo = KPI(g, "Custo direto", accent=NAVY)
        self.k_mc = KPI(g, "Margem no preço atual", accent=PRIMARY)
        self.k_sug = KPI(g, "Preço sugerido", accent="#16A34A")
        self.k_h = KPI(g, "Horas de mão de obra", accent=PRIMARY)
        for i, k in enumerate((self.k_custo, self.k_mc, self.k_sug, self.k_h)):
            k.grid(row=0, column=i, sticky="nsew", padx=4)
        # dados
        c = card(d)
        c.pack(fill="x", pady=6, padx=4)
        h = ctk.CTkFrame(c, fg_color="transparent")
        h.pack(fill="x", padx=16, pady=(14, 4))
        section_title(h, "Dados e preço do serviço").pack(side="left")
        btn(h, "Ver análise completa", self.open_analysis, "ghost", width=150).pack(side="right")
        btn(h, "Usar preço sugerido", self.use_suggested, "secondary", width=150).pack(side="right", padx=4)
        grid = ctk.CTkFrame(c, fg_color="transparent")
        grid.pack(fill="x", padx=12, pady=(0, 6))
        for i in range(4):
            grid.grid_columnconfigure(i, weight=1, uniform="sv")
        self.f = {}
        specs = [("nome", "Nome do serviço", 2), ("unidade", "Unidade", 1), ("preco", "Preço atual (R$)", 1),
                 ("imposto_pct", "Impostos sobre vendas (%)", 1), ("cartao_pct", "Taxa da maquininha (%)", 1),
                 ("app_pct", "Taxa de aplicativo (%)", 1), ("comissao_pct", "Comissão (%)", 1),
                 ("previsao", "Previsão de vendas/mês", 1), ("descricao", "Descrição para propostas", 3)]
        r = col = 0
        for key, label, span in specs:
            if col + span > 4:
                r, col = r + 1, 0
            cell = ctk.CTkFrame(grid, fg_color="transparent")
            cell.grid(row=r, column=col, columnspan=span, sticky="ew", padx=6, pady=4)
            ctk.CTkLabel(cell, text=label, font=F(12, "bold"), text_color=INK2).pack(anchor="w")
            if key == "unidade":
                w = ctk.CTkComboBox(cell, values=["Serviço", "Unidade", "Metro", "Hora", "Ponto", "Diária", "Visita"],
                                    height=34, font=F(13), border_color=BORDER, button_color=PRIMARY)
            else:
                w = ctk.CTkEntry(cell, height=34, font=F(13), border_color=BORDER)
            w.pack(fill="x")
            self.f[key] = w
            col += span
            if col >= 4:
                r, col = r + 1, 0
        ctk.CTkLabel(c, text="Dica: no Simples Nacional (Anexo III) a alíquota inicial é 6%. Informe a alíquota efetiva "
                             "do seu enquadramento.", font=F(11), text_color=SUBTLE).pack(anchor="w", padx=18)
        btn(c, "Salvar dados do serviço", self.save).pack(anchor="e", padx=16, pady=(6, 14))
        # mao de obra
        c = card(d)
        c.pack(fill="x", pady=6, padx=4)
        h = ctk.CTkFrame(c, fg_color="transparent")
        h.pack(fill="x", padx=16, pady=(14, 4))
        section_title(h, "Mão de obra", "Quem executa e quantas horas leva (inclua o tempo no cliente)").pack(side="left")
        btn(h, "+ Adicionar", self.add_mod, width=110).pack(side="right")
        self.t_mod = DataTable(c, [("nome", "Colaborador", 220, "w", None), ("cargo", "Cargo", 150, "w", None),
                                   ("custo_hora", "Custo/hora", 110, "e", M), ("horas", "Horas", 80, "e", N2),
                                   ("total", "Custo total", 120, "e", M)], height=4, on_double=self.edit_mod)
        self.t_mod.pack(fill="x", padx=10, pady=4)
        b = ctk.CTkFrame(c, fg_color="transparent")
        b.pack(fill="x", padx=12, pady=(0, 12))
        btn(b, "Remover", lambda: self.del_line("ficha_mod", self.t_mod), "danger", width=90).pack(side="right", padx=3)
        btn(b, "Editar horas", lambda: self.edit_mod(self.t_mod.selected()), "secondary", width=110).pack(side="right", padx=3)
        # insumos
        c = card(d)
        c.pack(fill="x", pady=6, padx=4)
        h = ctk.CTkFrame(c, fg_color="transparent")
        h.pack(fill="x", padx=16, pady=(14, 4))
        section_title(h, "Insumos, materiais e terceiros",
                      "Itens do cadastro de insumos (inclusive deslocamento em km)").pack(side="left")
        btn(h, "+ Adicionar", self.add_ins, width=110).pack(side="right")
        self.t_ins = DataTable(c, [("descricao", "Insumo", 260, "w", None), ("unidade", "Medida", 110, "w", None),
                                   ("custo_unit", "Custo unitário", 110, "e", M4), ("quantidade", "Qtde", 80, "e", N2),
                                   ("total", "Custo total", 120, "e", M)], height=5, on_double=self.edit_ins)
        self.t_ins.pack(fill="x", padx=10, pady=4)
        b = ctk.CTkFrame(c, fg_color="transparent")
        b.pack(fill="x", padx=12, pady=(0, 12))
        btn(b, "Remover", lambda: self.del_line("ficha_insumo", self.t_ins), "danger", width=90).pack(side="right", padx=3)
        btn(b, "Editar quantidade", lambda: self.edit_ins(self.t_ins.selected()), "secondary", width=140).pack(side="right",
                                                                                                             padx=3)

    # ---------------------------------------------------------------- lista
    def refresh(self):
        rows = [dict(id=s["id"], nome=s["nome"], preco=fnum(s.get("preco"))) for s in self.eng.servicos]
        self.list.set_rows(rows, "Nenhum serviço")
        if self.current and not any(r["id"] == self.current for r in rows):
            self.current = None
        if self.current is None and rows:
            self.current = rows[0]["id"]
        if self.current:
            self.list.select_id(self.current)
            self.load(self.current)
        else:
            self.detail.pack_forget()
            self.empty.pack(pady=80)

    def _select(self, r):
        if r and r["id"] != self.current:
            self.current = r["id"]
            self.load(r["id"])

    def load(self, sid):
        s = next((x for x in self.eng.servicos if x["id"] == sid), None)
        if not s:
            return
        self.empty.pack_forget()
        self.detail.pack(fill="both", expand=True)
        for k, w in self.f.items():
            v = s.get(k)
            if k == "unidade":
                w.set(v or "Serviço")
                continue
            w.delete(0, "end")
            if k in ("nome", "descricao"):
                w.insert(0, v or "")
            else:
                w.insert(0, num_input(v))
        f = self.eng.ficha(sid)
        self.t_mod.set_rows(f["mod"], "Adicione quem executa o serviço")
        self.t_ins.set_rows(f["insumos"], "Adicione materiais, deslocamento ou terceiros")
        it = self.eng.item("servico", sid)
        sug = self.eng.preco_sugerido("servico", sid)
        self.k_custo.set(money(f["total"]), f"MO {money(f['custo_mod'])} + materiais {money(f['custo_md'])}")
        self.k_mc.set(pct(it.mc_pct) if it.preco else "—", money(it.mc) + " por serviço",
                      DANGER if it.mc < 0 else NAVY)
        self.k_sug.set(money(sug) if sug else "—", f"lucro de {pct_n(self.eng.c('lucro_desejado_pct', 15), 0)} "
                                                   f"+ rateio de {pct(self.eng.rateio_pct())}")
        self.k_h.set(f"{num(f['horas'], 2)} h", f"{num(f['horas'] * it.previsao, 1)} h no mês")

    # ---------------------------------------------------------------- acoes
    def new(self):
        v = ask(self, "Novo serviço", [
            dict(key="nome", label="Nome do serviço", required=True, span=2),
            dict(key="preco", label="Preço que você cobra hoje (R$)", kind="money", min=0,
                 help="Deixe 0 se ainda não sabe: use o preço sugerido."),
            dict(key="previsao", label="Quantos vende por mês", kind="num", min=0),
            dict(key="imposto_pct", label="Impostos sobre vendas (%)", kind="pct", min=0),
            dict(key="cartao_pct", label="Taxa da maquininha (%)", kind="pct", min=0),
        ], dict(imposto_pct=6, cartao_pct=0), "Depois monte a ficha técnica com mão de obra e insumos.")
        if v:
            self.current = self.db.save("servicos", v)
            self.app.changed("Serviço criado")

    def save(self):
        if not self.current:
            return
        nome = self.f["nome"].get().strip()
        if not nome:
            return self.app.toast.show("Informe o nome do serviço", "warn")
        row = dict(id=self.current, nome=nome, unidade=self.f["unidade"].get().strip() or "Serviço",
                   descricao=self.f["descricao"].get().strip())
        for k in ("preco", "imposto_pct", "cartao_pct", "app_pct", "comissao_pct", "previsao"):
            row[k] = max(0.0, fnum(self.f[k].get()))
        self.db.save("servicos", row)
        self.app.changed("Serviço salvo")

    def dup(self):
        r = self.list.selected()
        if not r:
            return
        s = dict(next(x for x in self.eng.servicos if x["id"] == r["id"]))
        sid0 = s.pop("id")
        s["nome"] += " (cópia)"
        nid = self.db.save("servicos", s)
        for l in self.db.all("ficha_mod", "servico_id = ?", (sid0,)):
            self.db.save("ficha_mod", dict(servico_id=nid, equipe_id=l["equipe_id"], horas=l["horas"]))
        for l in self.db.all("ficha_insumo", "servico_id = ?", (sid0,)):
            self.db.save("ficha_insumo", dict(servico_id=nid, insumo_id=l["insumo_id"], quantidade=l["quantidade"]))
        self.current = nid
        self.app.changed("Serviço duplicado")

    def delete(self):
        r = self.list.selected()
        if r and confirm(self, "Excluir serviço", f"Excluir “{r['nome']}” e a ficha técnica?", "Excluir", True):
            self.db.delete("servicos", r["id"])
            self.current = None
            self.app.changed("Serviço excluído")

    def use_suggested(self):
        if not self.current:
            return
        sug = self.eng.preco_sugerido("servico", self.current)
        if not sug:
            return self.app.toast.show("Monte a ficha técnica para calcular o preço sugerido", "warn")
        self.db.save("servicos", dict(id=self.current, preco=round(sug, 2)))
        self.app.changed(f"Preço atualizado para {money(sug)}")

    def open_analysis(self):
        if self.current:
            self.app.pages["Análise de preço"].open_item("servico", self.current)

    def add_mod(self):
        if not self.current:
            return
        if not self.eng.equipe:
            info(self, "Cadastre a equipe", "Antes, cadastre você e/ou seus colaboradores na tela “Equipe”.", "warn")
            return self.app.show("Equipe")
        rows = [dict(c, custo_hora=c["custo_hora"]) for c in self.eng.equipe_calc()]
        r = pick(self, "Escolha o colaborador", [("nome", "Nome", 240, "w", None), ("cargo", "Cargo", 160, "w", None),
                                                  ("setor", "Setor", 120, "w", None), ("custo_hora", "Custo/hora", 120, "e", M)],
                 rows, width=700)
        if not r:
            return
        v = ask(self, "Horas de mão de obra", [dict(key="horas", label=f"Horas de {r['nome']} neste serviço", kind="num",
                                                    required=True, min=0, help="Ex.: 1,5 = uma hora e meia")],
                dict(horas=1), width=460, ok_text="Adicionar")
        if v:
            self.db.save("ficha_mod", dict(servico_id=self.current, equipe_id=r["id"], horas=v["horas"]))
            self.app.changed("Mão de obra adicionada")

    def edit_mod(self, r):
        if not r:
            return
        v = ask(self, "Editar horas", [dict(key="horas", label=f"Horas de {r['nome']}", kind="num", required=True, min=0)],
                r, width=420)
        if v:
            self.db.save("ficha_mod", dict(id=r["id"], horas=v["horas"]))
            self.app.changed("Horas atualizadas")

    def add_ins(self):
        if not self.current:
            return
        rows = [self.eng.insumo_calc(r) for r in self.eng.insumos.values()]
        r = pick(self, "Escolha o insumo", [("descricao", "Descrição", 330, "w", None), ("unidade", "Unidade", 120, "w", None),
                                             ("custo_medida", "Custo por medida", 140, "e", M4)], rows,
                 "Digite para filtrar. Para um item novo, cadastre-o antes em “Insumos e preços”.", width=720)
        if not r:
            return
        v = ask(self, "Quantidade", [dict(key="quantidade", label=f"Quantidade de “{r['descricao']}” ({r['unidade']})",
                                          kind="num", required=True, min=0)], dict(quantidade=1), width=480,
                ok_text="Adicionar")
        if v:
            self.db.save("ficha_insumo", dict(servico_id=self.current, insumo_id=r["id"], quantidade=v["quantidade"]))
            self.app.changed("Insumo adicionado")

    def edit_ins(self, r):
        if not r:
            return
        v = ask(self, "Editar quantidade", [dict(key="quantidade", label=f"Quantidade ({r['unidade']})", kind="num",
                                                 required=True, min=0)], r, width=420)
        if v:
            self.db.save("ficha_insumo", dict(id=r["id"], quantidade=v["quantidade"]))
            self.app.changed("Quantidade atualizada")

    def del_line(self, table, dt):
        r = dt.selected()
        if r:
            self.db.delete(table, r["id"])
            self.app.changed("Item removido")


# ====================================================================== REVENDA
class RevendaPage(Page):
    title = "Produtos de revenda"
    subtitle = "Materiais que você compra e revende ao cliente (ex.: disjuntores, tomadas, luminárias)."
    FIELDS = [
        dict(key="nome", label="Produto", required=True, span=2),
        dict(key="unidade", label="Unidade de medida", kind="combo", options=seed.UNIDADES),
        dict(key="qtde", label="Quantidade comprada", kind="num", min=0, help="Ex.: caixa com 10 unidades"),
        dict(key="custo", label="Valor pago na compra (R$)", kind="money", min=0, help="Valor total pela quantidade"),
        dict(key="preco", label="Preço de venda unitário (R$)", kind="money", min=0),
        dict(key="imposto_pct", label="Impostos (%)", kind="pct", min=0),
        dict(key="cartao_pct", label="Maquininha (%)", kind="pct", min=0),
        dict(key="app_pct", label="Aplicativo (%)", kind="pct", min=0),
        dict(key="comissao_pct", label="Comissão (%)", kind="pct", min=0),
        dict(key="previsao", label="Previsão de vendas/mês", kind="num", min=0),
    ]

    def build(self):
        btn(self.actions, "+ Novo produto", self.new).pack(side="left", padx=4)
        bar = ctk.CTkFrame(self.body, fg_color="transparent")
        bar.pack(fill="x", pady=(0, 8))
        self.search = ctk.CTkEntry(bar, placeholder_text="Pesquisar produto…", width=320, height=36, font=F(13),
                                   border_color=BORDER)
        self.search.pack(side="left")
        self.search.bind("<KeyRelease>", lambda e: self.table.set_filter(self.search.get()))
        for t, cmd, k in (("Excluir", self.delete, "danger"), ("Editar", self.edit, "secondary")):
            btn(bar, t, cmd, k, width=100).pack(side="right", padx=4)
        self.table = DataTable(self.body, [
            ("nome", "Produto", 260, "w", None), ("unidade", "Unidade", 100, "w", None),
            ("custo_unit", "Custo unitário", 120, "e", M4), ("preco", "Preço de venda", 120, "e", M),
            ("deducoes", "Deduções", 100, "e", M), ("mc", "Margem contrib.", 120, "e", M),
            ("mc_pct", "MC %", 80, "e", PC), ("sug", "Preço sugerido", 120, "e", M), ("previsao", "Venda/mês", 90, "e", N0)],
            height=18, on_double=lambda r: self.edit())
        self.table.pack(fill="both", expand=True)

    def refresh(self):
        rows = []
        for r in self.eng.revendas:
            it = self.eng.item("revenda", r["id"])
            rows.append(dict(r, custo_unit=it.custo_md, deducoes=it.deducoes, mc=it.mc, mc_pct=it.mc_pct,
                             sug=self.eng.preco_sugerido("revenda", r["id"]), _tag=mc_tag(it.mc_pct) if it.preco else None))
        self.table.set_rows(rows, "Nenhum produto de revenda cadastrado.")

    def new(self):
        v = ask(self, "Novo produto de revenda", self.FIELDS, dict(unidade="Unidade", qtde=1, imposto_pct=6))
        if v:
            v["qtde"] = v["qtde"] or 1
            self.db.save("revenda", v)
            self.app.changed("Produto salvo")

    def edit(self):
        r = self.table.selected()
        if not r:
            return self.app.toast.show("Selecione um produto", "warn")
        v = ask(self, "Editar produto", self.FIELDS, r)
        if v:
            v["id"] = r["id"]
            v["qtde"] = v["qtde"] or 1
            self.db.save("revenda", v)
            self.app.changed("Produto atualizado")

    def delete(self):
        r = self.table.selected()
        if r and confirm(self, "Excluir produto", f"Excluir “{r['nome']}”?", "Excluir", True):
            self.db.delete("revenda", r["id"])
            self.app.changed("Produto excluído")


# ====================================================================== TABELA DE PRECOS
class TabelaPrecosPage(Page):
    title = "Tabela de preços"
    subtitle = ("Todos os itens com custo, deduções e margem de contribuição no preço atual. "
                "Vermelho = prejuízo; laranja = margem abaixo de 20%.")

    def build(self):
        btn(self.actions, "Exportar PDF", self.export, "secondary").pack(side="left", padx=4)
        self.seg = ctk.CTkSegmentedButton(self.body, values=["Serviços", "Revenda"], command=lambda v: self.refresh(),
                                          selected_color=PRIMARY, text_color=INK, selected_hover_color=PRIMARY_H, font=F(13),
                                          height=34)
        self.seg.set("Serviços")
        self.seg.pack(anchor="w", pady=(0, 10))
        self.table = DataTable(self.body, [
            ("nome", "Item", 250, "w", None), ("preco", "Preço atual", 110, "e", M),
            ("custo_mod", "Mão de obra", 105, "e", M), ("custo_md", "Materiais / CMV", 120, "e", M),
            ("cv", "Custo variável", 115, "e", M), ("deducoes", "Deduções", 100, "e", M),
            ("mc", "Margem contrib.", 120, "e", M), ("mc_pct", "MC %", 75, "e", PC),
            ("pct_cpv", "% custo", 75, "e", PC), ("sug", "Preço sugerido", 120, "e", M)],
            height=18, on_double=self._open)
        self.table.pack(fill="both", expand=True)
        self.note = ctk.CTkLabel(self.body, text="", font=F(12), text_color=MUTED)
        self.note.pack(anchor="w", pady=(8, 0))

    def _open(self, r):
        self.app.pages["Análise de preço"].open_item(r["tipo"], r["id"])

    def refresh(self):
        tipo = "servico" if self.seg.get() == "Serviços" else "revenda"
        rows = []
        for it in self.eng.itens(tipo):
            rows.append(dict(id=it.id, tipo=tipo, nome=it.nome, preco=it.preco, custo_mod=it.custo_mod, custo_md=it.custo_md,
                             cv=it.cv, deducoes=it.deducoes, mc=it.mc, mc_pct=it.mc_pct, pct_cpv=it.pct_cpv,
                             sug=self.eng.preco_sugerido(tipo, it.id), _tag=mc_tag(it.mc_pct) if it.preco else "muted"))
        self.table.set_rows(rows, "Nenhum item cadastrado.")
        self.note.configure(text=f"Preço sugerido = custo variável ÷ [1 − (deduções + rateio de custos fixos "
                                 f"{pct(self.eng.rateio_pct())} + lucro desejado "
                                 f"{pct_n(self.eng.c('lucro_desejado_pct', 15), 0)})]. Duplo clique abre a análise.")

    def export(self):
        p = ask_pdf_path(self, f"Tabela de preços {date.today():%Y-%m-%d}.pdf")
        if p:
            self.app.run_pdf(lambda: pdfs.relatorio_completo(self.eng, p, {"precos"}), p)


# ====================================================================== ANALISE
class AnalisePage(Page):
    title = "Análise de preço"
    subtitle = ("Simule descontos e descubra o preço ideal para o lucro que você deseja. "
                "À esquerda o preço praticado; à direita o preço sugerido.")
    scroll = True

    def build(self):
        btn(self.actions, "Exportar análise em PDF", self.export, "secondary").pack(side="left", padx=4)
        ctl = card(self.body)
        ctl.pack(fill="x", padx=10, pady=(0, 8))
        r = ctk.CTkFrame(ctl, fg_color="transparent")
        r.pack(fill="x", padx=16, pady=14)
        self.seg = ctk.CTkSegmentedButton(r, values=["Serviço", "Revenda"], command=lambda v: self._fill_items(),
                                          selected_color=PRIMARY, text_color=INK, selected_hover_color=PRIMARY_H, font=F(13), height=34)
        self.seg.set("Serviço")
        self.seg.pack(side="left")
        self.cmb = ctk.CTkComboBox(r, values=[""], width=360, height=34, font=F(13), border_color=BORDER,
                                   button_color=PRIMARY, command=lambda v: self.calc(), dropdown_font=F(13))
        self.cmb.pack(side="left", padx=12)
        self.e_desc = self._num(r, "Desconto (%)", "0")
        self.e_luc = self._num(r, "Lucro desejado (%)", "15")
        btn(r, "Calcular", self.calc, width=100).pack(side="left", padx=8)
        self.items = []
        self.callout = Callout(self.body)
        cols = ctk.CTkFrame(self.body, fg_color="transparent")
        cols.pack(fill="x", padx=10)
        cols.grid_columnconfigure((0, 1), weight=1, uniform="an")
        self.panels = []
        for i, (title, accent) in enumerate((("Preço praticado", NAVY), ("Preço sugerido", PRIMARY))):
            c = card(cols)
            c.grid(row=0, column=i, sticky="nsew", padx=5, pady=5)
            ctk.CTkFrame(c, height=5, fg_color=accent, corner_radius=3).pack(fill="x", padx=16, pady=(12, 0))
            t = ctk.CTkLabel(c, text=title.upper(), font=F(12, "bold"), text_color=MUTED)
            t.pack(anchor="w", padx=18, pady=(10, 0))
            big = ctk.CTkLabel(c, text="—", font=F(30, "bold"), text_color=accent)
            big.pack(anchor="w", padx=18)
            grid = ctk.CTkFrame(c, fg_color="transparent")
            grid.pack(fill="x", padx=14, pady=(6, 6))
            grid.grid_columnconfigure(0, weight=1)
            fig, cv = chart_canvas(c, 3.6, 2.6)
            cv.get_tk_widget().pack(fill="x", padx=10, pady=(0, 12))
            self.panels.append(dict(big=big, grid=grid, fig=fig, cv=cv))
        self.apply_btn = btn(self.body, "Aplicar o preço sugerido ao cadastro", self.apply)
        self.apply_btn.pack(anchor="e", padx=15, pady=(6, 14))

    def _num(self, parent, label, default):
        f = ctk.CTkFrame(parent, fg_color="transparent")
        f.pack(side="left", padx=6)
        ctk.CTkLabel(f, text=label, font=F(11, "bold"), text_color=MUTED).pack(anchor="w")
        e = ctk.CTkEntry(f, width=110, height=32, font=F(13), border_color=BORDER)
        e.insert(0, default)
        e.pack()
        e.bind("<Return>", lambda ev: self.calc())
        e.bind("<FocusOut>", lambda ev: self.calc())
        return e

    def _fill_items(self, select_id=None):
        tipo = "servico" if self.seg.get() == "Serviço" else "revenda"
        self.items = [(it.id, it.nome) for it in self.eng.itens(tipo)]
        names = [n for _, n in self.items] or ["(nenhum item cadastrado)"]
        self.cmb.configure(values=names)
        cur = self.cmb.get()
        if select_id is not None:
            cur = next((n for i, n in self.items if i == select_id), names[0])
        elif cur not in names:
            cur = names[0]
        self.cmb.set(cur)
        self.calc()

    def refresh(self):
        if not self.e_luc.get().strip() or getattr(self, "_first", True):
            self.e_luc.delete(0, "end")
            self.e_luc.insert(0, num_input(self.eng.c("lucro_desejado_pct", 15)))
            self._first = False
        self._fill_items()

    def open_item(self, tipo, id_):
        self.app.show("Análise de preço")
        self.seg.set("Serviço" if tipo == "servico" else "Revenda")
        self._fill_items(id_)

    def current(self):
        tipo = "servico" if self.seg.get() == "Serviço" else "revenda"
        nome = self.cmb.get()
        id_ = next((i for i, n in self.items if n == nome), None)
        return tipo, id_

    def calc(self):
        tipo, id_ = self.current()
        if id_ is None:
            for p in self.panels:
                p["big"].configure(text="—")
            return None
        a = self.eng.analise(tipo, id_, fnum(self.e_desc.get()), fnum(self.e_luc.get(), 15))
        self.last = a
        if a.aviso:
            self.callout.set(a.aviso, "warn")
            self.callout.pack(fill="x", padx=15, pady=(0, 8), before=self.panels[0]["big"].master.master)
        else:
            self.callout.pack_forget()
        cols = [(a.preco, a.linhas, a.mc, a.rateio, a.lucro, a.markup),
                (a.preco_sug, a.linhas_sug, a.mc_sug, a.rateio_sug, a.lucro_sug, a.markup_sug)]
        for idx, (p, linhas, mc, rat, luc, mk) in enumerate(cols):
            pnl = self.panels[idx]
            pnl["big"].configure(text=money(p) if (idx == 0 or a.viavel) else "inviável")
            g = pnl["grid"]
            for w in g.winfo_children():
                w.destroy()
            cv = sum(v for _, v, _ in linhas)
            rows = [("(−) Custos variáveis", cv, safe_div(cv, p), True)] + \
                   [("      " + n, v, pc, False) for n, v, pc in linhas] + \
                   [("(=) Margem de contribuição", mc, safe_div(mc, p), True),
                    ("(−) Rateio de custos fixos", rat, safe_div(rat, p), True),
                    ("(=) Margem de lucro", luc, safe_div(luc, p), True)]
            for r, (lab, v, pc, bold) in enumerate(rows):
                color = (DANGER if v < 0 else (SUCCESS if "lucro" in lab else INK)) if bold else INK2
                ctk.CTkLabel(g, text=lab, font=F(13, "bold" if bold else "normal"), text_color=INK if bold else MUTED,
                             anchor="w").grid(row=r, column=0, sticky="w")
                ctk.CTkLabel(g, text=money(v), font=F(13, "bold" if bold else "normal"), text_color=color,
                             anchor="e").grid(row=r, column=1, sticky="e", padx=10)
                ctk.CTkLabel(g, text=pct(pc), font=F(12), text_color=MUTED, width=60, anchor="e").grid(row=r, column=2,
                                                                                                       sticky="e")
            r = len(rows)
            ctk.CTkFrame(g, height=1, fg_color=BORDER).grid(row=r, column=0, columnspan=3, sticky="ew", pady=4)
            ctk.CTkLabel(g, text="Markup multiplicador", font=F(13, "bold"), text_color=INK).grid(row=r + 1, column=0,
                                                                                                  sticky="w")
            ctk.CTkLabel(g, text=num(mk, 3), font=F(13, "bold"), text_color=NAVY).grid(row=r + 1, column=1, sticky="e",
                                                                                       padx=10)
            self._donut(pnl, p, a.item.cv, sum(v for _, v, _ in linhas[-4:]), rat, luc)
        return a

    def _donut(self, pnl, p, cv, ded, rat, luc):
        fig = pnl["fig"]
        fig.clear()
        ax = fig.add_subplot(111)
        parts = [("Custos diretos", cv, NAVY), ("Deduções", ded, "#94A3B8"), ("Custos fixos", rat, STEEL),
                 ("Lucro", max(luc, 0), PRIMARY)]
        parts = [x for x in parts if x[1] > 0.0001]
        if parts and p > 0:
            ax.pie([x[1] for x in parts], colors=[x[2] for x in parts], startangle=90, counterclock=False,
                   wedgeprops=dict(width=0.36, edgecolor="white"),
                   autopct=lambda v: f"{v:.0f}%" if v >= 5 else "", pctdistance=0.82,
                   textprops=dict(color="white", fontsize=8, fontweight="bold"))
            ax.legend([x[0] for x in parts], loc="center left", bbox_to_anchor=(1.0, 0.5), fontsize=8, frameon=False)
        else:
            ax.text(0.5, 0.5, "Sem dados", ha="center", va="center", color=MUTED)
            ax.axis("off")
        ax.set_aspect("equal")
        fig.tight_layout()
        pnl["cv"].draw_idle()

    def apply(self):
        tipo, id_ = self.current()
        a = getattr(self, "last", None)
        if id_ is None or not a or not a.viavel or a.preco_sug <= 0:
            return self.app.toast.show("Não há preço sugerido válido", "warn")
        if confirm(self, "Aplicar preço sugerido", f"Alterar o preço de “{a.item.nome}” de {money(a.item.preco)} para "
                                                    f"{money(a.preco_sug)}?"):
            self.db.save("servicos" if tipo == "servico" else "revenda", dict(id=id_, preco=round(a.preco_sug, 2)))
            self.app.changed("Preço atualizado")

    def export(self):
        a = self.calc()
        if not a:
            return self.app.toast.show("Escolha um item", "warn")
        p = ask_pdf_path(self, f"Análise - {a.item.nome}.pdf".replace("/", "-"))
        if p:
            self.app.run_pdf(lambda: pdfs.analise_pdf(self.eng, a, p), p)


# ====================================================================== SIMULACAO
class SimulacaoPage(Page):
    title = "Simulação de vendas"
    subtitle = ("Informe quantas vezes por mês você vende cada serviço/produto. A previsão define o rateio dos custos "
                "fixos, o lucro do mês e as horas vendidas da equipe. Duplo clique na linha para alterar.")

    def build(self):
        g = kpi_grid(self.body, 5)
        g.pack(fill="x", pady=(0, 10))
        self.ks = [KPI(g, t, accent=a) for t, a in (("Faturamento", NAVY), ("Margem de contribuição", PRIMARY),
                                                   ("Custos fixos rateados", STEEL), ("Lucro do mês", "#16A34A"),
                                                   ("Markup médio", PRIMARY))]
        for i, k in enumerate(self.ks):
            k.grid(row=0, column=i, sticky="nsew", padx=(0 if i == 0 else 4, 0 if i == 4 else 4))
        bar = ctk.CTkFrame(self.body, fg_color="transparent")
        bar.pack(fill="x", pady=(0, 8))
        ctk.CTkLabel(bar, text="Quantidade/mês do item selecionado:", font=F(13), text_color=INK2).pack(side="left")
        self.e_q = ctk.CTkEntry(bar, width=100, height=34, font=F(13), border_color=BORDER)
        self.e_q.pack(side="left", padx=8)
        self.e_q.bind("<Return>", lambda e: self.apply_q())
        btn(bar, "Aplicar", self.apply_q, width=90).pack(side="left")
        btn(bar, "Zerar previsões", self.zero, "danger", width=130).pack(side="right")
        self.table = DataTable(self.body, [
            ("tipo_txt", "Tipo", 70, "w", None), ("nome", "Item", 210, "w", None), ("previsao", "Qtd/mês", 70, "e", N0),
            ("preco", "Preço", 90, "e", M), ("faturamento", "Faturamento", 105, "e", M), ("cv_total", "Custo variável", 105, "e", M),
            ("ded_total", "Deduções", 90, "e", M), ("mc_total", "Margem contrib.", 110, "e", M),
            ("rateio_cf", "Rateio CF", 95, "e", M), ("lucro", "Lucro", 100, "e", M), ("lucro_pct", "Lucro %", 70, "e", PC),
            ("markup", "Markup", 65, "e", N2), ("mix_pct", "% mix", 60, "e", PC)],
            height=16, on_double=self.edit, on_select=self._sel, stretch_col=1)
        self.table.pack(fill="both", expand=True)

    def _sel(self, r):
        if r and not r.get("_fixed"):
            self.e_q.delete(0, "end")
            self.e_q.insert(0, num_input(r["previsao"]))

    def refresh(self):
        rows = []
        for it in self.eng.itens():
            d = {k: getattr(it, k) for k in ("id", "tipo", "nome", "previsao", "preco", "faturamento", "cv_total", "ded_total",
                                             "mc_total", "rateio_cf", "lucro", "lucro_pct", "markup", "mix_pct")}
            d["tipo_txt"] = "Serviço" if it.tipo == "servico" else "Revenda"
            d["_tag"] = "muted" if not it.previsao else ("neg" if it.lucro < 0 else None)
            rows.append(d)
        t = self.eng.totais()
        if rows:
            rows.append(dict(id=None, tipo_txt="", nome="TOTAL", previsao=t["quantidade"], preco="", faturamento=t["faturamento"],
                             cv_total=t["cv"], ded_total=t["deducoes"], mc_total=t["mc"], rateio_cf=t["rateio"],
                             lucro=t["lucro"], lucro_pct=t["lucro_pct"], markup=t["markup"], mix_pct=1 if t["faturamento"] else 0,
                             _tag="total", _fixed=True))
        self.table.set_rows(rows, "Cadastre serviços ou produtos para simular.")
        self.ks[0].set(money(t["faturamento"]), f"{num(t['quantidade'], 0)} vendas no mês")
        self.ks[1].set(money(t["mc"]), pct(t["mc_pct"]))
        self.ks[2].set(money(t["rateio"]), f"{pct(self.eng.rateio_pct())} do faturamento")
        self.ks[3].set(money(t["lucro"]), pct(t["lucro_pct"]), SUCCESS if t["lucro"] >= 0 else DANGER)
        self.ks[4].set(num(t["markup"], 2), "faturamento ÷ custo variável")

    def _save_q(self, r, q):
        self.db.save("servicos" if r["tipo"] == "servico" else "revenda", dict(id=r["id"], previsao=max(0.0, q)))
        self.app.changed("Previsão atualizada")

    def apply_q(self):
        r = self.table.selected()
        if not r or r.get("_fixed"):
            return self.app.toast.show("Selecione um item da tabela", "warn")
        self._save_q(r, fnum(self.e_q.get()))

    def edit(self, r):
        if not r or r.get("_fixed"):
            return
        v = ask(self, "Previsão de vendas", [dict(key="previsao", label=f"Quantas vezes “{r['nome']}” é vendido por mês?",
                                                  kind="num", min=0, required=True)], r, width=480)
        if v:
            self._save_q(r, v["previsao"])

    def zero(self):
        if confirm(self, "Zerar previsões", "Zerar a previsão de vendas de todos os itens?", "Zerar", True):
            self.db.execute("UPDATE servicos SET previsao = 0")
            self.db.execute("UPDATE revenda SET previsao = 0")
            self.app.changed("Previsões zeradas")


# ====================================================================== RELATORIOS
class RelatoriosPage(Page):
    title = "Relatórios gerenciais"
    subtitle = "Resultado do mês, ponto de equilíbrio, ticket médio e uso da capacidade da equipe."
    scroll = True

    def build(self):
        btn(self.actions, "Exportar relatório completo (PDF)", lambda: self.app.show("Exportar PDF")).pack(side="left")
        ctl = card(self.body)
        ctl.pack(fill="x", padx=10, pady=(0, 8))
        r = ctk.CTkFrame(ctl, fg_color="transparent")
        r.pack(fill="x", padx=16, pady=12)
        ctk.CTkLabel(r, text="Lucro desejado no mês:", font=F(13, "bold"), text_color=INK2).pack(side="left")
        self.seg = ctk.CTkSegmentedButton(r, values=["% do faturamento", "Valor em R$"], selected_color=PRIMARY,
                                          selected_hover_color=PRIMARY_H, font=F(12), height=32)
        self.seg.pack(side="left", padx=10)
        self.e_l = ctk.CTkEntry(r, width=120, height=32, font=F(13), border_color=BORDER)
        self.e_l.pack(side="left")
        btn(r, "Salvar", self.save, width=90).pack(side="left", padx=8)
        g = kpi_grid(self.body, 4)
        g.pack(fill="x", padx=10, pady=(0, 8))
        self.k = [KPI(g, t, sub=s, accent=a) for t, s, a in (
            ("Ponto de equilíbrio", "faturamento para ficar no 0 a 0", STEEL),
            ("Ponto de equilíbrio econômico", "faturamento para ter o lucro desejado", PRIMARY),
            ("Ticket médio", "valor médio por serviço vendido", PRIMARY),
            ("Margem de segurança", "quanto as vendas podem cair até o PE", "#16A34A"))]
        for i, k in enumerate(self.k):
            k.grid(row=0, column=i, sticky="nsew", padx=5)
        self.callout = Callout(self.body)
        self.callout.pack(fill="x", padx=15, pady=(0, 8))
        row = ctk.CTkFrame(self.body, fg_color="transparent")
        row.pack(fill="x", padx=10)
        row.grid_columnconfigure(0, weight=2)
        row.grid_columnconfigure(1, weight=3)
        c1 = card(row)
        c1.grid(row=0, column=0, sticky="nsew", padx=5, pady=5)
        section_title(c1, "DRE gerencial do mês").pack(anchor="w", padx=18, pady=(14, 6))
        self.t_dre = DataTable(c1, [("n", "Demonstração", 230, "w", None), ("v", "Valor", 120, "e", M),
                                    ("p", "%", 70, "e", PC)], height=7)
        self.t_dre.pack(fill="x", padx=10, pady=(0, 12))
        c2 = card(row)
        c2.grid(row=0, column=1, sticky="nsew", padx=5, pady=5)
        section_title(c2, "Composição do faturamento").pack(anchor="w", padx=18, pady=(14, 0))
        self.fig, self.cv = chart_canvas(c2, 6.0, 2.7)
        self.cv.get_tk_widget().pack(fill="both", expand=True, padx=10, pady=10)
        c3 = card(self.body)
        c3.pack(fill="x", padx=15, pady=(6, 14))
        section_title(c3, "Capacidade produtiva").pack(anchor="w", padx=18, pady=(14, 4))
        self.cap_lbl = ctk.CTkLabel(c3, text="", font=F(13), text_color=INK2, justify="left", anchor="w")
        self.cap_lbl.pack(anchor="w", padx=18)
        self.cap_bar = ctk.CTkProgressBar(c3, height=12, progress_color=PRIMARY, fg_color="#E6E9EE")
        self.cap_bar.pack(fill="x", padx=18, pady=8)
        self.cap_call = Callout(c3)
        self.cap_call.pack(fill="x", padx=18, pady=(0, 16))

    def refresh(self):
        e = self.eng
        modo = e.cfg.get("lucro_modo", "pct")
        self.seg.set("Valor em R$" if modo == "valor" else "% do faturamento")
        self.e_l.delete(0, "end")
        self.e_l.insert(0, num_input(e.c("lucro_desejado_valor") if modo == "valor" else e.c("lucro_desejado_pct", 15)))
        rel = e.relatorio()
        self.k[0].set(money(rel["pe"]))
        self.k[1].set(money(rel["pe_econ"]), f"lucro desejado de {money(rel['lucro_desejado'])}")
        self.k[2].set(money(rel["ticket"]), f"{num(rel['qtd_servicos'], 0)} serviços no mês")
        self.k[3].set(pct(rel["margem_seguranca"]))
        self.callout.set(rel["analise"], rel["nivel"])
        rows = [dict(n=n, v=v, p=p, _tag="total" if n.startswith("(=) Lucro") else ("neg" if v < 0 else None))
                for n, v, p in rel["dre"]]
        self.t_dre.set_rows(rows)
        self.fig.clear()
        ax = self.fig.add_subplot(111)
        fat = rel["faturamento"]
        parts = [("Deduções", rel["deducoes"], "#94A3B8"), ("Custos variáveis", rel["cv"], PRIMARY),
                 ("Custos fixos", rel["cf"], STEEL), ("Lucro", max(0, rel["lucro"]), "#16A34A")]
        left = 0
        if fat > 0:
            for n, v, c in parts:
                w = v / fat
                ax.barh([0], [w], left=left, color=c, height=0.5, label=n)
                if w > 0.06:
                    ax.text(left + w / 2, 0, f"{w * 100:.0f}%", ha="center", va="center", color="white", fontsize=9,
                            fontweight="bold")
                left += w
            ax.set_xlim(0, max(1, left))
            ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.12), ncol=4, fontsize=8, frameon=False)
        else:
            ax.text(0.5, 0.5, "Informe a previsão de vendas", ha="center", va="center", color=MUTED)
        ax.axis("off")
        self.fig.tight_layout()
        self.cv.draw_idle()
        cap = e.capacidade()
        self.cap_lbl.configure(text=f"{num(cap['alocadas'], 1)} h vendidas de {num(cap['efetivas_equipe'], 1)} h efetivas "
                                    f"({pct(cap['vendidas_pct'])}) · ociosidade {pct(cap['ociosidade_pct'])}")
        self.cap_bar.set(min(1, cap["vendidas_pct"]))
        self.cap_call.set(cap["status"], cap["nivel"])

    def save(self):
        modo = "valor" if self.seg.get() == "Valor em R$" else "pct"
        v = fnum(self.e_l.get())
        self.db.set_many({"lucro_modo": modo, ("lucro_desejado_valor" if modo == "valor" else "lucro_desejado_pct"): v})
        self.app.changed("Lucro desejado salvo")


# ====================================================================== CONCORRENTES
class ConcorrentesPage(Page):
    title = "Análise de concorrentes"
    subtitle = ("Defina seu cliente-alvo e compare-se com a concorrência. Nota de 1 a 3: 1 = baixo valor agregado, "
                "2 = médio, 3 = alto. O fator de valor ajuda a justificar o seu preço.")
    scroll = True
    ITENS = ["Atendimento", "Qualidade da solução", "Pós-venda", "Localização (acesso)", "Relevância da marca",
             "Facilidade no pagamento"]

    def build(self):
        btn(self.actions, "Salvar", self.save).pack(side="left", padx=4)
        c = card(self.body)
        c.pack(fill="x", padx=10, pady=(0, 8))
        section_title(c, "Cliente-alvo", "Idade, renda, região, principais necessidades, objetivos, dúvidas e objeções "
                                         "de compra").pack(anchor="w", padx=18, pady=(14, 4))
        self.alvo = ctk.CTkTextbox(c, height=90, font=F(13), border_width=1, border_color=BORDER, fg_color=FIELD)
        self.alvo.pack(fill="x", padx=18, pady=(0, 16))
        c = card(self.body)
        c.pack(fill="x", padx=10, pady=8)
        section_title(c, "Diferencial competitivo").pack(anchor="w", padx=18, pady=(14, 8))
        g = ctk.CTkFrame(c, fg_color="transparent")
        g.pack(fill="x", padx=18, pady=(0, 16))
        g.grid_columnconfigure(0, weight=2)
        for j in range(4):
            g.grid_columnconfigure(j + 1, weight=1, uniform="cc")
        ctk.CTkLabel(g, text="ITEM AVALIADO", font=F(11, "bold"), text_color=MUTED).grid(row=0, column=0, sticky="w")
        self.emp = []
        for j in range(4):
            e = ctk.CTkEntry(g, height=32, font=F(12, "bold"), border_color=BORDER, justify="center")
            e.grid(row=0, column=j + 1, sticky="ew", padx=4)
            self.emp.append(e)
        self.notas = {}
        for i, it in enumerate(self.ITENS):
            ctk.CTkLabel(g, text=f"{i + 1}. {it}", font=F(13), text_color=INK).grid(row=i + 1, column=0, sticky="w", pady=3)
            for j in range(4):
                om = ctk.CTkOptionMenu(g, values=["—", "1", "2", "3"], height=30, font=F(13), fg_color="#F1F5F9",
                                       button_color="#E2E8F0", button_hover_color="#C9CFD8", text_color=INK,
                                       command=lambda v: self._update())
                om.grid(row=i + 1, column=j + 1, sticky="ew", padx=4, pady=3)
                self.notas[(i, j)] = om
        n = len(self.ITENS) + 1
        ctk.CTkLabel(g, text="PREÇO UNITÁRIO (R$)", font=F(12, "bold"), text_color=INK).grid(row=n, column=0, sticky="w", pady=6)
        self.precos = []
        for j in range(4):
            e = ctk.CTkEntry(g, height=32, font=F(13), border_color=BORDER, justify="center")
            e.grid(row=n, column=j + 1, sticky="ew", padx=4, pady=6)
            e.bind("<KeyRelease>", lambda ev: self._update())
            self.precos.append(e)
        ctk.CTkLabel(g, text="FATOR DE VALOR (soma)", font=F(12, "bold"), text_color=NAVY).grid(row=n + 1, column=0, sticky="w")
        ctk.CTkLabel(g, text="Preço por ponto de valor", font=F(12), text_color=MUTED).grid(row=n + 2, column=0, sticky="w")
        self.fat_lbl, self.ppp_lbl = [], []
        for j in range(4):
            a = ctk.CTkLabel(g, text="0", font=F(16, "bold"), text_color=NAVY)
            a.grid(row=n + 1, column=j + 1)
            b = ctk.CTkLabel(g, text="—", font=F(12), text_color=MUTED)
            b.grid(row=n + 2, column=j + 1)
            self.fat_lbl.append(a)
            self.ppp_lbl.append(b)
        self.callout = Callout(self.body, "Quanto menor o preço por ponto de valor, mais vantajosa é a oferta para o cliente. "
                                          "Se o seu fator de valor é maior, você pode cobrar mais que a concorrência.")
        self.callout.pack(fill="x", padx=15, pady=(4, 14))

    def _data(self):
        try:
            return json.loads(self.eng.cfg.get("concorrentes_json") or "{}")
        except ValueError:
            return {}

    def refresh(self):
        d = self._data()
        empresas = d.get("empresas") or ["Empresa A", "Empresa B", "Empresa C", "Sua empresa"]
        for j, e in enumerate(self.emp):
            e.delete(0, "end")
            e.insert(0, empresas[j] if j < len(empresas) else "")
        notas = d.get("notas") or {}
        for (i, j), om in self.notas.items():
            v = notas.get(f"{i}|{j}")
            om.set(str(int(fnum(v))) if v not in (None, "", 0) else "—")
        precos = d.get("precos") or {}
        for j, e in enumerate(self.precos):
            e.delete(0, "end")
            if precos.get(str(j)):
                e.insert(0, num_input(precos[str(j)]))
        self.alvo.delete("1.0", "end")
        self.alvo.insert("1.0", d.get("cliente_alvo", ""))
        self._update()

    def _collect(self):
        notas = {f"{i}|{j}": int(om.get()) for (i, j), om in self.notas.items() if om.get() != "—"}
        precos = {str(j): fnum(e.get()) for j, e in enumerate(self.precos) if e.get().strip()}
        return dict(empresas=[e.get().strip() or f"Empresa {j + 1}" for j, e in enumerate(self.emp)], itens=self.ITENS,
                    notas=notas, precos=precos, cliente_alvo=self.alvo.get("1.0", "end").strip())

    def _update(self):
        comp = Engine.concorrencia(self._collect())["empresas"]
        for j, c in enumerate(comp):
            self.fat_lbl[j].configure(text=num(c["fator"], 0))
            self.ppp_lbl[j].configure(text=money(c["preco_por_ponto"]) if c["preco_por_ponto"] else "—")

    def save(self):
        self.db.set_cfg("concorrentes_json", json.dumps(self._collect(), ensure_ascii=False))
        self.app.changed("Análise de concorrentes salva")


# ====================================================================== CLIENTES
CLIENTE_FIELDS = [
    dict(key="nome", label="Nome / razão social", required=True, span=2),
    dict(key="documento", label="CPF / CNPJ"), dict(key="telefone", label="Telefone"),
    dict(key="email", label="E-mail"), dict(key="contato", label="Pessoa de contato"),
    dict(key="endereco", label="Endereço", span=2), dict(key="complemento", label="Complemento"),
    dict(key="bairro", label="Bairro"), dict(key="cidade", label="Cidade"),
    dict(key="uf", label="UF", kind="combo", options=seed.UFS), dict(key="cep", label="CEP"),
    dict(key="obs", label="Observações", kind="textarea", span=2, height=60),
]


class ClientesPage(Page):
    title = "Clientes"
    subtitle = "Cadastro de clientes para preencher as propostas comerciais automaticamente."

    def build(self):
        btn(self.actions, "+ Novo cliente", self.new).pack(side="left", padx=4)
        bar = ctk.CTkFrame(self.body, fg_color="transparent")
        bar.pack(fill="x", pady=(0, 8))
        self.search = ctk.CTkEntry(bar, placeholder_text="Pesquisar cliente…", width=320, height=36, font=F(13),
                                   border_color=BORDER)
        self.search.pack(side="left")
        self.search.bind("<KeyRelease>", lambda e: self.table.set_filter(self.search.get()))
        btn(bar, "Excluir", self.delete, "danger", width=100).pack(side="right", padx=4)
        btn(bar, "Editar", self.edit, "secondary", width=100).pack(side="right", padx=4)
        btn(bar, "Nova proposta para o cliente", self.proposal, "secondary").pack(side="right", padx=4)
        self.table = DataTable(self.body, [
            ("nome", "Cliente", 260, "w", None), ("documento", "CPF/CNPJ", 150, "w", None),
            ("telefone", "Telefone", 140, "w", None), ("email", "E-mail", 220, "w", None),
            ("cidade", "Cidade", 140, "w", None), ("uf", "UF", 50, "center", None)], height=18,
            on_double=lambda r: self.edit())
        self.table.pack(fill="both", expand=True)

    def refresh(self):
        self.table.set_rows(self.db.all("clientes"), "Nenhum cliente cadastrado.")

    def new(self):
        v = ask(self, "Novo cliente", CLIENTE_FIELDS, dict(cidade=self.eng.cfg.get("empresa_cidade", ""),
                                                           uf=self.eng.cfg.get("empresa_uf", "")), width=680)
        if v:
            self.db.save("clientes", v)
            self.app.changed("Cliente salvo")

    def edit(self):
        r = self.table.selected()
        if not r:
            return self.app.toast.show("Selecione um cliente", "warn")
        v = ask(self, "Editar cliente", CLIENTE_FIELDS, r, width=680)
        if v:
            v["id"] = r["id"]
            self.db.save("clientes", v)
            self.app.changed("Cliente atualizado")

    def delete(self):
        r = self.table.selected()
        if r and confirm(self, "Excluir cliente", f"Excluir “{r['nome']}”? As propostas já emitidas são mantidas.",
                         "Excluir", True):
            self.db.delete("clientes", r["id"])
            self.app.changed("Cliente excluído")

    def proposal(self):
        r = self.table.selected()
        if not r:
            return self.app.toast.show("Selecione um cliente", "warn")
        self.app.pages["Propostas"].new(cliente=r)


# ====================================================================== PROPOSTAS
def _resumo(t, n=95):
    t = " ".join(str(t or "").split())
    return t if len(t) <= n else t[:n - 1] + "…"


AJUDA_TEXTO = ("Dica: use {empresa}, {validade_dias}, {numero}, {total} e {cliente} para o programa preencher sozinho  ·  "
               "**texto** fica em negrito  ·  uma linha em branco separa os parágrafos")

ESCOPO_FIELDS = [
    dict(key="titulo", label="Título da etapa", required=True, span=2,
         help="Ex.: Projeto Elétrico  ·  Aparece antes dos dois pontos: “Projeto Elétrico: descrição…”"),
    dict(key="texto", label="Descrição da etapa", kind="textarea", height=140, span=2),
    dict(key="topicos", label="Tópicos com seta ➢ (um por linha) – opcional", kind="textarea", height=110, span=2,
         help="Use para listar itens abaixo da descrição, como no escopo das instalações internas."),
]
SECAO_FIELDS = [
    dict(key="titulo", label="Título da seção", required=True, span=2,
         help="Aparece em negrito e sublinhado. Ex.: PREMISSAS TÉCNICAS, FORA DO ESCOPO, GARANTIA"),
    dict(key="texto", label="Texto", kind="textarea", height=230, span=2, help=AJUDA_TEXTO),
    dict(key="nova_pagina", label="Começar esta seção em uma nova página?", kind="choice", options=["Não", "Sim"], span=2),
]
PARCELA_FIELDS = [
    dict(key="rotulo", label="Nome da parcela", required=True, help="Ex.: Entrada, Parcela 2"),
    dict(key="valor", label="Valor (R$)", kind="money", min=0),
    dict(key="detalhe", label="Detalhe entre parênteses", span=2,
         help="Ex.: 30 dias após o aceite  ·  sai impresso como “Parcela 2: R$ 5.611,67 (30 dias após o aceite).”"),
]


def _secao_to_form(it):
    return {**it, "nova_pagina": "Sim" if it.get("nova_pagina") else "Não"}


def _secao_from_form(v):
    return {**v, "nova_pagina": v.get("nova_pagina") == "Sim"}


def modelo_textos(cfg: dict) -> dict:
    """Textos padrão das propostas: o modelo salvo pelo usuario ou, na falta dele, o que veio com o programa."""
    try:
        m = json.loads(cfg.get("proposta_modelo_json") or "")
    except ValueError:
        m = None
    m = m if isinstance(m, dict) else {}
    base = seed.MODELO_PROPOSTA
    return dict(escopo_intro=m.get("escopo_intro", base["escopo_intro"]),
                escopo_nota=m.get("escopo_nota", base["escopo_nota"]),
                secoes_pre=m.get("secoes_pre", base["secoes_pre"]), secoes_pos=m.get("secoes_pos", base["secoes_pos"]),
                fecho=m.get("fecho", seed.FECHO_PADRAO))


class ProposalEditor(ctk.CTkToplevel):
    CLI_KEYS = ["nome", "documento", "telefone", "email", "endereco", "complemento", "bairro", "cidade", "uf", "cep"]
    MODELOS = ["Modelos de texto…", "Aplicar os textos padrão", "Salvar estes textos como padrão",
               "Carregar o exemplo (Nº 787 – Obra Kitnets)"]

    def __init__(self, page, prop=None, itens=None, cliente=None):
        super().__init__(page)
        self.page, self.app, self.db = page, page.app, page.db
        self.withdraw()
        self.configure(fg_color=BG)
        self.prop = dict(prop or {})
        self.itens = [dict(i) for i in (itens or [])]
        self.saved = False
        num_ = int(fnum(self.prop.get("numero"))) or self.db.next_proposal_number()
        self.prop["numero"] = num_
        self.title(f"Proposta técnica e comercial nº {num_}")
        self.transient(page.winfo_toplevel())
        self.protocol("WM_DELETE_WINDOW", self.close)
        set_icon(self)
        cfg = self.app.engine.cfg
        self.cfg = cfg
        p = self.prop
        # textos padrao so entram em propostas novas e vazias (editar/duplicar mantem o que ja existe)
        novo = not p.get("id") and not any(p.get(k) for k in ("objeto", "escopo_intro", "escopo_json", "secoes_pre_json",
                                                              "secoes_pos_json"))
        mod = modelo_textos(cfg) if novo else {}
        js = pdfs._json
        escopo = js(p.get("escopo_json"), [])
        pre = js(p.get("secoes_pre_json"), []) or (mod.get("secoes_pre") or [])
        pos = js(p.get("secoes_pos_json"), []) or (mod.get("secoes_pos") or [])
        if not pos and (p.get("observacoes") or "").strip():          # proposta antiga: observacoes viram uma secao
            pos = [dict(titulo="OBSERVAÇÕES COMERCIAIS IMPORTANTES", texto=p["observacoes"])]
        parcelas = js(p.get("parcelas_json"), [])

        head = ctk.CTkFrame(self, fg_color="transparent")
        head.pack(fill="x", padx=22, pady=(14, 4))
        ctk.CTkLabel(head, text=f"Proposta técnica e comercial nº {num_}", font=F(20, "bold"),
                     text_color=INK).pack(side="left")
        self.o_modelo = ctk.CTkOptionMenu(head, values=self.MODELOS, command=self._modelo, width=250, height=32,
                                          font=F(13), fg_color=CARD, button_color=NAVY, button_hover_color=NAVY_H,
                                          text_color=INK, dropdown_font=F(13))
        self.o_modelo.set(self.MODELOS[0])
        self.o_modelo.pack(side="right")

        self.tabs = ctk.CTkTabview(self, fg_color=BG, segmented_button_fg_color="#E3E6EB",
                                   segmented_button_selected_color=PRIMARY, segmented_button_selected_hover_color=PRIMARY_H,
                                   segmented_button_unselected_color="#E3E6EB",
                                   segmented_button_unselected_hover_color="#D5D9E0", text_color=INK, border_width=0)
        self.tabs.pack(fill="both", expand=True, padx=12, pady=(0, 0))
        names = ["1  Dados e cliente", "2  Objetivo e escopo", "3  Textos da proposta", "4  Investimento e pagamento",
                 "5  Fechamento"]
        tabs = []
        for n in names:
            t = self.tabs.add(n)
            sf = ctk.CTkScrollableFrame(t, fg_color=BG, corner_radius=0, scrollbar_button_color="#C9CFD8")
            sf.pack(fill="both", expand=True)
            tabs.append(sf)
        self._tab_dados(tabs[0])
        self._tab_escopo(tabs[1], escopo, mod)
        self._tab_textos(tabs[2], pre, pos)
        self._tab_invest(tabs[3], parcelas)
        self._tab_fecho(tabs[4], mod)

        bar = ctk.CTkFrame(self, fg_color="transparent")
        bar.pack(fill="x", padx=22, pady=12)
        btn(bar, "Salvar e gerar PDF", lambda: self.save(pdf=True), width=170).pack(side="right")
        btn(bar, "Salvar", self.save, "navy", width=110).pack(side="right", padx=8)
        btn(bar, "Pré-visualizar PDF", self.preview, "secondary", width=160).pack(side="right")
        btn(bar, "Cancelar", self.close, "secondary", width=110).pack(side="left")

        self._load(cliente, mod)
        self.update_idletasks()
        top = page.winfo_toplevel()
        try:
            sw, sh = screen_size(self)
            w, hgt = min(1200, sw - 40), min(840, sh - 80)
            x = top.winfo_rootx() + max(0, (top.winfo_width() - w) // 2)
            y = top.winfo_rooty() + 10
            self.geometry(f"{w}x{hgt}+{x}+{y}")
        except Exception:
            self.geometry("1180x800")
        self.deiconify()
        self.after(100, self._grab)

    def _grab(self):
        try:
            self.grab_set()
            self.focus_force()
        except Exception:
            pass

    # ---------------------------------------------------------------- blocos de tela
    def _entry(self, parent, label, row, col, span=1):
        f = ctk.CTkFrame(parent, fg_color="transparent")
        f.grid(row=row * 2, column=col, columnspan=span, sticky="ew", padx=4, pady=2)
        ctk.CTkLabel(f, text=label, font=F(12, "bold"), text_color=INK2).pack(anchor="w")
        e = ctk.CTkEntry(f, height=32, font=F(13), border_color=BORDER, fg_color=FIELD)
        e.pack(fill="x")
        return e

    def _text(self, parent, label, height, help_=None, pady=(8, 0)):
        ctk.CTkLabel(parent, text=label, font=F(12, "bold"), text_color=INK2).pack(anchor="w", padx=16, pady=pady)
        if help_:
            ctk.CTkLabel(parent, text=help_, font=F(11), text_color=SUBTLE, anchor="w", justify="left",
                         wraplength=1000).pack(anchor="w", padx=16)
        t = ctk.CTkTextbox(parent, height=height, font=F(13), border_width=1, border_color=BORDER, fg_color=FIELD)
        t.pack(fill="x", padx=16)
        return t

    @staticmethod
    def _set_text(t, value):
        t.delete("1.0", "end")
        t.insert("1.0", value or "")

    def _tab_dados(self, tab):
        tab.grid_columnconfigure(0, weight=2)
        tab.grid_columnconfigure(1, weight=3)
        c = card(tab)
        c.grid(row=0, column=0, sticky="nsew", padx=6, pady=6)
        section_title(c, "Proposta", "Cabeçalho do documento: “PROPOSTA TÉCNICA E COMERCIAL: N° … - título”").pack(
            anchor="w", padx=16, pady=(14, 4))
        gd = ctk.CTkFrame(c, fg_color="transparent")
        gd.pack(fill="x", padx=12)
        gd.grid_columnconfigure((0, 1), weight=1)
        self.e_num = self._entry(gd, "Nº da proposta", 0, 0)
        self.e_data = self._entry(gd, "Data (dd/mm/aaaa)", 0, 1)
        self.e_val = self._entry(gd, "Validade (dias)", 1, 0)
        sf = ctk.CTkFrame(gd, fg_color="transparent")
        sf.grid(row=2, column=1, sticky="ew", padx=4, pady=2)
        ctk.CTkLabel(sf, text="Situação", font=F(12, "bold"), text_color=INK2).pack(anchor="w")
        self.o_status = ctk.CTkOptionMenu(sf, values=seed.STATUS_PROPOSTA, height=32, font=F(13), fg_color=FIELD,
                                          text_color=INK, button_color=PRIMARY, button_hover_color=PRIMARY_H)
        self.o_status.pack(fill="x")
        self.e_titulo = self._entry(gd, "Título (ex.: Projeto e Execução Elétrica - Obra Kitnets)", 2, 0, 2)
        self.e_ac = self._entry(gd, "A/C. – aos cuidados de", 3, 0, 2)
        ctk.CTkFrame(c, height=10, fg_color="transparent").pack()

        c1 = card(tab)
        c1.grid(row=0, column=1, sticky="nsew", padx=6, pady=6)
        h = ctk.CTkFrame(c1, fg_color="transparent")
        h.pack(fill="x", padx=16, pady=(14, 2))
        section_title(h, "Cliente").pack(side="left")
        btn(h, "Escolher do cadastro", self.choose_client, "ghost", width=150).pack(side="right")
        gc = ctk.CTkFrame(c1, fg_color="transparent")
        gc.pack(fill="x", padx=12, pady=(0, 6))
        gc.grid_columnconfigure((0, 1), weight=1)
        labels = dict(nome="Nome / razão social", documento="CPF / CNPJ", telefone="Telefone", email="E-mail",
                      endereco="Endereço", complemento="Complemento", bairro="Bairro", cidade="Cidade", uf="UF", cep="CEP")
        self.cli = {}
        pos = [("nome", 0, 0, 2), ("documento", 1, 0, 1), ("telefone", 1, 1, 1), ("email", 2, 0, 2), ("endereco", 3, 0, 2),
               ("complemento", 4, 0, 1), ("bairro", 4, 1, 1), ("cidade", 5, 0, 1), ("uf", 5, 1, 1), ("cep", 6, 0, 1)]
        for k, r, col, span in pos:
            self.cli[k] = self._entry(gc, labels[k], r, col, span)
        self.chk_save = ctk.CTkCheckBox(c1, text="Salvar / atualizar no cadastro de clientes", font=F(12), fg_color=PRIMARY,
                                        hover_color=PRIMARY_H, checkmark_color=ON_PRIMARY)
        self.chk_save.pack(anchor="w", padx=16, pady=(4, 16))

    def _tab_escopo(self, tab, escopo, mod):
        c = card(tab)
        c.pack(fill="x", padx=6, pady=6)
        section_title(c, "Objetivo", "Resumo do que está sendo contratado (parágrafo logo abaixo de “OBJETIVO”).").pack(
            anchor="w", padx=16, pady=(14, 0))
        self.t_objeto = self._text(c, "Texto do objetivo", 110, pady=(4, 0))
        ctk.CTkFrame(c, height=12, fg_color="transparent").pack()
        c = card(tab)
        c.pack(fill="x", padx=6, pady=6)
        section_title(c, "Escopo dos serviços", "Cada etapa sai impressa como “Título: descrição”; os tópicos saem com "
                                                 "uma seta ➢ abaixo da etapa.").pack(anchor="w", padx=16, pady=(14, 0))
        self.t_intro = self._text(c, "Frase de introdução", 52, pady=(6, 0))
        ctk.CTkLabel(c, text="Etapas", font=F(12, "bold"), text_color=INK2).pack(anchor="w", padx=16, pady=(10, 2))
        self.l_escopo = ListEditor(
            c, escopo, ESCOPO_FIELDS, [("n", "#", 40, "center", None), ("titulo", "Etapa", 300, "w", None),
                                       ("resumo", "Descrição", 520, "w", None), ("topicos", "Tópicos", 70, "e", None)],
            lambda it: dict(titulo=it.get("titulo", ""), resumo=_resumo(it.get("texto")),
                            topicos=len([t for t in str(it.get("topicos") or "").split("\n") if t.strip()]) or ""),
            dialog_title="etapa do escopo", height=7, add_text="+ Adicionar etapa", stretch_col=2,
            subtitle="Dica: **texto** fica em negrito. Campos {empresa} e {numero} são preenchidos automaticamente.",
            empty_text="Nenhuma etapa. Clique em “+ Adicionar etapa”.")
        self.l_escopo.pack(fill="x", padx=14, pady=(0, 6))
        self.t_nota = self._text(c, "Nota final do escopo", 56, pady=(6, 0))
        ctk.CTkFrame(c, height=12, fg_color="transparent").pack()

    def _tab_textos(self, tab, pre, pos):
        c = card(tab)
        c.pack(fill="x", padx=6, pady=6)
        section_title(c, "Seções antes do Investimento",
                      "Documentos considerados, premissas, fora do escopo, responsabilidades, prazo… Cada seção vira um "
                      "título sublinhado seguido do texto. Seções sem texto não saem no PDF.").pack(anchor="w", padx=16,
                                                                                                   pady=(14, 4))
        cols = [("n", "#", 40, "center", None), ("titulo", "Título", 330, "w", None), ("resumo", "Texto", 480, "w", None),
                ("np", "Nova pág.", 80, "center", None)]
        fn = lambda it: dict(titulo=it.get("titulo", ""), resumo=_resumo(it.get("texto")),  # noqa: E731
                             np="sim" if it.get("nova_pagina") else "")
        kw = dict(dialog_title="seção de texto", height=8, defaults=dict(titulo="", texto="", nova_pagina=False),
                  to_form=_secao_to_form, from_form=_secao_from_form, stretch_col=2, width=820,
                  empty_text="Nenhuma seção. Clique em “+ Adicionar seção”.")
        self.l_pre = ListEditor(c, pre, SECAO_FIELDS, cols, fn, add_text="+ Adicionar seção", **kw)
        self.l_pre.pack(fill="x", padx=14, pady=(0, 14))
        c = card(tab)
        c.pack(fill="x", padx=6, pady=6)
        section_title(c, "Seções depois das condições de pagamento",
                      "Validade da proposta, garantia, observações comerciais importantes… (saem logo abaixo de "
                      "“CONDIÇÕES DE PAGAMENTO”).").pack(anchor="w", padx=16, pady=(14, 4))
        self.l_pos = ListEditor(c, pos, SECAO_FIELDS, cols, fn, add_text="+ Adicionar seção", **kw)
        self.l_pos.pack(fill="x", padx=14, pady=(0, 14))

    def _tab_invest(self, tab, parcelas):
        c2 = card(tab)
        c2.pack(fill="x", padx=6, pady=6)
        h = ctk.CTkFrame(c2, fg_color="transparent")
        h.pack(fill="x", padx=16, pady=(14, 4))
        section_title(h, "Investimento", "Tabela cinza do PDF: item, descrição e valor.").pack(side="left")
        bb = ctk.CTkFrame(c2, fg_color="transparent")
        bb.pack(fill="x", padx=12, pady=(0, 4))
        btn(bb, "+ Do catálogo", self.add_catalog, width=120).pack(side="left", padx=3)
        btn(bb, "+ Item livre", self.add_free, "secondary", width=110).pack(side="left", padx=3)
        btn(bb, "Editar", self.edit_item, "secondary", width=80).pack(side="left", padx=3)
        btn(bb, "Remover", self.del_item, "danger", width=90).pack(side="left", padx=3)
        btn(bb, "▲", lambda: self.move(-1), "secondary", width=36).pack(side="left", padx=(10, 2))
        btn(bb, "▼", lambda: self.move(1), "secondary", width=36).pack(side="left", padx=2)
        self.t = DataTable(c2, [("n", "#", 40, "center", None), ("descricao", "Descrição", 520, "w", None),
                                ("qtd", "Qtd", 80, "e", None), ("valor_unit", "Valor unit.", 110, "e", M),
                                ("total", "Valor", 110, "e", M)], height=7, on_double=lambda r: self.edit_item(), stretch_col=1)
        self.t.pack(fill="x", padx=10, pady=4)
        tot = ctk.CTkFrame(c2, fg_color="transparent")
        tot.pack(fill="x", padx=16, pady=(4, 2))
        ctk.CTkLabel(tot, text="Desconto (R$)", font=F(12, "bold"), text_color=INK2).pack(side="left")
        self.e_desc = ctk.CTkEntry(tot, width=110, height=32, font=F(13), border_color=BORDER)
        self.e_desc.pack(side="left", padx=8)
        self.e_desc.bind("<KeyRelease>", lambda e: self.update_totals())
        self.lbl_tot = ctk.CTkLabel(tot, text="", font=F(20, "bold"), text_color=NAVY)
        self.lbl_tot.pack(side="right")
        self.lbl_sub = ctk.CTkLabel(c2, text="", font=F(12), text_color=MUTED)
        self.lbl_sub.pack(anchor="e", padx=16)
        self.chk_pag = ctk.CTkCheckBox(c2, text="Começar o INVESTIMENTO em uma nova página (como no modelo)", font=F(12),
                                       fg_color=PRIMARY, hover_color=PRIMARY_H, checkmark_color=ON_PRIMARY)
        self.chk_pag.pack(anchor="w", padx=16, pady=(6, 14))

        c3 = card(tab)
        c3.pack(fill="x", padx=6, pady=6)
        h = ctk.CTkFrame(c3, fg_color="transparent")
        h.pack(fill="x", padx=16, pady=(14, 0))
        section_title(h, "Condições de pagamento",
                      "Cada parcela sai como “Entrada: R$ 7.000,00 (no aceite da proposta).”").pack(side="left")
        btn(h, "Gerar entrada + parcelas…", self.gen_parcelas, "secondary", width=200).pack(side="right")
        self.l_parc = ListEditor(
            c3, parcelas, PARCELA_FIELDS, [("n", "#", 40, "center", None), ("rotulo", "Parcela", 150, "w", None),
                                           ("valor", "Valor", 120, "e", M), ("detalhe", "Detalhe", 520, "w", None)],
            lambda it: dict(rotulo=it.get("rotulo", ""), valor=fnum(it.get("valor")), detalhe=it.get("detalhe", "")),
            dialog_title="parcela", height=5, add_text="+ Adicionar parcela", stretch_col=3, width=640,
            defaults=dict(rotulo="Parcela", valor=0, detalhe=""), on_change=self._parc_info,
            empty_text="Sem parcelas. Use “Gerar entrada + parcelas…” ou “+ Adicionar parcela”.")
        self.l_parc.pack(fill="x", padx=14, pady=(6, 2))
        self.lbl_parc = ctk.CTkLabel(c3, text="", font=F(12), text_color=MUTED)
        self.lbl_parc.pack(anchor="e", padx=16)
        self.t_det = self._text(c3, "Texto livre de pagamento (opcional – só sai se não houver parcelas)", 56,
                                pady=(6, 0))
        ctk.CTkFrame(c3, height=14, fg_color="transparent").pack()

    def _tab_fecho(self, tab, mod):
        c = card(tab)
        c.pack(fill="x", padx=6, pady=6)
        section_title(c, "Fechamento e assinaturas",
                      "Última página: frase de despedida, linha “Aprovo as condições acima descritas em __/__/__ e "
                      "assinamos:” (fixa) e as duas linhas de assinatura.").pack(anchor="w", padx=16, pady=(14, 0))
        self.t_fecho = self._text(c, "Frase de fechamento", 56, pady=(6, 0))
        g = ctk.CTkFrame(c, fg_color="transparent")
        g.pack(fill="x", padx=12, pady=(8, 16))
        g.grid_columnconfigure((0, 1), weight=1)
        self.e_ass1 = self._entry(g, "1ª assinatura – cliente (ex.: Tiago Santos (Resp.))", 0, 0)
        self.e_ass2 = self._entry(g, "2ª assinatura – empresa (ex.: Fulano de Tal (Administrativo))", 0, 1)

    # ---------------------------------------------------------------- valores iniciais
    def _load(self, cliente, mod):
        p, cfg = self.prop, self.cfg
        try:
            d = datetime.strptime(p.get("data") or "", "%Y-%m-%d").date()
        except ValueError:
            d = date.today()
        self.e_num.insert(0, str(int(fnum(p.get("numero")))))
        self.e_data.insert(0, f"{d:%d/%m/%Y}")
        self.e_val.insert(0, str(int(fnum(p.get("validade_dias"), fnum(cfg.get("proposta_validade_dias"), 30)))))
        self.o_status.set(p.get("status") or "Rascunho")
        self.e_titulo.insert(0, p.get("titulo") or "")
        self.e_ac.insert(0, p.get("aos_cuidados") or "")
        if cliente:
            for k in self.CLI_KEYS:
                self.cli[k].insert(0, cliente.get(k) or "")
            self.prop["cliente_id"] = cliente.get("id")
            if not self.e_ac.get():
                self.e_ac.insert(0, cliente.get("contato") or cliente.get("nome") or "")
        else:
            for k in self.CLI_KEYS:
                self.cli[k].insert(0, p.get(f"cliente_{k}") or "")
        if not p.get("id") and not cliente:
            if not self.cli["cidade"].get():
                self.cli["cidade"].insert(0, cfg.get("empresa_cidade", ""))
            if not self.cli["uf"].get():
                self.cli["uf"].insert(0, cfg.get("empresa_uf", ""))
            self.chk_save.select()
        self._set_text(self.t_objeto, p.get("objeto"))
        self._set_text(self.t_intro, p.get("escopo_intro") or mod.get("escopo_intro"))
        self._set_text(self.t_nota, p.get("escopo_nota") or mod.get("escopo_nota"))
        self.e_desc.insert(0, num_input(p.get("desconto_valor") or 0))
        if int(fnum(p.get("invest_nova_pagina"), 1)) or not p.get("id"):
            self.chk_pag.select()
        self._set_text(self.t_det, p.get("detalhes_pagamento"))
        self._set_text(self.t_fecho, p.get("fecho") or mod.get("fecho") or "")
        self.e_ass1.insert(0, p.get("assinatura1") or "")
        self.e_ass2.insert(0, p.get("assinatura2") or (cfg.get("proposta_assinante_empresa", "") if not p.get("id") else ""))
        self.refresh_items()
        self._parc_info()

    # ---------------------------------------------------------------- modelos de texto
    def _modelo(self, escolha):
        self.o_modelo.set(self.MODELOS[0])
        if escolha == self.MODELOS[1]:
            if confirm(self, "Aplicar os textos padrão", "Substituir a introdução, a nota do escopo, as seções de texto e o "
                       "fechamento pelos textos padrão? O objetivo, as etapas do escopo, os itens e as parcelas não mudam.",
                       "Aplicar"):
                m = modelo_textos(self.cfg)
                self._set_text(self.t_intro, m["escopo_intro"])
                self._set_text(self.t_nota, m["escopo_nota"])
                self._set_text(self.t_fecho, m["fecho"])
                self.l_pre.set(m["secoes_pre"])
                self.l_pos.set(m["secoes_pos"])
        elif escolha == self.MODELOS[2]:
            modelo = dict(escopo_intro=self.t_intro.get("1.0", "end").strip(), escopo_nota=self.t_nota.get("1.0", "end").strip(),
                          fecho=self.t_fecho.get("1.0", "end").strip(), secoes_pre=self.l_pre.get(),
                          secoes_pos=self.l_pos.get())
            self.db.set_cfg("proposta_modelo_json", json.dumps(modelo, ensure_ascii=False))
            if self.e_ass2.get().strip():
                self.db.set_cfg("proposta_assinante_empresa", self.e_ass2.get().strip())
            self.app.engine.reload()
            self.cfg = self.app.engine.cfg
            self.app.toast.show("Textos padrão salvos – valem para as próximas propostas", "ok", 3500)
        elif escolha == self.MODELOS[3]:
            if confirm(self, "Carregar o exemplo", "Preencher TODOS os campos com a proposta nº 787 (Obra Kitnets 200A) que "
                       "serviu de modelo? O que está digitado aqui será substituído.", "Carregar exemplo"):
                self.load_example()

    def load_example(self):
        ex = seed.EXEMPLO_PROPOSTA
        for e, v in ((self.e_num, str(ex["numero"])), (self.e_data, datetime.strptime(ex["data"], "%Y-%m-%d").strftime("%d/%m/%Y")),
                     (self.e_val, str(ex["validade_dias"])), (self.e_titulo, ex["titulo"]), (self.e_ac, ex["aos_cuidados"]),
                     (self.e_ass1, ex["assinatura1"]), (self.e_ass2, ex["assinatura2"]),
                     (self.cli["nome"], ex["cliente_nome"])):
            e.delete(0, "end")
            e.insert(0, v)
        self._set_text(self.t_objeto, ex["objeto"])
        self._set_text(self.t_intro, ex["escopo_intro"])
        self._set_text(self.t_nota, ex["escopo_nota"])
        self._set_text(self.t_fecho, ex["fecho"])
        self._set_text(self.t_det, "")
        self.l_escopo.set(ex["escopo"])
        self.l_pre.set(ex["secoes_pre"])
        self.l_pos.set(ex["secoes_pos"])
        self.l_parc.set(ex["parcelas"])
        self.itens = [dict(descricao=d, quantidade=1, unidade="", valor_unit=v, origem="livre") for d, v in ex["itens"]]
        self.e_desc.delete(0, "end")
        self.e_desc.insert(0, "0")
        self.chk_pag.select()
        self.refresh_items()
        self.app.toast.show("Exemplo carregado – edite o que quiser", "ok", 3000)

    # ---------------------------------------------------------------- itens
    def refresh_items(self):
        rows = []
        for i, it in enumerate(self.itens):
            q = fnum(it.get("quantidade"), 1)
            rows.append(dict(id=i, n=i + 1, descricao=it.get("descricao", ""),
                             qtd=num(q, 0 if abs(q - round(q)) < 1e-9 else 2) + (f" {it['unidade']}" if it.get("unidade") else ""),
                             valor_unit=fnum(it.get("valor_unit")), total=q * fnum(it.get("valor_unit"))))
        self.t.set_rows(rows, "Adicione serviços do catálogo ou itens livres")
        self.update_totals()

    def update_totals(self):
        tot = pdfs.proposta_totais(dict(desconto_valor=fnum(self.e_desc.get())), self.itens, self.app.engine.cfg)
        self.lbl_tot.configure(text=f"Valor total: {money(tot['total'])}")
        sub = f"Subtotal {money(tot['subtotal'])}"
        if tot["desconto"]:
            sub += f" · desconto {money(tot['desconto'])}"
        self.lbl_sub.configure(text=sub)
        self._parc_info()

    def _parc_info(self):
        if not hasattr(self, "lbl_parc") or not hasattr(self, "e_desc"):
            return
        tot = pdfs.proposta_totais(dict(desconto_valor=fnum(self.e_desc.get())), self.itens, self.app.engine.cfg)["total"]
        soma = sum(fnum(p.get("valor")) for p in self.l_parc.items)
        if not self.l_parc.items:
            self.lbl_parc.configure(text="", text_color=MUTED)
        elif abs(soma - tot) < 0.005:
            self.lbl_parc.configure(text=f"Soma das parcelas {money(soma)} = valor total ✓", text_color=SUCCESS)
        else:
            self.lbl_parc.configure(text=f"Soma das parcelas {money(soma)} · valor total {money(tot)} · diferença "
                                         f"{money(tot - soma)}", text_color=DANGER)

    def gen_parcelas(self):
        tot = pdfs.proposta_totais(dict(desconto_valor=fnum(self.e_desc.get())), self.itens, self.app.engine.cfg)["total"]
        v = ask(self, "Gerar entrada + parcelas", [
            dict(key="entrada", label="Valor da entrada (R$)", kind="money", min=0),
            dict(key="n", label="Quantidade de parcelas depois da entrada", kind="int", min=0),
            dict(key="intervalo", label="Intervalo entre as parcelas (dias)", kind="int", min=1),
            dict(key="detalhe", label="Detalhe da entrada", span=2,
                 help="Sai entre parênteses. Ex.: no aceite da proposta, referente aos custos iniciais")],
            dict(entrada=0, n=3, intervalo=30, detalhe="no aceite da proposta"),
            f"Valor total da proposta: {money(tot)}. O que sobrar da divisão em centavos vai para a última parcela.",
            width=640, ok_text="Gerar")
        if v:
            self.l_parc.set(pdfs.dividir_parcelas(tot, v["entrada"], v["n"], max(int(v["intervalo"]), 1), v["detalhe"]))

    ITEM_FIELDS = [dict(key="descricao", label="Descrição do item", kind="textarea", height=90, required=True, span=2),
                   dict(key="quantidade", label="Quantidade", kind="num", min=0),
                   dict(key="unidade", label="Unidade", kind="combo", options=["", "un", "m", "m²", "km", "h", "ponto", "serviço",
                                                                                "diária", "kit"]),
                   dict(key="valor_unit", label="Valor unitário (R$)", kind="money", min=0, span=2,
                        help="No PDF sai só o valor do item (quantidade × valor unitário). Quando a quantidade não é 1, ela "
                             "aparece entre parênteses na descrição.")]

    def add_catalog(self):
        e = self.app.engine
        rows = []
        for it in e.itens():
            sug = e.preco_sugerido(it.tipo, it.id)
            rows.append(dict(id=f"{it.tipo}-{it.id}", tipo=it.tipo, item_id=it.id,
                             tipo_txt="Serviço" if it.tipo == "servico" else "Revenda", nome=it.nome, preco=it.preco,
                             sug=sug, unidade=it.unidade))
        r = pick(self, "Adicionar do catálogo", [("tipo_txt", "Tipo", 80, "w", None), ("nome", "Item", 330, "w", None),
                                                 ("preco", "Preço atual", 120, "e", M), ("sug", "Preço sugerido", 130, "e", M)],
                 rows, "Escolha um serviço ou produto. Você poderá ajustar quantidade e valor.", width=760)
        if not r:
            return
        desc = r["nome"]
        if r["tipo"] == "servico":
            srv = next((s for s in e.servicos if s["id"] == r["item_id"]), {})
            if srv.get("descricao"):
                desc = f"{r['nome']} – {srv['descricao']}"
        un = {"Serviço": "serviço", "Unidade": "un", "Metro": "m", "Hora": "h"}.get(r.get("unidade"), (r.get("unidade") or "un").lower())
        valor = r["preco"] or r["sug"]
        v = ask(self, "Item do orçamento", self.ITEM_FIELDS, dict(descricao=desc, quantidade=1, unidade=un,
                                                                   valor_unit=round(valor, 2)),
                f"Preço atual {money(r['preco'])} · preço sugerido {money(r['sug'])}", ok_text="Adicionar")
        if v:
            v["origem"] = r["id"]
            self.itens.append(v)
            self.refresh_items()

    def add_free(self):
        v = ask(self, "Item livre", self.ITEM_FIELDS, dict(quantidade=1, unidade=""), ok_text="Adicionar")
        if v:
            v["origem"] = "livre"
            self.itens.append(v)
            self.refresh_items()

    def edit_item(self):
        r = self.t.selected()
        if r is None:
            return
        i = r["id"]
        v = ask(self, "Editar item", self.ITEM_FIELDS, self.itens[i])
        if v:
            self.itens[i].update(v)
            self.refresh_items()
            self.t.select_id(i)

    def del_item(self):
        r = self.t.selected()
        if r is not None:
            self.itens.pop(r["id"])
            self.refresh_items()

    def move(self, d):
        r = self.t.selected()
        if r is None:
            return
        i, j = r["id"], r["id"] + d
        if 0 <= j < len(self.itens):
            self.itens[i], self.itens[j] = self.itens[j], self.itens[i]
            self.refresh_items()
            self.t.select_id(j)

    def choose_client(self):
        rows = self.db.all("clientes")
        if not rows:
            return info(self, "Nenhum cliente", "Ainda não há clientes cadastrados. Preencha os dados aqui mesmo e deixe "
                                                "marcada a opção de salvar no cadastro.")
        r = pick(self, "Escolher cliente", [("nome", "Cliente", 280, "w", None), ("documento", "CPF/CNPJ", 150, "w", None),
                                            ("telefone", "Telefone", 140, "w", None), ("cidade", "Cidade", 140, "w", None)],
                 rows, width=760)
        if r:
            for k in self.CLI_KEYS:
                self.cli[k].delete(0, "end")
                self.cli[k].insert(0, r.get(k) or "")
            if not self.e_ac.get().strip():
                self.e_ac.insert(0, r.get("contato") or r.get("nome") or "")
            self.prop["cliente_id"] = r["id"]
            self.chk_save.deselect()

    # ---------------------------------------------------------------- salvar
    def collect(self):
        try:
            d = datetime.strptime(self.e_data.get().strip(), "%d/%m/%Y").date()
        except ValueError:
            raise ValueError("Data inválida. Use o formato dd/mm/aaaa.")
        numero = int(fnum(self.e_num.get()))
        if numero < 1:
            raise ValueError("Informe o número da proposta (1 ou maior).")
        outra = self.db.all("propostas", "numero = ? AND id != ?", (numero, self.prop.get("id") or 0))
        if outra:
            raise ValueError(f"Já existe outra proposta com o nº {numero}. Escolha outro número.")
        if not self.cli["nome"].get().strip():
            raise ValueError("Informe o nome do cliente.")
        if not self.itens:
            raise ValueError("Adicione pelo menos um item ao investimento.")
        dump = lambda v: json.dumps(v, ensure_ascii=False)  # noqa: E731
        p = dict(self.prop)
        p.update(numero=numero, data=d.isoformat(), validade_dias=int(fnum(self.e_val.get(), 30)) or 30,
                 status=self.o_status.get(), titulo=self.e_titulo.get().strip(), aos_cuidados=self.e_ac.get().strip(),
                 objeto=self.t_objeto.get("1.0", "end").strip(), escopo_intro=self.t_intro.get("1.0", "end").strip(),
                 escopo_json=dump(self.l_escopo.get()), escopo_nota=self.t_nota.get("1.0", "end").strip(),
                 secoes_pre_json=dump(self.l_pre.get()), secoes_pos_json=dump(self.l_pos.get()),
                 parcelas_json=dump(self.l_parc.get()), desconto_valor=fnum(self.e_desc.get()),
                 invest_nova_pagina=1 if self.chk_pag.get() else 0, detalhes_pagamento=self.t_det.get("1.0", "end").strip(),
                 fecho=self.t_fecho.get("1.0", "end").strip(), assinatura1=self.e_ass1.get().strip(),
                 assinatura2=self.e_ass2.get().strip(), observacoes="", forma_pagamento="")
        for k in self.CLI_KEYS:
            p[f"cliente_{k}"] = self.cli[k].get().strip()
        return p

    def preview(self):
        try:
            p = self.collect()
        except ValueError as ex:
            return info(self, "Verifique a proposta", str(ex), "warn")
        path = data_dir() / "previa_proposta.pdf"
        self.app.run_pdf(lambda: pdfs.proposta_pdf(self.app.engine.cfg, p, self.itens, path), path)

    def save(self, pdf=False):
        try:
            p = self.collect()
        except ValueError as ex:
            return info(self, "Verifique a proposta", str(ex), "warn")
        if self.chk_save.get():
            cli = {k: p[f"cliente_{k}"] for k in self.CLI_KEYS}
            if p.get("cliente_id") and self.db.get("clientes", p["cliente_id"]):
                cli["id"] = p["cliente_id"]
            p["cliente_id"] = self.db.save("clientes", cli)
        pid = self.db.save_proposal(p, [{k: v for k, v in it.items() if k in ("descricao", "quantidade", "unidade",
                                                                              "valor_unit", "origem")} for it in self.itens])
        self.prop = self.db.get("propostas", pid)
        self.saved = True
        self.app.changed(f"Proposta {int(self.prop['numero'])} salva")
        if pdf:
            self.page.make_pdf(self.prop, parent=self)
        self.close()

    def close(self):
        try:
            self.grab_release()
        except Exception:
            pass
        self.destroy()


class PropostasPage(Page):
    title = "Propostas comerciais"
    subtitle = "Monte a proposta técnica e comercial (escopo, textos, investimento e pagamento) e gere o PDF no modelo da ACRS."

    def build(self):
        btn(self.actions, "+ Nova proposta", self.new).pack(side="left", padx=4)
        g = kpi_grid(self.body, 4)
        g.pack(fill="x", pady=(0, 10))
        self.k = [KPI(g, t, accent=a) for t, a in (("Propostas em aberto", PRIMARY), ("Aprovadas", "#16A34A"),
                                                   ("Taxa de aprovação", PRIMARY), ("Ticket médio aprovado", NAVY))]
        for i, k in enumerate(self.k):
            k.grid(row=0, column=i, sticky="nsew", padx=(0 if i == 0 else 4, 0 if i == 3 else 4))
        bar = ctk.CTkFrame(self.body, fg_color="transparent")
        bar.pack(fill="x", pady=(0, 8))
        self.seg = ctk.CTkSegmentedButton(bar, values=["Todas"] + seed.STATUS_PROPOSTA, command=lambda v: self.refresh(),
                                          selected_color=PRIMARY, text_color=INK, selected_hover_color=PRIMARY_H, font=F(12), height=32)
        self.seg.set("Todas")
        self.seg.pack(side="left")
        for t, cmd, k in (("Excluir", self.delete, "danger"), ("Duplicar", self.dup, "secondary"),
                          ("Gerar PDF", self.pdf_selected, "secondary"), ("Abrir", self.edit, "secondary")):
            btn(bar, t, cmd, k, width=100).pack(side="right", padx=4)
        self.table = DataTable(self.body, [
            ("numero_txt", "Nº", 70, "w", None), ("data_txt", "Data", 100, "w", None), ("cliente_nome", "Cliente", 240, "w", None),
            ("itens", "Itens", 60, "e", N0), ("total", "Total", 130, "e", M), ("titulo", "Título", 260, "w", None),
            ("status", "Situação", 110, "w", None)], height=16, on_double=lambda r: self.edit(), stretch_col=2)
        self.table.pack(fill="both", expand=True)

    def refresh(self):
        cfg = self.eng.cfg
        rows, filt = [], self.seg.get()
        stats = {s: [0, 0.0] for s in seed.STATUS_PROPOSTA}
        for p in self.db.all("propostas"):
            itens = self.db.proposal_items(p["id"])
            tot = pdfs.proposta_totais(p, itens, cfg)["total"]
            st = p.get("status") or "Rascunho"
            if st in stats:
                stats[st][0] += 1
                stats[st][1] += tot
            if filt != "Todas" and st != filt:
                continue
            try:
                dt = datetime.strptime(p.get("data") or "", "%Y-%m-%d").strftime("%d/%m/%Y")
            except ValueError:
                dt = p.get("data") or ""
            tag = {"Aprovada": "good", "Recusada": "neg", "Rascunho": "muted"}.get(st)
            rows.append(dict(p, numero_txt=str(int(fnum(p['numero']))), data_txt=dt, itens=len(itens), total=tot, _tag=tag))
        self.table.set_rows(rows, "Nenhuma proposta. Clique em “+ Nova proposta”.")
        aberto = stats["Rascunho"][1] + stats["Enviada"][1]
        self.k[0].set(money(aberto), f"{stats['Rascunho'][0] + stats['Enviada'][0]} proposta(s)")
        self.k[1].set(money(stats["Aprovada"][1]), f"{stats['Aprovada'][0]} proposta(s)")
        dec = stats["Aprovada"][0] + stats["Recusada"][0]
        self.k[2].set(pct(safe_div(stats["Aprovada"][0], dec)) if dec else "—", "aprovadas ÷ (aprovadas + recusadas)")
        self.k[3].set(money(safe_div(stats["Aprovada"][1], stats["Aprovada"][0])) if stats["Aprovada"][0] else "—")

    def new(self, cliente=None):
        self.app.show("Propostas")
        ProposalEditor(self, cliente=cliente)

    def edit(self):
        r = self.table.selected()
        if not r:
            return self.app.toast.show("Selecione uma proposta", "warn")
        ProposalEditor(self, self.db.get("propostas", r["id"]), self.db.proposal_items(r["id"]))

    def dup(self):
        r = self.table.selected()
        if not r:
            return
        p = dict(self.db.get("propostas", r["id"]))
        for k in ("id", "numero", "criado_em", "atualizado_em"):
            p.pop(k, None)
        p.update(status="Rascunho", data=date.today().isoformat())
        ProposalEditor(self, p, self.db.proposal_items(r["id"]))

    def delete(self):
        r = self.table.selected()
        if r and confirm(self, "Excluir proposta", f"Excluir a proposta {r['numero_txt']} de {r['cliente_nome']}?",
                         "Excluir", True):
            self.db.delete("propostas", r["id"])
            self.app.changed("Proposta excluída")

    def pdf_selected(self):
        r = self.table.selected()
        if not r:
            return self.app.toast.show("Selecione uma proposta", "warn")
        self.make_pdf(self.db.get("propostas", r["id"]))

    def make_pdf(self, prop, parent=None):
        nome = "".join(ch for ch in (prop.get("cliente_nome") or "cliente") if ch.isalnum() or ch in " -_").strip()
        p = ask_pdf_path(parent or self, f"Proposta {int(fnum(prop['numero']))} - {nome}.pdf")
        if p:
            itens = self.db.proposal_items(prop["id"])
            self.app.run_pdf(lambda: pdfs.proposta_pdf(self.eng.cfg, prop, itens, p), p)


# ====================================================================== EXPORTAR
class ExportarPage(Page):
    title = "Exportar PDF"
    subtitle = ("Gere o relatório completo de precificação em PDF – o equivalente à planilha inteira, "
                "para imprimir ou enviar a quem não tem Excel.")
    scroll = True

    def build(self):
        c = card(self.body)
        c.pack(fill="x", padx=10, pady=(0, 10))
        section_title(c, "Relatório completo de precificação", "Escolha as seções que entram no documento").pack(
            anchor="w", padx=18, pady=(16, 8))
        self.checks = {}
        g = ctk.CTkFrame(c, fg_color="transparent")
        g.pack(fill="x", padx=18)
        for i, (k, t) in enumerate(pdfs.SECOES):
            cb = ctk.CTkCheckBox(g, text=t, font=F(13), fg_color=PRIMARY, hover_color=PRIMARY_H, checkmark_color=ON_PRIMARY)
            cb.grid(row=i // 2, column=i % 2, sticky="w", padx=6, pady=6)
            cb.select()
            self.checks[k] = cb
        bar = ctk.CTkFrame(c, fg_color="transparent")
        bar.pack(fill="x", padx=18, pady=16)
        btn(bar, "Gerar relatório em PDF", self.gen, width=220).pack(side="left")
        btn(bar, "Marcar todas", lambda: [cb.select() for cb in self.checks.values()], "ghost", width=120).pack(side="left", padx=8)
        btn(bar, "Desmarcar todas", lambda: [cb.deselect() for cb in self.checks.values()], "ghost", width=130).pack(side="left")
        c2 = card(self.body)
        c2.pack(fill="x", padx=10, pady=10)
        section_title(c2, "Outros documentos").pack(anchor="w", padx=18, pady=(16, 8))
        for title, sub, cmd in (
                ("Proposta técnica e comercial", "Documento no modelo da ACRS: escopo, investimento, pagamento e assinaturas",
                 lambda: self.app.show("Propostas")),
                ("Análise de um serviço", "DRE unitária, preço sugerido e gráficos de um serviço ou produto",
                 lambda: self.app.show("Análise de preço")),
                ("Tabela de preços", "Somente a tabela de preços de serviços e revenda",
                 lambda: self.app.pages["Tabela de preços"].export())):
            r = ctk.CTkFrame(c2, fg_color="transparent")
            r.pack(fill="x", padx=18, pady=6)
            box = ctk.CTkFrame(r, fg_color="transparent")
            box.pack(side="left")
            ctk.CTkLabel(box, text=title, font=F(14, "bold"), text_color=INK).pack(anchor="w")
            ctk.CTkLabel(box, text=sub, font=F(12), text_color=MUTED).pack(anchor="w")
            btn(r, "Abrir", cmd, "secondary", width=100).pack(side="right")
        ctk.CTkLabel(c2, text=f"Os PDFs são salvos por padrão em: {pdf_dir()}", font=F(12), text_color=SUBTLE).pack(
            anchor="w", padx=18, pady=(6, 16))

    def gen(self):
        sec = {k for k, cb in self.checks.items() if cb.get()}
        if not sec:
            return self.app.toast.show("Marque pelo menos uma seção", "warn")
        p = ask_pdf_path(self, f"Relatório de precificação {date.today():%Y-%m-%d}.pdf")
        if p:
            self.app.run_pdf(lambda: pdfs.relatorio_completo(self.eng, p, sec), p)


# ====================================================================== CONFIGURACOES
class ConfiguracoesPage(Page):
    title = "Configurações"
    subtitle = "Dados da sua empresa (aparecem nas propostas e relatórios), parâmetros, encargos e backup."
    scroll = True
    EMPRESA = [("empresa_nome", "Razão social / nome", 2), ("empresa_fantasia", "Nome fantasia", 1),
               ("empresa_cnpj", "CNPJ / CPF", 1), ("empresa_telefone", "Telefone / WhatsApp", 1),
               ("empresa_email", "E-mail", 1), ("empresa_endereco", "Endereço", 2), ("empresa_bairro", "Bairro", 1),
               ("empresa_cidade", "Cidade", 1), ("empresa_uf", "UF", 1), ("empresa_cep", "CEP", 1),
               ("empresa_sigla", "Nome curto nos textos (ex.: ACRS)", 1), ("empresa_site", "Site / Instagram", 1),
               ("proposta_assinante_empresa", "Assinante da empresa nas propostas (nome e função)", 2)]
    PARAMS = [("lucro_desejado_pct", "Lucro desejado padrão (%)"), ("proposta_proximo_numero", "Próximo nº de proposta"),
              ("proposta_validade_dias", "Validade das propostas (dias)")]
    ENC = [("enc_ferias", "Férias + 1/3 (%)"), ("enc_13", "13º salário (%)"), ("enc_13_ferias", "13º sobre férias (%)"),
           ("enc_inss", "INSS patronal (%)"), ("enc_sat", "SAT/RAT (%)"), ("enc_sal_educacao", "Salário-educação (%)"),
           ("enc_sistema_s", "INCRA/Sistema S (%)"), ("enc_fgts", "FGTS (%)"), ("enc_fgts_rescisao", "FGTS rescisão (%)"),
           ("enc_prolabore_inss", "INSS sobre pró-labore (%)")]

    def build(self):
        btn(self.actions, "Salvar configurações", self.save).pack(side="left")
        self.e = {}
        c = card(self.body)
        c.pack(fill="x", padx=10, pady=(0, 8))
        section_title(c, "Sua empresa", "Aparece no cabeçalho das propostas e dos relatórios").pack(anchor="w", padx=18,
                                                                                                    pady=(16, 6))
        top = ctk.CTkFrame(c, fg_color="transparent")
        top.pack(fill="x", padx=12, pady=(0, 12))
        top.grid_columnconfigure(0, weight=1)
        g = ctk.CTkFrame(top, fg_color="transparent")
        g.grid(row=0, column=0, sticky="nsew")
        self._grid(g, self.EMPRESA, 4)
        lg = ctk.CTkFrame(top, fg_color=FIELD, corner_radius=10, border_width=1, border_color=BORDER, width=210)
        lg.grid(row=0, column=1, sticky="ns", padx=(10, 6))
        self.logo_cap = ctk.CTkLabel(lg, text="Logotipo", font=F(12, "bold"), text_color=INK2)
        self.logo_cap.pack(pady=(10, 4))
        self.logo_lbl = ctk.CTkLabel(lg, text="", width=180, height=110, text_color=SUBTLE)
        self.logo_lbl.pack(padx=10)
        btn(lg, "Escolher imagem", self.choose_logo, "secondary", width=150).pack(pady=(6, 2))
        btn(lg, "Voltar ao logo da ACRS", self.remove_logo, "ghost", width=170).pack(pady=(0, 10))

        c = card(self.body)
        c.pack(fill="x", padx=10, pady=8)
        section_title(c, "Parâmetros de preço e propostas").pack(anchor="w", padx=18, pady=(16, 6))
        g = ctk.CTkFrame(c, fg_color="transparent")
        g.pack(fill="x", padx=12)
        self._grid(g, [(k, l, 1) for k, l in self.PARAMS], 5)
        ctk.CTkLabel(c, text=("Os textos padrão das propostas (escopo, premissas, garantia…) ficam no próprio editor de proposta: "
                              "menu “Modelos de texto…” › “Salvar estes textos como padrão”."),
                     font=F(12), text_color=MUTED, wraplength=900, justify="left").pack(anchor="w", padx=18, pady=(2, 16))

        c = card(self.body)
        c.pack(fill="x", padx=10, pady=8)
        section_title(c, "Encargos sobre salários", "CLT: férias, 13º e FGTS (no Simples Nacional, anexos I a III, o INSS "
                                                    "patronal é 0%). Pró-labore: 11% de INSS.").pack(anchor="w", padx=18,
                                                                                                     pady=(16, 6))
        g = ctk.CTkFrame(c, fg_color="transparent")
        g.pack(fill="x", padx=12, pady=(0, 6))
        self._grid(g, [(k, l, 1) for k, l in self.ENC], 5)
        btn(c, "Restaurar encargos padrão", self.reset_enc, "ghost", width=200).pack(anchor="e", padx=16, pady=(0, 14))

        c = card(self.body)
        c.pack(fill="x", padx=10, pady=8)
        section_title(c, "Tutorial", "Um passeio rápido por cada tela do programa, com a ordem recomendada de uso.").pack(
            anchor="w", padx=18, pady=(16, 8))
        t = ctk.CTkFrame(c, fg_color="transparent")
        t.pack(fill="x", padx=16, pady=(0, 16))
        btn(t, "Ver o tutorial agora", self.app.tutorial.start, "primary", width=190).pack(side="left", padx=(2, 18))
        self.show_tut = ctk.CTkCheckBox(t, text="Mostrar o tutorial sempre que abrir o programa", font=F(13), text_color=INK2,
                                        fg_color=PRIMARY, hover_color=PRIMARY_H, checkmark_color=ON_PRIMARY, border_color=BORDER,
                                        command=self._toggle_tutorial)
        self.show_tut.pack(side="left")

        c = card(self.body)
        c.pack(fill="x", padx=10, pady=8)
        section_title(c, "Dados e backup", f"Seus dados ficam em: {data_dir()}").pack(anchor="w", padx=18, pady=(16, 8))
        g = ctk.CTkFrame(c, fg_color="transparent")
        g.pack(fill="x", padx=16, pady=(0, 16))
        acts = [("Importar planilha Excel (.xlsm)", self.import_xlsx, "primary"),
                ("Fazer backup", self.backup, "secondary"), ("Restaurar backup", self.restore, "secondary"),
                ("Carregar exemplo", self.example, "secondary"), ("Abrir pasta de dados", lambda: open_file(data_dir()), "secondary"),
                ("Apagar todos os dados", self.reset, "danger")]
        for i, (t, cmd, k) in enumerate(acts):
            btn(g, t, cmd, k).grid(row=i // 3, column=i % 3, sticky="ew", padx=4, pady=4)
        for i in range(3):
            g.grid_columnconfigure(i, weight=1)

        c = card(self.body)
        c.pack(fill="x", padx=10, pady=(8, 16))
        ctk.CTkLabel(c, text=f"{APP_NAME} {APP_VERSION}", font=F(15, "bold"), text_color=INK).pack(anchor="w", padx=18, pady=(14, 0))
        ctk.CTkLabel(c, text=(f"Desenvolvido pela {APP_AUTHOR} (projeto de extensão PROEX – UniBrasil) como alternativa à "
                              "Planilha de Precificação EG3 para quem não tem Microsoft Excel. Os cálculos seguem a "
                              "planilha R02, com as correções apontadas no relatório final do projeto."),
                     font=F(12), text_color=MUTED, wraplength=900, justify="left").pack(anchor="w", padx=18, pady=(2, 14))

    def _grid(self, g, fields, cols):
        for i in range(cols):
            g.grid_columnconfigure(i, weight=1, uniform=str(id(g)))
        r = c = 0
        for key, label, span in fields:
            if c + span > cols:
                r, c = r + 1, 0
            f = ctk.CTkFrame(g, fg_color="transparent")
            f.grid(row=r, column=c, columnspan=span, sticky="ew", padx=4, pady=4)
            ctk.CTkLabel(f, text=label, font=F(12, "bold"), text_color=INK2).pack(anchor="w")
            if key == "empresa_uf":
                w = ctk.CTkComboBox(f, values=seed.UFS, height=34, font=F(13), border_color=BORDER, button_color=PRIMARY)
            else:
                w = ctk.CTkEntry(f, height=34, font=F(13), border_color=BORDER, fg_color=FIELD)
            w.pack(fill="x")
            self.e[key] = w
            c += span
            if c >= cols:
                r, c = r + 1, 0

    def refresh(self):
        cfg = self.db.config()
        for k, w in self.e.items():
            v = cfg.get(k, "")
            if isinstance(w, ctk.CTkComboBox):
                w.set(v)
                continue
            w.delete(0, "end")
            if k.startswith("enc_") or k in dict(self.PARAMS):
                w.insert(0, num_input(v, 4))
            else:
                w.insert(0, v)
        self._show_logo(cfg.get("empresa_logo", ""))
        if int(fnum(cfg.get(TUTORIAL_KEY, 0))) >= 1:
            self.show_tut.deselect()
        else:
            self.show_tut.select()

    def _toggle_tutorial(self):
        self.db.set_cfg(TUTORIAL_KEY, 0 if self.show_tut.get() else 1)
        self.app.toast.show("Tutorial será exibido ao abrir" if self.show_tut.get() else "Tutorial desativado na abertura")

    def _show_logo(self, path):
        """Mostra o logotipo escolhido; sem escolha, mostra o logotipo da ACRS que ja vem no programa."""
        try:
            from PIL import Image
            custom = bool(path and Path(path).exists())
            im = Image.open(path) if custom else Image.open(io.BytesIO(ACRS_LOGO_PNG))
            im.thumbnail((180, 110))
            self._logo_img = ctk.CTkImage(light_image=im, size=im.size)
            self.logo_lbl.configure(image=self._logo_img, text="")
            self.logo_cap.configure(text="Logotipo da empresa" if custom else "Logotipo padrão (ACRS)")
            return
        except Exception:
            pass
        self._logo_img = None
        self.logo_lbl.configure(image=None, text="sem logotipo")

    def choose_logo(self):
        p = filedialog.askopenfilename(parent=self, title="Escolha o logotipo",
                                       filetypes=[("Imagens", "*.png *.jpg *.jpeg *.gif *.bmp")])
        if not p:
            return
        try:
            from PIL import Image
            im = Image.open(p)
            im.thumbnail((900, 900))
            dest = data_dir() / "logotipo.png"
            im.save(dest, "PNG")
            self.db.set_cfg("empresa_logo", str(dest))
            self._show_logo(str(dest))
            self.app.changed("Logotipo atualizado")
        except Exception as ex:
            info(self, "Não foi possível usar a imagem", str(ex), "danger")

    def remove_logo(self):
        self.db.set_cfg("empresa_logo", "")
        self._show_logo("")
        self.app.changed("Logotipo da ACRS restaurado")

    def save(self):
        vals = {}
        for k, w in self.e.items():
            v = w.get().strip()
            if k.startswith("enc_") or k in dict(self.PARAMS):
                v = fnum(v)
            vals[k] = v
        self.db.set_many(vals)
        self.app.changed("Configurações salvas")

    def reset_enc(self):
        self.db.set_many(seed.ENCARGOS_PADRAO)
        self.app.changed("Encargos restaurados")

    def import_xlsx(self):
        p = filedialog.askopenfilename(parent=self, title="Importar Planilha de Precificação EG3",
                                       filetypes=[("Planilha Excel", "*.xlsm *.xlsx")])
        if not p:
            return
        if not confirm(self, "Importar planilha", "Os dados da planilha serão mesclados aos atuais (itens com o mesmo nome "
                                                  "são atualizados). Um backup é feito antes. Continuar?", "Importar"):
            return
        try:
            self.db.backup()
            from .importer import importar_planilha
            rep = importar_planilha(self.db, p)
            self.app.changed("Planilha importada")
            txt = "\n".join(f"• {k.replace('_', ' ').capitalize()}: {v}" for k, v in rep.items() if v)
            info(self, "Importação concluída", txt or "Nenhum dado encontrado na planilha.", "ok")
        except Exception as ex:
            info(self, "Erro ao importar", f"{ex}", "danger")

    def backup(self):
        p = filedialog.asksaveasfilename(parent=self, title="Salvar backup", defaultextension=".db",
                                         initialfile=f"precifica_backup_{date.today():%Y%m%d}.db",
                                         filetypes=[("Backup Precifica", "*.db")])
        if p:
            self.db.backup(Path(p))
            self.app.toast.show("Backup salvo")

    def restore(self):
        p = filedialog.askopenfilename(parent=self, title="Restaurar backup", filetypes=[("Backup Precifica", "*.db")])
        if p and confirm(self, "Restaurar backup", "Os dados atuais serão substituídos pelos do backup (uma cópia de "
                                                   "segurança é feita antes). Continuar?", "Restaurar", True):
            self.db.restore(Path(p))
            self.app.changed("Backup restaurado")

    def example(self):
        if confirm(self, "Carregar exemplo", "Adiciona um eletricista (pró-labore de R$ 4.000), custos fixos e o serviço "
                                             "“Instalação de chuveiro elétrico” com ficha técnica e previsão de vendas, "
                                             "para você explorar o app. Continuar?", "Carregar"):
            self.db.load_example()
            self.app.changed("Exemplo carregado")

    def reset(self):
        if confirm(self, "Apagar todos os dados", "Todos os cadastros, propostas e configurações serão apagados "
                                                  "(um backup automático é feito antes). Tem certeza?", "Apagar tudo", True):
            self.db.reset_all()
            self.app.changed("Dados apagados")


# ====================================================================== APP
NAV = [
    ("VISÃO GERAL", [("Painel", "◆")]),
    ("CADASTROS", [("Serviços e fichas", "▤"), ("Insumos e preços", "▦"), ("Equipe", "◉"), ("Custos fixos", "▣"),
                   ("Capacidade produtiva", "◔"), ("Revenda", "▢")]),
    ("PRECIFICAÇÃO", [("Tabela de preços", "☰"), ("Análise de preço", "◐"), ("Simulação", "▲"),
                      ("Relatórios gerenciais", "▥"), ("Concorrentes", "◈")]),
    ("COMERCIAL", [("Propostas", "✎"), ("Clientes", "☺")]),
    ("SISTEMA", [("Exportar PDF", "⇩"), ("Configurações", "⚙")]),
]
PAGE_CLASSES = {
    "Painel": DashboardPage, "Serviços e fichas": ServicosPage, "Insumos e preços": InsumosPage, "Equipe": EquipePage,
    "Custos fixos": CustosFixosPage, "Capacidade produtiva": CapacidadePage, "Revenda": RevendaPage,
    "Tabela de preços": TabelaPrecosPage, "Análise de preço": AnalisePage, "Simulação": SimulacaoPage,
    "Relatórios gerenciais": RelatoriosPage, "Concorrentes": ConcorrentesPage, "Propostas": PropostasPage,
    "Clientes": ClientesPage, "Exportar PDF": ExportarPage, "Configurações": ConfiguracoesPage,
}
ALIASES = {"Serviços": "Serviços e fichas", "Simulação de vendas": "Simulação", "Insumos": "Insumos e preços"}


class App(ctk.CTk):
    def __init__(self):
        ctk.set_appearance_mode("light")
        ctk.set_default_color_theme("blue")
        super().__init__()
        self.title(f"{APP_NAME} · Precificação de serviços")
        sw, sh = screen_size(self)
        self.geometry(f"{min(1440, sw - 40)}x{min(880, sh - 90)}+10+10")
        self.minsize(1024, 620)
        if sw < 1500 and sys.platform.startswith("win"):
            self.after(50, lambda: self.state("zoomed"))
        self.configure(fg_color=BG)
        self._set_icon()
        setup_ttk_style(self)
        try:
            import matplotlib
            if sys.platform.startswith("win"):
                matplotlib.rcParams["font.family"] = ["Segoe UI", "DejaVu Sans"]
        except Exception:
            pass
        self.db = Database()
        self.engine = Engine(self.db)
        self.toast = Toast(self)
        self.report_callback_exception = self._on_error

        self.sidebar = ctk.CTkFrame(self, width=248, corner_radius=0, fg_color=SIDEBAR)
        self.sidebar.pack(side="left", fill="y")
        self.sidebar.pack_propagate(False)
        self._build_sidebar()
        self.content = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        self.content.pack(side="left", fill="both", expand=True)
        self.pages: dict[str, Page] = {}
        self.current = None
        self._active_nav = None
        self._company_txt = None
        self.tutorial = Tutorial(self)
        for name, cls in PAGE_CLASSES.items():
            self.pages[name] = cls(self.content, self)
        self.pages["Serviços"] = self.pages["Serviços e fichas"]
        self.show("Painel")
        if self.db.cfg_num("onboarding_ok") < 1:
            self.after(600, self._welcome)
        elif self.db.cfg_num(TUTORIAL_KEY) < 1:
            self.after(700, self.tutorial.start)

    # ---------------------------------------------------------------- icone
    def _set_icon(self):
        self.icon_path = None
        try:
            from PIL import Image
            ico = data_dir() / "icone_acrs.ico"
            if not ico.exists():
                im = Image.open(io.BytesIO(ACRS_LOGO_PNG)).convert("RGBA")
                side = max(im.size)
                sq = Image.new("RGBA", (side, side), (255, 255, 255, 255))
                sq.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2))
                sq.save(ico, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
            if sys.platform.startswith("win"):
                self.iconbitmap(str(ico))
                self.icon_path = str(ico)
                ICON["path"] = str(ico)
        except Exception:
            pass

    # ---------------------------------------------------------------- sidebar
    def _build_sidebar(self):
        top = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        top.pack(fill="x", padx=14, pady=(16, 6))
        try:
            from PIL import Image
            im = Image.open(io.BytesIO(ACRS_LOGO_PNG))
            w = 168
            self._side_logo = ctk.CTkImage(light_image=im, size=(w, int(w * im.size[1] / im.size[0])))
            cardl = ctk.CTkFrame(top, fg_color="white", corner_radius=12)
            cardl.pack(fill="x")
            ctk.CTkLabel(cardl, image=self._side_logo, text="").pack(padx=10, pady=8)
        except Exception:
            pass
        tf = ctk.CTkFrame(top, fg_color="transparent")
        tf.pack(fill="x", pady=(10, 0))
        ctk.CTkLabel(tf, text="Precifica", font=F(18, "bold"), text_color="white").pack(side="left")
        ctk.CTkLabel(tf, text="  PRECIFICAÇÃO E PROPOSTAS", font=F(9, "bold"), text_color=ACCENT).pack(side="left", pady=(4, 0))
        nav = ctk.CTkScrollableFrame(self.sidebar, fg_color=SIDEBAR, corner_radius=0, scrollbar_button_color=SIDEBAR_H,
                                     scrollbar_button_hover_color="#33445E")
        nav.pack(fill="both", expand=True, padx=0, pady=(4, 0))
        self.nav_buttons = {}
        for group, items in NAV:
            ctk.CTkLabel(nav, text=group, font=F(10, "bold"), text_color=SIDEBAR_MUTED).pack(anchor="w", padx=16, pady=(12, 2))
            for name, icon in items:
                b = ctk.CTkButton(nav, text=f"  {icon}   {name}", anchor="w", height=36, corner_radius=8, font=F(13),
                                  fg_color="transparent", hover_color=SIDEBAR_H, text_color=SIDEBAR_TXT,
                                  border_width=0, command=lambda n=name: self.show(n))
                b.pack(fill="x", padx=8, pady=1)
                self.nav_buttons[name] = b
        foot = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        foot.pack(fill="x", side="bottom", padx=16, pady=14)
        self.company_lbl = ctk.CTkLabel(foot, text="", font=F(12, "bold"), text_color="white", anchor="w", wraplength=210,
                                        justify="left")
        self.company_lbl.pack(anchor="w")
        ctk.CTkLabel(foot, text=f"v{APP_VERSION} · por {APP_AUTHOR}", font=F(10), text_color=SIDEBAR_MUTED).pack(anchor="w")

    # ---------------------------------------------------------------- navegacao
    def show(self, name):
        """Troca de tela sem piscar: a nova pagina e' colocada por cima e so depois a antiga sai."""
        name = ALIASES.get(name, name)
        page = self.pages.get(name)
        if not page:
            return
        if page.dirty:
            self._refresh(page)          # atualiza ainda fora da tela; nada e' desenhado nesse momento
        prev = self.current
        if prev is not page:
            page.place(x=0, y=0, relwidth=1, relheight=1)
            page.lift()
            if prev is not None:
                prev.place_forget()
            self.current = page
        # so reconfigura os dois botoes que mudaram (evita redesenhar o menu inteiro)
        if self._active_nav != name:
            old = self.nav_buttons.get(self._active_nav)
            if old is not None:
                old.configure(fg_color="transparent", hover_color=SIDEBAR_H, text_color=SIDEBAR_TXT)
            new = self.nav_buttons.get(name)
            if new is not None:
                # hover = cor ativa: a animacao de clique do botao nao "pisca" por cima do item selecionado
                new.configure(fg_color=PRIMARY, hover_color=PRIMARY, text_color=ON_PRIMARY)
            self._active_nav = name
        self._set_company_label()

    def _set_company_label(self):
        txt = self.engine.cfg.get("empresa_fantasia") or self.engine.cfg.get("empresa_nome", "")
        if txt != self._company_txt:
            self._company_txt = txt
            self.company_lbl.configure(text=txt)

    def _refresh(self, page):
        try:
            page.refresh()
        finally:
            page.dirty = False

    def changed(self, msg=None):
        """Chamar sempre que os dados mudarem: recalcula e atualiza a tela visivel."""
        self.engine.reload()
        for p in set(self.pages.values()):
            p.dirty = True
        if self.current:
            self._refresh(self.current)
        self._set_company_label()
        if msg:
            self.toast.show(msg)

    # ---------------------------------------------------------------- PDFs
    def run_pdf(self, fn, path):
        self.configure(cursor="watch")
        self.update_idletasks()
        try:
            self.engine.reload()
            fn()
        except PermissionError:
            info(self, "Não foi possível salvar", "O arquivo está aberto em outro programa. Feche o PDF e tente de novo.",
                 "danger")
            return
        except Exception as ex:
            traceback.print_exc()
            info(self, "Erro ao gerar o PDF", str(ex), "danger")
            return
        finally:
            self.configure(cursor="")
        self.toast.show("PDF gerado")
        open_file(path)

    # ---------------------------------------------------------------- erros e boas-vindas
    def _on_error(self, exc, val, tb):
        traceback.print_exception(exc, val, tb)
        try:
            log = data_dir() / "erros.log"
            with log.open("a", encoding="utf-8") as fh:
                fh.write(f"\n[{datetime.now():%Y-%m-%d %H:%M:%S}]\n")
                fh.write("".join(traceback.format_exception(exc, val, tb)))
        except Exception:
            pass
        self.toast.show(f"Erro: {val}", "danger", 5000)

    def _welcome(self):
        d = ctk.CTkToplevel(self)
        d.withdraw()
        d.title("Bem-vindo")
        d.configure(fg_color=BG)
        d.transient(self)
        set_icon(d)
        ctk.CTkLabel(d, text="Bem-vindo ao Precifica Desktop", font=F(22, "bold"), text_color=INK).pack(anchor="w", padx=26,
                                                                                                        pady=(24, 4))
        ctk.CTkLabel(d, text=("Descubra quanto cobrar pelos seus serviços sem precisar de Excel. O app já vem com 96 preços "
                              "de referência de serviços elétricos. Como você quer começar?"),
                     font=F(13), text_color=INK2, wraplength=520, justify="left").pack(anchor="w", padx=26)
        opts = ctk.CTkFrame(d, fg_color="transparent")
        opts.pack(fill="x", padx=20, pady=16)

        def go(action):
            self.db.set_cfg("onboarding_ok", 1)
            try:
                d.grab_release()
            except Exception:
                pass
            d.destroy()
            if action == "exemplo":
                self.db.load_example()
                self.changed("Exemplo carregado")
            elif action == "importar":
                self.show("Configurações")
                self.pages["Configurações"].import_xlsx()
            else:
                self.show("Configurações")
            if self.db.cfg_num(TUTORIAL_KEY) < 1:
                self.after(400, self.tutorial.start)      # tour guiado logo depois da escolha inicial
            elif action == "zero":
                self.toast.show("Comece preenchendo os dados da sua empresa", "info", 4000)

        for title, sub, act, kind in (
                ("Começar do zero", "Preencha sua empresa, equipe, custos e serviços (recomendado).", "zero", "primary"),
                ("Ver um exemplo pronto", "Eletricista autônomo com o serviço de instalação de chuveiro.", "exemplo", "secondary"),
                ("Importar a planilha EG3", "Traga os dados da Planilha de Precificação (.xlsm).", "importar", "secondary")):
            r = card(opts)
            r.pack(fill="x", pady=5)
            box = ctk.CTkFrame(r, fg_color="transparent")
            box.pack(side="left", padx=16, pady=12)
            ctk.CTkLabel(box, text=title, font=F(14, "bold"), text_color=INK).pack(anchor="w")
            ctk.CTkLabel(box, text=sub, font=F(12), text_color=MUTED).pack(anchor="w")
            btn(r, "Escolher", lambda a=act: go(a), kind, width=100).pack(side="right", padx=14)
        d.protocol("WM_DELETE_WINDOW", lambda: go("zero"))
        d.update_idletasks()
        d.geometry(f"600x430+{self.winfo_rootx() + 380}+{self.winfo_rooty() + 120}")
        d.deiconify()
        d.after(100, lambda: (d.grab_set(), d.focus_force()))


def main():
    app = App()
    app.mainloop()
