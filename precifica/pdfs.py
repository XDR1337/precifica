# -*- coding: utf-8 -*-
"""Geracao de documentos PDF (nao exige Excel): relatorio completo de precificacao,
analise individual de servico/produto e proposta comercial."""
from __future__ import annotations

import io
import json
from datetime import date, datetime, timedelta
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Flowable, Frame, Image, KeepTogether, NextPageTemplate,
                                PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle)

from .assets import ACRS_LOGO_PNG
from .core import APP_NAME, APP_AUTHOR, fnum, money, num, pct, safe_div

# Paleta ACRS: laranja do filete do modelo de proposta + azul-grafite do logotipo
ORANGE = colors.HexColor("#FF9900")
ORANGE_D = colors.HexColor("#E08600")
NAVY = colors.HexColor("#1B2A3D")
INK = colors.HexColor("#111A25")
MUTED = colors.HexColor("#5F6B7A")
LINE = colors.HexColor("#D9DEE5")
SOFT = colors.HexColor("#F1F1F1")      # cinza da tabela de investimento do modelo
GREEN = colors.HexColor("#15803D")
RED = colors.HexColor("#B91C1C")
AMBER = colors.HexColor("#B45309")

# ------------------------------------------------------------------ fontes
_FONTS = None


def fonts() -> tuple[str, str]:
    """Registra uma fonte Unicode. Calibri (a mesma do modelo de proposta da ACRS) quando existir;
    Carlito (compativel com Calibri), Segoe UI, Arial ou DejaVu como reserva."""
    global _FONTS
    if _FONTS:
        return _FONTS
    win = Path("C:/Windows/Fonts")
    candidates = [
        (win / "calibri.ttf", win / "calibrib.ttf"),
        (Path("/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf"),
         Path("/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf")),
        (win / "segoeui.ttf", win / "segoeuib.ttf"),
        (win / "arial.ttf", win / "arialbd.ttf"),
    ]
    try:
        import matplotlib
        base = Path(matplotlib.get_data_path()) / "fonts" / "ttf"
        candidates.append((base / "DejaVuSans.ttf", base / "DejaVuSans-Bold.ttf"))
    except Exception:
        pass
    for reg, bold in candidates:
        try:
            if reg.exists() and bold.exists():
                pdfmetrics.registerFont(TTFont("PFont", str(reg)))
                pdfmetrics.registerFont(TTFont("PFont-Bold", str(bold)))
                pdfmetrics.registerFontFamily("PFont", normal="PFont", bold="PFont-Bold",
                                              italic="PFont", boldItalic="PFont-Bold")
                _FONTS = ("PFont", "PFont-Bold")
                return _FONTS
        except Exception:
            continue
    _FONTS = ("Helvetica", "Helvetica-Bold")
    return _FONTS


def styles():
    f, fb = fonts()
    return {
        "h1": ParagraphStyle("h1", fontName=fb, fontSize=17, leading=21, textColor=NAVY, spaceAfter=4),
        "h2": ParagraphStyle("h2", fontName=fb, fontSize=12.5, leading=16, textColor=NAVY, spaceBefore=8, spaceAfter=5),
        "h3": ParagraphStyle("h3", fontName=fb, fontSize=10.5, leading=13, textColor=INK, spaceBefore=6, spaceAfter=3),
        "body": ParagraphStyle("body", fontName=f, fontSize=9.2, leading=12.5, textColor=INK),
        "small": ParagraphStyle("small", fontName=f, fontSize=7.8, leading=10, textColor=MUTED),
        "cell": ParagraphStyle("cell", fontName=f, fontSize=8.2, leading=10, textColor=INK),
        "cellb": ParagraphStyle("cellb", fontName=fb, fontSize=8.2, leading=10, textColor=INK),
        "cellr": ParagraphStyle("cellr", fontName=f, fontSize=8.2, leading=10, textColor=INK, alignment=TA_RIGHT),
        "head": ParagraphStyle("head", fontName=fb, fontSize=8, leading=10, textColor=colors.white),
        "headr": ParagraphStyle("headr", fontName=fb, fontSize=8, leading=10, textColor=colors.white, alignment=TA_RIGHT),
        "kpi_l": ParagraphStyle("kpi_l", fontName=fb, fontSize=7.5, leading=9, textColor=MUTED),
        "kpi_v": ParagraphStyle("kpi_v", fontName=fb, fontSize=14, leading=17, textColor=NAVY),
        "center": ParagraphStyle("center", fontName=f, fontSize=9, leading=12, alignment=TA_CENTER, textColor=INK),
    }


def P(text, st):
    return Paragraph(str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>"), st)


def data_table(header, rows, widths, align=None, total_row=False, zebra=True, font_size=None):
    """Tabela padrao: cabecalho teal, zebra, numeros alinhados a direita."""
    st = styles()
    align = align or ["l"] * len(header)
    cell_l, cell_r = st["cell"], st["cellr"]
    if font_size:
        cell_l = ParagraphStyle("cl", parent=cell_l, fontSize=font_size, leading=font_size + 2)
        cell_r = ParagraphStyle("cr", parent=cell_r, fontSize=font_size, leading=font_size + 2)
    data = [[P(h, st["headr"] if a == "r" else st["head"]) for h, a in zip(header, align)]]
    for r in rows:
        data.append([P(v, cell_r if a == "r" else cell_l) for v, a in zip(r, align)])
    t = Table(data, colWidths=widths, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    if zebra:
        for i in range(1, len(data)):
            if i % 2 == 0:
                cmds.append(("BACKGROUND", (0, i), (-1, i), SOFT))
    if total_row and len(data) > 1:
        cmds += [("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FFF1DB")),
                 ("LINEABOVE", (0, -1), (-1, -1), 0.8, ORANGE_D)]
        bold_r = ParagraphStyle("tb", parent=cell_r, fontName=fonts()[1])
        bold_l = ParagraphStyle("tbl", parent=cell_l, fontName=fonts()[1])
        data[-1] = [P(v, bold_r if a == "r" else bold_l) for v, a in zip(rows[-1], align)]
        t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle(cmds))
    return t


def kpi_row(items, width):
    """Cartoes de indicadores lado a lado: items = [(rotulo, valor, cor)]."""
    st = styles()
    cells = []
    for label, value, color in items:
        vs = ParagraphStyle("kv", parent=st["kpi_v"], textColor=color or NAVY)
        cells.append([[P(label.upper(), st["kpi_l"])], [P(value, vs)]])
    inner = [Table(c, colWidths=[width / len(items) - 8]) for c in cells]
    for t in inner:
        t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 1),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    t = Table([inner], colWidths=[width / len(items)] * len(items))
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.6, LINE),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white), ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LINEABOVE", (0, 0), (-1, 0), 2.2, ORANGE),
    ]))
    return t


def callout(text, nivel="info", width=None):
    st = styles()
    bg = {"ok": "#E8F7EE", "warn": "#FFF6E5", "danger": "#FDECEC", "info": "#EAF4FB"}.get(nivel, "#EAF4FB")
    bar = {"ok": GREEN, "warn": AMBER, "danger": RED, "info": ORANGE_D}.get(nivel, ORANGE_D)
    t = Table([[P(text, st["body"])]], colWidths=[width or 17 * cm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(bg)),
                           ("LINEBEFORE", (0, 0), (0, -1), 3, bar),
                           ("LEFTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 7),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    return t


def fig_image(fig, width_cm):
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    FigureCanvasAgg(fig)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=200, bbox_inches="tight", facecolor="white")
    buf.seek(0)
    w, h = fig.get_size_inches()
    img = Image(buf, width=width_cm * cm, height=width_cm * cm * h / w)
    return img


def _mpl_fig(w, h):
    from matplotlib.figure import Figure
    fig = Figure(figsize=(w, h))
    fig.patch.set_facecolor("white")
    return fig


def chart_dre(rel: dict):
    fig = _mpl_fig(7.2, 2.9)
    ax = fig.add_subplot(111)
    labels = ["Faturamento", "Deduções", "Custos\nvariáveis", "Custos\nfixos", "Lucro\noperacional"]
    vals = [rel["faturamento"], rel["deducoes"], rel["cv"], rel["cf"], rel["lucro"]]
    cols = ["#FF9900", "#94A3B8", "#1B2A3D", "#52617F", "#15803D" if rel["lucro"] >= 0 else "#B91C1C"]
    bars = ax.bar(labels, vals, color=cols, width=0.62)
    for b, v in zip(bars, vals):
        ax.annotate(money(v, 0), (b.get_x() + b.get_width() / 2, max(v, 0)), ha="center", va="bottom",
                    fontsize=7.5, xytext=(0, 2), textcoords="offset points", color="#0F172A")
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.set_yticks([])
    ax.tick_params(axis="x", labelsize=8)
    ax.axhline(0, color="#CBD5E1", lw=0.8)
    fig.tight_layout()
    return fig


def chart_donut(a, sugerido=False):
    fig = _mpl_fig(3.0, 3.0)
    ax = fig.add_subplot(111)
    if sugerido:
        p, cv, ded, rat, luc = a.preco_sug, a.item.cv, sum(v for n, v, _ in a.linhas_sug[-4:]), a.rateio_sug, a.lucro_sug
    else:
        p, cv, ded, rat, luc = a.preco, a.item.cv, sum(v for n, v, _ in a.linhas[-4:]), a.rateio, a.lucro
    parts = [("Custos diretos", cv, "#1B2A3D"), ("Deduções", ded, "#94A3B8"), ("Custos fixos", rat, "#52617F"),
             ("Lucro", max(luc, 0), "#FF9900")]
    parts = [x for x in parts if x[1] > 0.0001]
    if not parts or p <= 0:
        ax.text(0.5, 0.5, "Sem dados", ha="center", va="center")
        ax.axis("off")
        return fig
    ax.pie([x[1] for x in parts], colors=[x[2] for x in parts], startangle=90, counterclock=False,
           wedgeprops=dict(width=0.38, edgecolor="white"),
           autopct=lambda v: f"{v:.0f}%" if v >= 4 else "", pctdistance=0.81,
           textprops=dict(color="white", fontsize=8, fontweight="bold"))
    ax.text(0, 0, money(p), ha="center", va="center", fontsize=9, fontweight="bold", color="#1B2A3D")
    ax.legend([x[0] for x in parts], loc="lower center", bbox_to_anchor=(0.5, -0.2), ncol=2, fontsize=7, frameon=False)
    ax.set_aspect("equal")
    fig.tight_layout()
    return fig


def _filete(canv, x1, x2, y, width=1.0, gap=1.0):
    """Filete laranja duplo (o mesmo do cabecalho do modelo de proposta da ACRS)."""
    canv.saveState()
    canv.setStrokeColor(ORANGE)
    canv.setLineWidth(width)
    canv.line(x1, y, x2, y)
    canv.line(x1, y - width - gap, x2, y - width - gap)
    canv.restoreState()


# ------------------------------------------------------------------ template de pagina
class _Doc(BaseDocTemplate):
    def __init__(self, path, empresa: str, titulo: str, logo_bytes: bytes | None = None, **kw):
        super().__init__(str(path), pagesize=A4, leftMargin=1.6 * cm, rightMargin=1.6 * cm,
                         topMargin=2.4 * cm, bottomMargin=1.6 * cm, title=titulo, author=empresa,
                         creator=f"{APP_NAME} - {APP_AUTHOR}", **kw)
        self.empresa, self.titulo, self.logo = empresa, titulo, logo_bytes
        pw, ph = A4
        fp = Frame(self.leftMargin, self.bottomMargin, pw - self.leftMargin - self.rightMargin,
                   ph - self.topMargin - self.bottomMargin, id="p")
        lw, lh = landscape(A4)
        fl = Frame(self.leftMargin, self.bottomMargin, lw - self.leftMargin - self.rightMargin,
                   lh - self.topMargin - self.bottomMargin, id="l")
        self.addPageTemplates([
            PageTemplate("portrait", [fp], onPage=self._decor, pagesize=A4),
            PageTemplate("landscape", [fl], onPage=self._decor, pagesize=landscape(A4)),
        ])

    def _decor(self, canv, doc):
        f, fb = fonts()
        w, h = canv._pagesize
        canv.saveState()
        lb = self.logo or ACRS_LOGO_PNG
        x0 = 1.6 * cm
        try:
            ir = ImageReader(io.BytesIO(lb))
            iw, ih = ir.getSize()
            lh = 1.15 * cm
            lw = min(3.4 * cm, lh * iw / ih)
            lh = lw * ih / iw
            canv.drawImage(ir, x0, h - 0.45 * cm - lh, width=lw, height=lh, mask="auto")
            x0 += lw + 0.35 * cm
        except Exception:
            pass
        canv.setFillColor(NAVY)
        canv.setFont(fb, 10.5)
        canv.drawString(x0, h - 1.25 * cm, self.empresa)
        canv.setFont(f, 9)
        canv.setFillColor(MUTED)
        canv.drawRightString(w - 1.6 * cm, h - 1.25 * cm, self.titulo)
        _filete(canv, 1.6 * cm, w - 1.6 * cm, h - 1.85 * cm)
        canv.setStrokeColor(LINE)
        canv.setLineWidth(0.6)
        canv.line(1.6 * cm, 1.15 * cm, w - 1.6 * cm, 1.15 * cm)
        canv.setFont(f, 7.5)
        canv.drawString(1.6 * cm, 0.75 * cm, f"Gerado em {datetime.now():%d/%m/%Y %H:%M} pelo {APP_NAME} · {APP_AUTHOR}")
        canv.drawRightString(w - 1.6 * cm, 0.75 * cm, f"Página {doc.page}")
        canv.restoreState()

    @property
    def width_p(self):
        return A4[0] - self.leftMargin - self.rightMargin

    @property
    def width_l(self):
        return landscape(A4)[0] - self.leftMargin - self.rightMargin


def _empresa(cfg: dict) -> str:
    return (cfg.get("empresa_fantasia") or cfg.get("empresa_nome") or "Minha Empresa").strip()


def _sigla(cfg: dict) -> str:
    """Nome curto usado nos textos da proposta (ex.: ACRS)."""
    return (cfg.get("empresa_sigla") or cfg.get("empresa_fantasia") or cfg.get("empresa_nome") or "Empresa").strip()


def _logo_bytes(cfg: dict) -> bytes:
    """Logotipo escolhido em Configuracoes; se nao houver, usa o logotipo da ACRS embutido no programa."""
    p = cfg.get("empresa_logo") or ""
    try:
        if p and Path(p).exists():
            return Path(p).read_bytes()
    except OSError:
        pass
    return ACRS_LOGO_PNG


# ------------------------------------------------------------------ relatorio completo
SECOES = [
    ("resumo", "Resumo e resultado do mês"),
    ("precos", "Tabela de preços (serviços e revenda)"),
    ("simulacao", "Simulação de vendas (mix)"),
    ("fichas", "Fichas técnicas dos serviços"),
    ("equipe", "Equipe, encargos e capacidade produtiva"),
    ("custos", "Custos fixos e depreciação"),
    ("insumos", "Cadastro de insumos e preços de referência"),
    ("concorrentes", "Análise de concorrentes"),
]


def relatorio_completo(engine, path, secoes=None) -> Path:
    engine.reload()
    secoes = set(secoes or [k for k, _ in SECOES])
    cfg = engine.cfg
    st = styles()
    doc = _Doc(path, _empresa(cfg), "Relatório de Precificação", _logo_bytes(cfg))
    W, WL = doc.width_p, doc.width_l
    story = []
    rel = engine.relatorio()
    cap = engine.capacidade()
    cf = engine.custos_fixos()

    # ---------------- capa / resumo
    story += [Spacer(1, 4), P("Relatório de Precificação", st["h1"]),
              P(f"{_empresa(cfg)}  ·  emitido em {date.today():%d/%m/%Y}", st["small"]), Spacer(1, 10)]
    story.append(kpi_row([
        ("Faturamento previsto", money(rel["faturamento"]), NAVY),
        ("Margem de contribuição", pct(rel["mc_pct"]), ORANGE_D),
        ("Lucro operacional", money(rel["lucro"]), GREEN if rel["lucro"] >= 0 else RED),
        ("Ponto de equilíbrio", money(rel["pe"]), NAVY),
    ], W))
    story += [Spacer(1, 8), callout(rel["analise"], rel["nivel"], W)]

    if "resumo" in secoes:
        story += [P("1. Resultado do mês (DRE gerencial)", st["h2"])]
        rows = [[n, money(v), pct(p)] for n, v, p in rel["dre"]]
        story.append(data_table(["Demonstração do resultado", "Valor (R$)", "% do faturamento"], rows,
                                [W * 0.56, W * 0.24, W * 0.20], ["l", "r", "r"], total_row=True))
        story += [Spacer(1, 6), fig_image(chart_dre(rel), 16.5)]
        ind = [
            ["Ponto de equilíbrio (vender para ficar no 0 a 0)", money(rel["pe"]), "Custos fixos ÷ MC%"],
            ["Ponto de equilíbrio econômico (com o lucro desejado)", money(rel["pe_econ"]), "(Custos fixos + lucro) ÷ MC%"],
            ["Lucro desejado no mês", money(rel["lucro_desejado"]), "Configurações"],
            ["Ticket médio dos serviços", money(rel["ticket"]), "Faturamento ÷ quantidade"],
            ["Margem de segurança", pct(rel["margem_seguranca"]), "(Faturamento − PE) ÷ faturamento"],
            ["Rateio de custos fixos no preço", pct(engine.rateio_pct()), "Custos fixos ÷ faturamento"],
        ]
        story += [P("Indicadores gerenciais", st["h3"]),
                  data_table(["Indicador", "Valor", "Como é calculado"], ind, [W * 0.47, W * 0.2, W * 0.33], ["l", "r", "l"])]
        capr = [
            ["Colaboradores produtivos", num(cap["colaboradores"], 0)],
            ["Horas por dia × dias no mês", f"{num(cap['horas_dia'], 1)} h × {num(cap['dias_mes'], 0)} dias"],
            ["Produtividade considerada", pct(cap["produtividade"])],
            ["Horas efetivas da equipe no mês", f"{num(cap['efetivas_equipe'], 1)} h"],
            ["Horas vendidas (previsão × ficha técnica)", f"{num(cap['alocadas'], 1)} h"],
            ["Capacidade vendida / ociosidade", f"{pct(cap['vendidas_pct'])} / {pct(cap['ociosidade_pct'])}"],
        ]
        story += [P("Capacidade produtiva", st["h3"]),
                  data_table(["Item", "Valor"], capr, [W * 0.6, W * 0.4], ["l", "r"]),
                  Spacer(1, 4), callout(cap["status"], cap["nivel"], W)]

    # ---------------- precos (paisagem)
    if "precos" in secoes or "simulacao" in secoes:
        story += [NextPageTemplate("landscape"), PageBreak()]
    if "precos" in secoes:
        story.append(P("2. Tabela de preços", st["h2"]))
        rows = []
        for it in engine.itens("servico"):
            sug = engine.preco_sugerido("servico", it.id)
            rows.append([it.nome, money(it.preco), money(it.custo_mod), money(it.custo_md), money(it.cv),
                         money(it.deducoes), money(it.mc), pct(it.mc_pct), money(sug) if sug else "—",
                         num(safe_div(it.preco, it.cv), 2) if it.cv else "—"])
        if rows:
            story.append(P("Serviços", st["h3"]))
            story.append(data_table(
                ["Serviço", "Preço atual", "Mão de obra", "Materiais", "Custo variável", "Deduções", "Margem contrib.",
                 "MC %", "Preço sugerido", "Markup atual"], rows,
                [WL * x for x in (0.24, 0.085, 0.085, 0.085, 0.09, 0.08, 0.09, 0.06, 0.095, 0.07)],
                ["l"] + ["r"] * 9, font_size=7.6))
            story.append(P(f"Preço sugerido com lucro desejado de {pct(engine.c('lucro_desejado_pct', 15) / 100)} "
                           f"e rateio de custos fixos de {pct(engine.rateio_pct())}.", st["small"]))
        rows = []
        for it in engine.itens("revenda"):
            sug = engine.preco_sugerido("revenda", it.id)
            rows.append([it.nome, it.unidade, money(it.preco), money(it.custo_md), money(it.deducoes), money(it.mc),
                         pct(it.mc_pct), money(sug) if sug else "—"])
        if rows:
            story.append(P("Produtos de revenda", st["h3"]))
            story.append(data_table(["Produto", "Unidade", "Preço atual", "CMV", "Deduções", "Margem contrib.", "MC %",
                                     "Preço sugerido"], rows,
                                    [WL * x for x in (0.3, 0.09, 0.1, 0.1, 0.1, 0.11, 0.08, 0.12)], ["l", "l"] + ["r"] * 6,
                                    font_size=7.6))
        if not engine.itens():
            story.append(P("Nenhum serviço ou produto cadastrado.", st["body"]))

    if "simulacao" in secoes:
        story.append(P("3. Simulação de vendas do mês (mix)", st["h2"]))
        rows = []
        for it in engine.itens():
            if it.previsao <= 0:
                continue
            rows.append([("S · " if it.tipo == "servico" else "R · ") + it.nome, num(it.previsao, 0), money(it.faturamento),
                         money(it.cv_total), money(it.ded_total), money(it.mc_total), money(it.rateio_cf), money(it.lucro),
                         pct(it.lucro_pct), num(it.markup, 2), pct(it.mix_pct)])
        t = engine.totais()
        if rows:
            rows.append(["TOTAL", num(t["quantidade"], 0), money(t["faturamento"]), money(t["cv"]), money(t["deducoes"]),
                         money(t["mc"]), money(t["rateio"]), money(t["lucro"]), pct(t["lucro_pct"]), num(t["markup"], 2),
                         "100%"])
            story.append(data_table(["Item (S = serviço, R = revenda)", "Qtd/mês", "Faturamento", "Custo variável",
                                     "Deduções", "Margem contrib.", "Rateio CF", "Lucro", "Lucro %", "Markup", "% mix"],
                                    rows, [WL * x for x in (0.22, 0.06, 0.09, 0.09, 0.08, 0.09, 0.08, 0.09, 0.06, 0.06, 0.06)],
                                    ["l"] + ["r"] * 10, total_row=True, font_size=7.6))
        else:
            story.append(P("Informe a previsão de vendas na tela Simulação para preencher esta seção.", st["body"]))

    if "precos" in secoes or "simulacao" in secoes:
        story += [NextPageTemplate("portrait"), PageBreak()]

    # ---------------- fichas tecnicas
    if "fichas" in secoes:
        story.append(P("4. Fichas técnicas dos serviços", st["h2"]))
        any_f = False
        for s in engine.servicos:
            f = engine.ficha(s["id"])
            if not (f["mod"] or f["insumos"]):
                continue
            any_f = True
            block = [P(s["nome"], st["h3"])]
            if f["mod"]:
                block.append(data_table(["Mão de obra", "Cargo/função", "Custo/hora", "Horas", "Custo total"],
                                        [[m["nome"], m["cargo"], money(m["custo_hora"]), num(m["horas"], 2), money(m["total"])]
                                         for m in f["mod"]], [W * 0.32, W * 0.24, W * 0.15, W * 0.12, W * 0.17],
                                        ["l", "l", "r", "r", "r"]))
            if f["insumos"]:
                block += [Spacer(1, 3), data_table(["Insumo / serviço", "Medida", "Custo unitário", "Qtde", "Custo total"],
                                                   [[i["descricao"], i["unidade"], money(i["custo_unit"], 2),
                                                     num(i["quantidade"], 2), money(i["total"])] for i in f["insumos"]],
                                                   [W * 0.38, W * 0.18, W * 0.15, W * 0.12, W * 0.17], ["l", "l", "r", "r", "r"])]
            tot = [["Total de horas alocadas", f"{num(f['horas'], 2)} h"], ["Custo com mão de obra direta", money(f["custo_mod"])],
                   ["Custo com insumos", money(f["custo_md"])], ["CUSTO TOTAL", money(f["total"])]]
            tt = Table([[P(a, st["cellb"]), P(b, st["cellr"])] for a, b in tot], colWidths=[W * 0.83, W * 0.17])
            tt.setStyle(TableStyle([("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FFF1DB")),
                                    ("LINEABOVE", (0, -1), (-1, -1), 0.8, ORANGE_D),
                                    ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
            block += [Spacer(1, 2), tt, Spacer(1, 6)]
            story.append(KeepTogether(block))
        if not any_f:
            story.append(P("Nenhuma ficha técnica preenchida.", st["body"]))

    # ---------------- equipe
    if "equipe" in secoes:
        story.append(P("5. Equipe, encargos e capacidade produtiva", st["h2"]))
        eq = engine.equipe_calc()
        if eq:
            rows = [[e["nome"], f'{e.get("setor", "")} · {e.get("contratacao", "")}', money(e["salario"]),
                     money(e["enc_sociais"] + e["enc_trab"] + e["beneficios"]), money(e["total"]),
                     num(e["carga_horaria"], 0), money(e["custo_hora"])] for e in eq]
            rows.append(["TOTAL", "", money(sum(e["salario"] for e in eq)),
                         money(sum(e["enc_sociais"] + e["enc_trab"] + e["beneficios"] for e in eq)),
                         money(sum(e["total"] for e in eq)), "", ""])
            story.append(data_table(["Nome", "Setor · contrato", "Salário", "Encargos + benefícios", "Custo total",
                                     "Horas/mês", "Custo-hora*"], rows,
                                    [W * x for x in (0.22, 0.2, 0.12, 0.13, 0.12, 0.09, 0.12)],
                                    ["l", "l"] + ["r"] * 5, total_row=True, font_size=7.6))
            story.append(P("* Custo-hora usado na ficha técnica = custo total ÷ (horas/mês × produtividade).", st["small"]))
        else:
            story.append(P("Nenhum colaborador cadastrado.", st["body"]))
        enc = [["Provisão de férias + 1/3", pct(engine.c("enc_ferias") / 100, 2)],
               ["Provisão de 13º salário", pct(engine.c("enc_13") / 100, 2)],
               ["13º sobre férias", pct(engine.c("enc_13_ferias") / 100, 2)],
               ["Total encargos trabalhistas (CLT)", pct(engine.encargos_trab_pct(), 2)],
               ["INSS + SAT/RAT + Salário-educação + Sistema S", pct((engine.c("enc_inss") + engine.c("enc_sat") +
                                                                  engine.c("enc_sal_educacao") + engine.c("enc_sistema_s")) / 100, 2)],
               ["FGTS + provisão de rescisão", pct((engine.c("enc_fgts") + engine.c("enc_fgts_rescisao")) / 100, 2)],
               ["Total encargos sociais (CLT)", pct(engine.encargos_soc_pct(), 2)],
               ["INSS sobre pró-labore", pct(engine.c("enc_prolabore_inss") / 100, 2)]]
        story += [P("Parâmetros de encargos", st["h3"]),
                  data_table(["Encargo", "Alíquota"], enc, [W * 0.7, W * 0.3], ["l", "r"])]

    # ---------------- custos fixos
    if "custos" in secoes:
        rows = [[d + (" (automático)" if auto else ""), money(v)] for d, v, auto in cf["linhas"] if v or auto]
        rows.append(["TOTAL DE CUSTOS FIXOS", money(cf["total"])])
        story.append(KeepTogether([P("6. Custos fixos e depreciação", st["h2"]),
                                   data_table(["Descrição", "Valor mensal"], rows, [W * 0.75, W * 0.25], ["l", "r"],
                                              total_row=True)]))
        dep = [d for d in engine.depreciacao() if fnum(d.get("valor"))]
        if dep:
            story += [P("Depreciação do imobilizado", st["h3"]),
                      data_table(["Bem", "Valor", "Vida útil", "Taxa anual", "Valor mensal"],
                                 [[d["descricao"], money(d["valor"]), f"{num(d['vida_util'], 0)} anos", pct(d["taxa"]),
                                   money(d["mensal"])] for d in dep],
                                 [W * 0.36, W * 0.18, W * 0.14, W * 0.14, W * 0.18], ["l", "r", "r", "r", "r"])]

    # ---------------- insumos
    if "insumos" in secoes:
        story += [PageBreak(), P("7. Insumos e preços de referência", st["h2"])]
        rows = []
        for r in engine.insumos.values():
            ic = engine.insumo_calc(r)
            rows.append([r["descricao"], r.get("unidade", ""), num(r.get("qtde_bruta"), 2), num(r.get("qtde_liquida"), 2),
                         money(r.get("custo")), num(ic["fator"], 3), money(ic["custo_medida"], 4 if ic["custo_medida"] < 10 else 2)])
        rows.sort(key=lambda x: x[0].lower())
        story.append(data_table(["Descrição", "Unidade", "Qtd bruta", "Qtd líquida", "Custo", "Fator perda", "Custo por medida"],
                                rows, [W * x for x in (0.38, 0.13, 0.09, 0.09, 0.11, 0.09, 0.11)],
                                ["l", "l", "r", "r", "r", "r", "r"], font_size=7.2))

    # ---------------- concorrentes
    if "concorrentes" in secoes:
        try:
            dados = json.loads(cfg.get("concorrentes_json") or "{}")
        except ValueError:
            dados = {}
        if dados.get("itens"):
            story.append(P("8. Análise de concorrentes", st["h2"]))
            if dados.get("cliente_alvo"):
                story += [P("Cliente-alvo", st["h3"]), P(dados["cliente_alvo"], st["body"]), Spacer(1, 4)]
            emp = dados.get("empresas") or []
            notas = dados.get("notas") or {}
            rows = [[it] + [num(notas.get(f"{i}|{j}", ""), 0) if notas.get(f"{i}|{j}") not in (None, "") else "—"
                            for j in range(len(emp))] for i, it in enumerate(dados["itens"])]
            comp = engine.concorrencia(dados)["empresas"]
            rows.append(["FATOR DE VALOR (soma das notas)"] + [num(c["fator"], 0) for c in comp])
            rows.append(["PREÇO UNITÁRIO"] + [money(c["preco"]) if c["preco"] else "—" for c in comp])
            n = len(emp)
            story.append(data_table(["Item avaliado (nota 1 a 3)"] + emp, rows, [W * 0.36] + [W * 0.64 / n] * n,
                                    ["l"] + ["r"] * n, total_row=False))
            story.append(P("Notas: 1 = baixo valor agregado, 2 = médio, 3 = alto.", st["small"]))

    doc.build(story)
    return Path(path)


# ------------------------------------------------------------------ analise individual
def analise_pdf(engine, a, path) -> Path:
    cfg = engine.cfg
    st = styles()
    doc = _Doc(path, _empresa(cfg), "Análise de preço", _logo_bytes(cfg))
    W = doc.width_p
    it = a.item
    tipo = "serviço" if it.tipo == "servico" else "produto de revenda"
    story = [P(f"Análise do {tipo}: {it.nome}", st["h1"]),
             P(f"Desconto simulado: {pct(a.desconto)}  ·  Lucro desejado: {pct(a.lucro_desejado)}  ·  "
               f"Rateio de custos fixos: {pct(a.rateio_pct)}", st["small"]), Spacer(1, 8)]
    story.append(kpi_row([("Preço praticado", money(a.preco), NAVY),
                          ("Preço sugerido", money(a.preco_sug) if a.viavel else "inviável", ORANGE_D),
                          ("Lucro no preço praticado", f"{money(a.lucro)} ({pct(safe_div(a.lucro, a.preco))})",
                           GREEN if a.lucro >= 0 else RED)], W))
    if a.aviso:
        story += [Spacer(1, 6), callout(a.aviso, "warn", W)]

    def dre(linhas, preco, mc, rateio, lucro, markup):
        rows = [["Preço de venda", money(preco), "100,0%"]]
        cv = sum(v for _, v, _ in linhas)
        rows.append(["(−) Custos variáveis", money(cv), pct(safe_div(cv, preco))])
        rows += [[f"     {n}", money(v), pct(p)] for n, v, p in linhas]
        rows += [["(=) Margem de contribuição", money(mc), pct(safe_div(mc, preco))],
                 ["(−) Rateio de custos fixos", money(rateio), pct(safe_div(rateio, preco))],
                 ["(=) Margem de lucro", money(lucro), pct(safe_div(lucro, preco))],
                 ["Markup multiplicador", num(markup, 3), ""]]
        return rows

    w2 = W / 2 - 6
    t1 = data_table(["Preço praticado", "R$", "%"], dre(a.linhas, a.preco, a.mc, a.rateio, a.lucro, a.markup),
                    [w2 * 0.56, w2 * 0.26, w2 * 0.18], ["l", "r", "r"], zebra=False)
    t2 = data_table(["Preço sugerido", "R$", "%"], dre(a.linhas_sug, a.preco_sug, a.mc_sug, a.rateio_sug, a.lucro_sug,
                                                      a.markup_sug),
                    [w2 * 0.56, w2 * 0.26, w2 * 0.18], ["l", "r", "r"], zebra=False)
    story += [Spacer(1, 10), Table([[t1, t2]], colWidths=[W / 2, W / 2],
                                   style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                          ("RIGHTPADDING", (0, 0), (-1, -1), 6)])]
    story += [Spacer(1, 10), Table([[fig_image(chart_donut(a), 7.6), fig_image(chart_donut(a, True), 7.6)]],
                                   colWidths=[W / 2, W / 2])]
    if it.tipo == "servico":
        f = engine.ficha(it.id)
        if f["mod"] or f["insumos"]:
            story.append(P("Composição do custo (ficha técnica)", st["h2"]))
            rows = [[m["nome"], f"{num(m['horas'], 2)} h × {money(m['custo_hora'])}", money(m["total"])] for m in f["mod"]]
            rows += [[i["descricao"], f"{num(i['quantidade'], 2)} {i['unidade']} × {money(i['custo_unit'])}", money(i["total"])]
                     for i in f["insumos"]]
            rows.append(["CUSTO DIRETO TOTAL", "", money(f["total"])])
            story.append(data_table(["Item", "Cálculo", "Custo"], rows, [W * 0.45, W * 0.35, W * 0.2], ["l", "l", "r"],
                                    total_row=True))
    story += [Spacer(1, 8), P("Fórmula do preço sugerido: custo direto ÷ [1 − (impostos + taxas + comissão + rateio de "
                              "custos fixos + lucro desejado)].", st["small"])]
    doc.build(story)
    return Path(path)


# ====================================================================== PROPOSTA TECNICA E COMERCIAL
# Layout reproduzido do modelo da ACRS (PDF "Proposta Obra kitnets 200A"): A4, fonte Calibri, logotipo no canto
# superior esquerdo, data em negrito a direita, titulo em 16 pt, filete laranja duplo, secoes em negrito sublinhado,
# tabela de investimento em cinza com valores centralizados e linhas de assinatura no final.
import re
from reportlab.lib.enums import TA_LEFT

PW, PH = A4                 # 595,3 x 841,9 pt
X_L, X_R = 35.0, 556.5      # quadro de texto (o OBJETIVO usa a largura quase toda)
X_BODY, BODY_R = 46.8, 390.5    # texto das secoes
X_ESC, ESC_R = 48.8, 385.5      # texto do escopo (10 pt no Word)
X_HEAD = 55.6                   # titulos das secoes
# O PDF de referencia foi impresso do Word com ~97,4% de escala: os tamanhos abaixo ja incluem esse fator
FS = 10.72                      # corpo (11 pt no Word)
FS_ESC = 9.75                   # escopo e fecho (10 pt no Word)
LEAD = 13.1                     # entrelinha do corpo
LEAD_ESC = 11.85                # entrelinha do texto de 10 pt
FRAME_TOP = 135.6               # distancia (pt) do topo da pagina ate o primeiro texto das paginas seguintes
FRAME_BOTTOM = 772.0            # distancia do topo da pagina ate o limite inferior do texto
RULE_Y = 123.1                  # filete laranja do cabecalho (distancia do topo)
COLS_INV = [12.8, 36.0, 256.2, 116.5, 100.0]    # tabela de investimento (soma = X_R - X_L)


def _esc(t) -> str:
    return str(t if t is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _rich(t) -> str:
    """Texto digitado -> XML do reportlab: escapa e converte **negrito** e quebras de linha."""
    s = _esc(t)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s, flags=re.S)
    return s.replace("\n", "<br/>")


def _paras(t) -> list[str]:
    """Linha em branco separa paragrafos; quebra de linha simples fica dentro do paragrafo."""
    parts = re.split(r"\n\s*\n", str(t or "").replace("\r", "").strip())
    return [p.strip("\n") for p in parts if p.strip()]


def _json(v, default):
    if isinstance(v, (list, dict)):
        return v
    try:
        out = json.loads(v) if v else default
        return out if isinstance(out, type(default)) else default
    except (ValueError, TypeError):
        return default


def proposta_totais(prop: dict, itens: list[dict], cfg: dict) -> dict:
    subtotal = sum(fnum(i.get("quantidade"), 1) * fnum(i.get("valor_unit")) for i in itens)
    desconto = min(fnum(prop.get("desconto_valor")), subtotal)
    total = subtotal - desconto
    pix = fnum(cfg.get("proposta_pix_desconto_pct"), 5)
    return dict(subtotal=subtotal, desconto=desconto, total=total, pix_pct=pix, total_pix=total * (1 - pix / 100))


def dividir_parcelas(total: float, entrada: float, n: int, intervalo: int = 30, detalhe_entrada: str = "") -> list[dict]:
    """Entrada + n parcelas iguais (os centavos que sobram ficam na ultima), no estilo do modelo:
    Entrada, Parcela 2 (30 dias), Parcela 3 (60 dias)..."""
    total, entrada = round(fnum(total), 2), round(min(max(fnum(entrada), 0), fnum(total)), 2)
    n = max(int(n), 0)
    out = []
    if entrada > 0 or n == 0:
        out.append(dict(rotulo="Entrada", valor=entrada if n else total,
                        detalhe=detalhe_entrada or "no aceite da proposta"))
    if n:
        resto = round(total - (entrada if entrada > 0 else 0), 2)
        base = round(resto / n, 2)
        for i in range(n):
            v = base if i < n - 1 else round(resto - base * (n - 1), 2)
            out.append(dict(rotulo=f"Parcela {len(out) + 1}", valor=v,
                            detalhe=f"{intervalo * (i + 1)} dias após o aceite"))
    return out


def proposta_contexto(cfg: dict, prop: dict, itens: list[dict]) -> dict:
    tot = proposta_totais(prop, itens, cfg)
    try:
        dt = datetime.strptime(prop.get("data") or "", "%Y-%m-%d").date()
    except ValueError:
        dt = date.today()
    return dict(empresa=_sigla(cfg), numero=int(fnum(prop.get("numero"))), data=dt, total=tot["total"],
                validade=int(fnum(prop.get("validade_dias"), 30)), cliente=(prop.get("cliente_nome") or "").strip(),
                titulo=(prop.get("titulo") or "").strip())


def _sub(texto, ctx) -> str:
    """Troca os campos {empresa}, {EMPRESA}, {numero}, {validade_dias}, {total}, {cliente}, {titulo}."""
    rep = {"{EMPRESA}": ctx["empresa"].upper(), "{empresa}": ctx["empresa"], "{numero}": str(ctx["numero"]),
           "{validade_dias}": str(ctx["validade"]), "{total}": money(ctx["total"]), "{cliente}": ctx["cliente"],
           "{titulo}": ctx["titulo"]}
    s = str(texto or "")
    for k, v in rep.items():
        s = s.replace(k, v)
    return s


def _pst(name, size=FS, lead=LEAD, left=None, right=None, bold=False, align=TA_LEFT, before=0.0, after=0.0,
         keep=False):
    f, fb = fonts()
    left = X_BODY if left is None else left
    right = BODY_R if right is None else right
    return ParagraphStyle(name, fontName=fb if bold else f, fontSize=size, leading=lead, textColor=colors.black,
                          leftIndent=left - X_L, rightIndent=X_R - right, spaceBefore=before, spaceAfter=after,
                          alignment=align, keepWithNext=1 if keep else 0)


class _Seta(Flowable):
    """Marcador de topico (seta) do escopo."""

    def __init__(self, size=FS_ESC):
        super().__init__()
        self.size, self.width, self.height = size, 8.0, LEAD_ESC

    def draw(self):
        c = self.canv
        cy = self.height - self.size * 0.62
        c.setFillColor(colors.black)
        p = c.beginPath()
        p.moveTo(0.2, cy - 2.9)
        p.lineTo(7.7, cy)
        p.lineTo(0.2, cy + 2.9)
        p.lineTo(2.3, cy)
        p.close()
        c.drawPath(p, stroke=0, fill=1)


class _Filete(Flowable):
    """Filete laranja duplo no corpo da pagina (abaixo do titulo da primeira pagina)."""

    def __init__(self, height=3.0):
        super().__init__()
        self.width, self.height = X_R - X_L, height

    def draw(self):
        _filete(self.canv, X_BODY - X_L, X_R - 0.7 - X_L, self.height - 0.5)


class _Assinaturas(Flowable):
    """Duas linhas de assinatura com o nome abaixo, centralizado."""

    def __init__(self, a1, a2):
        super().__init__()
        self.a1, self.a2 = a1, a2
        self.width, self.height = X_R - X_L, 26.0

    def draw(self):
        c = self.canv
        f, fb = fonts()
        for (x1, x2), nome in (((82.8, 268.2), self.a1), ((336.8, 522.5), self.a2)):
            c.setStrokeColor(colors.black)
            c.setLineWidth(0.75)
            y = self.height - 0.5
            c.line(x1 - X_L, y, x2 - X_L, y)
            nome = (nome or "").strip()
            if not nome:
                continue
            size = 8.8
            while size > 6 and pdfmetrics.stringWidth(nome, fb, size) > (x2 - x1) + 30:
                size -= 0.5
            c.setFont(fb, size)
            c.setFillColor(colors.black)
            c.drawCentredString((x1 + x2) / 2 - X_L, y - 2.6 - size * 0.8, nome)


def _decor_proposta(ctx, logo, cfg):
    f, fb = fonts()
    title = Paragraph(_esc(f"PROPOSTA TÉCNICA E COMERCIAL: N° {ctx['numero']}  - {ctx['titulo']}".rstrip(" -")),
                      ParagraphStyle("pt", fontName=f, fontSize=15.6, leading=17.8, textColor=colors.black))

    def decor(canv, doc):
        canv.saveState()
        # logotipo (cabe numa caixa de 36 pt de altura)
        try:
            ir = ImageReader(io.BytesIO(logo))
            iw, ih = ir.getSize()
            h = 36.0
            w = h * iw / ih
            if w > 130:
                w, h = 130.0, 130.0 * ih / iw
            canv.drawImage(ir, 48.6, PH - 49.0 - h, width=w, height=h, mask="auto")
        except Exception:
            pass
        canv.setFillColor(colors.black)
        canv.setFont(fb, FS_ESC)
        canv.drawRightString(554.8, PH - 81.1, f"Data: {ctx['data']:%d/%m/%y}")
        _, th = title.wrap(498, 100)
        title.drawOn(canv, 50.2, PH - 86.5 - th + 3.9)
        _filete(canv, 46.8, 555.8, PH - RULE_Y)
        canv.setFont(f, FS)
        canv.drawCentredString(297.9, PH - 787.0, str(doc.page))
        canv.restoreState()
    return decor


def _bloco_secao(titulo, texto, ctx, *, left=X_HEAD, before=6.7, after=11.2, nova_pagina=False, espaco=0.0):
    """Titulo (negrito sublinhado) + paragrafos do texto. Retorna lista de flowables ([] se nao houver texto)."""
    paras = _paras(_sub(texto, ctx))
    titulo = _sub(titulo, ctx).strip()
    if not paras:
        return []
    out = [PageBreak()] if nova_pagina else []
    if espaco:
        out.append(Spacer(1, espaco))
    out.append(Paragraph(f"<u>{_esc(titulo)}</u>", _pst("h", bold=True, left=left, right=X_R, before=before,
                                                          after=after, keep=True)))
    for i, p in enumerate(paras):
        st = _pst("b", after=LEAD if i < len(paras) - 1 else 0)
        out.append(Paragraph(_rich(p), st))
    return out


def proposta_pdf(cfg: dict, prop: dict, itens: list[dict], path) -> Path:
    f, fb = fonts()
    ctx = proposta_contexto(cfg, prop, itens)
    tot = proposta_totais(prop, itens, cfg)
    logo = _logo_bytes(cfg)
    numero = ctx["numero"]
    doc = BaseDocTemplate(str(path), pagesize=A4, leftMargin=X_L, rightMargin=PW - X_R, topMargin=FRAME_TOP,
                          bottomMargin=PH - FRAME_BOTTOM, title=f"Proposta técnica e comercial nº {numero}",
                          author=_empresa(cfg), creator=APP_NAME)
    frame = Frame(X_L, PH - FRAME_BOTTOM, X_R - X_L, FRAME_BOTTOM - FRAME_TOP, leftPadding=0, rightPadding=0,
                  topPadding=0, bottomPadding=0, id="f")
    doc.addPageTemplates([PageTemplate("p", [frame], onPage=_decor_proposta(ctx, logo, cfg))])
    story = []

    # ---------------- A/C + objeto
    ac = (prop.get("aos_cuidados") or prop.get("cliente_nome") or "").strip()
    story += [Spacer(1, 29.0)]   # sem filete aqui: o filete duplo fica apenas no cabeçalho
    if ac:
        story.append(Paragraph(f"<u>A/C.: {_esc(ac)}</u>", _pst("ac", bold=True, left=49.6, right=X_R)))
    objeto = _paras(_sub(prop.get("objeto"), ctx))
    if objeto:
        story.append(Paragraph("<u>OBJETIVO</u>", _pst("h", bold=True, left=49.2, right=X_R, before=13.5, after=LEAD,
                                                     keep=True)))
        for i, p in enumerate(objeto):
            story.append(Paragraph(_rich(p), _pst("o", left=35.0, right=552.0, after=LEAD if i < len(objeto) - 1 else 0)))

    # ---------------- escopo
    escopo = _json(prop.get("escopo_json"), [])
    intro = _sub(prop.get("escopo_intro"), ctx).strip()
    if escopo or intro:
        story.append(Paragraph("<u>ESCOPO DOS SERVIÇOS</u>", _pst("h", bold=True, left=51.4, right=X_R, before=8.7,
                                                                  after=3.2, keep=True)))
        st10 = _pst("e", size=FS_ESC, lead=LEAD_ESC, left=X_ESC, right=ESC_R, after=LEAD_ESC)
        if intro:
            story.append(Paragraph(_rich(intro), st10))
        for blk in escopo:
            tit, txt = (blk.get("titulo") or "").strip(), _sub(blk.get("texto"), ctx).strip()
            if not (tit or txt):
                continue
            head = (f"{_esc(_sub(tit, ctx))}: " if tit else "") + _rich(txt)
            story.append(Paragraph(head, st10))
            for tp in [t.strip() for t in str(blk.get("topicos") or "").split("\n") if t.strip()]:
                row = Table([["", _Seta(), Paragraph(_rich(_sub(tp, ctx)), _pst("t", size=FS_ESC, lead=LEAD_ESC, left=X_L,
                                                                                right=X_R))]],
                            colWidths=[66.4 - X_L, 83.9 - 66.4, ESC_R - 83.9], hAlign="LEFT")
                row.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                         ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                                         ("VALIGN", (0, 0), (-1, -1), "TOP")]))
                row.spaceAfter = LEAD_ESC
                story.append(row)
        nota = _sub(prop.get("escopo_nota"), ctx).strip()
        if nota:
            story.append(Paragraph(_rich(nota), _pst("n", left=X_ESC, right=BODY_R)))

    # ---------------- textos antes do investimento
    n_antes = len(story)
    for sec in _json(prop.get("secoes_pre_json"), []):
        story += _bloco_secao(sec.get("titulo", ""), sec.get("texto", ""), ctx, nova_pagina=bool(sec.get("nova_pagina")),
                              espaco=fnum(sec.get("espaco")))
    tem_texto_antes = bool(objeto or escopo or intro or len(story) > n_antes)

    # ---------------- investimento
    if itens:
        if tem_texto_antes and int(fnum(prop.get("invest_nova_pagina"), 1)):
            story.append(PageBreak())
        story.append(Paragraph("<u>INVESTIMENTO</u>", _pst("h", bold=True, left=49.2, right=X_R, before=6.7, after=7.3,
                                                          keep=len(itens) <= 12)))
        pn = _pst("pn", left=X_L, right=X_L + COLS_INV[1])
        pd_ = _pst("pd", left=X_L, right=X_R)
        pv = _pst("pv", left=X_L, right=X_R, align=TA_CENTER)
        data, mid_rows = [], []
        for k, it in enumerate(itens, 1):
            q, v = fnum(it.get("quantidade"), 1), fnum(it.get("valor_unit"))
            desc = _rich(_sub(it.get("descricao"), ctx))
            if abs(q - 1) > 1e-9:       # o modelo mostra so o valor do item; quantidades diferentes de 1 ficam na descricao
                qtxt = num(q, 0 if abs(q - round(q)) < 1e-9 else 2) + (f" {it['unidade']}" if it.get("unidade") else "")
                desc += f" ({_esc(qtxt)} × {_esc(money(v))})"
            pdesc = Paragraph(desc, _pst("pd2", left=X_L, right=X_R))
            pdesc.wrap(COLS_INV[2] - 0.01, 10000)
            if len(pdesc.blPara.lines) >= 3:
                mid_rows.append(len(data))
            data.append(["", Paragraph(str(k), _pst("pn2", left=X_L, right=X_R)), pdesc, "", Paragraph(_esc(money(q * v)), pv)])
        data.append(["", "", "", "", ""])
        t = Table(data, colWidths=COLS_INV, hAlign="LEFT", rowHeights=[None] * (len(data) - 1) + [13.8])
        t.setStyle(TableStyle([
            ("BACKGROUND", (1, 0), (-1, -1), SOFT), ("VALIGN", (0, 0), (-1, -1), "TOP"),
            *[("VALIGN", (4, r), (4, r), "MIDDLE") for r in mid_rows],
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
        story += [t, Spacer(1, 12.2)]
        lab = _pst("lab", left=X_L, right=X_R, align=TA_CENTER)
        trs = []
        if tot["desconto"] > 0:
            trs += [["", "", "", Paragraph("SUBTOTAL", lab), Paragraph(_esc(money(tot["subtotal"])), pv)],
                    ["", "", "", Paragraph("DESCONTO", lab), Paragraph(_esc("− " + money(tot["desconto"])), pv)]]
        trs.append(["", "", "", Paragraph("VALOR TOTAL DO INVESTIMENTO", lab), Paragraph(_esc(money(tot["total"])), pv)])
        tt = Table(trs, colWidths=COLS_INV, hAlign="LEFT")
        tt.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
        story.append(tt)

    # ---------------- condicoes de pagamento
    parcelas = _json(prop.get("parcelas_json"), [])
    linhas = []
    for p in parcelas:
        rot, det = (p.get("rotulo") or "").strip(), (p.get("detalhe") or "").strip()
        if not (rot or fnum(p.get("valor"))):
            continue
        linhas.append(f"{rot + ': ' if rot else ''}{money(p.get('valor'))}" + (f" ({det})." if det else "."))
    if not linhas and (prop.get("detalhes_pagamento") or "").strip():          # propostas antigas
        linhas = [x.strip() for x in prop["detalhes_pagamento"].split("\n") if x.strip()]
    if linhas:
        story.append(Paragraph("<u>CONDIÇÕES DE PAGAMENTO</u>", _pst("h", bold=True, left=X_HEAD, right=X_R, before=35.0,
                                                                     after=11.2, keep=True)))
        for i, ln in enumerate(linhas):
            story.append(Paragraph(_esc(ln), _pst("b", after=LEAD if i < len(linhas) - 1 else 0)))

    # ---------------- textos depois (validade, garantia, observacoes...)
    pos = _json(prop.get("secoes_pos_json"), [])
    if not pos and (prop.get("observacoes") or "").strip():                      # propostas antigas
        pos = [dict(titulo="OBSERVAÇÕES COMERCIAIS IMPORTANTES", texto=prop["observacoes"])]
    for sec in pos:
        story += _bloco_secao(sec.get("titulo", ""), sec.get("texto", ""), ctx, nova_pagina=bool(sec.get("nova_pagina")),
                              espaco=fnum(sec.get("espaco")))

    # ---------------- fechamento e assinaturas
    fecho = _paras(_sub(prop.get("fecho"), ctx))
    a1 = _sub(prop.get("assinatura1") or (f"{ac} (Resp.)" if ac else ""), ctx)
    a2 = _sub(prop.get("assinatura2") or cfg.get("proposta_assinante_empresa") or "", ctx)
    fim = []
    for i, p in enumerate(fecho):
        fim.append(Paragraph(_rich(p), _pst("fe", size=FS_ESC, lead=LEAD_ESC, left=49.1, right=BODY_R,
                                            before=30.1 if i == 0 else 0, after=10.0)))
    fim.append(Paragraph("Aprovo as condições acima descritas em __________/__________/__________e assinamos:",
                         _pst("ap", size=FS_ESC, lead=LEAD_ESC, left=49.1, right=X_R, before=0 if fecho else 30.1)))
    fim += [Spacer(1, 80.7), _Assinaturas(a1, a2)]
    story.append(KeepTogether(fim))
    doc.build(story)
    return Path(path)
