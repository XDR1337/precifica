# -*- coding: utf-8 -*-
"""Componentes visuais reutilizaveis (tema, tabelas, dialogos, cartoes)."""
from __future__ import annotations

import sys
import tkinter as tk
import tkinter.font as tkfont
from tkinter import ttk

import customtkinter as ctk

from .core import fnum, num_input

# ------------------------------------------------------------------ paleta (identidade visual ACRS)
# laranja do filete da proposta (#FF9900) + azul-grafite do logotipo
BG = "#F4F5F7"
CARD = "#FFFFFF"
BORDER = "#E3E6EB"
INK = "#111A25"
INK2 = "#2F3B4B"
MUTED = "#5F6B7A"
SUBTLE = "#9AA3B0"
PRIMARY = "#FF9900"
PRIMARY_H = "#E08600"
PRIMARY_SOFT = "#FFF1DB"
ON_PRIMARY = "#111A25"          # texto sobre o laranja (contraste alto)
ACCENT = "#FFB347"
NAVY = "#1B2A3D"
NAVY_H = "#2C3E56"
STEEL = "#52617F"
SIDEBAR = "#111A25"
SIDEBAR_H = "#1F2C3F"
SIDEBAR_TXT = "#CBD2DD"
SIDEBAR_MUTED = "#8793A5"
SUCCESS = "#15803D"
SUCCESS_SOFT = "#E8F7EE"
WARN = "#B45309"
WARN_SOFT = "#FFF6E5"
DANGER = "#C62828"
DANGER_SOFT = "#FDECEC"
INFO_SOFT = "#FFF1DB"
FIELD = "#F8F9FB"               # fundo dos campos de texto

FAMILY = "Segoe UI" if sys.platform.startswith("win") else "Helvetica"
ICON = {"path": None}  # definido pelo App (icone .ico da janela)
NIVEL_CORES = {"ok": (SUCCESS_SOFT, SUCCESS), "warn": (WARN_SOFT, WARN), "danger": (DANGER_SOFT, DANGER),
               "info": (INFO_SOFT, "#B36B00")}


def F(size=13, weight="normal"):
    return ctk.CTkFont(family=FAMILY, size=size, weight=weight)


def screen_size(widget) -> tuple[int, int]:
    """Tamanho da tela em pixels logicos (descontando a escala do Windows)."""
    sc = window_scaling(widget) or 1.0
    try:
        return int(widget.winfo_screenwidth() / sc), int(widget.winfo_screenheight() / sc)
    except Exception:
        return 1920, 1080


def window_scaling(widget) -> float:
    try:
        return float(ctk.ScalingTracker.get_window_scaling(widget))
    except Exception:
        return 1.0


def setup_ttk_style(root):
    s = ttk.Style(root)
    try:
        s.theme_use("clam")
    except tk.TclError:
        pass
    sc = window_scaling(root)
    body = tkfont.Font(root=root, family=FAMILY, size=10)
    head = tkfont.Font(root=root, family=FAMILY, size=9, weight="bold")
    s.configure("P.Treeview", background=CARD, fieldbackground=CARD, foreground=INK, rowheight=int(30 * sc),
                borderwidth=0, relief="flat", font=body)
    s.configure("P.Treeview.Heading", background="#EEF0F3", foreground="#3A4656", font=head, relief="flat",
                borderwidth=0, padding=(8, int(6 * sc)))
    root._p_fonts = (body, head)  # manter referencia (senao o Tk descarta a fonte)
    s.map("P.Treeview.Heading", background=[("active", "#E2E6EC")])
    s.map("P.Treeview", background=[("selected", "#FFE2B8")], foreground=[("selected", INK)])
    s.layout("P.Treeview", [("Treeview.treearea", {"sticky": "nswe"})])
    for orient in ("Vertical", "Horizontal"):
        s.configure(f"P.{orient}.TScrollbar", troughcolor=CARD, background="#C9CFD8", bordercolor=CARD,
                    arrowcolor=MUTED, relief="flat")


# ------------------------------------------------------------------ botoes
def btn(master, text, command=None, kind="primary", width=None, **kw):
    styles = {
        "primary": dict(fg_color=PRIMARY, hover_color=PRIMARY_H, text_color=ON_PRIMARY),
        "secondary": dict(fg_color=CARD, hover_color="#EEF0F3", text_color=INK2, border_width=1, border_color=BORDER),
        "ghost": dict(fg_color="transparent", hover_color="#ECEEF2", text_color="#B36B00"),
        "danger": dict(fg_color=CARD, hover_color=DANGER_SOFT, text_color=DANGER, border_width=1, border_color="#F3C5C5"),
        "navy": dict(fg_color=NAVY, hover_color=NAVY_H, text_color="white"),
    }
    opts = dict(text=text, command=command, height=34, corner_radius=8, font=F(13, "bold" if kind in ("primary", "navy") else "normal"))
    opts.update(styles[kind])
    if width:
        opts["width"] = width
    opts.update(kw)
    return ctk.CTkButton(master, **opts)


def card(master, **kw):
    opts = dict(fg_color=CARD, corner_radius=12, border_width=1, border_color=BORDER)
    opts.update(kw)
    return ctk.CTkFrame(master, **opts)


def section_title(master, text, sub=None):
    f = ctk.CTkFrame(master, fg_color="transparent")
    ctk.CTkLabel(f, text=text, font=F(15, "bold"), text_color=INK, anchor="w").pack(anchor="w")
    if sub:
        ctk.CTkLabel(f, text=sub, font=F(12), text_color=MUTED, anchor="w", justify="left", wraplength=900).pack(anchor="w")
    return f


class Callout(ctk.CTkFrame):
    def __init__(self, master, text="", nivel="info"):
        bg, fg = NIVEL_CORES.get(nivel, NIVEL_CORES["info"])
        super().__init__(master, fg_color=bg, corner_radius=10)
        self.bar = ctk.CTkFrame(self, width=5, fg_color=fg, corner_radius=3)
        self.bar.pack(side="left", fill="y", padx=(8, 0), pady=8)
        self.lbl = ctk.CTkLabel(self, text=text, font=F(13), text_color=INK, anchor="w", justify="left", wraplength=980)
        self.lbl.pack(side="left", fill="x", expand=True, padx=12, pady=10)

    def set(self, text, nivel="info"):
        bg, fg = NIVEL_CORES.get(nivel, NIVEL_CORES["info"])
        self.configure(fg_color=bg)
        self.bar.configure(fg_color=fg)
        self.lbl.configure(text=text)


class KPI(ctk.CTkFrame):
    """Cartao de indicador."""

    def __init__(self, master, title, value="—", sub="", color=NAVY, accent=ACCENT):
        super().__init__(master, fg_color=CARD, corner_radius=12, border_width=1, border_color=BORDER)
        ctk.CTkFrame(self, height=4, fg_color=accent, corner_radius=2).pack(fill="x", padx=14, pady=(10, 0))
        self.t = ctk.CTkLabel(self, text=title.upper(), font=F(11, "bold"), text_color=MUTED, anchor="w")
        self.t.pack(fill="x", padx=16, pady=(8, 0))
        self.v = ctk.CTkLabel(self, text=value, font=F(22, "bold"), text_color=color, anchor="w")
        self.v.pack(fill="x", padx=16)
        self.s = ctk.CTkLabel(self, text=sub, font=F(12), text_color=MUTED, anchor="w", justify="left", wraplength=230)
        self.s.pack(fill="x", padx=16, pady=(0, 12))

    def set(self, value, sub=None, color=None):
        self.v.configure(text=value)
        if sub is not None:
            self.s.configure(text=sub)
        if color:
            self.v.configure(text_color=color)


def kpi_grid(master, n):
    f = ctk.CTkFrame(master, fg_color="transparent")
    for i in range(n):
        f.grid_columnconfigure(i, weight=1, uniform="kpi")
    return f


# ------------------------------------------------------------------ tabela
class DataTable(ctk.CTkFrame):
    """Treeview estilizado. columns = [(chave, titulo, largura, alinhamento 'w'|'e'|'center', formatador|None)]"""

    def __init__(self, master, columns, height=12, on_double=None, on_select=None, stretch_col=0):
        super().__init__(master, fg_color=CARD, corner_radius=10, border_width=1, border_color=BORDER)
        self.columns = columns
        self.rows: list[dict] = []
        self.view: list[dict] = []
        self.filter_text = ""
        self._sort = (None, False)
        inner = tk.Frame(self, bg=CARD, highlightthickness=0, bd=0)
        inner.pack(fill="both", expand=True, padx=6, pady=6)
        keys = [c[0] for c in columns]
        self.tree = ttk.Treeview(inner, columns=keys, show="headings", height=height, style="P.Treeview",
                                 selectmode="browse")
        sb = ttk.Scrollbar(inner, orient="vertical", command=self.tree.yview, style="P.Vertical.TScrollbar")
        hsb = ttk.Scrollbar(inner, orient="horizontal", command=self.tree.xview, style="P.Horizontal.TScrollbar")
        self.tree.configure(yscrollcommand=sb.set, xscrollcommand=hsb.set)
        inner.grid_rowconfigure(0, weight=1)
        inner.grid_columnconfigure(0, weight=1)
        self.tree.grid(row=0, column=0, sticky="nsew")
        sb.grid(row=0, column=1, sticky="ns")
        hsb.grid(row=1, column=0, sticky="ew")
        sc = window_scaling(self)
        for i, (k, title, w, anchor, _fmt) in enumerate(columns):
            self.tree.heading(k, text=title, anchor=anchor if anchor != "center" else "center",
                              command=lambda kk=k: self.sort_by(kk))
            self.tree.column(k, width=int(w * sc), minwidth=int(40 * sc), anchor=anchor, stretch=(i == stretch_col))
        self.tree.tag_configure("odd", background="#FAFAFB")
        self.tree.tag_configure("neg", foreground=DANGER)
        self.tree.tag_configure("warn", foreground=WARN)
        self.tree.tag_configure("good", foreground=SUCCESS)
        self._bold = tkfont.Font(family=FAMILY, size=10, weight="bold")
        self.tree.tag_configure("total", background="#FFF1DB", font=self._bold)
        self.tree.tag_configure("muted", foreground=SUBTLE)
        if on_double:
            self.tree.bind("<Double-1>", lambda e: self._double(e, on_double))
            self.tree.bind("<Return>", lambda e: on_double(self.selected()))
        if on_select:
            self.tree.bind("<<TreeviewSelect>>", lambda e: on_select(self.selected()))
        self.empty = ctk.CTkLabel(self, text="", font=F(12), text_color=SUBTLE)

    def _double(self, event, cb):
        if self.tree.identify_region(event.x, event.y) == "heading":
            return
        r = self.selected()
        if r is not None:
            cb(r)

    def set_rows(self, rows, empty_text="Nenhum registro."):
        self.rows = list(rows)
        self._render(empty_text)

    def set_filter(self, text):
        self.filter_text = (text or "").strip().lower()
        self._render()

    def sort_by(self, key):
        last, rev = self._sort
        rev = (not rev) if last == key else False
        self._sort = (key, rev)
        self._render()

    def _render(self, empty_text="Nenhum registro."):
        sel = self.selected_id()
        self.tree.delete(*self.tree.get_children())
        rows = self.rows
        if self.filter_text:
            rows = [r for r in rows if self.filter_text in " ".join(str(v) for k, v in r.items()
                                                                     if not k.startswith("_")).lower()]
        key, rev = self._sort
        if key:
            def sk(r):
                v = r.get(key)
                return (0, v) if isinstance(v, (int, float)) else (1, str(v or "").lower())
            fixed = [r for r in rows if r.get("_fixed")]
            rows = sorted([r for r in rows if not r.get("_fixed")], key=sk, reverse=rev) + fixed
        self.view = rows
        for i, r in enumerate(rows):
            vals = []
            for k, _t, _w, _a, fmt in self.columns:
                v = r.get(k, "")
                vals.append(fmt(v) if fmt and v not in (None, "") else ("" if v is None else v))
            tags = [t for t in (r.get("_tag"),) if t]
            if i % 2 and "total" not in tags:
                tags.append("odd")
            self.tree.insert("", "end", iid=str(i), values=vals, tags=tags)
        if sel is not None:
            for i, r in enumerate(rows):
                if r.get("id") == sel:
                    self.tree.selection_set(str(i))
                    self.tree.see(str(i))
                    break
        if not rows:
            self.empty.configure(text=empty_text)
            self.empty.place(relx=0.5, rely=0.55, anchor="center")
        else:
            self.empty.place_forget()

    def selected(self):
        s = self.tree.selection()
        if not s:
            return None
        try:
            return self.view[int(s[0])]
        except (ValueError, IndexError):
            return None

    def selected_id(self):
        r = self.selected()
        return r.get("id") if r else None

    def select_id(self, id_):
        for i, r in enumerate(self.view):
            if r.get("id") == id_:
                self.tree.selection_set(str(i))
                self.tree.see(str(i))
                return True
        return False


# ------------------------------------------------------------------ dialogos
def set_icon(win):
    """Aplica o icone do app (o CTkToplevel troca o icone apos ~200 ms, por isso o atraso)."""
    ico = ICON.get("path")
    if not ico:
        return
    def apply():
        try:
            win.iconbitmap(ico)
        except Exception:
            pass
    try:
        win.after(260, apply)
    except Exception:
        pass


class _Modal(ctk.CTkToplevel):
    def __init__(self, master, title, width=560, height=None):
        super().__init__(master)
        self.withdraw()
        self.title(title)
        self.configure(fg_color=BG)
        self.result = None
        self.transient(master.winfo_toplevel())
        self.resizable(True, True)
        self._dlg_w, self._dlg_h = width, height
        self.bind("<Escape>", lambda e: self.cancel())
        self.protocol("WM_DELETE_WINDOW", self.cancel)
        set_icon(self)

    def show(self):
        self.update_idletasks()
        top = self.master.winfo_toplevel()
        w = self._dlg_w
        sc = window_scaling(self)
        h = self._dlg_h or int(self.winfo_reqheight() / sc) + 12
        sw, sh = screen_size(self)
        w, h = min(w, sw - 40), min(h, sh - 90)
        try:
            x = top.winfo_rootx() + (top.winfo_width() - int(w * sc)) // 2
            y = top.winfo_rooty() + max(30, (top.winfo_height() - int(h * sc)) // 3)
            self.geometry(f"{w}x{h}+{max(0, x)}+{max(0, y)}")
        except Exception:
            self.geometry(f"{w}x{h}")
        self.deiconify()
        self.lift()
        self.after(80, self._grab)
        self.wait_window(self)
        return self.result

    def _grab(self):
        try:
            self.grab_set()
            self.focus_force()
        except tk.TclError:
            pass

    def cancel(self):
        self.result = None
        self.destroy()


class FormDialog(_Modal):
    """Formulario generico.
    fields: dict(key, label, kind='text'|'num'|'money'|'pct'|'int'|'choice'|'combo'|'textarea', options, help, span, required)"""

    def __init__(self, master, title, fields, values=None, subtitle=None, width=620, ok_text="Salvar"):
        super().__init__(master, title, width)
        values = values or {}
        self.fields = fields
        self.widgets = {}
        head = ctk.CTkFrame(self, fg_color="transparent")
        head.pack(fill="x", padx=22, pady=(18, 6))
        ctk.CTkLabel(head, text=title, font=F(18, "bold"), text_color=INK, anchor="w").pack(anchor="w")
        if subtitle:
            ctk.CTkLabel(head, text=subtitle, font=F(12), text_color=MUTED, anchor="w", justify="left",
                         wraplength=width - 60).pack(anchor="w", pady=(2, 0))
        body = card(self)
        body.pack(fill="both", expand=True, padx=18, pady=6)
        body.grid_columnconfigure((0, 1), weight=1, uniform="c")
        r = c = 0
        for fdef in fields:
            span = fdef.get("span", 1)
            if c + span > 2:
                r, c = r + 1, 0
            cell = ctk.CTkFrame(body, fg_color="transparent")
            cell.grid(row=r, column=c, columnspan=span, sticky="ew", padx=12, pady=(10 if r == 0 else 4, 4))
            label = fdef["label"] + (" *" if fdef.get("required") else "")
            ctk.CTkLabel(cell, text=label, font=F(12, "bold"), text_color=INK2, anchor="w").pack(anchor="w")
            w = self._make(cell, fdef, values.get(fdef["key"]))
            self.widgets[fdef["key"]] = w
            if fdef.get("help"):
                ctk.CTkLabel(cell, text=fdef["help"], font=F(11), text_color=SUBTLE, anchor="w", justify="left",
                             wraplength=(width - 90) // (2 // span)).pack(anchor="w")
            c += span
            if c >= 2:
                r, c = r + 1, 0
        ctk.CTkFrame(body, height=6, fg_color="transparent").grid(row=r + 1, column=0)
        self.err = ctk.CTkLabel(self, text="", text_color=DANGER, font=F(12))
        self.err.pack(fill="x", padx=22)
        bar = ctk.CTkFrame(self, fg_color="transparent")
        bar.pack(fill="x", padx=18, pady=(4, 16))
        btn(bar, ok_text, self.ok, width=130).pack(side="right")
        btn(bar, "Cancelar", self.cancel, "secondary", width=110).pack(side="right", padx=8)
        self.bind("<Return>", lambda e: self.ok() if not isinstance(e.widget, tk.Text) else None)
        first = next(iter(self.widgets.values()), None)
        if first is not None:
            self.after(150, lambda: self._focus(first))

    @staticmethod
    def _focus(w):
        try:
            w.focus_set()
        except Exception:
            pass

    def _make(self, parent, fdef, value):
        kind = fdef.get("kind", "text")
        if kind == "choice":
            opts = fdef.get("options") or [""]
            w = ctk.CTkOptionMenu(parent, values=opts, height=34, font=F(13), fg_color=FIELD,
                                  button_color=PRIMARY, button_hover_color=PRIMARY_H, text_color=INK,
                                  dropdown_font=F(13))
            w.set(str(value) if value not in (None, "") else opts[0])
        elif kind == "combo":
            w = ctk.CTkComboBox(parent, values=fdef.get("options") or [], height=34, font=F(13),
                                button_color=PRIMARY, border_color=BORDER, dropdown_font=F(13))
            w.set("" if value is None else str(value))
        elif kind == "textarea":
            w = ctk.CTkTextbox(parent, height=fdef.get("height", 80), font=F(13), border_width=1, border_color=BORDER,
                               fg_color=FIELD)
            if value:
                w.insert("1.0", str(value))
        else:
            w = ctk.CTkEntry(parent, height=34, font=F(13), border_color=BORDER, fg_color=FIELD,
                             placeholder_text=fdef.get("placeholder"))
            if value not in (None, ""):
                w.insert(0, num_input(value, 4) if kind in ("num", "money", "pct", "int") else str(value))
        w.pack(fill="x", pady=(3, 0))
        return w

    def _value(self, fdef):
        w = self.widgets[fdef["key"]]
        kind = fdef.get("kind", "text")
        if kind == "textarea":
            return w.get("1.0", "end").strip()
        raw = w.get().strip()
        if kind in ("num", "money", "pct"):
            if raw and fnum(raw, None) is None:
                raise ValueError(f"“{fdef['label']}” precisa ser um número.")
            v = fnum(raw)
            if fdef.get("min") is not None and v < fdef["min"]:
                raise ValueError(f"“{fdef['label']}” deve ser no mínimo {fdef['min']}.")
            return v
        if kind == "int":
            return int(round(fnum(raw)))
        return raw

    def ok(self):
        out = {}
        try:
            for fdef in self.fields:
                v = self._value(fdef)
                if fdef.get("required") and (v == "" or v is None):
                    raise ValueError(f"Preencha o campo “{fdef['label']}”.")
                out[fdef["key"]] = v
        except ValueError as ex:
            self.err.configure(text=str(ex))
            return
        self.result = out
        self.destroy()


class PickerDialog(_Modal):
    """Lista pesquisavel para escolher um registro."""

    def __init__(self, master, title, columns, rows, subtitle=None, width=760, height=560):
        super().__init__(master, title, width, height)
        ctk.CTkLabel(self, text=title, font=F(18, "bold"), text_color=INK).pack(anchor="w", padx=22, pady=(18, 0))
        if subtitle:
            ctk.CTkLabel(self, text=subtitle, font=F(12), text_color=MUTED, wraplength=width - 50,
                         justify="left").pack(anchor="w", padx=22)
        self.search = ctk.CTkEntry(self, placeholder_text="Pesquisar…", height=36, font=F(13), border_color=BORDER)
        self.search.pack(fill="x", padx=18, pady=(10, 6))
        self.table = DataTable(self, columns, height=12, on_double=self._pick)
        self.table.pack(fill="both", expand=True, padx=18, pady=4)
        self.table.set_rows(rows)
        self.search.bind("<KeyRelease>", lambda e: self.table.set_filter(self.search.get()))
        self.search.bind("<Return>", lambda e: self._pick(self.table.view[0] if len(self.table.view) == 1 else self.table.selected()))
        self.search.bind("<Down>", lambda e: self._focus_table())
        bar = ctk.CTkFrame(self, fg_color="transparent")
        bar.pack(fill="x", padx=18, pady=(6, 16))
        btn(bar, "Selecionar", lambda: self._pick(self.table.selected()), width=130).pack(side="right")
        btn(bar, "Cancelar", self.cancel, "secondary", width=110).pack(side="right", padx=8)
        self.after(150, self.search.focus_set)

    def _focus_table(self):
        t = self.table.tree
        kids = t.get_children()
        if kids:
            t.focus_set()
            t.selection_set(kids[0])
            t.focus(kids[0])

    def _pick(self, row):
        if row is None:
            return
        self.result = row
        self.destroy()


def ask(master, title, fields, values=None, subtitle=None, width=620, ok_text="Salvar"):
    return FormDialog(master, title, fields, values, subtitle, width, ok_text).show()


def pick(master, title, columns, rows, subtitle=None, width=760):
    return PickerDialog(master, title, columns, rows, subtitle, width).show()


class ListEditor(ctk.CTkFrame):
    """Lista editavel de blocos de texto (dicts): adicionar, editar, duplicar, remover e reordenar.
    items: lista de dicts (fica em self.items) | fields: campos do formulario (ver FormDialog)
    columns/row_fn: colunas da tabela e funcao item -> dict com as chaves das colunas."""

    def __init__(self, master, items, fields, columns, row_fn, *, dialog_title="Item", height=6, defaults=None,
                 width=780, subtitle=None, add_text="+ Adicionar", empty_text="Nada cadastrado ainda.", on_change=None,
                 to_form=None, from_form=None, stretch_col=1):
        super().__init__(master, fg_color="transparent")
        self.items = [dict(i) for i in (items or [])]
        self.fields, self.row_fn, self.defaults = fields, row_fn, defaults or {}
        self.dialog_title, self.width, self.subtitle = dialog_title, width, subtitle
        self.empty_text, self.on_change = empty_text, on_change
        self.to_form, self.from_form = to_form, from_form
        bar = ctk.CTkFrame(self, fg_color="transparent")
        bar.pack(fill="x", pady=(0, 4))
        btn(bar, add_text, self.add, width=140).pack(side="left", padx=3)
        btn(bar, "Editar", self.edit, "secondary", width=80).pack(side="left", padx=3)
        btn(bar, "Duplicar", self.dup, "secondary", width=90).pack(side="left", padx=3)
        btn(bar, "Remover", self.remove, "danger", width=90).pack(side="left", padx=3)
        btn(bar, "▲", lambda: self.move(-1), "secondary", width=36).pack(side="left", padx=(12, 2))
        btn(bar, "▼", lambda: self.move(1), "secondary", width=36).pack(side="left", padx=2)
        self.table = DataTable(self, columns, height=height, on_double=lambda r: self.edit(), stretch_col=stretch_col)
        self.table.pack(fill="x")
        self.refresh()

    # ------------------------------------------------------------ dados
    def get(self):
        return [dict(i) for i in self.items]

    def set(self, items):
        self.items = [dict(i) for i in (items or [])]
        self.refresh()

    def refresh(self, select=None):
        rows = [dict(id=i, n=i + 1, **self.row_fn(it)) for i, it in enumerate(self.items)]
        self.table.set_rows(rows, self.empty_text)
        if select is not None:
            self.table.select_id(select)
        if self.on_change:
            self.on_change()

    # ------------------------------------------------------------ acoes
    def _form(self, values, title):
        v = self.to_form(values) if self.to_form else values
        out = ask(self, title, self.fields, v, self.subtitle, self.width)
        return self.from_form(out) if (out and self.from_form) else out

    def add(self):
        v = self._form(dict(self.defaults), f"Novo: {self.dialog_title}")
        if v:
            self.items.append(v)
            self.refresh(len(self.items) - 1)

    def edit(self):
        r = self.table.selected()
        if r is None:
            return
        i = r["id"]
        v = self._form(self.items[i], f"Editar: {self.dialog_title}")
        if v:
            self.items[i] = {**self.items[i], **v}
            self.refresh(i)

    def dup(self):
        r = self.table.selected()
        if r is None:
            return
        self.items.insert(r["id"] + 1, dict(self.items[r["id"]]))
        self.refresh(r["id"] + 1)

    def remove(self):
        r = self.table.selected()
        if r is not None and confirm(self, "Remover", "Remover este item da lista?", "Remover", True):
            self.items.pop(r["id"])
            self.refresh()

    def move(self, d):
        r = self.table.selected()
        if r is None:
            return
        i, j = r["id"], r["id"] + d
        if 0 <= j < len(self.items):
            self.items[i], self.items[j] = self.items[j], self.items[i]
            self.refresh(j)


def confirm(master, title, text, ok_text="Confirmar", danger=False):
    d = _Modal(master, title, 460)
    ctk.CTkLabel(d, text=title, font=F(17, "bold"), text_color=INK).pack(anchor="w", padx=22, pady=(20, 4))
    ctk.CTkLabel(d, text=text, font=F(13), text_color=INK2, wraplength=410, justify="left").pack(anchor="w", padx=22)
    bar = ctk.CTkFrame(d, fg_color="transparent")
    bar.pack(fill="x", padx=18, pady=18)

    def ok():
        d.result = True
        d.destroy()
    btn(bar, ok_text, ok, "danger" if danger else "primary", width=130).pack(side="right")
    btn(bar, "Cancelar", d.cancel, "secondary", width=110).pack(side="right", padx=8)
    return bool(d.show())


def info(master, title, text, nivel="info"):
    d = _Modal(master, title, 480)
    bg, fg = NIVEL_CORES.get(nivel, NIVEL_CORES["info"])
    ctk.CTkLabel(d, text=title, font=F(17, "bold"), text_color=fg).pack(anchor="w", padx=22, pady=(20, 4))
    ctk.CTkLabel(d, text=text, font=F(13), text_color=INK2, wraplength=430, justify="left").pack(anchor="w", padx=22)
    bar = ctk.CTkFrame(d, fg_color="transparent")
    bar.pack(fill="x", padx=18, pady=18)

    def ok():
        d.result = True
        d.destroy()
    btn(bar, "OK", ok, width=110).pack(side="right")
    d.show()


class Toast:
    """Mensagem rapida no rodape da janela."""

    def __init__(self, root):
        self.root = root
        self.lbl = None
        self.job = None

    def show(self, text, nivel="ok", ms=2600):
        bg, fg = NIVEL_CORES.get(nivel, NIVEL_CORES["ok"])
        if self.lbl is None:
            self.lbl = ctk.CTkLabel(self.root, text="", font=F(13, "bold"), corner_radius=8, height=38)
        self.lbl.configure(text=f"   {text}   ", fg_color=fg, text_color="white")
        self.lbl.place(relx=0.99, rely=0.985, anchor="se")
        self.lbl.lift()
        if self.job:
            self.root.after_cancel(self.job)
        self.job = self.root.after(ms, self.hide)

    def hide(self):
        if self.lbl is not None:
            self.lbl.place_forget()
        self.job = None


class Page(ctk.CTkFrame):
    """Pagina base: cabecalho com titulo, subtitulo e acoes; conteudo rolavel opcional."""
    title = ""
    subtitle = ""
    scroll = False

    def __init__(self, master, app):
        super().__init__(master, fg_color=BG, corner_radius=0)
        self.app = app
        self.dirty = True
        head = ctk.CTkFrame(self, fg_color="transparent")
        head.pack(fill="x", padx=28, pady=(22, 10))
        left = ctk.CTkFrame(head, fg_color="transparent")
        left.pack(side="left", fill="x", expand=True)
        ctk.CTkLabel(left, text=self.title, font=F(26, "bold"), text_color=INK, anchor="w").pack(anchor="w")
        if self.subtitle:
            ctk.CTkLabel(left, text=self.subtitle, font=F(13), text_color=MUTED, anchor="w", justify="left",
                         wraplength=760).pack(anchor="w", pady=(2, 0))
        self.actions = ctk.CTkFrame(head, fg_color="transparent")
        self.actions.pack(side="right", anchor="n")
        if self.scroll:
            self.body = ctk.CTkScrollableFrame(self, fg_color=BG, corner_radius=0, scrollbar_button_color="#C9CFD8")
            self.body.pack(fill="both", expand=True, padx=(18, 4), pady=(0, 6))
        else:
            self.body = ctk.CTkFrame(self, fg_color="transparent")
            self.body.pack(fill="both", expand=True, padx=28, pady=(0, 18))
        self.build()

    def build(self):
        pass

    def refresh(self):
        pass

    @property
    def db(self):
        return self.app.db

    @property
    def eng(self):
        return self.app.engine
