"use strict";
/* Precifica Web - documentos para imprimir / salvar em PDF (substitui pdfs.py):
   relatorio completo, tabela de precos, analise de preco e proposta tecnica e comercial (modelo ACRS). */
P.docs = {};
const { fnum: dfnum, money: dmoney, num: dnum, pct: dpct, esc: desc, safeDiv: dsafe } = P;

const ORANGE = "#FF9900", NAVY = "#1B2A3D";

function logoSrc(cfg) { return (cfg.empresa_logo && String(cfg.empresa_logo).startsWith("data:")) ? cfg.empresa_logo : P.LOGO; }

/** Tabela padrao: cabecalho azul-grafite, zebra, numeros a direita. */
function T(header, rows, aligns, o = {}) {
  const al = aligns || header.map(() => "l");
  const cg = o.w ? `<colgroup>${o.w.map((x) => `<col style="width:${x}%">`).join("")}</colgroup>` : "";
  const head = o.nohead ? "" : `<thead><tr>${header.map((x, i) => `<th class="a${al[i]}">${desc(x)}</th>`).join("")}</tr></thead>`;
  const body = rows.map((r, ri) => `<tr class="${o.total && ri === rows.length - 1 ? "tot" : ""}">${r.map((c, i) => `<td class="a${al[i]}">${desc(c)}</td>`).join("")}</tr>`).join("");
  return `<table class="dt${o.fs ? " fs" + o.fs : ""}${o.plain ? " plain" : ""}${o.w ? " fx" : ""}">${cg}${head}<tbody>${body}</tbody></table>`;
}
function KPIs(items) {
  return `<div class="dk">${items.map(([l, v, c]) => `<div><span>${desc(l)}</span><b style="color:${c || NAVY}">${desc(v)}</b></div>`).join("")}</div>`;
}
function Call(text, nivel = "info") { return `<div class="dcall ${nivel}">${desc(text)}</div>`; }
const H2 = (t) => `<h2 class="dh2">${desc(t)}</h2>`;
const H3 = (t) => `<h3 class="dh3">${desc(t)}</h3>`;
const SM = (t) => `<p class="dsm">${desc(t)}</p>`;

function header(cfg, title) {
  return `<div class="dhd"><img src="${logoSrc(cfg)}" alt=""><b>${desc(P.empresaNome(cfg))}</b><span>${desc(title)}</span></div><div class="rule2"></div>`;
}
function sheet(headerHtml, bodyHtml, cls = "") {
  return `<div class="paper ${cls}"><table class="sheet"><thead><tr><td>${headerHtml}</td></tr></thead><tbody><tr><td>${bodyHtml}</td></tr></tbody></table></div>`;
}
function pageCss(extra = "") {
  const now = new Date();
  const stamp = `Gerado em ${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} pelo Precifica`;
  const boxes = `@bottom-left{content:"${stamp}";font:7.5pt sans-serif;color:#5F6B7A} @bottom-right{content:"Página " counter(page);font:7.5pt sans-serif;color:#5F6B7A}`;
  return `@page{size:A4;margin:12mm 12mm 16mm;${boxes}} @page land{size:A4 landscape;margin:12mm 12mm 16mm;${boxes}} ${extra}`;
}

// ------------------------------------------------------------------ relatorio completo
P.docs.SECOES = [
  ["resumo", "Resumo e resultado do mês"], ["precos", "Tabela de preços (serviços e revenda)"], ["simulacao", "Simulação de vendas (mix)"],
  ["fichas", "Fichas técnicas dos serviços"], ["equipe", "Equipe, encargos e capacidade produtiva"], ["custos", "Custos fixos e depreciação"],
  ["insumos", "Cadastro de insumos e preços de referência"], ["concorrentes", "Análise de concorrentes"],
];

P.docs.report = function (e, secoes) {
  e.reload();
  const set = new Set(secoes || P.docs.SECOES.map((s) => s[0]));
  const cfg = e.cfg, rel = e.relatorio(), cap = e.capacidade(), cf = e.custosFixos();
  const sheets = [];
  const hdr = header(cfg, "Relatório de Precificação");
  let b = `<h1 class="dh1">Relatório de Precificação</h1>${SM(`${P.empresaNome(cfg)}  ·  emitido em ${P.fmtDate(P.todayISO())}`)}`;
  b += KPIs([["Faturamento previsto", dmoney(rel.faturamento)], ["Margem de contribuição", dpct(rel.mc_pct), "#E08600"],
    ["Lucro operacional", dmoney(rel.lucro), rel.lucro >= 0 ? "#15803D" : "#B91C1C"], ["Ponto de equilíbrio", dmoney(rel.pe)]]);
  b += Call(rel.analise, rel.nivel);
  if (set.has("resumo")) {
    b += H2("1. Resultado do mês (DRE gerencial)");
    b += T(["Demonstração do resultado", "Valor (R$)", "% do faturamento"], rel.dre.map(([n, v, p]) => [n, dmoney(v), dpct(p)]), ["l", "r", "r"], { total: true, w: [56, 24, 20] });
    b += `<div class="dchart">${P.chart.bars(["Faturamento", "Deduções", "Custos variáveis", "Custos fixos", "Lucro operacional"], [rel.faturamento, rel.deducoes, rel.cv, rel.cf, rel.lucro],
      [ORANGE, "#94A3B8", NAVY, "#52617F", rel.lucro >= 0 ? "#15803D" : "#B91C1C"], { w: 520, hgt: 210 })}</div>`;
    b += H3("Indicadores gerenciais") + T(["Indicador", "Valor", "Como é calculado"], [
      ["Ponto de equilíbrio (vender para ficar no 0 a 0)", dmoney(rel.pe), "Custos fixos ÷ MC%"],
      ["Ponto de equilíbrio econômico (com o lucro desejado)", dmoney(rel.pe_econ), "(Custos fixos + lucro) ÷ MC%"],
      ["Lucro desejado no mês", dmoney(rel.lucro_desejado), "Configurações"],
      ["Ticket médio dos serviços", dmoney(rel.ticket), "Faturamento ÷ quantidade"],
      ["Margem de segurança", dpct(rel.margem_seguranca), "(Faturamento − PE) ÷ faturamento"],
      ["Rateio de custos fixos no preço", dpct(e.rateioPct()), "Custos fixos ÷ faturamento"]], ["l", "r", "l"], { w: [47, 20, 33] });
    b += H3("Capacidade produtiva") + T(["Item", "Valor"], [
      ["Colaboradores produtivos", dnum(cap.colaboradores, 0)], ["Horas por dia × dias no mês", `${dnum(cap.horas_dia, 1)} h × ${dnum(cap.dias_mes, 0)} dias`],
      ["Produtividade considerada", dpct(cap.produtividade)], ["Horas efetivas da equipe no mês", `${dnum(cap.efetivas_equipe, 1)} h`],
      ["Horas vendidas (previsão × ficha técnica)", `${dnum(cap.alocadas, 1)} h`], ["Capacidade vendida / ociosidade", `${dpct(cap.vendidas_pct)} / ${dpct(cap.ociosidade_pct)}`]], ["l", "r"], { w: [60, 40] });
    b += Call(cap.status, cap.nivel);
  }
  sheets.push(sheet(hdr, b));

  // ---- paisagem: precos + simulacao
  if (set.has("precos") || set.has("simulacao")) {
    let l = "";
    if (set.has("precos")) {
      l += H2("2. Tabela de preços");
      const srv = e.itens("servico").map((it) => {
        const sug = e.precoSugerido("servico", it.id);
        return [it.nome, dmoney(it.preco), dmoney(it.custo_mod), dmoney(it.custo_md), dmoney(it.cv), dmoney(it.deducoes), dmoney(it.mc), dpct(it.mc_pct), sug ? dmoney(sug) : "—", it.cv ? dnum(dsafe(it.preco, it.cv), 2) : "—"];
      });
      if (srv.length) {
        l += H3("Serviços") + T(["Serviço", "Preço atual", "Mão de obra", "Materiais", "Custo variável", "Deduções", "Margem contrib.", "MC %", "Preço sugerido", "Markup atual"], srv, ["l", ...Array(9).fill("r")], { fs: 76, w: [24, 8.5, 8.5, 8.5, 9, 8, 9, 6, 9.5, 7] });
        l += SM(`Preço sugerido com lucro desejado de ${dpct(e.c("lucro_desejado_pct", 15) / 100)} e rateio de custos fixos de ${dpct(e.rateioPct())}.`);
      }
      const rev = e.itens("revenda").map((it) => { const sug = e.precoSugerido("revenda", it.id); return [it.nome, it.unidade, dmoney(it.preco), dmoney(it.custo_md), dmoney(it.deducoes), dmoney(it.mc), dpct(it.mc_pct), sug ? dmoney(sug) : "—"]; });
      if (rev.length) l += H3("Produtos de revenda") + T(["Produto", "Unidade", "Preço atual", "CMV", "Deduções", "Margem contrib.", "MC %", "Preço sugerido"], rev, ["l", "l", ...Array(6).fill("r")], { fs: 76, w: [30, 9, 10, 10, 10, 11, 8, 12] });
      if (!e.itens().length) l += `<p class="dp">Nenhum serviço ou produto cadastrado.</p>`;
    }
    if (set.has("simulacao")) {
      l += H2("3. Simulação de vendas do mês (mix)");
      const rows = e.itens().filter((it) => it.previsao > 0).map((it) => [(it.tipo === "servico" ? "S · " : "R · ") + it.nome, dnum(it.previsao, 0), dmoney(it.faturamento), dmoney(it.cv_total), dmoney(it.ded_total), dmoney(it.mc_total), dmoney(it.rateio_cf), dmoney(it.lucro), dpct(it.lucro_pct), dnum(it.markup, 2), dpct(it.mix_pct)]);
      const t = e.totais();
      if (rows.length) {
        rows.push(["TOTAL", dnum(t.quantidade, 0), dmoney(t.faturamento), dmoney(t.cv), dmoney(t.deducoes), dmoney(t.mc), dmoney(t.rateio), dmoney(t.lucro), dpct(t.lucro_pct), dnum(t.markup, 2), "100%"]);
        l += T(["Item (S = serviço, R = revenda)", "Qtd/mês", "Faturamento", "Custo variável", "Deduções", "Margem contrib.", "Rateio CF", "Lucro", "Lucro %", "Markup", "% mix"], rows, ["l", ...Array(10).fill("r")], { total: true, fs: 76, w: [22, 6, 9, 9, 8, 9, 8, 9, 6, 6, 6] });
      } else l += `<p class="dp">Informe a previsão de vendas na tela Simulação para preencher esta seção.</p>`;
    }
    sheets.push(sheet(hdr, l, "land"));
  }

  // ---- retrato: fichas, equipe, custos, insumos, concorrentes
  let r = "";
  if (set.has("fichas")) {
    r += H2("4. Fichas técnicas dos serviços");
    let any = false;
    for (const s of e.servicos) {
      const f = e.ficha(s.id);
      if (!(f.mod.length || f.insumos.length)) continue;
      any = true;
      let blk = H3(s.nome);
      if (f.mod.length) blk += T(["Mão de obra", "Cargo/função", "Custo/hora", "Horas", "Custo total"], f.mod.map((m) => [m.nome, m.cargo, dmoney(m.custo_hora), dnum(m.horas, 2), dmoney(m.total)]), ["l", "l", "r", "r", "r"], { w: [32, 24, 15, 12, 17] });
      if (f.insumos.length) blk += T(["Insumo / serviço", "Medida", "Custo unitário", "Qtde", "Custo total"], f.insumos.map((i) => [i.descricao, i.unidade, dmoney(i.custo_unit, 2), dnum(i.quantidade, 2), dmoney(i.total)]), ["l", "l", "r", "r", "r"], { w: [38, 18, 15, 12, 17] });
      blk += T(["Totais", ""], [["Total de horas alocadas", `${dnum(f.horas, 2)} h`], ["Custo com mão de obra direta", dmoney(f.custo_mod)], ["Custo com insumos", dmoney(f.custo_md)], ["CUSTO TOTAL", dmoney(f.total)]], ["l", "r"], { total: true, plain: true, nohead: true, w: [83, 17] });
      r += `<div class="keep">${blk}</div>`;
    }
    if (!any) r += `<p class="dp">Nenhuma ficha técnica preenchida.</p>`;
  }
  if (set.has("equipe")) {
    r += H2("5. Equipe, encargos e capacidade produtiva");
    const eq = e.equipeCalc();
    if (eq.length) {
      const rows = eq.map((x) => [x.nome, `${x.setor || ""} · ${x.contratacao || ""}`, dmoney(x.salario), dmoney(x.enc_sociais + x.enc_trab + x.beneficios), dmoney(x.total), dnum(x.carga_horaria, 0), dmoney(x.custo_hora)]);
      rows.push(["TOTAL", "", dmoney(eq.reduce((a, x) => a + x.salario, 0)), dmoney(eq.reduce((a, x) => a + x.enc_sociais + x.enc_trab + x.beneficios, 0)), dmoney(eq.reduce((a, x) => a + x.total, 0)), "", ""]);
      r += T(["Nome", "Setor · contrato", "Salário", "Encargos + benefícios", "Custo total", "Horas/mês", "Custo-hora*"], rows, ["l", "l", "r", "r", "r", "r", "r"], { total: true, fs: 76, w: [22, 20, 12, 13, 12, 9, 12] });
      r += SM("* Custo-hora usado na ficha técnica = custo total ÷ (horas/mês × produtividade).");
    } else r += `<p class="dp">Nenhum colaborador cadastrado.</p>`;
    r += H3("Parâmetros de encargos") + T(["Encargo", "Alíquota"], [
      ["Provisão de férias + 1/3", dpct(e.c("enc_ferias") / 100, 2)], ["Provisão de 13º salário", dpct(e.c("enc_13") / 100, 2)], ["13º sobre férias", dpct(e.c("enc_13_ferias") / 100, 2)],
      ["Total encargos trabalhistas (CLT)", dpct(e.encargosTrabPct(), 2)],
      ["INSS + SAT/RAT + Salário-educação + Sistema S", dpct((e.c("enc_inss") + e.c("enc_sat") + e.c("enc_sal_educacao") + e.c("enc_sistema_s")) / 100, 2)],
      ["FGTS + provisão de rescisão", dpct((e.c("enc_fgts") + e.c("enc_fgts_rescisao")) / 100, 2)], ["Total encargos sociais (CLT)", dpct(e.encargosSocPct(), 2)],
      ["INSS sobre pró-labore", dpct(e.c("enc_prolabore_inss") / 100, 2)]], ["l", "r"], { w: [70, 30] });
  }
  if (set.has("custos")) {
    const rows = cf.linhas.filter(([, v, auto]) => v || auto).map(([d, v, auto]) => [d + (auto ? " (automático)" : ""), dmoney(v)]);
    rows.push(["TOTAL DE CUSTOS FIXOS", dmoney(cf.total)]);
    r += `<div class="keep">${H2("6. Custos fixos e depreciação")}${T(["Descrição", "Valor mensal"], rows, ["l", "r"], { total: true, w: [75, 25] })}</div>`;
    const dep = e.depreciacao().filter((d) => dfnum(d.valor));
    if (dep.length) r += H3("Depreciação do imobilizado") + T(["Bem", "Valor", "Vida útil", "Taxa anual", "Valor mensal"], dep.map((d) => [d.descricao, dmoney(d.valor), `${dnum(d.vida_util, 0)} anos`, dpct(d.taxa), dmoney(d.mensal)]), ["l", "r", "r", "r", "r"], { w: [36, 18, 14, 14, 18] });
  }
  if (set.has("insumos")) {
    r += `<div class="pgbreak"></div>` + H2("7. Insumos e preços de referência");
    const rows = [...e.insumos.values()].map((x) => { const ic = P.Engine.insumoCalc(x); return [x.descricao, x.unidade || "", dnum(x.qtde_bruta, 2), dnum(x.qtde_liquida, 2), dmoney(x.custo), dnum(ic.fator, 3), dmoney(ic.custo_medida, ic.custo_medida < 10 ? 4 : 2)]; });
    rows.sort((a, b) => a[0].toLowerCase() < b[0].toLowerCase() ? -1 : 1);
    r += T(["Descrição", "Unidade", "Qtd bruta", "Qtd líquida", "Custo", "Fator perda", "Custo por medida"], rows, ["l", "l", "r", "r", "r", "r", "r"], { fs: 72, w: [38, 13, 9, 9, 11, 9, 11] });
  }
  if (set.has("concorrentes")) {
    const dados = P.json(cfg.concorrentes_json, {});
    if (dados.itens && dados.itens.length) {
      r += H2("8. Análise de concorrentes");
      if (dados.cliente_alvo) r += H3("Cliente-alvo") + `<p class="dp">${desc(dados.cliente_alvo).replace(/\n/g, "<br>")}</p>`;
      const emp = dados.empresas || [];
      const notas = dados.notas || {};
      const rows = dados.itens.map((it, i) => [it, ...emp.map((_, j) => (notas[`${i}|${j}`] !== undefined && notas[`${i}|${j}`] !== "" ? dnum(notas[`${i}|${j}`], 0) : "—"))]);
      const comp = P.Engine.concorrencia(dados).empresas;
      rows.push(["FATOR DE VALOR (soma das notas)", ...comp.map((c) => dnum(c.fator, 0))]);
      rows.push(["PREÇO UNITÁRIO", ...comp.map((c) => (c.preco ? dmoney(c.preco) : "—"))]);
      r += T(["Item avaliado (nota 1 a 3)", ...emp], rows, ["l", ...emp.map(() => "r")]);
      r += SM("Notas: 1 = baixo valor agregado, 2 = médio, 3 = alto.");
    }
  }
  if (r) sheets.push(sheet(hdr, r, set.has("precos") || set.has("simulacao") ? "newpage" : ""));
  return { html: sheets.join(""), css: pageCss(), title: "Relatório de Precificação" };
};

// ------------------------------------------------------------------ analise individual
P.docs.analysis = function (e, a) {
  const cfg = e.cfg, it = a.item;
  const tipo = it.tipo === "servico" ? "serviço" : "produto de revenda";
  let b = `<h1 class="dh1">Análise do ${tipo}: ${desc(it.nome)}</h1>${SM(`Desconto simulado: ${dpct(a.desconto)}  ·  Lucro desejado: ${dpct(a.lucro_desejado)}  ·  Rateio de custos fixos: ${dpct(a.rateio_pct)}`)}`;
  b += KPIs([["Preço praticado", dmoney(a.preco)], ["Preço sugerido", a.viavel ? dmoney(a.preco_sug) : "inviável", "#E08600"],
    ["Lucro no preço praticado", `${dmoney(a.lucro)} (${dpct(dsafe(a.lucro, a.preco))})`, a.lucro >= 0 ? "#15803D" : "#B91C1C"]]);
  if (a.aviso) b += Call(a.aviso, "warn");
  const dre = (linhas, preco, mc, rateio, lucro, markup) => {
    const cv = linhas.reduce((x, l) => x + l[1], 0);
    return [["Preço de venda", dmoney(preco), "100,0%"], ["(−) Custos variáveis", dmoney(cv), dpct(dsafe(cv, preco))],
      ...linhas.map(([n, v, p]) => ["     " + n, dmoney(v), dpct(p)]),
      ["(=) Margem de contribuição", dmoney(mc), dpct(dsafe(mc, preco))], ["(−) Rateio de custos fixos", dmoney(rateio), dpct(dsafe(rateio, preco))],
      ["(=) Margem de lucro", dmoney(lucro), dpct(dsafe(lucro, preco))], ["Markup multiplicador", dnum(markup, 3), ""]];
  };
  b += `<div class="dtwo"><div>${T(["Preço praticado", "R$", "%"], dre(a.linhas, a.preco, a.mc, a.rateio, a.lucro, a.markup), ["l", "r", "r"], { plain: true })}</div>` +
    `<div>${T(["Preço sugerido", "R$", "%"], dre(a.linhas_sug, a.preco_sug, a.mc_sug, a.rateio_sug, a.lucro_sug, a.markup_sug), ["l", "r", "r"], { plain: true })}</div></div>`;
  b += `<div class="dtwo">${[false, true].map((s) => `<div>${P.docs.donut(a, s)}</div>`).join("")}</div>`;
  if (it.tipo === "servico") {
    const f = e.ficha(it.id);
    if (f.mod.length || f.insumos.length) {
      b += H2("Composição do custo (ficha técnica)");
      const rows = f.mod.map((m) => [m.nome, `${dnum(m.horas, 2)} h × ${dmoney(m.custo_hora)}`, dmoney(m.total)])
        .concat(f.insumos.map((i) => [i.descricao, `${dnum(i.quantidade, 2)} ${i.unidade} × ${dmoney(i.custo_unit)}`, dmoney(i.total)]));
      rows.push(["CUSTO DIRETO TOTAL", "", dmoney(f.total)]);
      b += T(["Item", "Cálculo", "Custo"], rows, ["l", "l", "r"], { total: true });
    }
  }
  b += SM("Fórmula do preço sugerido: custo direto ÷ [1 − (impostos + taxas + comissão + rateio de custos fixos + lucro desejado)].");
  return { html: sheet(header(cfg, "Análise de preço"), b), css: pageCss(), title: "Análise - " + it.nome };
};
P.docs.donut = function (a, sug) {
  const [p, cv, ded, rat, luc] = sug
    ? [a.preco_sug, a.item.cv, a.linhas_sug.slice(-4).reduce((x, l) => x + l[1], 0), a.rateio_sug, a.lucro_sug]
    : [a.preco, a.item.cv, a.linhas.slice(-4).reduce((x, l) => x + l[1], 0), a.rateio, a.lucro];
  const parts = [{ label: "Custos diretos", value: cv, color: NAVY }, { label: "Deduções", value: ded, color: "#94A3B8" }, { label: "Custos fixos", value: rat, color: "#52617F" },
    { label: "Lucro", value: Math.max(luc, 0), color: ORANGE }].filter((x) => x.value > 0.0001);
  if (!parts.length || p <= 0) return `<div class="chart-empty">Sem dados</div>`;
  return P.chart.donut(parts, dmoney(p));
};

// ------------------------------------------------------------------ tabela de precos
P.docs.prices = (e) => { const d = P.docs.report(e, ["precos"]); d.title = "Tabela de preços"; return d; };

// ------------------------------------------------------------------ proposta tecnica e comercial (modelo ACRS)
P.docs.proposal = function (cfg, prop, itens) {
  const ctx = P.proposalContext(cfg, prop, itens);
  const tot = P.proposalTotals(prop, itens, cfg);
  const sub = (t) => P.sub(t, ctx);
  const numero = ctx.numero;
  const dt = ctx.data.slice(8, 10) + "/" + ctx.data.slice(5, 7) + "/" + ctx.data.slice(2, 4);
  const titulo = `PROPOSTA TÉCNICA E COMERCIAL: N° ${numero}  - ${ctx.titulo}`.replace(/[ -]+$/, "");
  const head = `<div class="ph"><img src="${logoSrc(cfg)}" alt=""><b>Data: ${dt}</b></div><div class="ptitle">${desc(titulo)}</div><div class="rule2"></div>`;
  const ac = (prop.aos_cuidados || prop.cliente_nome || "").trim();
  const secao = (t, texto, o = {}) => {
    const ps = P.paras(sub(texto));
    const tit = sub(t).trim();
    if (!ps.length) return "";
    return `${o.nova ? '<div class="pgbreak"></div>' : ""}<h4 class="psec" style="${o.espaco ? `margin-top:${6.7 + o.espaco}pt` : ""}"><u>${desc(tit)}</u></h4>` +
      ps.map((p, i) => `<p class="pb${i === ps.length - 1 ? " last" : ""}">${P.rich(p)}</p>`).join("");
  };
  let b = `<div style="height:29pt"></div>`;
  if (ac) b += `<p class="pac"><u>A/C.: ${desc(ac)}</u></p>`;
  const objeto = P.paras(sub(prop.objeto));
  if (objeto.length) b += `<h4 class="psec obj"><u>OBJETIVO</u></h4>` + objeto.map((p, i) => `<p class="po${i === objeto.length - 1 ? " last" : ""}">${P.rich(p)}</p>`).join("");
  // escopo
  const escopo = P.json(prop.escopo_json, []);
  const intro = sub(prop.escopo_intro).trim();
  if (escopo.length || intro) {
    b += `<h4 class="psec esc"><u>ESCOPO DOS SERVIÇOS</u></h4>`;
    if (intro) b += `<p class="pe">${P.rich(intro)}</p>`;
    for (const blk of escopo) {
      const tit = (blk.titulo || "").trim(), txt = sub(blk.texto).trim();
      if (!(tit || txt)) continue;
      b += `<p class="pe">${tit ? desc(sub(tit)) + ": " : ""}${P.rich(txt)}</p>`;
      for (const tp of String(blk.topicos || "").split("\n").map((x) => x.trim()).filter(Boolean))
        b += `<p class="pe pt"><span class="arr"></span><span>${P.rich(sub(tp))}</span></p>`;
    }
    const nota = sub(prop.escopo_nota).trim();
    if (nota) b += `<p class="pn">${P.rich(nota)}</p>`;
  }
  // secoes antes do investimento
  const pre = P.json(prop.secoes_pre_json, []);
  let preHtml = "";
  for (const s of pre) preHtml += secao(s.titulo || "", s.texto || "", { nova: !!s.nova_pagina, espaco: dfnum(s.espaco) });
  b += preHtml;
  const temTextoAntes = !!(objeto.length || escopo.length || intro || preHtml);
  // investimento
  if (itens.length) {
    if (temTextoAntes && Math.floor(dfnum(prop.invest_nova_pagina, 1))) b += '<div class="pgbreak"></div>';
    const cols = `<colgroup><col style="width:12.8pt"><col style="width:36pt"><col style="width:256.2pt"><col style="width:116.5pt"><col style="width:100pt"></colgroup>`;
    b += `<h4 class="psec inv"><u>INVESTIMENTO</u></h4><table class="pinv">${cols}<tbody>`;
    itens.forEach((it, k) => {
      const q = dfnum(it.quantidade, 1), v = dfnum(it.valor_unit);
      let d = P.rich(sub(it.descricao));
      if (Math.abs(q - 1) > 1e-9) d += ` (${desc(dnum(q, Math.abs(q - Math.round(q)) < 1e-9 ? 0 : 2) + (it.unidade ? " " + it.unidade : ""))} × ${desc(dmoney(v))})`;
      b += `<tr><td class="w"></td><td class="n">${k + 1}</td><td class="d">${d}</td><td class="g"></td><td class="v">${desc(dmoney(q * v))}</td></tr>`;
    });
    b += `<tr class="end"><td class="w"></td><td class="n"></td><td class="d"></td><td class="g"></td><td class="v"></td></tr></tbody></table>`;
    b += `<table class="ptot">${cols}<tbody>`;
    const trow = (l, v) => `<tr><td></td><td></td><td></td><td class="l">${l}</td><td class="v">${desc(v)}</td></tr>`;
    if (tot.desconto > 0) b += trow("SUBTOTAL", dmoney(tot.subtotal)) + trow("DESCONTO", "− " + dmoney(tot.desconto));
    b += trow("VALOR TOTAL DO INVESTIMENTO", dmoney(tot.total)) + "</tbody></table>";
  }
  // condicoes de pagamento
  const parcelas = P.json(prop.parcelas_json, []);
  let linhas = [];
  for (const p of parcelas) {
    const rot = (p.rotulo || "").trim(), det = (p.detalhe || "").trim();
    if (!(rot || dfnum(p.valor))) continue;
    linhas.push(`${rot ? rot + ": " : ""}${dmoney(p.valor)}` + (det ? ` (${det}).` : "."));
  }
  if (!linhas.length && (prop.detalhes_pagamento || "").trim()) linhas = prop.detalhes_pagamento.split("\n").map((x) => x.trim()).filter(Boolean);
  if (linhas.length) b += `<h4 class="psec pay"><u>CONDIÇÕES DE PAGAMENTO</u></h4>` + linhas.map((ln, i) => `<p class="pb${i === linhas.length - 1 ? " last" : ""}">${desc(ln)}</p>`).join("");
  // secoes depois
  let pos = P.json(prop.secoes_pos_json, []);
  if (!pos.length && (prop.observacoes || "").trim()) pos = [{ titulo: "OBSERVAÇÕES COMERCIAIS IMPORTANTES", texto: prop.observacoes }];
  for (const s of pos) b += secao(s.titulo || "", s.texto || "", { nova: !!s.nova_pagina, espaco: dfnum(s.espaco) });
  b += P.docs.closing(cfg, prop, ctx, ac);
  const css = `@page{size:A4;margin:9mm 13.7mm 15mm 12.35mm;@bottom-center{content:counter(page);font:10.7pt Calibri,Carlito,Arial,sans-serif;color:#000}}`;
  return { html: `<div class="paper prop"><table class="sheet"><thead><tr><td>${head}</td></tr></thead><tbody><tr><td>${b}</td></tr></tbody></table></div>`, css,
    title: `Proposta ${numero} - ${ctx.cliente || "cliente"}` };
};

/** Fecho da proposta: frase de despedida, linha de aprovacao e as duas assinaturas (com imagem, se houver). */
P.docs.closing = function (cfg, prop, ctx, ac, onlySig = false) {
  const sub = (t) => P.sub(t, ctx);
  if (onlySig) return `<div class="pfim">${P.docs.sigRow(prop.assinatura1_img, sub(prop.assinatura1 || (ac ? `${ac} (Resp.)` : "")), prop.assinatura2_img, sub(prop.assinatura2 || cfg.proposta_assinante_empresa || ""))}</div>`;
  const fecho = P.paras(sub(prop.fecho));
  const a1 = sub(prop.assinatura1 || (ac ? `${ac} (Resp.)` : ""));
  const a2 = sub(prop.assinatura2 || cfg.proposta_assinante_empresa || "");
  return `<div class="pfim">` + fecho.map((p, i) => `<p class="pf" style="${i === 0 ? "margin-top:30pt" : ""}">${P.rich(p)}</p>`).join("") +
    `<p class="pap" style="${fecho.length ? "" : "margin-top:30pt"}">Aprovo as condições acima descritas em __________/__________/__________e assinamos:</p>` +
    P.docs.sigRow(prop.assinatura1_img, a1, prop.assinatura2_img, a2) + `</div>`;
};
// ------------------------------------------------------------------ visualizacao / impressao
let docModal = null, docStyle = null;
P.openDoc = function (d) {
  const view = P.h("div", { class: "docview" });
  view.innerHTML = d.html;
  const printBtn = P.btn("Imprimir / Salvar PDF", () => { fit(); setTimeout(() => window.print(), 50); }, "primary");
  const hint = P.h("p", { class: "dochint", text: "Dica: na janela de impressão escolha “Salvar como PDF” (no celular: Imprimir › Salvar como PDF ou Compartilhar)." });
  const m = P.modal({ title: d.title, body: [hint, view], footer: [P.btn("Fechar", () => m.close(), "secondary"), P.h("span", { class: "grow" }), printBtn], cls: "full docmo",
    onClose: () => { if (docStyle) { docStyle.remove(); docStyle = null; } removeEventListener("resize", fit); } });
  docModal = m;
  if (docStyle) docStyle.remove();
  docStyle = P.h("style", { id: "doc-page-style", text: d.css || "" });
  document.head.append(docStyle);
  function fit() {
    const avail = m.body.clientWidth - 16;
    view.querySelectorAll(".paper").forEach((p) => {
      p.style.zoom = "";
      const w = p.getBoundingClientRect().width;
      p.style.zoom = w > avail && avail > 100 ? String(Math.max(0.3, avail / w)) : "";
    });
  }
  addEventListener("resize", fit);
  requestAnimationFrame(fit);
  setTimeout(fit, 120);
  return m;
};
