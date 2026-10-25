// Teste de paridade: o motor JS (web/src/core.js) tem que dar os mesmos numeros do motor Python (precifica/engine.py).
// Uso: node web/test/parity.js   (depois de python web/test/parity_gen.py)
const fs = require("fs");
const path = require("path");
const out = path.join(__dirname, "out");

global.addEventListener = () => {};
global.document = { addEventListener() {} };
global.localStorage = { getItem: () => null, setItem() {} };
global.window = global;
const P = {};
global.P = P;
new Function("P", fs.readFileSync(path.join(out, "seed_for_test.js"), "utf8"))(P);
new Function("P", fs.readFileSync(path.join(__dirname, "..", "src", "core.js"), "utf8"))(P);

const exp = JSON.parse(fs.readFileSync(path.join(out, "expected.json"), "utf8"));
const db = new P.Database();
db.importData(fs.readFileSync(path.join(out, "db_web.json"), "utf8"));
const e = new P.Engine(db);

let fails = 0, checks = 0;
function close(a, b) { return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)); }
function cmp(where, got, want) {
  if (typeof want === "number") { checks++; if (typeof got !== "number" || !close(got, want)) { fails++; console.log("DIFF", where, "js=", got, "py=", want); } return; }
  if (want === null || typeof want === "string" || typeof want === "boolean") { checks++; if (got !== want) { fails++; console.log("DIFF", where, "js=", JSON.stringify(got), "py=", JSON.stringify(want)); } return; }
  if (Array.isArray(want)) {
    if (!Array.isArray(got) || got.length !== want.length) { fails++; checks++; console.log("DIFF len", where, got && got.length, want.length); return; }
    want.forEach((w, i) => cmp(`${where}[${i}]`, got[i], w)); return;
  }
  for (const k of Object.keys(want)) cmp(`${where}.${k}`, got ? got[k] : undefined, want[k]);
}

cmp("relatorio", e.relatorio(), exp.relatorio);
cmp("capacidade", e.capacidade(), exp.capacidade);
const cf = e.custosFixos();
cmp("cf", cf, exp.cf);
cmp("totais", e.totais(), exp.totais);
cmp("totais_servico", e.totais("servico"), exp.totais_servico);
cmp("rateio", e.rateioPct(), exp.rateio);
cmp("depreciacao", e.depreciacao().map((d) => ({ taxa: d.taxa, mensal: d.mensal, valor: d.valor })), exp.depreciacao.map((d) => ({ taxa: d.taxa, mensal: d.mensal, valor: d.valor })));
cmp("checklist", e.checklist().map((x) => [x[0], x[1]]), exp.checklist.map((x) => [x[0], x[1]]));

exp.itens.forEach((w, i) => {
  const it = e.itens()[i];
  const got = { ...it, sug: e.precoSugerido(it.tipo, it.id) };
  const keys = Object.keys(w).filter((k) => !["imposto", "cartao", "app", "comissao"].includes(k) || true);
  keys.forEach((k) => cmp(`item${i}.${k}`, got[k], w[k]));
});
exp.analises.forEach((w, i) => {
  const items = e.itens();
  const it = i < items.length ? items[i] : e.item("servico", e.servicos[0].id);
  const a = i < items.length ? e.analise(it.tipo, it.id, 10, 18) : e.analise("servico", e.servicos[0].id, 0, 95);
  for (const k of ["desconto", "lucro_desejado", "rateio_pct", "preco", "mc", "rateio", "lucro", "markup", "preco_sug", "mc_sug", "rateio_sug", "lucro_sug", "markup_sug", "viavel", "aviso"])
    cmp(`analise${i}.${k}`, a[k], w[k]);
  cmp(`analise${i}.linhas`, a.linhas, w.linhas);
  cmp(`analise${i}.linhas_sug`, a.linhas_sug, w.linhas_sug);
});
exp.equipe.forEach((w, i) => { const c = e.equipeCalc().find((x) => x.id === w.id); for (const k of ["enc_sociais", "enc_trab", "beneficios", "total", "valor_hora", "custo_hora"]) cmp(`equipe${i}.${k}`, c[k], w[k]); });
cmp("concorrencia", P.Engine.concorrencia(JSON.parse(e.cfg.concorrentes_json)), exp.concorrencia);
exp.insumo.forEach((w, i) => { const r = P.Engine.insumoCalc(db.get("insumos", w.id)); cmp(`insumo${i}.fator`, r.fator, w.fator); cmp(`insumo${i}.custo_medida`, r.custo_medida, w.custo_medida); });
for (const [sid, w] of Object.entries(exp.fichas)) { const f = e.ficha(parseInt(sid)); for (const k of ["horas", "custo_mod", "custo_md", "total"]) cmp(`ficha${sid}.${k}`, f[k], w[k]); cmp(`ficha${sid}.mod`, f.mod.map((m) => [m.nome, m.custo_hora, m.horas, m.total]), w.mod.map((m) => [m.nome, m.custo_hora, m.horas, m.total])); }

// formatacao
const F = exp.fmt;
const inp = [0, 1, -1, 0.5, 1234.5, -1234.567, 1e6, 0.004, 0.005, 12.3456789, 1234567.891];
const sinp = ["1.234,56", "1234,56", "1234.56", "R$ 10", "15%", " 7 ", "", "abc", "1,5", "1.5", "1,234.56", "-3,2", "1e3", null, "1.234.567", "2,5%"];
cmp("fmt.money", inp.map((v) => P.money(v)), F.money);
cmp("fmt.money4", inp.map((v) => P.money(v, 4)), F.money4);
cmp("fmt.num", inp.map((v) => P.num(v, 2)), F.num);
cmp("fmt.pct", inp.map((v) => P.pct(v)), F.pct);
cmp("fmt.pctn", inp.map((v) => P.pctN(v)), F.pctn);
cmp("fmt.num_input", inp.map((v) => P.numInput(v, 4)), F.num_input);
cmp("fmt.fnum", sinp.map((v) => P.fnum(v)), F.fnum);
cmp("parcelas", [P.dividirParcelas(10001.01, 1000, 3, 30, "x"), P.dividirParcelas(500, 0, 0), P.dividirParcelas(900, 900, 2), P.dividirParcelas(100, 0, 3)], F.parcelas);
cmp("totais_proposta", P.proposalTotals({ desconto_valor: 500 }, [{ quantidade: 2, valor_unit: 100.5 }, { quantidade: 1, valor_unit: 300 }], e.cfg), F.totais_proposta);

console.log(`${checks} verificacoes, ${fails} diferencas`);
process.exit(fails ? 1 : 0);
