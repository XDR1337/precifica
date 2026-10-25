# -*- coding: utf-8 -*-
"""Precifica Desktop - substituto independente da planilha EG3.
Armazena dados em CSV e não exige Microsoft Excel.
"""
from __future__ import annotations
import csv, os, sys, shutil, subprocess
from pathlib import Path
from datetime import datetime
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import customtkinter as ctk
from matplotlib.figure import Figure
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

APP_NAME = "Precifica Desktop"
BASE_DIR = Path(os.getenv("LOCALAPPDATA", str(Path.home()))) / "PrecificaDesktop"
DATA_DIR = BASE_DIR / "dados"
BACKUP_DIR = BASE_DIR / "backups"
DATA_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

SCHEMAS = {
 "config": ["chave","valor"],
 "insumos": ["id","descricao","unidade","qtde_bruta","qtde_liquida","custo_compra","fator_perda","custo_unitario"],
 "funcionarios": ["id","nome","setor","cargo","contratacao","salario","encargos_sociais_pct","encargos_trabalhistas_pct","vale_transporte","vale_refeicao","convenio_medico","carga_horaria_mensal","custo_total","valor_hora"],
 "custos_fixos": ["id","descricao","valor_mensal","categoria"],
 "imobilizados": ["id","descricao","valor","vida_util_anos","taxa_anual_pct","depreciacao_mensal"],
 "servicos": ["id","nome","preco_venda","imposto_pct","cartao_pct","aplicativo_pct","comissao_pct"],
 "revendas": ["id","nome","unidade","quantidade_compra","custo_compra","custo_unitario","preco_venda","imposto_pct","cartao_pct","aplicativo_pct","comissao_pct"],
 "ficha_mao_obra": ["id","servico_id","funcionario_id","horas"],
 "ficha_insumos": ["id","servico_id","insumo_id","quantidade"],
 "simulacao": ["id","tipo","item_id","previsao_vendas"],
 "concorrentes": ["id","empresa","item_avaliado","nota","preco_unitario","observacao"],
}
DEFAULT_CONFIG = {
 "horas_dia":"8", "dias_mes":"22", "produtividade_pct":"75", "lucro_desejado_pct":"15",
 "encargos_trabalhistas_padrao_pct":"21.77", "encargos_sociais_padrao_pct":"12"
}

def fnum(v):
    if v is None: return 0.0
    s=str(v).strip().replace("R$","").replace("%","").replace(" ","")
    if not s: return 0.0
    if "," in s and "." in s: s=s.replace(".","").replace(",",".")
    elif "," in s: s=s.replace(",",".")
    try: return float(s)
    except ValueError: return 0.0

def money(v): return f"R$ {v:,.2f}".replace(",","X").replace(".",",").replace("X",".")
def pct(v): return f"{v:.2f}%".replace(".",",")

class CSVDB:
    def __init__(self):
        self._cache={}
        for name, fields in SCHEMAS.items():
            p=self.path(name)
            if not p.exists(): self.write(name, [])
        if not self.read("config"):
            self.write("config", [{"chave":k,"valor":v} for k,v in DEFAULT_CONFIG.items()])
        self.seed_examples()
    def seed_examples(self):
        """Preenche categorias vazias com exemplos didáticos, sem alterar dados existentes."""
        cfg=self.config()
        if cfg.get("exemplos_criados")=="1": return
        examples={
            "insumos":{"descricao":"Cabo elétrico 2,5 mm² [EXEMPLO]","unidade":"Metro","qtde_bruta":"100","qtde_liquida":"95","custo_compra":"250","fator_perda":"1.0526","custo_unitario":"2.6316"},
            "funcionarios":{"nome":"Profissional de instalação [EXEMPLO]","setor":"Operacional","cargo":"Eletricista","contratacao":"CLT","salario":"3000","encargos_sociais_pct":"12","encargos_trabalhistas_pct":"21.77","vale_transporte":"220","vale_refeicao":"550","convenio_medico":"300","carga_horaria_mensal":"176","custo_total":"5083.10","valor_hora":"28.8813"},
            "custos_fixos":{"descricao":"Aluguel do escritório [EXEMPLO]","valor_mensal":"1500","categoria":"Estrutura"},
            "imobilizados":{"descricao":"Notebook de trabalho [EXEMPLO]","valor":"5000","vida_util_anos":"5","taxa_anual_pct":"20","depreciacao_mensal":"83.33"},
            "servicos":{"nome":"Instalação de tomada [EXEMPLO]","preco_venda":"180","imposto_pct":"6","cartao_pct":"2.5","aplicativo_pct":"0","comissao_pct":"0"},
            "revendas":{"nome":"Tomada 20 A [EXEMPLO]","unidade":"Unidade","quantidade_compra":"10","custo_compra":"120","custo_unitario":"12","preco_venda":"25","imposto_pct":"6","cartao_pct":"2.5","aplicativo_pct":"0","comissao_pct":"0"},
            "concorrentes":{"empresa":"Concorrente A [EXEMPLO]","item_avaliado":"Atendimento","nota":"2","preco_unitario":"190","observacao":"Exemplo para comparação; substitua pelos seus dados."},
        }
        ids={}
        for table,row in examples.items():
            rows=self.read(table)
            if not rows: ids[table]=self.upsert(table,{"id":"",**row})
            else: ids[table]=rows[0].get("id")
        service_id=ids["servicos"];employee_id=ids["funcionarios"];input_id=ids["insumos"];resale_id=ids["revendas"]
        if not self.read("ficha_mao_obra"): self.upsert("ficha_mao_obra",{"id":"","servico_id":service_id,"funcionario_id":employee_id,"horas":"2"})
        if not self.read("ficha_insumos"): self.upsert("ficha_insumos",{"id":"","servico_id":service_id,"insumo_id":input_id,"quantidade":"8"})
        if not self.read("simulacao"):
            self.upsert("simulacao",{"id":"","tipo":"servico","item_id":service_id,"previsao_vendas":"12"})
            self.upsert("simulacao",{"id":"","tipo":"revenda","item_id":resale_id,"previsao_vendas":"8"})
        cfg["exemplos_criados"]="1"; self.save_config(cfg)
    def path(self, name): return DATA_DIR/f"{name}.csv"
    def read(self,name):
        cached=self._cache.get(name)
        if cached is None:
            try:
                with self.path(name).open("r",encoding="utf-8-sig",newline="") as fh: cached=list(csv.DictReader(fh,delimiter=";"))
            except (FileNotFoundError, csv.Error): cached=[]
            self._cache[name]=cached
        return [dict(r) for r in cached]
    def write(self,name,rows):
        fields=SCHEMAS[name]; tmp=self.path(name).with_suffix(".tmp")
        with tmp.open("w",encoding="utf-8-sig",newline="") as fh:
            w=csv.DictWriter(fh,fieldnames=fields,delimiter=";",extrasaction="ignore"); w.writeheader(); w.writerows(rows)
        tmp.replace(self.path(name)); self._cache.pop(name,None)
    def next_id(self,name): return str(max([int(r.get("id",0) or 0) for r in self.read(name)]+[0])+1)
    def upsert(self,name,row):
        rows=self.read(name)
        if not row.get("id"): row["id"]=self.next_id(name)
        found=False
        for i,r in enumerate(rows):
            if r.get("id")==row["id"]: rows[i]=row; found=True; break
        if not found: rows.append(row)
        self.write(name,rows); return row["id"]
    def delete(self,name,id_): self.write(name,[r for r in self.read(name) if r.get("id")!=id_])
    def config(self): return {r["chave"]:r["valor"] for r in self.read("config")}
    def save_config(self,d): self.write("config",[{"chave":k,"valor":v} for k,v in d.items()])

class CrudFrame(ctk.CTkFrame):
    def __init__(self,master,app,table,title,fields,calc=None):
        super().__init__(master,fg_color="transparent"); self.app=app; self.table=table; self.title=title; self.fields=fields; self.calc=calc; self.selected=None
        top=ctk.CTkFrame(self,fg_color="#FFFFFF",border_width=1,border_color="#DDE5EF"); top.pack(fill="x",padx=10,pady=8)
        titlebox=ctk.CTkFrame(top,fg_color="transparent");titlebox.pack(side="left",fill="x",expand=True,padx=12,pady=10)
        ctk.CTkLabel(titlebox,text=title,font=ctk.CTkFont(size=24,weight="bold"),text_color="#0F172A").pack(anchor="w")
        ctk.CTkLabel(titlebox,text="Preencha os campos abaixo, salve e consulte os registros na tabela.",text_color="#64748B").pack(anchor="w",pady=(2,0))
        self._search_job=None
        self.search=ctk.CTkEntry(top,placeholder_text="Pesquisar..."); self.search.pack(side="right",padx=10); self.search.bind("<KeyRelease>",self._on_search)
        ctk.CTkLabel(self,text="DADOS DO REGISTRO",font=ctk.CTkFont(size=12,weight="bold"),text_color="#475569").pack(anchor="w",padx=18,pady=(7,0))
        form=ctk.CTkFrame(self,height=210,fg_color="#FFFFFF",border_width=1,border_color="#DDE5EF"); form.pack(fill="x",padx=10,pady=5)
        self.entries={}
        for i,(key,label) in enumerate(fields):
            ctk.CTkLabel(form,text=label).grid(row=(i//3)*2,column=i%3,padx=7,pady=(4,0),sticky="w")
            e=ctk.CTkEntry(form,width=260,height=34); e.grid(row=(i//3)*2+1,column=i%3,padx=7,pady=(0,7),sticky="ew"); self.entries[key]=e
        btn=ctk.CTkFrame(self,fg_color="transparent"); btn.pack(fill="x",padx=10)
        for text,cmd,color in [("Novo/Limpar",self.clear,None),("Salvar",self.save,"#00a8c6"),("Excluir",self.remove,"#b33939")]:
            kwargs={"text":text,"command":cmd};
            if color: kwargs["fg_color"]=color
            ctk.CTkButton(btn,**kwargs).pack(side="left",padx=5,pady=5)
        ctk.CTkLabel(self,text="REGISTROS CADASTRADOS",font=ctk.CTkFont(size=12,weight="bold"),text_color="#475569").pack(anchor="w",padx=18,pady=(10,0))
        cols=[k for k,_ in fields]
        tablebox=ttk.Frame(self);tablebox.pack(fill="both",expand=True,padx=10,pady=(5,14));tablebox.grid_columnconfigure(0,weight=1);tablebox.grid_rowconfigure(0,weight=1)
        self.tree=ttk.Treeview(tablebox,columns=cols,show="headings",height=16)
        vs=ttk.Scrollbar(tablebox,orient="vertical",command=self.tree.yview);self.tree.configure(yscrollcommand=vs.set)
        self.tree.grid(row=0,column=0,sticky="nsew");vs.grid(row=0,column=1,sticky="ns")
        for k,l in fields: self.tree.heading(k,text=l); self.tree.column(k,width=135,anchor="w")
        self.tree.bind("<<TreeviewSelect>>",self.load_selected); self.refresh()
    def _on_search(self,e=None):
        if self._search_job: self.after_cancel(self._search_job)
        self._search_job=self.after(250,self.refresh)
    def clear(self):
        self.selected=None
        for e in self.entries.values(): e.delete(0,"end")
    def save(self):
        row={k:e.get().strip() for k,e in self.entries.items()}; row["id"]=self.selected or ""
        if self.calc: row=self.calc(row)
        try: self.app.db.upsert(self.table,row); self.clear(); self.app.refresh_all(); self.app.status("Registro salvo")
        except Exception as ex: messagebox.showerror("Erro",str(ex))
    def remove(self):
        if self.selected and messagebox.askyesno("Excluir","Excluir o registro selecionado?"):
            self.app.db.delete(self.table,self.selected); self.clear(); self.app.refresh_all()
    def refresh(self):
        self._search_job=None
        q=self.search.get().lower() if hasattr(self,"search") else ""
        self.tree.delete(*self.tree.get_children())
        for r in self.app.db.read(self.table):
            if q and q not in " ".join(r.values()).lower(): continue
            self.tree.insert("", "end", iid=r.get("id") or None, values=[r.get(k,"") for k,_ in self.fields])
    def load_selected(self,e=None):
        s=self.tree.selection()
        if not s:return
        self.selected=s[0]; rows=self.app.db.read(self.table); r=next((x for x in rows if x.get("id")==self.selected),None)
        if r:
            for k,en in self.entries.items(): en.delete(0,"end"); en.insert(0,r.get(k,""))

class PricingFrame(ctk.CTkFrame):
    def __init__(self,master,app):
        super().__init__(master,fg_color="transparent");self.app=app;self.service_map={}
        self.metrics={k:tk.StringVar(value="R$ 0,00") for k in ["sale","recommended","profit","cost","contribution"]}
        header=ctk.CTkFrame(self,fg_color="transparent");header.pack(fill="x",padx=24,pady=(18,8))
        ctk.CTkLabel(header,text="Quanto cobrar?",font=ctk.CTkFont(size=29,weight="bold"),text_color="#0F172A").pack(anchor="w")
        ctk.CTkLabel(header,text="O resultado vem primeiro. Selecione o serviço e confira preço, custos e lucro antes de editar a composição.",text_color="#64748B").pack(anchor="w",pady=(3,0))
        selector=ctk.CTkFrame(self,fg_color="#FFFFFF",border_width=1,border_color="#D9E2EC");selector.pack(fill="x",padx=24,pady=6)
        ctk.CTkLabel(selector,text="Serviço analisado",font=ctk.CTkFont(weight="bold"),text_color="#334155").pack(side="left",padx=(16,8),pady=14)
        self.cmb=ctk.CTkComboBox(selector,width=500,values=["Cadastre um serviço primeiro"],command=lambda _:self.load());self.cmb.pack(side="left",padx=6,pady=12)
        ctk.CTkButton(selector,text="Atualizar resultado",command=self.refresh,width=160,fg_color="#087EA4").pack(side="left",padx=8,pady=12)
        ctk.CTkButton(selector,text="Editar preço do serviço",command=lambda:self.app.show("Serviços"),width=170,fg_color="#FFFFFF",text_color="#087EA4",border_width=1,border_color="#5FB3CA",hover_color="#EAF6F9").pack(side="left",padx=8,pady=12)
        cards=ctk.CTkFrame(self,fg_color="transparent");cards.pack(fill="x",padx=18,pady=(8,10))
        for i,(key,title,color,sub) in enumerate([
            ("recommended","PREÇO RECOMENDADO","#087EA4","para atingir o lucro desejado"),
            ("sale","PREÇO CADASTRADO","#2563EB","valor atual de venda"),
            ("profit","LUCRO ESTIMADO","#16803A","após custos e rateio"),
            ("cost","CUSTO TOTAL","#B45309","custo direto + rateio"),
            ("contribution","MARGEM DE CONTRIBUIÇÃO","#6D28D9","antes dos custos fixos")]):
            cards.grid_columnconfigure(i,weight=1,uniform="result")
            card=ctk.CTkFrame(cards,fg_color="#FFFFFF",border_width=1,border_color="#D9E2EC",corner_radius=8);card.grid(row=0,column=i,sticky="nsew",padx=6)
            ctk.CTkLabel(card,text=title,font=ctk.CTkFont(size=11,weight="bold"),text_color="#64748B").pack(anchor="w",padx=15,pady=(14,3))
            ctk.CTkLabel(card,textvariable=self.metrics[key],font=ctk.CTkFont(size=25,weight="bold"),text_color=color).pack(anchor="w",padx=15)
            ctk.CTkLabel(card,text=sub,font=ctk.CTkFont(size=10),text_color="#94A3B8").pack(anchor="w",padx=15,pady=(2,13))
        lower=ctk.CTkFrame(self,fg_color="transparent");lower.pack(fill="both",expand=True,padx=24,pady=(2,10));lower.grid_columnconfigure(0,weight=3);lower.grid_columnconfigure(1,weight=2);lower.grid_rowconfigure(0,weight=1)
        comp=ctk.CTkFrame(lower,fg_color="#FFFFFF",border_width=1,border_color="#D9E2EC");comp.grid(row=0,column=0,sticky="nsew",padx=(0,6))
        ctk.CTkLabel(comp,text="Composição do serviço",font=ctk.CTkFont(size=18,weight="bold"),text_color="#0F172A").pack(anchor="w",padx=16,pady=(14,2))
        ctk.CTkLabel(comp,text="Adicione recursos somente quando precisar alterar a ficha.",text_color="#64748B").pack(anchor="w",padx=16,pady=(0,8))
        tabs=ctk.CTkTabview(comp,fg_color="#FFFFFF");tabs.pack(fill="both",expand=True,padx=10,pady=(0,10));tabs.add("Mão de obra");tabs.add("Insumos")
        self.mo=self._composer(tabs.tab("Mão de obra"),"funcionarios","ficha_mao_obra","funcionario_id","horas","Horas utilizadas")
        self.ins=self._composer(tabs.tab("Insumos"),"insumos","ficha_insumos","insumo_id","quantidade","Quantidade utilizada")
        detail=ctk.CTkFrame(lower,fg_color="#FFFFFF",border_width=1,border_color="#D9E2EC");detail.grid(row=0,column=1,sticky="nsew",padx=(6,0));detail.grid_rowconfigure(2,weight=1);detail.grid_columnconfigure(0,weight=1)
        ctk.CTkLabel(detail,text="Detalhamento do resultado",font=ctk.CTkFont(size=18,weight="bold"),text_color="#0F172A").grid(row=0,column=0,sticky="w",padx=16,pady=(14,2))
        ctk.CTkLabel(detail,text="Entenda como o preço foi formado.",text_color="#64748B").grid(row=1,column=0,sticky="w",padx=16,pady=(0,8))
        self.detail_tree=ttk.Treeview(detail,columns=("item","valor"),show="headings",height=9);self.detail_tree.heading("item",text="Indicador");self.detail_tree.heading("valor",text="Valor");self.detail_tree.column("item",width=230,stretch=True);self.detail_tree.column("valor",width=145,anchor="e",stretch=True)
        dscroll=ttk.Scrollbar(detail,orient="vertical",command=self.detail_tree.yview);self.detail_tree.configure(yscrollcommand=dscroll.set);self.detail_tree.grid(row=2,column=0,sticky="nsew",padx=(16,0),pady=8);dscroll.grid(row=2,column=1,sticky="ns",padx=(0,16),pady=8)
        ctk.CTkButton(detail,text="Recalcular",command=self.calculate,height=40,fg_color="#087EA4").grid(row=3,column=0,columnspan=2,sticky="ew",padx=16,pady=(4,16))
        self.refresh()
    def _composer(self,parent,source,link,fk,qty,placeholder):
        toolbar=ctk.CTkFrame(parent,fg_color="transparent");toolbar.pack(fill="x",padx=4,pady=6)
        box=ctk.CTkComboBox(toolbar,width=340,values=["Nenhum cadastro disponível"]);box.pack(side="left",padx=4)
        ent=ctk.CTkEntry(toolbar,width=145,placeholder_text=placeholder);ent.pack(side="left",padx=4)
        obj={"box":box,"source":source,"link":link,"fk":fk,"qty":qty}
        def add():
            sid=self.current_service();item=getattr(self,f"map_{source}",{}).get(box.get())
            if not sid or not item or fnum(ent.get())<=0:return messagebox.showwarning("Verifique os dados","Selecione um item e informe uma quantidade maior que zero.")
            self.app.db.upsert(link,{"id":"","servico_id":sid,fk:item,qty:ent.get()});ent.delete(0,"end");self.load();self.app.refresh_all()
        def delete():
            sel=tree.selection()
            if sel:self.app.db.delete(link,sel[0]);self.load();self.app.refresh_all()
        ctk.CTkButton(toolbar,text="Adicionar",width=95,command=add,fg_color="#16803A").pack(side="left",padx=4)
        ctk.CTkButton(toolbar,text="Remover",width=90,command=delete,fg_color="#B42318").pack(side="left",padx=4)
        holder=ttk.Frame(parent);holder.pack(fill="both",expand=True,padx=4,pady=(2,6));holder.grid_rowconfigure(0,weight=1);holder.grid_columnconfigure(0,weight=1)
        tree=ttk.Treeview(holder,columns=("descricao","qtd"),show="headings",height=8);tree.heading("descricao",text="Descrição");tree.heading("qtd",text="Qtd./Horas");tree.column("descricao",width=430,stretch=True);tree.column("qtd",width=110,anchor="center",stretch=False)
        scroll=ttk.Scrollbar(holder,orient="vertical",command=tree.yview);tree.configure(yscrollcommand=scroll.set);tree.grid(row=0,column=0,sticky="nsew");scroll.grid(row=0,column=1,sticky="ns")
        obj["tree"]=tree;return obj
    def current_service(self):return self.service_map.get(self.cmb.get())
    def refresh(self):
        services=self.app.db.read("servicos");self.service_map={f'{r["id"]} - {r["nome"]}':r["id"] for r in services};vals=list(self.service_map) or ["Cadastre um serviço primeiro"]
        current=self.cmb.get();self.cmb.configure(values=vals);self.cmb.set(current if current in vals else vals[0])
        for obj in [self.mo,self.ins]:
            rows=self.app.db.read(obj["source"]);mp={f'{r["id"]} - {r.get("nome",r.get("descricao",""))}':r["id"] for r in rows};setattr(self,f'map_{obj["source"]}',mp);values=list(mp) or ["Nenhum cadastro disponível"];obj["box"].configure(values=values);obj["box"].set(values[0])
        self.load()
    def load(self):
        sid=self.current_service()
        for obj in [self.mo,self.ins]:
            tree=obj["tree"]
            for item in tree.get_children():tree.delete(item)
            source={r["id"]:r for r in self.app.db.read(obj["source"])}
            for r in self.app.db.read(obj["link"]):
                if r.get("servico_id")==sid:
                    item=source.get(r.get(obj["fk"]),{});name=item.get("nome",item.get("descricao",""));tree.insert("","end",iid=r["id"],values=(name,r.get(obj["qty"],"")))
        self.calculate(False)
    def compute(self,sid):return self.app.compute(sid)
    def calculate(self,notify=True):
        sid=self.current_service();srv=next((r for r in self.app.db.read("servicos") if r["id"]==sid),None)
        if not srv:return
        labor,material,hours=self.compute(sid);price=fnum(srv["preco_venda"]);rates=sum(fnum(srv[k]) for k in ["imposto_pct","cartao_pct","aplicativo_pct","comissao_pct"])/100
        deductions=price*rates;contribution=price-labor-material-deductions;fixed=self.app.total_fixed();capacity=self.app.capacity()[2];allocation=fixed*(hours/capacity) if capacity else 0;total_cost=labor+material+allocation;profit=contribution-allocation
        desired=fnum(self.app.db.config().get("lucro_desejado_pct","15"))/100;den=1-rates-desired;recommended=total_cost/den if den>0 else 0
        self.metrics["sale"].set(money(price));self.metrics["recommended"].set(money(recommended));self.metrics["profit"].set(money(profit));self.metrics["cost"].set(money(total_cost));self.metrics["contribution"].set(money(contribution))
        rows=[("Mão de obra",money(labor)),("Materiais e insumos",money(material)),("Deduções sobre a venda",money(deductions)),("Rateio de custos fixos",money(allocation)),("Horas do serviço",f"{hours:.2f} h"),("Margem de contribuição",pct(contribution/price*100 if price else 0)),("Margem de lucro",pct(profit/price*100 if price else 0)),("Markup",f"{price/(labor+material):.3f}" if labor+material else "0")]
        for item in self.detail_tree.get_children():self.detail_tree.delete(item)
        for label,value in rows:self.detail_tree.insert("","end",values=(label,value))
        if notify:self.app.status("Resultado recalculado")

class Dashboard(ctk.CTkFrame):
    def __init__(self,m,a):
        super().__init__(m,fg_color="transparent");self.a=a;self.vars={k:tk.StringVar(value="R$ 0,00") for k in ["revenue","profit","breakeven","recommended"]}
        ctk.CTkLabel(self,text="Resumo financeiro",font=ctk.CTkFont(size=29,weight="bold"),text_color="#0F172A").pack(anchor="w",padx=24,pady=(20,3))
        ctk.CTkLabel(self,text="Os números mais importantes ficam aqui. Use a ficha técnica para formar preços e a simulação para projetar o mês.",text_color="#64748B").pack(anchor="w",padx=24,pady=(0,14))
        cards=ctk.CTkFrame(self,fg_color="transparent");cards.pack(fill="x",padx=18,pady=4)
        data=[("revenue","FATURAMENTO PREVISTO","#2563EB"),("profit","LUCRO OPERACIONAL","#16803A"),("breakeven","PONTO DE EQUILÍBRIO","#B45309"),("recommended","PREÇO RECOMENDADO DO 1º SERVIÇO","#087EA4")]
        for i,(key,title,color) in enumerate(data):
            cards.grid_columnconfigure(i,weight=1,uniform="main");card=ctk.CTkFrame(cards,fg_color="#FFFFFF",border_width=1,border_color="#D9E2EC");card.grid(row=0,column=i,sticky="nsew",padx=6)
            ctk.CTkLabel(card,text=title,font=ctk.CTkFont(size=11,weight="bold"),text_color="#64748B").pack(anchor="w",padx=16,pady=(16,4));ctk.CTkLabel(card,textvariable=self.vars[key],font=ctk.CTkFont(size=27,weight="bold"),text_color=color).pack(anchor="w",padx=16,pady=(0,16))
        body=ctk.CTkFrame(self,fg_color="transparent");body.pack(fill="both",expand=True,padx=24,pady=14);body.grid_columnconfigure(0,weight=2);body.grid_columnconfigure(1,weight=1);body.grid_rowconfigure(0,weight=1)
        left=ctk.CTkFrame(body,fg_color="#FFFFFF",border_width=1,border_color="#D9E2EC");left.grid(row=0,column=0,sticky="nsew",padx=(0,7));ctk.CTkLabel(left,text="Serviços e preços",font=ctk.CTkFont(size=18,weight="bold"),text_color="#0F172A").pack(anchor="w",padx=16,pady=(15,8))
        holder=ttk.Frame(left);holder.pack(fill="both",expand=True,padx=16,pady=(0,16));holder.grid_columnconfigure(0,weight=1);holder.grid_rowconfigure(0,weight=1)
        self.tree=ttk.Treeview(holder,columns=("service","price","cost","profit"),show="headings");
        for c,t,w in [("service","Serviço",320),("price","Preço atual",130),("cost","Custo total",130),("profit","Lucro estimado",140)]:self.tree.heading(c,text=t);self.tree.column(c,width=w,anchor="e" if c!="service" else "w",stretch=True)
        sb=ttk.Scrollbar(holder,orient="vertical",command=self.tree.yview);self.tree.configure(yscrollcommand=sb.set);self.tree.grid(row=0,column=0,sticky="nsew");sb.grid(row=0,column=1,sticky="ns")
        right=ctk.CTkFrame(body,fg_color="#FFFFFF",border_width=1,border_color="#D9E2EC");right.grid(row=0,column=1,sticky="nsew",padx=(7,0));ctk.CTkLabel(right,text="Atalhos",font=ctk.CTkFont(size=18,weight="bold"),text_color="#0F172A").pack(anchor="w",padx=16,pady=(15,5))
        for text,page,desc in [("Formar preço","Ficha técnica","Componha custos e veja quanto cobrar."),("Simular o mês","Simulação e relatórios","Informe quantidades previstas."),("Cadastrar serviço","Serviços","Crie ou altere preços de venda."),("Revisar custos","Custos fixos","Atualize as despesas mensais.")]:
            box=ctk.CTkFrame(right,fg_color="#F8FAFC");box.pack(fill="x",padx=14,pady=6);ctk.CTkButton(box,text=text,command=lambda p=page:a.show(p),width=145,fg_color="#087EA4").pack(side="left",padx=8,pady=9);ctk.CTkLabel(box,text=desc,text_color="#64748B",wraplength=190,justify="left").pack(side="left",fill="x",expand=True,padx=5)
        charts=ctk.CTkFrame(self,fg_color="transparent");charts.pack(fill="x",padx=24,pady=(0,16));charts.grid_columnconfigure((0,1),weight=1,uniform="charts")
        price_card=ctk.CTkFrame(charts,fg_color="#FFFFFF",border_width=1,border_color="#D9E2EC");price_card.grid(row=0,column=0,sticky="nsew",padx=(0,7))
        ctk.CTkLabel(price_card,text="Preço, custo e recomendação",font=ctk.CTkFont(size=17,weight="bold"),text_color="#0F172A").pack(anchor="w",padx=16,pady=(13,0))
        self.price_fig=Figure(figsize=(5.5,2.35),dpi=100,facecolor="#FFFFFF");self.price_ax=self.price_fig.add_subplot(111);self.price_canvas=FigureCanvasTkAgg(self.price_fig,master=price_card);self.price_canvas.get_tk_widget().pack(fill="both",expand=True,padx=8,pady=8)
        mix_card=ctk.CTkFrame(charts,fg_color="#FFFFFF",border_width=1,border_color="#D9E2EC");mix_card.grid(row=0,column=1,sticky="nsew",padx=(7,0))
        ctk.CTkLabel(mix_card,text="Destino do faturamento previsto",font=ctk.CTkFont(size=17,weight="bold"),text_color="#0F172A").pack(anchor="w",padx=16,pady=(13,0))
        self.mix_fig=Figure(figsize=(5.5,2.35),dpi=100,facecolor="#FFFFFF");self.mix_ax=self.mix_fig.add_subplot(111);self.mix_canvas=FigureCanvasTkAgg(self.mix_fig,master=mix_card);self.mix_canvas.get_tk_widget().pack(fill="both",expand=True,padx=8,pady=8)
        self.refresh()
    def refresh(self):
        for item in self.tree.get_children():self.tree.delete(item)
        revenue=variable=qty=0;price_chart=[];cost_chart=[];recommended_chart=[];labels=[];sim={(r["tipo"],r["item_id"]):fnum(r["previsao_vendas"]) for r in self.a.db.read("simulacao")};first_rec=0
        total_fixed=self.a.total_fixed();cap=self.a.capacity()[2];desired=fnum(self.a.db.config().get("lucro_desejado_pct","15"))/100
        for srv in self.a.db.read("servicos"):
            labor,mat,hours=self.a.compute(srv["id"]);price=fnum(srv["preco_venda"]);rates=sum(fnum(srv[k]) for k in ["imposto_pct","cartao_pct","aplicativo_pct","comissao_pct"])/100;allocation=total_fixed*(hours/cap) if cap else 0;cost=labor+mat+allocation;profit=price-price*rates-cost
            rec=cost/(1-rates-desired) if 1-rates-desired>0 else 0
            if not first_rec:first_rec=rec
            self.tree.insert("","end",values=(srv["nome"],money(price),money(cost),money(profit)));labels.append(srv["nome"][:22]);price_chart.append(price);cost_chart.append(cost);recommended_chart.append(rec);q=sim.get(("servico",srv["id"]),0);revenue+=price*q;variable+=(labor+mat+price*rates)*q;qty+=q
        for r in self.a.db.read("revendas"):
            q=sim.get(("revenda",r["id"]),0);price=fnum(r["preco_venda"]);rates=sum(fnum(r.get(k)) for k in ["imposto_pct","cartao_pct","aplicativo_pct","comissao_pct"])/100;revenue+=price*q;variable+=(fnum(r["custo_unitario"])+price*rates)*q;qty+=q
        contribution=revenue-variable;fixed=self.a.total_fixed();profit=contribution-fixed;cm=contribution/revenue if revenue else 0;breakeven=fixed/cm if cm else 0
        self.vars["revenue"].set(money(revenue));self.vars["profit"].set(money(profit));self.vars["breakeven"].set(money(breakeven));self.vars["recommended"].set(money(first_rec))
        self.price_ax.clear();self.price_ax.set_facecolor("#FFFFFF")
        shown=min(6,len(labels));idx=list(range(shown));width=.24
        if shown:
            self.price_ax.bar([x-width for x in idx],price_chart[:shown],width,label="Preço atual",color="#2563EB")
            self.price_ax.bar(idx,cost_chart[:shown],width,label="Custo",color="#F59E0B")
            self.price_ax.bar([x+width for x in idx],recommended_chart[:shown],width,label="Recomendado",color="#0F9D8A")
            self.price_ax.set_xticks(idx,labels[:shown],rotation=12,ha="right",fontsize=8);self.price_ax.legend(frameon=False,ncol=3,fontsize=8,loc="upper left")
        else:self.price_ax.text(.5,.5,"Cadastre serviços para visualizar",ha="center",va="center",color="#64748B")
        self.price_ax.spines[["top","right","left"]].set_visible(False);self.price_ax.grid(axis="y",alpha=.18);self.price_ax.tick_params(axis="y",labelsize=8);self.price_fig.tight_layout();self.price_canvas.draw_idle()
        self.mix_ax.clear();self.mix_ax.set_facecolor("#FFFFFF");operating=max(0,profit);costs=max(0,variable);fixed_part=max(0,fixed)
        values=[v for v in [costs,fixed_part,operating] if v>0];names=[n for n,v in zip(["Custos variáveis","Custos fixos","Lucro"],[costs,fixed_part,operating]) if v>0];colors=[c for c,v in zip(["#F59E0B","#64748B","#16A34A"],[costs,fixed_part,operating]) if v>0]
        if values:
            self.mix_ax.pie(values,labels=names,colors=colors,autopct=lambda x:f"{x:.0f}%",startangle=90,wedgeprops={"width":.42,"edgecolor":"white"},textprops={"fontsize":8})
            self.mix_ax.text(0,0,"Faturamento\nprevisto",ha="center",va="center",fontsize=9,color="#475569")
        else:self.mix_ax.text(.5,.5,"Preencha a simulação de vendas",ha="center",va="center",color="#64748B",transform=self.mix_ax.transAxes)
        self.mix_fig.tight_layout();self.mix_canvas.draw_idle()

class SimulationFrame(ctk.CTkFrame):
    def __init__(self,m,a):
        super().__init__(m,fg_color="transparent"); self.a=a
        ctk.CTkLabel(self,text="Simulação de vendas e relatório gerencial",font=ctk.CTkFont(size=24,weight="bold"),text_color="#0F172A").pack(anchor="w",padx=18,pady=12)
        self.scroll=ctk.CTkFrame(self,fg_color="#FFFFFF",border_width=1,border_color="#D9E2EC"); self.scroll.pack(fill="both",expand=True,padx=12,pady=6); self.entries={}
        ctk.CTkButton(self,text="Salvar previsão e calcular",command=self.calculate,fg_color="#00a8c6").pack(pady=8)
        self.out=ctk.CTkTextbox(self,height=210); self.out.pack(fill="x",padx=12,pady=8); self.refresh()
    def refresh(self):
        for w in self.scroll.winfo_children():w.destroy()
        self.entries={}; saved={(r["tipo"],r["item_id"]):r for r in self.a.db.read("simulacao")}
        for c,t in enumerate(["Tipo","Item","Preço","Previsão"]):ctk.CTkLabel(self.scroll,text=t,font=ctk.CTkFont(weight="bold")).grid(row=0,column=c,padx=8,pady=5,sticky="w")
        row=1
        for typ,table in [("servico","servicos"),("revenda","revendas")]:
            for r in self.a.db.read(table):
                ctk.CTkLabel(self.scroll,text=typ.title()).grid(row=row,column=0,padx=8,pady=3,sticky="w"); ctk.CTkLabel(self.scroll,text=r["nome"],width=320,anchor="w").grid(row=row,column=1,padx=8,pady=3); ctk.CTkLabel(self.scroll,text=money(fnum(r["preco_venda"]))).grid(row=row,column=2,padx=8,pady=3)
                e=ctk.CTkEntry(self.scroll,width=100); e.insert(0,saved.get((typ,r["id"]),{}).get("previsao_vendas","0")); e.grid(row=row,column=3,padx=8,pady=3); self.entries[(typ,r["id"])]=e; row+=1
        self.calculate(False)
    def calculate(self,save=True):
        if save:
            rows=[]
            for (typ,i),e in self.entries.items(): rows.append({"id":str(len(rows)+1),"tipo":typ,"item_id":i,"previsao_vendas":e.get()})
            self.a.db.write("simulacao",rows)
        revenue=variable=contribution=qty=0
        services={r["id"]:r for r in self.a.db.read("servicos")}; resale={r["id"]:r for r in self.a.db.read("revendas")}
        for (typ,i),e in self.entries.items():
            q=fnum(e.get()); item=(services if typ=="servico" else resale).get(i,{}); price=fnum(item.get("preco_venda")); qty+=q; revenue+=price*q
            rates=sum(fnum(item.get(k)) for k in ["imposto_pct","cartao_pct","aplicativo_pct","comissao_pct"])/100
            base=sum(self.a.compute(i)[:2]) if typ=="servico" else fnum(item.get("custo_unitario")); vc=(base+price*rates)*q; variable+=vc; contribution+=price*q-vc
        fixed=self.a.total_fixed(); profit=contribution-fixed; cm=contribution/revenue if revenue else 0; pe=fixed/cm if cm else 0; ticket=revenue/qty if qty else 0
        text=f"Faturamento bruto: {money(revenue)}\nCustos variáveis: {money(variable)}\nMargem de contribuição: {money(contribution)} ({pct(cm*100)})\nCustos fixos: {money(fixed)}\nLucro operacional: {money(profit)}\nPonto de equilíbrio: {money(pe)}\nTicket médio: {money(ticket)}"
        self.out.delete("1.0","end");self.out.insert("1.0",text)
        if save:self.a.refresh_all();self.a.status("Simulação salva")

class AnalysisFrame(ctk.CTkFrame):
    def __init__(self,m,a):
        super().__init__(m,fg_color="transparent");self.a=a;self.map={}
        ctk.CTkLabel(self,text="Análise individual",font=ctk.CTkFont(size=26,weight="bold"),text_color="#0F172A").pack(anchor="w",padx=24,pady=(20,4))
        ctk.CTkLabel(self,text="Analise rentabilidade, simule desconto e encontre o preço mínimo recomendado.",text_color="#64748B").pack(anchor="w",padx=24,pady=(0,16))
        card=ctk.CTkFrame(self,fg_color="#FFFFFF",border_width=1,border_color="#DDE5EF");card.pack(fill="x",padx=24,pady=5)
        self.kind=ctk.CTkSegmentedButton(card,values=["Serviço","Revenda"],command=lambda _:self.refresh());self.kind.set("Serviço");self.kind.grid(row=0,column=0,padx=18,pady=18)
        self.item=ctk.CTkComboBox(card,width=430,command=lambda _:self.calculate());self.item.grid(row=0,column=1,padx=8,pady=18)
        self.discount=ctk.CTkEntry(card,width=150,placeholder_text="Desconto %");self.discount.grid(row=0,column=2,padx=8,pady=18);self.discount.insert(0,"0")
        self.desired=ctk.CTkEntry(card,width=170,placeholder_text="Lucro desejado %");self.desired.grid(row=0,column=3,padx=8,pady=18);self.desired.insert(0,"15")
        ctk.CTkButton(card,text="Calcular análise",command=self.calculate,fg_color="#087EA4").grid(row=0,column=4,padx=18,pady=18)
        self.out=ctk.CTkTextbox(self,fg_color="#FFFFFF",text_color="#1E293B",border_width=1,border_color="#DDE5EF",font=("Segoe UI",13));self.out.pack(fill="both",expand=True,padx=24,pady=16)
        self.refresh()
    def refresh(self):
        table="servicos" if self.kind.get()=="Serviço" else "revendas";rows=self.a.db.read(table);self.map={f'{r["id"]} - {r["nome"]}':r for r in rows};vals=list(self.map) or ["Nenhum item cadastrado"]
        self.item.configure(values=vals);self.item.set(vals[0]);self.calculate()
    def calculate(self):
        r=self.map.get(self.item.get());
        if not r:return
        price=fnum(r.get("preco_venda"));sale=price*(1-fnum(self.discount.get())/100);rates=sum(fnum(r.get(k)) for k in ["imposto_pct","cartao_pct","aplicativo_pct","comissao_pct"])/100
        if self.kind.get()=="Serviço":labor,material,hours=self.a.compute(r["id"]);base=labor+material
        else:labor=hours=0;material=base=fnum(r.get("custo_unitario"))
        deduction=sale*rates;contribution=sale-base-deduction;fixed=self.a.total_fixed();capacity=self.a.capacity()[2];allocation=fixed*(hours/capacity) if capacity and hours else 0;profit=contribution-allocation;margin=profit/sale*100 if sale else 0
        desired=fnum(self.desired.get())/100;den=1-rates-desired;recommended=(base+allocation)/den if den>0 else 0
        status="Rentável" if profit>=0 else "Prejuízo"
        text=(f"ITEM ANALISADO: {r.get('nome','')}\nSTATUS: {status}\n\n"
              f"Preço cadastrado: {money(price)}\nPreço após desconto: {money(sale)}\nCusto direto: {money(base)}\n"
              f"Deduções percentuais: {money(deduction)}\nRateio de custos fixos: {money(allocation)}\n"
              f"Margem de contribuição: {money(contribution)}\nLucro estimado: {money(profit)} ({pct(margin)})\n\n"
              f"PREÇO RECOMENDADO PARA O LUCRO DESEJADO: {money(recommended)}")
        self.out.delete("1.0","end");self.out.insert("1.0",text)

class CapacityFrame(ctk.CTkFrame):
    def __init__(self,m,a):
        super().__init__(m,fg_color="transparent");self.a=a;self.out=ctk.CTkTextbox(self,fg_color="#FFFFFF",text_color="#1E293B",border_width=1,border_color="#DDE5EF",font=("Segoe UI",13))
        ctk.CTkLabel(self,text="Capacidade produtiva",font=ctk.CTkFont(size=26,weight="bold"),text_color="#0F172A").pack(anchor="w",padx=24,pady=(20,4));ctk.CTkLabel(self,text="Compare a capacidade efetiva da equipe com as horas previstas na simulação.",text_color="#64748B").pack(anchor="w",padx=24,pady=(0,16));self.out.pack(fill="both",expand=True,padx=24,pady=10);self.refresh()
    def refresh(self):
        n,mx,eff=self.a.capacity();allocated=0
        sim={(r["tipo"],r["item_id"]):fnum(r["previsao_vendas"]) for r in self.a.db.read("simulacao")}
        for r in self.a.db.read("servicos"):allocated+=self.a.compute(r["id"])[2]*sim.get(("servico",r["id"]),0)
        used=allocated/eff*100 if eff else 0;status="Capacidade disponível" if allocated<=eff else "Capacidade excedida"
        cfg=self.a.db.config();text=(f"RESUMO DA EQUIPE\n\nFuncionários cadastrados: {n}\n"
            f"Horas produtivas por dia: {cfg.get('horas_dia','0')}\nDias de atividade no mês: {cfg.get('dias_mes','0')}\n"
            f"Produtividade considerada: {cfg.get('produtividade_pct','0')}%\n\nCapacidade máxima: {mx:.2f} horas/mês\n"
            f"Capacidade efetiva: {eff:.2f} horas/mês\nHoras comprometidas com a previsão: {allocated:.2f} horas/mês\n"
            f"Utilização: {pct(used)}\nOciosidade: {pct(max(0,100-used))}\n\nSTATUS: {status}")
        self.out.delete("1.0","end");self.out.insert("1.0",text)

class SettingsFrame(ctk.CTkFrame):
    def __init__(self,m,a):
        super().__init__(m,fg_color="transparent");self.a=a;self.e={}
        ctk.CTkLabel(self,text="Configurações e dados",font=ctk.CTkFont(size=24,weight="bold"),text_color="#0F172A").pack(anchor="w",padx=18,pady=12)
        f=ctk.CTkFrame(self);f.pack(fill="x",padx=15,pady=8)
        labels={"horas_dia":"Horas produtivas/dia","dias_mes":"Dias de atividade/mês","produtividade_pct":"Produtividade da equipe (%)","lucro_desejado_pct":"Lucro desejado (%)","encargos_trabalhistas_padrao_pct":"Encargos trabalhistas padrão (%)","encargos_sociais_padrao_pct":"Encargos sociais padrão (%)"}
        cfg=a.db.config()
        for i,(k,l) in enumerate(labels.items()):
            ctk.CTkLabel(f,text=l).grid(row=i,column=0,padx=10,pady=6,sticky="w");e=ctk.CTkEntry(f);e.insert(0,cfg.get(k,""));e.grid(row=i,column=1,padx=10,pady=6);self.e[k]=e
        ctk.CTkButton(f,text="Salvar configurações",command=self.save).grid(row=len(labels),column=0,columnspan=2,pady=12)
        actions=ctk.CTkFrame(self);actions.pack(fill="x",padx=15,pady=8)
        ctk.CTkButton(actions,text="Abrir pasta de dados",command=self.open_folder).pack(side="left",padx=7,pady=10)
        ctk.CTkButton(actions,text="Criar backup",command=self.backup).pack(side="left",padx=7,pady=10)
        ctk.CTkButton(actions,text="Restaurar backup",command=self.restore).pack(side="left",padx=7,pady=10)
        ctk.CTkButton(actions,text="Importar cadastros da planilha .xlsm",command=self.import_xlsx).pack(side="left",padx=7,pady=10)
    def save(self):self.a.db.save_config({k:e.get() for k,e in self.e.items()});self.a.refresh_all();self.a.status("Configurações salvas")
    def open_folder(self): os.startfile(DATA_DIR) if sys.platform.startswith("win") else subprocess.Popen(["xdg-open",str(DATA_DIR)])
    def backup(self):
        p=BACKUP_DIR/datetime.now().strftime("backup_%Y%m%d_%H%M%S");shutil.copytree(DATA_DIR,p);messagebox.showinfo("Backup",f"Backup criado em:\n{p}")
    def restore(self):
        p=filedialog.askdirectory(initialdir=BACKUP_DIR,title="Selecione a pasta do backup")
        if p and messagebox.askyesno("Restaurar","Os dados atuais serão substituídos. Continuar?"):
            for f in DATA_DIR.glob("*.csv"):f.unlink()
            for f in Path(p).glob("*.csv"):shutil.copy2(f,DATA_DIR/f.name)
            self.a.db=CSVDB();self.a.refresh_all();messagebox.showinfo("Concluído","Backup restaurado.")
    def import_xlsx(self):
        p=filedialog.askopenfilename(filetypes=[("Planilha Excel","*.xlsx *.xlsm")])
        if not p:return
        try:
            from openpyxl import load_workbook
            wb=load_workbook(p,data_only=False,read_only=True)
            count=0
            if "CadInsumos" in wb.sheetnames:
                ws=wb["CadInsumos"]
                for row in ws.iter_rows(min_row=1,values_only=True):
                    vals=["" if v is None else str(v) for v in row]
                    if len(vals)>=6 and vals[0].isdigit() and vals[1] and fnum(vals[5])>0:
                        bruto=fnum(vals[2]) or 1; liquido=fnum(vals[3]) or bruto; custo=fnum(vals[5]); fator=bruto/liquido if liquido else 1
                        self.a.db.upsert("insumos",{"id":vals[0],"descricao":vals[1],"unidade":vals[4],"qtde_bruta":bruto,"qtde_liquida":liquido,"custo_compra":custo,"fator_perda":fator,"custo_unitario":custo*fator});count+=1
            if "CadServicos" in wb.sheetnames:
                ws=wb["CadServicos"]
                for row in ws.iter_rows(values_only=True):
                    vals=["" if v is None else str(v) for v in row]
                    if len(vals)>=2 and vals[0].isdigit() and vals[1]:self.a.db.upsert("servicos",{"id":vals[0],"nome":vals[1],"preco_venda":"0","imposto_pct":"0","cartao_pct":"0","aplicativo_pct":"0","comissao_pct":"0"});count+=1
            self.a.refresh_all();messagebox.showinfo("Importação",f"{count} registros importados. Revise os valores no aplicativo.")
        except Exception as ex:messagebox.showerror("Erro ao importar",str(ex))

class App(ctk.CTk):
    def __init__(self):
        super().__init__();ctk.set_appearance_mode("light");ctk.set_default_color_theme("blue");self.db=CSVDB();self.title(APP_NAME);self.geometry("1520x920");self.minsize(1180,720);self._configure_ttk()
        self.configure(fg_color="#F4F7FB");self.sidebar=ctk.CTkFrame(self,width=235,corner_radius=0,fg_color="#FFFFFF",border_width=1,border_color="#DDE5EF");self.sidebar.pack(side="left",fill="y");ctk.CTkLabel(self.sidebar,text="PRECIFICA",font=ctk.CTkFont(size=25,weight="bold"),text_color="#087EA4").pack(padx=20,pady=(25,18))
        self.content=ctk.CTkFrame(self,fg_color="#F4F7FB");self.content.pack(side="left",fill="both",expand=True);self.pages={};self.factories={};self.dirty=set();self.current=None
        def calc_ins(r):
            bruto=fnum(r["qtde_bruta"]) or 1;liq=fnum(r["qtde_liquida"]) or bruto;c=fnum(r["custo_compra"]);r["fator_perda"]=bruto/liq if liq else 1;r["custo_unitario"]=c*r["fator_perda"];return r
        def calc_emp(r):
            sal=fnum(r["salario"]);extras=sum(fnum(r[k]) for k in ["vale_transporte","vale_refeicao","convenio_medico"]);enc=(fnum(r["encargos_sociais_pct"])+fnum(r["encargos_trabalhistas_pct"]))/100;r["custo_total"]=sal*(1+enc)+extras;h=fnum(r["carga_horaria_mensal"]);r["valor_hora"]=r["custo_total"]/h if h else 0;return r
        def calc_rev(r):q=fnum(r["quantidade_compra"]) or 1;r["custo_unitario"]=fnum(r["custo_compra"])/q;return r
        def calc_imob(r):vida=fnum(r["vida_util_anos"]);tax=fnum(r["taxa_anual_pct"])/100;r["depreciacao_mensal"]=fnum(r["valor"])*tax/12 if tax else (fnum(r["valor"])/(vida*12) if vida else 0);return r
        specs={
        "Insumos":("insumos","Cadastro de insumos e materiais",[("descricao","Descrição"),("unidade","Unidade"),("qtde_bruta","Qtd. bruta"),("qtde_liquida","Qtd. líquida"),("custo_compra","Custo compra"),("fator_perda","Fator perda"),("custo_unitario","Custo unitário")],calc_ins),
        "Funcionários":("funcionarios","Cadastro de funcionários",[("nome","Nome"),("setor","Setor"),("cargo","Cargo/Função"),("contratacao","Contratação"),("salario","Salário"),("encargos_sociais_pct","Encargos sociais %"),("encargos_trabalhistas_pct","Encargos trabalhistas %"),("vale_transporte","Vale transporte"),("vale_refeicao","Vale refeição"),("convenio_medico","Convênio médico"),("carga_horaria_mensal","Carga horária mensal"),("custo_total","Custo total"),("valor_hora","Valor/hora")],calc_emp),
        "Custos fixos":("custos_fixos","Custos fixos mensais",[("descricao","Descrição"),("valor_mensal","Valor mensal"),("categoria","Categoria")],None),
        "Imobilizados":("imobilizados","Imobilizados e depreciação",[("descricao","Descrição"),("valor","Valor"),("vida_util_anos","Vida útil (anos)"),("taxa_anual_pct","Taxa anual %"),("depreciacao_mensal","Depreciação mensal")],calc_imob),
        "Serviços":("servicos","Cadastro de serviços",[("nome","Serviço"),("preco_venda","Preço de venda"),("imposto_pct","Impostos %"),("cartao_pct","Cartão %"),("aplicativo_pct","Aplicativo %"),("comissao_pct","Comissão %")],None),
        "Revendas":("revendas","Produtos para revenda",[("nome","Produto"),("unidade","Unidade"),("quantidade_compra","Qtd. compra"),("custo_compra","Custo compra"),("custo_unitario","Custo unitário"),("preco_venda","Preço venda"),("imposto_pct","Impostos %"),("cartao_pct","Cartão %"),("aplicativo_pct","Aplicativo %"),("comissao_pct","Comissão %")],calc_rev),
        "Concorrentes":("concorrentes","Análise de concorrentes",[("empresa","Empresa"),("item_avaliado","Item avaliado"),("nota","Nota 1 a 3"),("preco_unitario","Preço unitário"),("observacao","Observação")],None)}
        self.factories["Início"]=lambda:Dashboard(self.content,self)
        for n,(t,ttl,fields,calc) in specs.items():self.factories[n]=lambda t=t,ttl=ttl,fields=fields,calc=calc:CrudFrame(self.content,self,t,ttl,fields,calc)
        self.factories["Ficha técnica"]=lambda:PricingFrame(self.content,self);self.factories["Análise individual"]=lambda:AnalysisFrame(self.content,self);self.factories["Capacidade produtiva"]=lambda:CapacityFrame(self.content,self);self.factories["Simulação e relatórios"]=lambda:SimulationFrame(self.content,self);self.factories["Configurações"]=lambda:SettingsFrame(self.content,self)
        self.nav_buttons={}
        menu_groups=[
            ("VISÃO GERAL",["Início"]),
            ("1. CADASTROS",["Insumos","Funcionários","Custos fixos","Imobilizados","Serviços","Revendas","Concorrentes"]),
            ("2. PRECIFICAÇÃO",["Ficha técnica","Análise individual"]),
            ("3. PLANEJAMENTO",["Capacidade produtiva","Simulação e relatórios"]),
            ("SISTEMA",["Configurações"]),
        ]
        for group,names in menu_groups:
            ctk.CTkLabel(self.sidebar,text=group,font=ctk.CTkFont(size=11,weight="bold"),text_color="#94A3B8").pack(anchor="w",padx=18,pady=(12,4))
            for name in names:
                b=ctk.CTkButton(self.sidebar,text=name,anchor="w",height=36,corner_radius=7,command=lambda n=name:self.show(n),fg_color="transparent",text_color="#334155",hover_color="#E8F3F8")
                b.pack(fill="x",padx=10,pady=2);self.nav_buttons[name]=b
        self.lbl=ctk.CTkLabel(self.sidebar,text="Pronto",wraplength=190,text_color="#64748B");self.lbl.pack(side="bottom",padx=10,pady=15);self.show("Início")
    def _configure_ttk(self):
        style=ttk.Style(self)
        style.configure("Treeview",background="#FFFFFF",fieldbackground="#FFFFFF",foreground="#1E293B",rowheight=30,borderwidth=0,font=("Segoe UI",10))
        style.configure("Treeview.Heading",background="#EAF1F7",foreground="#334155",relief="flat",font=("Segoe UI",10,"bold"),padding=8)
        style.map("Treeview",background=[("selected","#CDEAF5")],foreground=[("selected","#0F172A")])
        style.map("Treeview.Heading",background=[("active","#DCEAF2")])
    def show(self,n):
        if n==self.current and n in self.pages and n not in self.dirty: return
        if self.current in self.nav_buttons:
            self.nav_buttons[self.current].configure(fg_color="transparent",text_color="#334155",border_width=0)
        self.nav_buttons[n].configure(fg_color="#DDF1F7",text_color="#075E74",border_width=1,border_color="#9ED5E3")
        page=self.pages.get(n)
        if page is None:
            page=self.pages[n]=self.factories[n]()   # criada sob demanda (já nasce atualizada)
            self.dirty.discard(n)
        elif n in self.dirty:
            self.dirty.discard(n)
            if hasattr(page,"refresh"): page.refresh()
        old=self.pages.get(self.current)
        page.pack(fill="both",expand=True,padx=8,pady=8)
        if old is not None and old is not page: old.pack_forget()
        self.current=n
        self.status(f"Tela atual: {n}")
    def status(self,t):self.lbl.configure(text=t)
    def compute(self,sid):
        emps={r["id"]:r for r in self.db.read("funcionarios")};ins={r["id"]:r for r in self.db.read("insumos")}
        mo=[r for r in self.db.read("ficha_mao_obra") if r["servico_id"]==sid]
        labor=sum(fnum(emps.get(r["funcionario_id"],{}).get("valor_hora"))*fnum(r["horas"]) for r in mo)
        material=sum(fnum(ins.get(r["insumo_id"],{}).get("custo_unitario"))*fnum(r["quantidade"]) for r in self.db.read("ficha_insumos") if r["servico_id"]==sid)
        return labor,material,sum(fnum(r["horas"]) for r in mo)
    def capacity(self):
        cfg=self.db.config();n=len(self.db.read("funcionarios"));mx=n*fnum(cfg.get("horas_dia"))*fnum(cfg.get("dias_mes"));eff=mx*fnum(cfg.get("produtividade_pct"))/100;return n,mx,eff
    def total_fixed(self):return sum(fnum(r["valor_mensal"]) for r in self.db.read("custos_fixos"))+sum(fnum(r["depreciacao_mensal"]) for r in self.db.read("imobilizados"))
    def refresh_all(self):
        """Marca as telas como desatualizadas; só a tela visível é redesenhada agora."""
        self.dirty.update(self.pages)
        page=self.pages.get(self.current)
        if page is not None and hasattr(page,"refresh"):
            self.dirty.discard(self.current)
            try:page.refresh()
            except Exception:pass

if __name__=="__main__": App().mainloop()
