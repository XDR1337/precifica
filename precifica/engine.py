# -*- coding: utf-8 -*-
"""Motor de calculo - reproduz as formulas da Planilha de Precificacao EG3 (R02).

Convencao: percentuais armazenados no banco em pontos (6 = 6%); dentro do motor
sao convertidos para fracao (0,06). Todos os valores monetarios em R$.

Correcoes em relacao a planilha R02 (backlog do relatorio final):
* o rateio de custos fixos da Analise usa o faturamento de servicos + revenda,
  igual a aba Simulacao (na R02 a aba Analise usava apenas servicos);
* a contagem de colaboradores da capacidade produtiva considera apenas o setor Produtivo.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .core import fnum, safe_div

DED_KEYS = ("imposto_pct", "cartao_pct", "app_pct", "comissao_pct")


@dataclass
class ItemCalc:
    """Linha da tabela de precificacao (servico ou revenda) + simulacao."""
    tipo: str                 # 'servico' | 'revenda'
    id: int
    nome: str
    unidade: str
    preco: float
    custo_md: float           # materiais/insumos diretos (servico) ou CMV (revenda)
    custo_mod: float          # mao de obra direta (0 na revenda)
    horas: float              # horas de MOD por unidade
    imposto: float            # fracoes
    cartao: float
    app: float
    comissao: float
    previsao: float
    # calculados
    cv: float = 0.0
    ded_imposto: float = 0.0
    ded_cartao: float = 0.0
    ded_app: float = 0.0
    ded_comissao: float = 0.0
    deducoes: float = 0.0
    mc: float = 0.0
    mc_pct: float = 0.0
    tem_ficha: bool = True
    # simulacao (totais do mes)
    faturamento: float = 0.0
    cv_total: float = 0.0
    mod_total: float = 0.0
    md_total: float = 0.0
    ded_total: float = 0.0
    ded_imposto_total: float = 0.0
    ded_cartao_total: float = 0.0
    ded_app_total: float = 0.0
    ded_comissao_total: float = 0.0
    mc_total: float = 0.0
    rateio_cf: float = 0.0
    lucro: float = 0.0
    lucro_pct: float = 0.0
    markup: float = 0.0
    mix_pct: float = 0.0

    @property
    def ded_pct(self) -> float:
        return self.imposto + self.cartao + self.app + self.comissao

    @property
    def pct_mod(self) -> float:
        return safe_div(self.custo_mod, self.preco)

    @property
    def pct_md(self) -> float:
        return safe_div(self.custo_md, self.preco)

    @property
    def pct_cpv(self) -> float:
        return safe_div(self.cv, self.preco)


@dataclass
class Analise:
    """DRE unitaria (aba Analise): coluna 'preco praticado' e coluna 'preco sugerido'."""
    item: ItemCalc
    desconto: float
    lucro_desejado: float
    rateio_pct: float
    # coluna praticada
    preco: float = 0.0
    linhas: list = field(default_factory=list)          # (rotulo, valor, pct)
    mc: float = 0.0
    rateio: float = 0.0
    lucro: float = 0.0
    markup: float = 0.0
    # coluna sugerida
    preco_sug: float = 0.0
    linhas_sug: list = field(default_factory=list)
    mc_sug: float = 0.0
    rateio_sug: float = 0.0
    lucro_sug: float = 0.0
    markup_sug: float = 0.0
    viavel: bool = True
    aviso: str = ""


class Engine:
    def __init__(self, db):
        self.db = db
        self.reload()

    # ------------------------------------------------------------ carga
    def reload(self):
        db = self.db
        self.cfg = db.config()
        self.insumos = {r["id"]: r for r in db.all("insumos")}
        self.equipe = {r["id"]: r for r in db.all("equipe")}
        self.cf_rows = db.all("custos_fixos")
        self.imob_rows = db.all("imobilizado")
        self.servicos = db.all("servicos")
        self.revendas = db.all("revenda")
        self.fmod = db.all("ficha_mod")
        self.fins = db.all("ficha_insumo")
        self._cache = {}

    def c(self, key, default=0.0) -> float:
        return fnum(self.cfg.get(key), default)

    # ------------------------------------------------------------ encargos / equipe
    def encargos_trab_pct(self) -> float:
        return (self.c("enc_ferias") + self.c("enc_13") + self.c("enc_13_ferias")) / 100

    def encargos_soc_pct(self) -> float:
        return (self.c("enc_inss") + self.c("enc_sat") + self.c("enc_sal_educacao") + self.c("enc_sistema_s")
                + self.c("enc_fgts") + self.c("enc_fgts_rescisao")) / 100

    def colaborador(self, e: dict) -> dict:
        sal = fnum(e.get("salario"))
        tipo = (e.get("contratacao") or "").lower()
        if tipo == "clt":
            soc, trab = sal * self.encargos_soc_pct(), sal * self.encargos_trab_pct()
        elif "pró" in tipo or "pro-" in tipo or "pro labore" in tipo or "pró-labore" in tipo:
            soc, trab = sal * self.c("enc_prolabore_inss") / 100, 0.0
        else:
            soc, trab = 0.0, 0.0
        beneficios = fnum(e.get("vale_transporte")) + fnum(e.get("vale_refeicao")) + fnum(e.get("convenio"))
        total = sal + soc + trab + beneficios
        carga = fnum(e.get("carga_horaria"))
        prod = self.produtividade()
        return dict(e, enc_sociais=soc, enc_trab=trab, beneficios=beneficios, total=total,
                    valor_hora=safe_div(total, carga),
                    custo_hora=safe_div(total, carga * prod))   # custo-hora usado na ficha tecnica

    def equipe_calc(self) -> list[dict]:
        return [self.colaborador(e) for e in self.equipe.values()]

    def folha_total(self, setor: str | None = None) -> float:
        return sum(c["total"] for c in self.equipe_calc() if setor is None or c.get("setor") == setor)

    # ------------------------------------------------------------ capacidade produtiva
    def produtividade(self) -> float:
        return max(0.01, self.c("produtividade_pct", 75) / 100)

    def capacidade(self) -> dict:
        prod_list = [e for e in self.equipe.values() if e.get("setor") == "Produtivo"]
        n = len(prod_list)
        h_dia, dias, p = self.c("horas_dia", 8), self.c("dias_mes", 22), self.produtividade()
        horas_max = n * h_dia * dias
        efet_membro = h_dia * dias * p
        efet_equipe = horas_max * p
        alocadas = sum(self.ficha(s["id"])["horas"] * fnum(s.get("previsao")) for s in self.servicos)
        vendidas = safe_div(alocadas, efet_equipe)
        ociosidade = max(0.0, 1 - vendidas) if efet_equipe else 0.0
        if not efet_equipe:
            status = "Cadastre a equipe produtiva para calcular a capacidade."
            nivel = "info"
        elif vendidas > 1:
            status = ("A capacidade produtiva já está no máximo: será necessário melhorar a produtividade "
                      "ou contratar novos colaboradores.")
            nivel = "danger"
        elif abs(vendidas - 1) < 1e-6:
            status = "Sua capacidade de produção está 100% preenchida."
            nivel = "ok"
        else:
            status = "Existe espaço para vender mais serviços com a equipe atual."
            nivel = "warn" if vendidas < 0.6 else "ok"
        return dict(colaboradores=n, horas_dia=h_dia, dias_mes=dias, produtividade=p, horas_max=horas_max,
                    efetivas_membro=efet_membro, efetivas_equipe=efet_equipe, alocadas=alocadas,
                    vendidas_pct=vendidas, ociosidade_pct=ociosidade, status=status, nivel=nivel)

    # ------------------------------------------------------------ insumos
    @staticmethod
    def insumo_calc(r: dict) -> dict:
        qb = fnum(r.get("qtde_bruta"), 1) or 1
        ql = fnum(r.get("qtde_liquida"), qb) or qb
        fator = safe_div(qb, ql, 1.0)
        custo_medida = safe_div(fnum(r.get("custo")), qb) * fator
        return dict(r, fator=fator, custo_medida=custo_medida)

    # ------------------------------------------------------------ ficha tecnica
    def ficha(self, servico_id) -> dict:
        key = ("ficha", servico_id)
        if key in self._cache:
            return self._cache[key]
        mod_lines, ins_lines = [], []
        for l in self.fmod:
            if l["servico_id"] != servico_id:
                continue
            e = self.equipe.get(l["equipe_id"])
            if not e:
                continue
            c = self.colaborador(e)
            h = fnum(l["horas"])
            mod_lines.append(dict(id=l["id"], equipe_id=e["id"], nome=e["nome"], cargo=e.get("cargo", ""),
                                  custo_hora=c["custo_hora"], horas=h, total=h * c["custo_hora"]))
        for l in self.fins:
            if l["servico_id"] != servico_id:
                continue
            i = self.insumos.get(l["insumo_id"])
            if not i:
                continue
            ic = self.insumo_calc(i)
            q = fnum(l["quantidade"])
            ins_lines.append(dict(id=l["id"], insumo_id=i["id"], descricao=i["descricao"], unidade=i.get("unidade", ""),
                                  custo_unit=ic["custo_medida"], quantidade=q, total=q * ic["custo_medida"]))
        res = dict(mod=mod_lines, insumos=ins_lines,
                   horas=sum(x["horas"] for x in mod_lines),
                   custo_mod=sum(x["total"] for x in mod_lines),
                   custo_md=sum(x["total"] for x in ins_lines))
        res["total"] = res["custo_mod"] + res["custo_md"]
        self._cache[key] = res
        return res

    # ------------------------------------------------------------ tabela de precificacao
    def _item(self, tipo: str, r: dict) -> ItemCalc:
        if tipo == "servico":
            f = self.ficha(r["id"])
            md, mod, horas = f["custo_md"], f["custo_mod"], f["horas"]
            tem = bool(f["mod"] or f["insumos"])
            un = r.get("unidade") or "Serviço"
        else:
            md = safe_div(fnum(r.get("custo")), fnum(r.get("qtde"), 1) or 1)
            mod, horas, tem = 0.0, 0.0, True
            un = r.get("unidade") or "Unidade"
        it = ItemCalc(tipo=tipo, id=r["id"], nome=r.get("nome", ""), unidade=un, preco=fnum(r.get("preco")),
                      custo_md=md, custo_mod=mod, horas=horas,
                      imposto=fnum(r.get("imposto_pct")) / 100, cartao=fnum(r.get("cartao_pct")) / 100,
                      app=fnum(r.get("app_pct")) / 100, comissao=fnum(r.get("comissao_pct")) / 100,
                      previsao=fnum(r.get("previsao")), tem_ficha=tem)
        it.cv = it.custo_md + it.custo_mod
        it.ded_imposto = it.preco * it.imposto
        it.ded_cartao = it.preco * it.cartao
        it.ded_app = it.preco * it.app
        it.ded_comissao = it.preco * it.comissao
        it.deducoes = it.ded_imposto + it.ded_cartao + it.ded_app + it.ded_comissao
        it.mc = it.preco - it.cv - it.deducoes
        it.mc_pct = safe_div(it.mc, it.preco)
        return it

    def itens(self, tipo: str | None = None) -> list[ItemCalc]:
        key = ("itens",)
        if key not in self._cache:
            lst = [self._item("servico", r) for r in self.servicos] + [self._item("revenda", r) for r in self.revendas]
            self._simular(lst)
            self._cache[key] = lst
        lst = self._cache[key]
        return [i for i in lst if tipo is None or i.tipo == tipo]

    def item(self, tipo: str, id_) -> ItemCalc | None:
        return next((i for i in self.itens(tipo) if i.id == id_), None)

    # ------------------------------------------------------------ custos fixos
    def depreciacao(self) -> list[dict]:
        out = []
        for r in self.imob_rows:
            vida = fnum(r.get("vida_util"))
            taxa = safe_div(1, vida)
            out.append(dict(r, taxa=taxa, mensal=fnum(r.get("valor")) * taxa / 12))
        return out

    def custos_fixos(self) -> dict:
        key = ("cf",)
        if key in self._cache:
            return self._cache[key]
        adm = self.folha_total("Administrativo")
        prod_total = self.folha_total("Produtivo")
        mod_alocada = sum(self.ficha(s["id"])["custo_mod"] * fnum(s.get("previsao")) for s in self.servicos)
        ociosidade = max(0.0, prod_total - mod_alocada)
        dep = sum(d["mensal"] for d in self.depreciacao())
        manuais = [(r["descricao"], fnum(r.get("valor"))) for r in self.cf_rows]
        linhas = [("Salários administrativos + encargos + benefícios", adm, True),
                  ("Mão de obra produtiva ociosa (não alocada em serviços)", ociosidade, True),
                  ("Depreciação de equipamentos", dep, True)] + [(d, v, False) for d, v in manuais]
        total = sum(v for _, v, _ in linhas)
        res = dict(linhas=linhas, total=total, adm=adm, ociosidade=ociosidade, depreciacao=dep,
                   mod_alocada=mod_alocada, manuais=sum(v for _, v in manuais))
        self._cache[key] = res
        return res

    # ------------------------------------------------------------ simulacao (mix de vendas)
    def _simular(self, lst: list[ItemCalc]):
        fat_total = sum(i.preco * i.previsao for i in lst)
        # CF depende da MOD alocada (calculada via ficha) - nao depende do rateio, sem circularidade
        cf = self.custos_fixos()["total"]
        for i in lst:
            q = i.previsao
            i.faturamento = i.preco * q
            i.md_total = i.custo_md * q
            i.mod_total = i.custo_mod * q
            i.cv_total = i.cv * q
            i.ded_imposto_total = i.ded_imposto * q
            i.ded_cartao_total = i.ded_cartao * q
            i.ded_app_total = i.ded_app * q
            i.ded_comissao_total = i.ded_comissao * q
            i.ded_total = i.deducoes * q
            i.mc_total = i.mc * q
            i.rateio_cf = safe_div(cf, fat_total) * i.faturamento
            i.lucro = i.mc_total - i.rateio_cf
            i.lucro_pct = safe_div(i.lucro, i.faturamento)
            i.markup = safe_div(i.faturamento, i.cv_total)
            i.mix_pct = safe_div(i.faturamento, fat_total)

    def totais(self, tipo: str | None = None) -> dict:
        lst = self.itens(tipo)
        t = dict(quantidade=sum(i.previsao for i in lst), faturamento=sum(i.faturamento for i in lst),
                 md=sum(i.md_total for i in lst), mod=sum(i.mod_total for i in lst), cv=sum(i.cv_total for i in lst),
                 imposto=sum(i.ded_imposto_total for i in lst), cartao=sum(i.ded_cartao_total for i in lst),
                 app=sum(i.ded_app_total for i in lst), comissao=sum(i.ded_comissao_total for i in lst),
                 deducoes=sum(i.ded_total for i in lst), mc=sum(i.mc_total for i in lst),
                 rateio=sum(i.rateio_cf for i in lst), lucro=sum(i.lucro for i in lst))
        t["mc_pct"] = safe_div(t["mc"], t["faturamento"])
        t["lucro_pct"] = safe_div(t["lucro"], t["faturamento"])
        t["markup"] = safe_div(t["faturamento"], t["cv"])
        return t

    def rateio_pct(self) -> float:
        fat = self.totais()["faturamento"]
        return safe_div(self.custos_fixos()["total"], fat)

    # ------------------------------------------------------------ analise individual
    def analise(self, tipo: str, id_, desconto_pct: float = 0.0, lucro_pct: float | None = None) -> Analise | None:
        it = self.item(tipo, id_)
        if not it:
            return None
        if lucro_pct is None:
            lucro_pct = self.c("lucro_desejado_pct", 15)
        d, L = desconto_pct / 100, lucro_pct / 100
        r = self.rateio_pct()
        a = Analise(item=it, desconto=d, lucro_desejado=L, rateio_pct=r)
        # coluna 1: preco praticado (com desconto simulado)
        p = it.preco * (1 - d)
        a.preco = p
        a.linhas = self._linhas(it, p)
        cvar = sum(v for _, v, _ in a.linhas)
        a.mc = p - cvar
        a.rateio = p * r
        a.lucro = a.mc - a.rateio
        a.markup = safe_div(p, it.cv)
        # coluna 2: preco sugerido p/ lucro desejado (markup divisor)
        den = 1 - (it.ded_pct + r + L)
        if den <= 0.0001:
            a.viavel = False
            a.aviso = ("Os percentuais (impostos, taxas, comissão, rateio de custos fixos e lucro) somam 100% ou mais "
                       "do preço. Reduza o lucro desejado ou os custos fixos, ou aumente a previsão de vendas.")
            a.preco_sug = 0.0
        else:
            a.preco_sug = it.cv / den
        ps = a.preco_sug
        a.linhas_sug = self._linhas(it, ps)
        a.mc_sug = ps - sum(v for _, v, _ in a.linhas_sug)
        a.rateio_sug = ps * r
        a.lucro_sug = a.mc_sug - a.rateio_sug
        a.markup_sug = safe_div(1, den) if a.viavel else 0.0
        if not it.tem_ficha and tipo == "servico":
            a.aviso = a.aviso or "Este serviço ainda não tem ficha técnica: cadastre mão de obra e insumos para calcular o custo."
        elif r == 0 and self.custos_fixos()["total"] > 0:
            a.aviso = a.aviso or "Informe a previsão de vendas (Simulação) para ratear os custos fixos no preço."
        return a

    @staticmethod
    def _linhas(it: ItemCalc, p: float) -> list:
        base = [("Mão de obra direta", it.custo_mod), ("Materiais diretos", it.custo_md)] if it.tipo == "servico" \
            else [("Custo da mercadoria (CMV)", it.custo_md)]
        ded = [("Impostos", p * it.imposto), ("Taxa de maquininha", p * it.cartao),
               ("Taxa de aplicativos", p * it.app), ("Comissões", p * it.comissao)]
        return [(n, v, safe_div(v, p)) for n, v in base + ded]

    def preco_sugerido(self, tipo: str, id_, lucro_pct: float | None = None) -> float:
        a = self.analise(tipo, id_, 0, lucro_pct)
        return a.preco_sug if a and a.viavel else 0.0

    # ------------------------------------------------------------ relatorios gerenciais
    def relatorio(self) -> dict:
        t = self.totais()
        cf = self.custos_fixos()["total"]
        fat = t["faturamento"]
        fat_liq = fat - t["deducoes"]
        mc = fat_liq - t["cv"]
        lucro_op = mc - cf
        mc_pct = safe_div(mc, fat)
        if self.cfg.get("lucro_modo") == "valor":
            lucro_des = self.c("lucro_desejado_valor")
        else:
            lucro_des = self.c("lucro_desejado_pct", 15) / 100 * fat
        pe = safe_div(cf, mc_pct)
        pe_econ = safe_div(cf + lucro_des, mc_pct)
        qtd = self.totais("servico")["quantidade"]
        ticket = safe_div(self.totais("servico")["faturamento"], qtd)
        if not fat:
            analise, nivel = "Informe a previsão de vendas na Simulação para gerar o resultado do mês.", "info"
        elif abs(lucro_op) < 0.005:
            analise, nivel = ("Sua empresa está no 0 a 0, ou seja, atingiu o PONTO DE EQUILÍBRIO. "
                              "Nessa situação não há lucro nem prejuízo."), "warn"
        elif lucro_op < 0:
            analise, nivel = ("ATENÇÃO: sua empresa está com PREJUÍZO. Revise a estrutura de preços, negocie "
                              "melhores preços com fornecedores e reduza as despesas fixas."), "danger"
        else:
            analise, nivel = ("PARABÉNS: sua empresa gera LUCRO. Continue acompanhando os números para melhorar "
                              "ainda mais o lucro operacional."), "ok"
        dre = [("Faturamento bruto", fat), ("(-) Deduções sobre vendas", -t["deducoes"]),
               ("(=) Faturamento líquido", fat_liq), ("(-) Custos variáveis", -t["cv"]),
               ("(=) Margem de contribuição", mc), ("(-) Custos fixos", -cf), ("(=) Lucro operacional", lucro_op)]
        return dict(dre=[(n, v, safe_div(v, fat)) for n, v in dre], faturamento=fat, deducoes=t["deducoes"],
                    fat_liquido=fat_liq, cv=t["cv"], mc=mc, mc_pct=mc_pct, cf=cf, lucro=lucro_op,
                    lucro_pct=safe_div(lucro_op, fat), lucro_desejado=lucro_des, pe=pe, pe_econ=pe_econ,
                    ticket=ticket, qtd_servicos=qtd, analise=analise, nivel=nivel,
                    margem_seguranca=safe_div(fat - pe, fat) if fat and pe else 0.0)

    # ------------------------------------------------------------ concorrentes
    @staticmethod
    def concorrencia(dados: dict) -> dict:
        empresas = dados.get("empresas") or ["Empresa A", "Empresa B", "Empresa C", "Sua empresa"]
        itens = dados.get("itens") or []
        notas = dados.get("notas") or {}
        precos = dados.get("precos") or {}
        res = []
        for idx, emp in enumerate(empresas):
            soma = sum(fnum(notas.get(f"{i}|{idx}")) for i in range(len(itens)))
            preco = fnum(precos.get(str(idx)))
            res.append(dict(empresa=emp, fator=soma, preco=preco, preco_por_ponto=safe_div(preco, soma)))
        return dict(empresas=res)

    # ------------------------------------------------------------ onboarding
    def checklist(self) -> list[tuple[str, bool, str]]:
        cfg = self.cfg
        return [
            ("Dados da empresa", (cfg.get("empresa_nome") or "Minha Empresa") != "Minha Empresa", "Configurações"),
            ("Equipe e pró-labore", bool(self.equipe), "Equipe"),
            ("Custos fixos do mês", self.custos_fixos()["manuais"] > 0, "Custos fixos"),
            ("Serviço com ficha técnica", any(self.ficha(s["id"])["total"] > 0 for s in self.servicos), "Serviços"),
            ("Previsão de vendas", self.totais()["quantidade"] > 0, "Simulação"),
        ]
