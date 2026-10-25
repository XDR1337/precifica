"""Gera, a partir do motor Python (fonte da verdade), os valores esperados para o teste de paridade da versao web.
Saidas (em test/out/): db_web.json (banco no formato da web), expected.json, seed_for_test.js"""
import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE.parent))

from precifica import core, pdfs, seed         # noqa: E402
from precifica.db import Database             # noqa: E402
from precifica.engine import Engine           # noqa: E402
import build_web                              # noqa: E402
import exportar_dados_para_web as exporter    # noqa: E402

OUT = HERE / "out"
OUT.mkdir(exist_ok=True)

Database.migrate_old_csv = lambda self: 0     # nao ler dados antigos do usuario
tmp = Path(tempfile.mkdtemp()) / "t.db"
db = Database(tmp)
db.load_example()

# ---- cenario mais completo que o exemplo
clt = db.save("equipe", dict(nome="Ana CLT", salario=2800, setor="Produtivo", cargo="Eletricista", contratacao="CLT", vale_transporte=180, vale_refeicao=450, convenio=120, carga_horaria=176))
adm = db.save("equipe", dict(nome="Bia Adm", salario=2200, setor="Administrativo", cargo="Atendente", contratacao="CLT", vale_transporte=100, carga_horaria=176))
pj = db.save("equipe", dict(nome="Caio PJ", salario=3000, setor="Produtivo", cargo="Auxiliar", contratacao="PJ", carga_horaria=160))
ins = {r["descricao"]: r["id"] for r in db.all("insumos")}
s2 = db.save("servicos", dict(nome="Troca de disjuntor", preco=90, imposto_pct=6, cartao_pct=3.5, app_pct=2, comissao_pct=5, previsao=40))
db.save("ficha_mod", dict(servico_id=s2, equipe_id=clt, horas=0.75))
db.save("ficha_insumo", dict(servico_id=s2, insumo_id=ins["Deslocamento"], quantidade=12))
db.save("ficha_insumo", dict(servico_id=s2, insumo_id=ins["Disjuntor Monofásico (Substituição)"], quantidade=1))
s3 = db.save("servicos", dict(nome="Serviço sem ficha", preco=50, imposto_pct=6, previsao=5))
s4 = db.save("servicos", dict(nome="Instalação de ventilador", preco=250, imposto_pct=6, cartao_pct=2.5, previsao=15))
db.save("ficha_mod", dict(servico_id=s4, equipe_id=pj, horas=1.5))
db.save("ficha_mod", dict(servico_id=s4, equipe_id=clt, horas=0.5))
db.save("ficha_insumo", dict(servico_id=s4, insumo_id=ins["Ventilador de Teto"], quantidade=1))
db.save("revenda", dict(nome="Disjuntor 20A", unidade="Unidade", qtde=10, custo=120, preco=25, imposto_pct=6, cartao_pct=2.5, previsao=30))
db.save("revenda", dict(nome="Tomada dupla", unidade="Unidade", qtde=5, custo=40, preco=14, imposto_pct=6, previsao=0))
db.save("imobilizado", dict(descricao="Furadeira", valor=900, vida_util=3))
db.save("custos_fixos", dict(descricao="Seguro", valor=250.5))
db.set_many(dict(horas_dia=7.5, dias_mes=21, produtividade_pct=80, lucro_desejado_pct=18, lucro_modo="valor", lucro_desejado_valor=1500,
                 concorrentes_json=json.dumps(dict(empresas=["A", "B", "C", "Eu"], itens=["x", "y", "z", "w", "v", "u"],
                                                   notas={"0|0": 3, "1|0": 2, "0|3": 3, "1|3": 3, "2|3": 1}, precos={"0": 200, "3": 180}))))

e = Engine(db)


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if hasattr(o, "__dataclass_fields__"):
        return clean({k: getattr(o, k) for k in o.__dataclass_fields__})
    return o


items = []
for it in e.itens():
    d = clean(it)
    d["sug"] = e.preco_sugerido(it.tipo, it.id)
    d["ded_pct"] = it.ded_pct
    d["pct_cpv"] = it.pct_cpv
    items.append(d)
analises = []
for it in e.itens():
    a = e.analise(it.tipo, it.id, 10, 18)
    analises.append(clean(a))
analises.append(clean(e.analise("servico", e.servicos[0]["id"], 0, 95)))      # inviavel

fmt_inputs = [0, 1, -1, 0.5, 1234.5, -1234.567, 1e6, 0.004, 0.005, 12.3456789, 1234567.891]
str_inputs = ["1.234,56", "1234,56", "1234.56", "R$ 10", "15%", " 7 ", "", "abc", "1,5", "1.5", "1,234.56", "-3,2", "1e3", None, "1.234.567", "2,5%"]
fm = dict(
    money=[core.money(v) for v in fmt_inputs], money4=[core.money(v, 4) for v in fmt_inputs], num=[core.num(v, 2) for v in fmt_inputs],
    pct=[core.pct(v) for v in fmt_inputs], pctn=[core.pct_n(v) for v in fmt_inputs], num_input=[core.num_input(v, 4) for v in fmt_inputs],
    fnum=[core.fnum(s) for s in str_inputs],
    parcelas=[pdfs.dividir_parcelas(10001.01, 1000, 3, 30, "x"), pdfs.dividir_parcelas(500, 0, 0), pdfs.dividir_parcelas(900, 900, 2), pdfs.dividir_parcelas(100, 0, 3)])
prop = dict(desconto_valor=500)
itens_p = [dict(quantidade=2, valor_unit=100.5), dict(quantidade=1, valor_unit=300)]
fm["totais_proposta"] = pdfs.proposta_totais(prop, itens_p, e.cfg)

expected = dict(
    relatorio=clean(e.relatorio()), capacidade=clean(e.capacidade()), cf=clean(e.custos_fixos()), totais=clean(e.totais()),
    totais_servico=clean(e.totais("servico")), itens=items, analises=analises, equipe=clean(e.equipe_calc()),
    depreciacao=clean(e.depreciacao()), rateio=e.rateio_pct(), checklist=clean(e.checklist()), fmt=fm,
    concorrencia=clean(Engine.concorrencia(json.loads(e.cfg["concorrentes_json"]))), insumo=clean([Engine.insumo_calc(r) for r in db.all("insumos")[:5]]),
    fichas={str(s["id"]): clean(e.ficha(s["id"])) for s in e.servicos},
)
(OUT / "expected.json").write_text(json.dumps(expected, ensure_ascii=False), encoding="utf-8")
exporter.export(tmp, OUT / "db_web.json")
(OUT / "seed_for_test.js").write_text(build_web.seed_js(), encoding="utf-8")
print("ok:", len(items), "itens,", len(analises), "analises")
