// Teste da juncao de dados entre dois aparelhos (core.js: snapshot/mergeRemote).  Uso: node web/test/sync_test.js
const fs = require("fs");
const path = require("path");
global.addEventListener = () => {};
global.document = { addEventListener() {} };
global.localStorage = { getItem: () => null, setItem() {} };
const P = {};
global.P = P;
new Function("P", fs.readFileSync(path.join(__dirname, "out", "seed_for_test.js"), "utf8"))(P);
new Function("P", fs.readFileSync(path.join(__dirname, "..", "src", "core.js"), "utf8"))(P);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FALHOU:", msg); } };

// visao independente de ids: cada linha vira {uid -> campos}, e as chaves estrangeiras viram o nome do pai
function view(db) {
  const s = db.state, name = (t, id) => { const r = s.t[t].find((x) => x.id === id); return r ? (r.nome || r.descricao || r.numero) : "?"; };
  const out = {};
  for (const t of Object.keys(s.t)) {
    out[t] = s.t[t].map((r) => {
      const o = { ...r }; delete o.id; delete o._u;
      if (t === "ficha_mod") { o.servico_id = name("servicos", r.servico_id); o.equipe_id = name("equipe", r.equipe_id); }
      if (t === "ficha_insumo") { o.servico_id = name("servicos", r.servico_id); o.insumo_id = name("insumos", r.insumo_id); }
      if (t === "proposta_itens") o.proposta_id = name("propostas", r.proposta_id);
      return o;
    }).sort((x, y) => (x.uid < y.uid ? -1 : 1));
  }
  const cfg = { ...s.config }; delete cfg.onboarding_ok; delete cfg.tutorial_nao_mostrar;
  return JSON.stringify({ t: out, cfg });
}

(async () => {
  const a = new P.Database(), b = new P.Database();
  ok(a.state.t.insumos.length === 96 && a.state.t.insumos[0].uid === "seed-insumos-1", "sementes com uid fixo");
  ok(view(a) === view(b), "dois aparelhos novos sao iguais");

  await sleep(5);
  // --- aparelho A
  const ea = a.save("equipe", { nome: "Ana", salario: 3000, setor: "Produtivo" });
  const sa = a.save("servicos", { nome: "S-A", preco: 100 });
  a.save("ficha_mod", { servico_id: sa, equipe_id: ea, horas: 2 });
  a.setCfg("lucro_desejado_pct", 20);
  a.save("clientes", { nome: "Cli A" });
  const pa = a.saveProposal({ cliente_nome: "Cli A", titulo: "P-A" }, [{ descricao: "item A1", quantidade: 1, valor_unit: 10 }]);
  await sleep(5);
  // --- aparelho B (mesmos ids baixos, dados diferentes)
  const eb = b.save("equipe", { nome: "Bia", salario: 2000, setor: "Administrativo" });
  const sb = b.save("servicos", { nome: "S-B", preco: 50 });
  const insB = b.all("insumos")[10];
  b.save("ficha_insumo", { servico_id: sb, insumo_id: insB.id, quantidade: 3 });
  b.remove("insumos", b.all("insumos")[2].id);                         // exclui um insumo de fabrica
  b.save("insumos", { id: b.all("insumos")[4].id, custo: 999 });         // edita outro
  b.setCfg("lucro_desejado_pct", 25);
  ok(sa === sb, "ids colidem entre aparelhos (cenario do teste)");
  await sleep(5);
  b.saveProposal({ cliente_nome: "Cli B", titulo: "P-B" }, [{ descricao: "item B1", quantidade: 1, valor_unit: 5 }, { descricao: "item B2", quantidade: 2, valor_unit: 7 }]);

  // --- junta nos dois sentidos
  const snapA = a.snapshot(), snapB = b.snapshot();
  const chA = a.mergeRemote(snapB);
  const chB = b.mergeRemote(snapA);
  ok(chA && chB, "houve alteracao nos dois");
  ok(view(a) === view(b), "os dois convergem para os mesmos dados");
  const names = (db, t) => db.state.t[t].map((r) => r.nome || r.titulo).sort().join(",");
  ok(names(a, "servicos") === "S-A,S-B", "os dois servicos existem: " + names(a, "servicos"));
  ok(names(a, "equipe") === "Ana,Bia", "equipe unida");
  ok(a.state.t.insumos.length === 95, "insumo excluido em B some em A (" + a.state.t.insumos.length + ")");
  ok(a.state.t.insumos.find((r) => r.custo === 999), "edicao de B chega em A");
  ok(a.cfg("lucro_desejado_pct") === "25", "config mais recente vence");
  // fichas apontam para os pais certos (apesar dos ids diferentes)
  const fm = a.state.t.ficha_mod[0], fi = a.state.t.ficha_insumo[0];
  ok(a.state.t.servicos.find((s) => s.id === fm.servico_id).nome === "S-A" && a.state.t.equipe.find((e) => e.id === fm.equipe_id).nome === "Ana", "ficha_mod com pais corretos");
  ok(a.state.t.servicos.find((s) => s.id === fi.servico_id).nome === "S-B", "ficha_insumo com pai correto");
  ok(a.state.t.propostas.length === 2 && a.state.t.proposta_itens.length === 3, "propostas e itens unidos");
  const e1 = new P.Engine(a), e2 = new P.Engine(b);
  ok(e1.ficha(a.state.t.servicos.find((s) => s.nome === "S-A").id).horas === 2, "motor enxerga a ficha unida");

  // --- edicao concorrente da mesma proposta: vence o conjunto de itens da mais recente
  await sleep(5);
  const pidA = a.state.t.propostas.find((p) => p.titulo === "P-A").id, pidB = b.state.t.propostas.find((p) => p.titulo === "P-A").id;
  a.saveProposal({ id: pidA, cliente_nome: "Cli A", titulo: "P-A", numero: a.get("propostas", pidA).numero }, [{ descricao: "A-novo", quantidade: 1, valor_unit: 1 }]);
  await sleep(5);
  b.saveProposal({ id: pidB, cliente_nome: "Cli A", titulo: "P-A", numero: b.get("propostas", pidB).numero }, [{ descricao: "B-novo1", quantidade: 1, valor_unit: 2 }, { descricao: "B-novo2", quantidade: 1, valor_unit: 3 }]);
  const s1 = a.snapshot(), s2 = b.snapshot();
  a.mergeRemote(s2); b.mergeRemote(s1);
  const itensP = (db) => db.state.t.proposta_itens.filter((i) => i.proposta_id === db.state.t.propostas.find((p) => p.titulo === "P-A").id).map((i) => i.descricao).sort().join(",");
  ok(itensP(a) === "B-novo1,B-novo2" && itensP(b) === "B-novo1,B-novo2", "itens da proposta: vence o lado mais recente, sem duplicar (" + itensP(a) + " | " + itensP(b) + ")");

  // --- exclusao em A chega em B; edicao posterior ressuscita
  await sleep(5);
  const idS = a.state.t.servicos.find((s) => s.nome === "S-B").id;
  a.remove("servicos", idS);
  b.mergeRemote(a.snapshot());
  ok(!b.state.t.servicos.some((s) => s.nome === "S-B") && !b.state.t.ficha_insumo.length, "exclusao propaga (e leva a ficha junto)");
  // idempotencia
  const before = view(b);
  b.mergeRemote(a.snapshot()); a.mergeRemote(b.snapshot());
  ok(view(b) === before && view(a) === view(b), "juntar de novo nao muda nada");
  // novo aparelho entra depois e recebe tudo
  const c = new P.Database(); c.mergeRemote(a.snapshot());
  ok(view(c) === view(a), "terceiro aparelho recebe tudo");

  console.log(`${checks} verificacoes, ${fails} falhas`);
  process.exit(fails ? 1 : 0);
})();
