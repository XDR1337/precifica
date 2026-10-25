"use strict";
/* Precifica Web - importacao da Planilha de Precificacao EG3 (.xlsm/.xlsx). Porta de precifica/importer.py.
   A leitura usa o SheetJS, carregado so quando o usuario escolhe importar (precisa de internet nessa hora). */
const { fnum } = P;

P.loadXLSX = function () {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error("Leitor de planilhas indisponível.")));
    s.onerror = () => reject(new Error("Não foi possível carregar o leitor de planilhas. Conecte-se à internet para importar (só é preciso nesta etapa)."));
    document.head.append(s);
  });
};

const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const isFormula = (v) => typeof v === "string" && v.startsWith("=");
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const isDigit = (s) => /^\d+$/.test(s);

P.importXlsx = function (db, wb, XLSX) {
  const names = new Set(wb.SheetNames);
  const rep = { insumos: 0, equipe: 0, servicos: 0, fichas: 0, revenda: 0, custos_fixos: 0, imobilizado: 0, parametros: 0, concorrentes: 0 };
  const sheet = (n) => wb.Sheets[n];
  const raw = (ws, r, c) => { const x = ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })]; return x ? x.v : null; };   // r, c comecam em 1
  const cellRef = (ws, ref) => { const x = ws[ref]; const v = x ? x.v : null; return isFormula(v) ? null : v; };
  const maxRow = (ws) => (ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).e.r + 1 : 0);
  const empty = (v) => v === null || v === undefined || v === "";

  // ---------------- insumos
  const insByName = new Map(db.all("insumos").map((r) => [r.descricao.trim().toLowerCase(), r]));
  if (names.has("CadInsumos")) {
    const ws = sheet("CadInsumos");
    for (let r = 7; r <= maxRow(ws); r++) {
      const desc = str(raw(ws, r, 4)), custo = raw(ws, r, 8);
      if (!desc || empty(custo) || isFormula(custo)) continue;
      const row = { descricao: desc, qtde_bruta: fnum(raw(ws, r, 5), 1) || 1, qtde_liquida: fnum(raw(ws, r, 6), 1) || 1, unidade: str(raw(ws, r, 7)).replace("km/h", "Quilômetro") || "Unidade", custo: fnum(custo) };
      const old = insByName.get(desc.toLowerCase());
      if (old) row.id = old.id; else row.categoria = "Importado da planilha";
      row.id = db.save("insumos", row);
      insByName.set(desc.toLowerCase(), row);
      rep.insumos++;
    }
  }

  // ---------------- equipe + encargos
  const empByName = new Map(db.all("equipe").map((r) => [r.nome.trim().toLowerCase(), r]));
  if (names.has("CadFopag")) {
    const ws = sheet("CadFopag");
    const enc = { enc_ferias: "D9", enc_13: "D10", enc_13_ferias: "D11", enc_inss: "D15", enc_sat: "D16", enc_sal_educacao: "D17", enc_sistema_s: "D18", enc_fgts: "D19", enc_fgts_rescisao: "D20" };
    const vals = {};
    for (const [k, ref] of Object.entries(enc)) { const v = cellRef(ws, ref); if (!empty(v)) vals[k] = r4(fnum(v) * 100); }
    if (Object.keys(vals).length) { db.setMany(vals); rep.parametros += Object.keys(vals).length; }
    for (let r = 8; r < 108; r++) {
      const nome = str(raw(ws, r, 7));
      if (!nome) continue;
      const row = { nome, salario: fnum(raw(ws, r, 8)), setor: str(raw(ws, r, 9)) || "Produtivo", cargo: str(raw(ws, r, 10)), contratacao: str(raw(ws, r, 11)) || "CLT",
        vale_transporte: fnum(raw(ws, r, 14)), vale_refeicao: fnum(raw(ws, r, 15)), convenio: fnum(raw(ws, r, 16)), carga_horaria: fnum(raw(ws, r, 18), 176) || 176 };
      const old = empByName.get(nome.toLowerCase());
      if (old) row.id = old.id;
      row.id = db.save("equipe", row);
      empByName.set(nome.toLowerCase(), row);
      rep.equipe++;
    }
  }

  // ---------------- capacidade produtiva
  if (names.has("CapProd")) {
    const ws = sheet("CapProd");
    for (const [key, ref, mult] of [["horas_dia", "E9", 1], ["dias_mes", "E10", 1], ["produtividade_pct", "E12", 100]]) {
      const v = cellRef(ws, ref);
      if (!empty(v)) { db.setCfg(key, r4(fnum(v) * mult)); rep.parametros++; }
    }
  }

  // ---------------- custos fixos e imobilizado
  if (names.has("CF")) {
    const ws = sheet("CF");
    const cfBy = new Map(db.all("custos_fixos").map((r) => [r.descricao.trim().toLowerCase(), r]));
    for (let r = 12; r < 121; r++) {
      const desc = str(raw(ws, r, 3)), val = raw(ws, r, 5);
      if (!desc || empty(val) || isFormula(val)) continue;
      const row = { descricao: desc, valor: fnum(val) };
      const old = cfBy.get(desc.toLowerCase());
      if (old) row.id = old.id;
      db.save("custos_fixos", row);
      rep.custos_fixos++;
    }
    const imBy = new Map(db.all("imobilizado").map((r) => [r.descricao.trim().toLowerCase(), r]));
    for (let r = 10; r < 27; r++) {
      const desc = str(raw(ws, r, 7)), val = raw(ws, r, 9), vida = raw(ws, r, 11);
      if (!desc || empty(val) || isFormula(val)) continue;
      const row = { descricao: desc, valor: fnum(val), vida_util: fnum(vida, 10) || 10 };
      const old = imBy.get(desc.toLowerCase());
      if (old) row.id = old.id;
      db.save("imobilizado", row);
      rep.imobilizado++;
    }
  }

  // ---------------- servicos + ficha tecnica + precos + previsao
  const srvBy = new Map(db.all("servicos").map((r) => [r.nome.trim().toLowerCase(), r]));
  if (names.has("CadServicos")) {
    const ws = sheet("CadServicos");
    const tp = names.has("TblPrecificacao") ? sheet("TblPrecificacao") : null;
    const sim = names.has("Simulacao") ? sheet("Simulacao") : null;
    const ft = names.has("FichaTecnica") ? sheet("FichaTecnica") : null;
    const prev = {};
    if (sim) {
      for (let r = 8; r < 108; r++) {
        let code = raw(sim, r, 3); const q = raw(sim, r, 6);
        code = empty(code) || isFormula(code) ? r - 7 : Math.trunc(fnum(code));
        if (!empty(q) && !isFormula(q)) prev[code] = fnum(q);
      }
    }
    for (let n = 1; n <= 100; n++) {
      const nome = str(raw(ws, 6 + n, 4));
      if (!nome) continue;
      const row = { nome, previsao: prev[n] || 0 };
      if (tp) {
        const r = 6 + n;
        Object.assign(row, { preco: fnum(raw(tp, r, 10)), imposto_pct: fnum(raw(tp, r, 14)) * 100, cartao_pct: fnum(raw(tp, r, 16)) * 100, app_pct: fnum(raw(tp, r, 18)) * 100, comissao_pct: fnum(raw(tp, r, 20)) * 100 });
      }
      const old = srvBy.get(nome.toLowerCase());
      if (old) row.id = old.id;
      const sid = db.save("servicos", row);
      srvBy.set(nome.toLowerCase(), { ...row, id: sid });
      rep.servicos++;
      if (!ft) continue;
      const idx = n - 1;
      const top = 6 + 35 * Math.floor(idx / 2);
      const [cName, cQty] = idx % 2 === 0 ? [3, 6] : [9, 12];
      const mod = [], ins = [];
      for (let r = top + 2; r < top + 10; r++) {
        const nm = str(raw(ft, r, cName)), hh = raw(ft, r, cQty);
        if (nm && !empty(hh) && empByName.has(nm.toLowerCase())) mod.push([empByName.get(nm.toLowerCase()).id, fnum(hh)]);
      }
      for (let r = top + 11; r < top + 30; r++) {
        const nm = str(raw(ft, r, cName)), q = raw(ft, r, cQty);
        if (nm && !empty(q) && insByName.has(nm.toLowerCase())) ins.push([insByName.get(nm.toLowerCase()).id, fnum(q)]);
      }
      if (mod.length || ins.length) {
        db.clearTable("ficha_mod", (x) => x.servico_id === sid);
        db.clearTable("ficha_insumo", (x) => x.servico_id === sid);
        for (const [eid, hh] of mod) db.save("ficha_mod", { servico_id: sid, equipe_id: eid, horas: hh });
        for (const [iid, q] of ins) db.save("ficha_insumo", { servico_id: sid, insumo_id: iid, quantidade: q });
        rep.fichas++;
      }
    }
  }

  // ---------------- revenda
  if (names.has("CadRevenda")) {
    const ws = sheet("CadRevenda");
    const tp = names.has("TblPrecificacaoRevenda") ? sheet("TblPrecificacaoRevenda") : null;
    const sim = names.has("SimulacaoRevenda") ? sheet("SimulacaoRevenda") : null;
    const prev = {};
    if (sim) {
      for (let r = 8; r < 1008; r++) {
        let code = raw(sim, r, 3); const q = raw(sim, r, 6);
        code = empty(code) || isFormula(code) ? r - 7 : Math.trunc(fnum(code));
        if (!empty(q) && !isFormula(q)) prev[code] = fnum(q);
      }
    }
    const revBy = new Map(db.all("revenda").map((r) => [r.nome.trim().toLowerCase(), r]));
    for (let r = 7; r <= maxRow(ws); r++) {
      const nome = str(raw(ws, r, 4));
      if (!nome) continue;
      const code = Math.trunc(fnum(raw(ws, r, 3), r - 6)) || (r - 6);
      const row = { nome, unidade: str(raw(ws, r, 5)) || "Unidade", qtde: fnum(raw(ws, r, 6), 1) || 1, custo: fnum(raw(ws, r, 7)), previsao: prev[code] || 0 };
      if (tp) {
        const tr = 6 + code;
        Object.assign(row, { preco: fnum(raw(tp, tr, 10)), imposto_pct: fnum(raw(tp, tr, 12)) * 100, cartao_pct: fnum(raw(tp, tr, 14)) * 100, app_pct: fnum(raw(tp, tr, 16)) * 100, comissao_pct: fnum(raw(tp, tr, 18)) * 100 });
      }
      const old = revBy.get(nome.toLowerCase());
      if (old) row.id = old.id;
      db.save("revenda", row);
      rep.revenda++;
    }
  }

  // ---------------- lucro desejado
  if (names.has("Analise")) {
    const v = cellRef(sheet("Analise"), "R9");
    if (!empty(v)) db.setCfg("lucro_desejado_pct", r4(fnum(v) * 100));
  }

  // ---------------- concorrentes
  if (names.has("Concorrentes")) {
    const ws = sheet("Concorrentes");
    const itens = [], empresas = [];
    for (let r = 16; r < 22; r++) { const t = str(raw(ws, r, 3)); const i = t.indexOf(". "); itens.push(i >= 0 ? t.slice(i + 2) : t); }
    for (let c = 4; c < 8; c++) { const t = str(raw(ws, 15, c)); empresas.push(t ? t.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) : `Empresa ${c}`); }
    const notas = {}, precos = {}, alvo = [];
    for (let i = 0, r = 16; r < 22; i++, r++) for (let j = 0, c = 4; c < 8; j++, c++) { const v = raw(ws, r, c); if (!empty(v) && !isFormula(v)) notas[`${i}|${j}`] = fnum(v); }
    for (let j = 0, c = 4; c < 8; j++, c++) { const v = raw(ws, 23, c); if (!empty(v) && !isFormula(v)) precos[String(j)] = fnum(v); }
    for (let r = 7; r < 13; r++) for (let c = 3; c < 8; c++) { const v = str(raw(ws, r, c)); if (v && !v.startsWith("=")) alvo.push(v); }
    if (Object.keys(notas).length || Object.keys(precos).length || alvo.length) {
      const dados = db.cfg("concorrentes_json") ? P.json(db.cfg("concorrentes_json"), {}) : {};
      Object.assign(dados, { empresas, itens, notas, precos });
      if (alvo.length) dados.cliente_alvo = alvo.join("\n");
      db.setCfg("concorrentes_json", JSON.stringify(dados));
      rep.concorrentes = Object.keys(notas).length + Object.keys(precos).length;
    }
  }
  return rep;
};
