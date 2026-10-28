"use strict";
/* Precifica Web - telas: Tabela de precos, Analise, Simulacao, Relatorios, Concorrentes, Clientes, Exportar PDF, Configuracoes. */
const { h, btn, card, cardTitle, kpis, callout, table, seg, progress } = P;
const { fnum, money, num, pct, numInput, safeDiv, M, N0, N2, PC } = P;
const SEED = P.SEED;
const { PRIMARY, NAVY, STEEL, GREEN, RED } = P.colors;
const mcTag = P.mcTag;

// ====================================================================== TABELA DE PRECOS
P.definePage("Tabela de preços", {
  subtitle: "Todos os itens com custo, deduções e margem de contribuição no preço atual. Vermelho = prejuízo; laranja = margem abaixo de 20%.",
  state: { tipo: "Serviços" },
  actions: () => [btn("Exportar PDF", () => P.app.openDoc(P.docs.prices(P.app.engine)), "secondary")],
  render(pg) {
    const e = pg.eng, st = this.state;
    const tipo = st.tipo === "Serviços" ? "servico" : "revenda";
    const rows = e.itens(tipo).map((it) => ({ id: it.id, tipo, nome: it.nome, preco: it.preco, custo_mod: it.custo_mod, custo_md: it.custo_md, cv: it.cv, deducoes: it.deducoes, mc: it.mc,
      mc_pct: it.mc_pct, pct_cpv: it.pct_cpv, sug: e.precoSugerido(tipo, it.id), _tag: it.preco ? mcTag(it.mc_pct) : "muted" }));
    const tabs = seg(["Serviços", "Revenda"], st.tipo, (v) => { st.tipo = v; pg.rerender(); });
    const tbl = card(table([{ key: "nome", label: "Item", pri: true }, { key: "preco", label: "Preço atual", align: "r", fmt: M }, { key: "custo_mod", label: "Mão de obra", align: "r", fmt: M, hm: true },
      { key: "custo_md", label: "Materiais / CMV", align: "r", fmt: M, hm: true }, { key: "cv", label: "Custo variável", align: "r", fmt: M }, { key: "deducoes", label: "Deduções", align: "r", fmt: M, hm: true },
      { key: "mc", label: "Margem contrib.", align: "r", fmt: M, hm: true }, { key: "mc_pct", label: "MC %", align: "r", fmt: PC }, { key: "pct_cpv", label: "% custo", align: "r", fmt: PC, hm: true },
      { key: "sug", label: "Preço sugerido", align: "r", fmt: M }], rows, { onOpen: (r) => P.app.openAnalysis(r.tipo, r.id), empty: "Nenhum item cadastrado." }));
    const note = h("p", { class: "fh pad", text: `Preço sugerido = custo variável ÷ [1 − (deduções + rateio de custos fixos ${pct(e.rateioPct())} + lucro desejado ${P.pctN(e.c("lucro_desejado_pct", 15), 0)})]. Toque em um item para abrir a análise.` });
    return [h("div", { class: "bar" }, tabs), tbl, note];
  },
});

// ====================================================================== ANALISE DE PRECO
P.definePage("Análise de preço", {
  subtitle: "Simule descontos e descubra o preço ideal para o lucro que você deseja. À esquerda o preço praticado; à direita o preço sugerido.",
  state: { tipo: "Serviço", id: null, desc: "0", luc: null, pending: null },
  actions: () => [btn("Exportar análise em PDF", () => P.pages["Análise de preço"].exportar(), "secondary")],
  render(pg) {
    const e = pg.eng, st = this.state;
    if (st.pending) { st.tipo = st.pending.tipo === "servico" ? "Serviço" : "Revenda"; st.id = st.pending.id; st.pending = null; }
    if (st.luc === null) st.luc = numInput(e.c("lucro_desejado_pct", 15));
    const tipoKey = () => (st.tipo === "Serviço" ? "servico" : "revenda");
    const res = h("div");
    const sel = h("select", { class: "in" });
    const fillSel = () => {
      const its = e.itens(tipoKey());
      sel.replaceChildren(...(its.length ? its.map((it) => h("option", { value: it.id, text: it.nome })) : [h("option", { value: "", text: "(nenhum item cadastrado)" })]));
      if (!its.some((i) => i.id === st.id)) st.id = its.length ? its[0].id : null;
      sel.value = st.id ?? "";
    };
    const tabs = seg(["Serviço", "Revenda"], st.tipo, (v) => { st.tipo = v; st.id = null; fillSel(); calc(); });
    const iDesc = P.inp({ kind: "pct" }, st.desc), iLuc = P.inp({ kind: "pct" }, st.luc);
    sel.addEventListener("change", () => { st.id = sel.value ? parseInt(sel.value) : null; calc(); });
    const onNum = () => { st.desc = iDesc.value; st.luc = iLuc.value; calc(); };
    iDesc.addEventListener("input", onNum); iLuc.addEventListener("input", onNum);
    const ctl = card(h("div", { class: "an-ctl" }, tabs, h("label", { class: "fld grow" }, h("span", { class: "fl", text: "Item" }), sel),
      P.field({ label: "Desconto (%)", kind: "pct" }, iDesc), P.field({ label: "Lucro desejado (%)", kind: "pct" }, iLuc)));
    const calc = () => {
      const a = st.id === null ? null : e.analise(tipoKey(), st.id, fnum(st.desc), fnum(st.luc, 15));
      this.last = a;
      if (!a) { res.replaceChildren(P.empty("Cadastre um serviço ou produto para analisar.")); return; }
      const panel = (title, accent, preco, linhas, mc, rat, luc, mk, sug, viavel) => {
        const cv = linhas.reduce((x, l) => x + l[1], 0);
        const rows = [["(−) Custos variáveis", cv, safeDiv(cv, preco), true], ...linhas.map(([n, v, p]) => ["      " + n, v, p, false]),
          ["(=) Margem de contribuição", mc, safeDiv(mc, preco), true], ["(−) Rateio de custos fixos", rat, safeDiv(rat, preco), true], ["(=) Margem de lucro", luc, safeDiv(luc, preco), true]];
        const donut = P.docs.donut(a, sug);
        return h("section", { class: "card an-panel", style: { "--ac": accent } }, h("div", { class: "bar4" }), h("div", { class: "pt", text: title.toUpperCase() }),
          h("div", { class: "big", style: { color: accent }, text: viavel ? money(preco) : "inviável" }),
          h("table", { class: "dre" }, h("tbody", null, rows.map(([lab, v, p, bold]) => h("tr", { class: bold ? "b" : "" },
            h("td", { text: lab.replace(/^ +/, (m2) => " ".repeat(m2.length)) }), h("td", { class: "ar" + (bold && v < 0 ? " neg" : "") + (bold && lab.includes("lucro") && v >= 0 ? " pos" : ""), text: money(v) }), h("td", { class: "ar m", text: pct(p) }))),
            h("tr", { class: "sep" }, h("td", { colspan: 3 })), h("tr", { class: "b" }, h("td", { text: "Markup multiplicador" }), h("td", { class: "ar", text: num(mk, 3) }), h("td")))),
          h("div", { html: donut }));
      };
      res.replaceChildren(...[a.aviso ? callout(a.aviso, "warn") : null,
        h("div", { class: "cols2" }, panel("Preço praticado", NAVY, a.preco, a.linhas, a.mc, a.rateio, a.lucro, a.markup, false, true),
          panel("Preço sugerido", PRIMARY, a.preco_sug, a.linhas_sug, a.mc_sug, a.rateio_sug, a.lucro_sug, a.markup_sug, true, a.viavel)),
        h("div", { class: "right" }, btn("Aplicar o preço sugerido ao cadastro", () => this.aplicar(pg)))].filter(Boolean));
    };
    fillSel(); calc();
    return [ctl, res];
  },
  async aplicar(pg) {
    const a = this.last, st = this.state;
    if (!a || !a.viavel || a.preco_sug <= 0) return P.ui.toast("Não há preço sugerido válido", "warn");
    if (await P.confirm("Aplicar preço sugerido", `Alterar o preço de “${a.item.nome}” de ${money(a.item.preco)} para ${money(a.preco_sug)}?`)) {
      pg.db.save(st.tipo === "Serviço" ? "servicos" : "revenda", { id: a.item.id, preco: P.round2(a.preco_sug) });
      P.app.changed("Preço atualizado");
    }
  },
  exportar() {
    const a = this.last;
    if (!a) return P.ui.toast("Escolha um item", "warn");
    P.app.engine.reload();
    P.app.openDoc(P.docs.analysis(P.app.engine, a));
  },
});

// ====================================================================== SIMULACAO
P.definePage("Simulação", {
  subtitle: "Informe quantas vezes por mês você vende cada serviço/produto. A previsão define o rateio dos custos fixos, o lucro do mês e as horas vendidas da equipe. Toque na linha para alterar.",
  actions: () => [btn("Zerar previsões", () => P.pages["Simulação"].zerar(), "danger-ghost")],
  render(pg) {
    const e = pg.eng, t = e.totais();
    const k = kpis([{ title: "Faturamento", value: money(t.faturamento), sub: `${num(t.quantidade, 0)} vendas no mês`, accent: NAVY }, { title: "Margem de contribuição", value: money(t.mc), sub: pct(t.mc_pct), accent: PRIMARY },
      { title: "Custos fixos rateados", value: money(t.rateio), sub: `${pct(e.rateioPct())} do faturamento`, accent: STEEL }, { title: "Lucro do mês", value: money(t.lucro), sub: pct(t.lucro_pct), color: t.lucro >= 0 ? GREEN : RED, accent: GREEN },
      { title: "Markup médio", value: num(t.markup, 2), sub: "faturamento ÷ custo variável", accent: PRIMARY }]);
    const rows = e.itens().map((it) => ({ id: it.id, tipo: it.tipo, tipo_txt: it.tipo === "servico" ? "Serviço" : "Revenda", nome: it.nome, previsao: it.previsao, preco: it.preco, faturamento: it.faturamento,
      cv_total: it.cv_total, ded_total: it.ded_total, mc_total: it.mc_total, rateio_cf: it.rateio_cf, lucro: it.lucro, lucro_pct: it.lucro_pct, markup: it.markup, mix_pct: it.mix_pct,
      _tag: !it.previsao ? "muted" : it.lucro < 0 ? "neg" : null }));
    if (rows.length) rows.push({ id: null, tipo_txt: "", nome: "TOTAL", previsao: t.quantidade, preco: "", faturamento: t.faturamento, cv_total: t.cv, ded_total: t.deducoes, mc_total: t.mc, rateio_cf: t.rateio,
      lucro: t.lucro, lucro_pct: t.lucro_pct, markup: t.markup, mix_pct: t.faturamento ? 1 : 0, _tag: "total", _fixed: true });
    return [k, card(table([{ key: "tipo_txt", label: "Tipo", hm: true }, { key: "nome", label: "Item", pri: true }, { key: "previsao", label: "Qtd/mês", align: "r", fmt: N0 },
      { key: "preco", label: "Preço", align: "r", fmt: (v) => (v === "" ? "" : M(v)), hm: true }, { key: "faturamento", label: "Faturamento", align: "r", fmt: M }, { key: "cv_total", label: "Custo variável", align: "r", fmt: M, hm: true },
      { key: "ded_total", label: "Deduções", align: "r", fmt: M, hm: true }, { key: "mc_total", label: "Margem contrib.", align: "r", fmt: M, hm: true }, { key: "rateio_cf", label: "Rateio CF", align: "r", fmt: M, hm: true },
      { key: "lucro", label: "Lucro", align: "r", fmt: M }, { key: "lucro_pct", label: "Lucro %", align: "r", fmt: PC, hm: true }, { key: "markup", label: "Markup", align: "r", fmt: N2, hm: true },
      { key: "mix_pct", label: "% mix", align: "r", fmt: PC, hm: true }], rows, { onOpen: (r) => this.editar(pg, r), empty: "Cadastre serviços ou produtos para simular." }))];
  },
  async editar(pg, r) {
    const v = await P.ask("Previsão de vendas", [{ key: "previsao", label: `Quantas vezes “${r.nome}” é vendido por mês?`, kind: "num", min: 0, required: true }], r);
    if (v) { pg.db.save(r.tipo === "servico" ? "servicos" : "revenda", { id: r.id, previsao: Math.max(0, v.previsao) }); P.app.changed("Previsão atualizada"); }
  },
  async zerar() {
    if (await P.confirm("Zerar previsões", "Zerar a previsão de vendas de todos os itens?", "Zerar", true)) {
      P.app.db.updateAll("servicos", { previsao: 0 }); P.app.db.updateAll("revenda", { previsao: 0 }); P.app.changed("Previsões zeradas");
    }
  },
});

// ====================================================================== RELATORIOS GERENCIAIS
P.definePage("Relatórios gerenciais", {
  subtitle: "Resultado do mês, ponto de equilíbrio, ticket médio e uso da capacidade da equipe.",
  actions: () => [btn("Exportar relatório completo (PDF)", () => P.app.show("Exportar PDF"), "secondary")],
  render(pg) {
    const e = pg.eng, rel = e.relatorio(), cap = e.capacidade();
    const modo = e.cfg.lucro_modo === "valor" ? "Valor em R$" : "% do faturamento";
    const tabs = seg(["% do faturamento", "Valor em R$"], modo);
    const inp = P.inp({ kind: "num" }, modo === "Valor em R$" ? e.c("lucro_desejado_valor") : e.c("lucro_desejado_pct", 15));
    const salvar = () => {
      const m = tabs.get() === "Valor em R$" ? "valor" : "pct";
      pg.db.setMany({ lucro_modo: m, [m === "valor" ? "lucro_desejado_valor" : "lucro_desejado_pct"]: fnum(inp.value) });
      P.app.changed("Lucro desejado salvo");
    };
    const ctl = card(h("div", { class: "rel-ctl" }, h("b", { text: "Lucro desejado no mês:" }), tabs, inp, btn("Salvar", salvar)));
    const k = kpis([{ title: "Ponto de equilíbrio", value: money(rel.pe), sub: "faturamento para ficar no 0 a 0", accent: STEEL },
      { title: "Ponto de equilíbrio econômico", value: money(rel.pe_econ), sub: `lucro desejado de ${money(rel.lucro_desejado)}`, accent: PRIMARY },
      { title: "Ticket médio", value: money(rel.ticket), sub: `${num(rel.qtd_servicos, 0)} serviços no mês`, accent: PRIMARY },
      { title: "Margem de segurança", value: pct(rel.margem_seguranca), sub: "quanto as vendas podem cair até o PE", accent: GREEN }], 4);
    const dre = card(cardTitle("DRE gerencial do mês"), table([{ key: "n", label: "Demonstração", pri: true }, { key: "v", label: "Valor", align: "r", fmt: M }, { key: "p", label: "%", align: "r", fmt: PC }],
      rel.dre.map(([n, v, p]) => ({ n, v, p, _tag: n.startsWith("(=) Lucro") ? "total" : v < 0 ? "neg" : null }))));
    const fat = rel.faturamento;
    const comp = card(cardTitle("Composição do faturamento"), h("div", { html: P.chart.stack([{ label: "Deduções", value: rel.deducoes, color: "#94A3B8" }, { label: "Custos variáveis", value: rel.cv, color: PRIMARY },
      { label: "Custos fixos", value: rel.cf, color: STEEL }, { label: "Lucro", value: Math.max(0, rel.lucro), color: "#16A34A" }], fat) }));
    const capc = card(cardTitle("Capacidade produtiva"), h("p", { class: "msg", text: `${num(cap.alocadas, 1)} h vendidas de ${num(cap.efetivas_equipe, 1)} h efetivas (${pct(cap.vendidas_pct)}) · ociosidade ${pct(cap.ociosidade_pct)}` }),
      progress(cap.vendidas_pct, cap.vendidas_pct > 1), callout(cap.status, cap.nivel));
    return [ctl, k, callout(rel.analise, rel.nivel), h("div", { class: "cols23r" }, dre, comp), capc];
  },
});

// ====================================================================== CONCORRENTES
P.definePage("Concorrentes", {
  subtitle: "Defina seu cliente-alvo e compare-se com a concorrência. Nota de 1 a 3: 1 = baixo valor agregado, 2 = médio, 3 = alto. O fator de valor ajuda a justificar o seu preço.",
  ITENS: ["Atendimento", "Qualidade da solução", "Pós-venda", "Localização (acesso)", "Relevância da marca", "Facilidade no pagamento"],
  actions: () => [btn("Salvar", () => P.pages["Concorrentes"].salvar())],
  render(pg) {
    const d = P.json(pg.eng.cfg.concorrentes_json, {});
    const empresas = d.empresas && d.empresas.length ? d.empresas : ["Empresa A", "Empresa B", "Empresa C", "Sua empresa"];
    const alvo = h("textarea", { class: "in", rows: 4, text: d.cliente_alvo || "" });
    alvo.value = d.cliente_alvo || "";
    const emp = [0, 1, 2, 3].map((j) => h("input", { class: "in ctr b", type: "text", value: empresas[j] ?? "", "aria-label": `Empresa ${j + 1}` }));
    const notas = {}, precos = [];
    const fat = [], ppp = [];
    const update = () => {
      const comp = P.Engine.concorrencia(this.collect()).empresas;
      comp.forEach((c, j) => { fat[j].textContent = num(c.fator, 0); ppp[j].textContent = c.preco_por_ponto ? money(c.preco_por_ponto) : "—"; });
    };
    const rowEl = (label, cells, cls = "") => h("div", { class: "cmp-row " + cls }, h("div", { class: "cmp-l", text: label }), h("div", { class: "cmp-c" }, cells));
    const rows = [rowEl("ITEM AVALIADO", emp, "head")];
    this.ITENS.forEach((it, i) => {
      const cells = [0, 1, 2, 3].map((j) => {
        const sel = h("select", { class: "in ctr" }, ["—", "1", "2", "3"].map((o) => h("option", { value: o, text: o })));
        const v = (d.notas || {})[`${i}|${j}`];
        sel.value = v ? String(Math.round(fnum(v))) : "—";
        sel.addEventListener("change", update);
        notas[`${i}|${j}`] = sel;
        return sel;
      });
      rows.push(rowEl(`${i + 1}. ${it}`, cells));
    });
    rows.push(rowEl("PREÇO UNITÁRIO (R$)", [0, 1, 2, 3].map((j) => {
      const e2 = h("input", { class: "in ctr", type: "text", inputmode: "decimal", value: (d.precos || {})[String(j)] ? numInput(d.precos[String(j)]) : "" });
      e2.addEventListener("input", update); precos.push(e2); return e2;
    }), "price"));
    rows.push(rowEl("FATOR DE VALOR (soma)", [0, 1, 2, 3].map((j) => { const s = h("b", { class: "fat", text: "0" }); fat.push(s); return s; }), "res"));
    rows.push(rowEl("Preço por ponto de valor", [0, 1, 2, 3].map((j) => { const s = h("span", { text: "—" }); ppp.push(s); return s; }), "res"));
    this.refs = { alvo, emp, notas, precos };
    queueMicrotask(update);
    return [card(cardTitle("Cliente-alvo", "Idade, renda, região, principais necessidades, objetivos, dúvidas e objeções de compra"), alvo),
      card(cardTitle("Diferencial competitivo"), h("div", { class: "cmp" }, rows)),
      callout("Quanto menor o preço por ponto de valor, mais vantajosa é a oferta para o cliente. Se o seu fator de valor é maior, você pode cobrar mais que a concorrência.", "info")];
  },
  collect() {
    const r = this.refs, notas = {}, precos = {};
    for (const [k, s] of Object.entries(r.notas)) if (s.value !== "—") notas[k] = parseInt(s.value);
    r.precos.forEach((e2, j) => { if (e2.value.trim()) precos[String(j)] = fnum(e2.value); });
    return { empresas: r.emp.map((e2, j) => e2.value.trim() || `Empresa ${j + 1}`), itens: this.ITENS, notas, precos, cliente_alvo: r.alvo.value.trim() };
  },
  salvar() { P.app.db.setCfg("concorrentes_json", JSON.stringify(this.collect())); P.app.changed("Análise de concorrentes salva"); },
});

// ====================================================================== CLIENTES
P.CLIENTE_FIELDS = [
  { key: "nome", label: "Nome / razão social", required: true, span: 2 }, { key: "documento", label: "CPF / CNPJ", mode: "numeric" }, { key: "telefone", label: "Telefone", mode: "tel" },
  { key: "email", label: "E-mail", mode: "email" }, { key: "contato", label: "Pessoa de contato" }, { key: "endereco", label: "Endereço", span: 2 }, { key: "complemento", label: "Complemento" },
  { key: "bairro", label: "Bairro" }, { key: "cidade", label: "Cidade" }, { key: "uf", label: "UF", kind: "combo", options: SEED.UFS }, { key: "cep", label: "CEP", mode: "numeric" },
  { key: "obs", label: "Observações", kind: "textarea", span: 2, height: 60 }];
P.definePage("Clientes", {
  subtitle: "Cadastro de clientes para preencher as propostas comerciais automaticamente.",
  actions: () => [btn("+ Novo cliente", () => P.pages["Clientes"].novo())],
  render(pg) {
    return P.crud(pg, { state: this.state = this.state || { q: "" }, empty: "Nenhum cliente cadastrado.", searchText: "Pesquisar cliente…", searchKeys: ["nome", "documento", "telefone", "email", "cidade"],
      rows: (p) => p.db.all("clientes"),
      columns: [{ key: "nome", label: "Cliente", pri: true }, { key: "documento", label: "CPF/CNPJ", hm: true }, { key: "telefone", label: "Telefone" }, { key: "email", label: "E-mail", hm: true },
        { key: "cidade", label: "Cidade", hm: true }, { key: "uf", label: "UF", align: "c", hm: true }], edit: (r) => this.editar(r) });
  },
  async novo() {
    const c = P.app.engine.cfg;
    const v = await P.ask("Novo cliente", P.CLIENTE_FIELDS, { cidade: c.empresa_cidade || "", uf: c.empresa_uf || "" }, { wide: true });
    if (v) { P.app.db.save("clientes", v); P.app.changed("Cliente salvo"); }
  },
  async editar(r) {
    const v = await P.ask("Editar cliente", P.CLIENTE_FIELDS, r, { wide: true, extra: [
      { text: "Excluir", kind: "danger-ghost", fn: async () => { if (await P.confirm("Excluir cliente", `Excluir “${r.nome}”? As propostas já emitidas são mantidas.`, "Excluir", true)) { P.app.db.remove("clientes", r.id); P.app.changed("Cliente excluído"); } } },
      { text: "Nova proposta", kind: "secondary", fn: () => P.pages["Propostas"].newProposal(r) }] });
    if (v) { v.id = r.id; P.app.db.save("clientes", v); P.app.changed("Cliente atualizado"); }
  },
});

// ====================================================================== EXPORTAR PDF
P.definePage("Exportar PDF", {
  subtitle: "Gere o relatório completo de precificação em PDF – o equivalente à planilha inteira, para imprimir ou enviar a quem não tem Excel.",
  state: { sel: null },
  render(pg) {
    const st = this.state;
    if (!st.sel) st.sel = new Set(P.docs.SECOES.map((s) => s[0]));
    const boxes = P.docs.SECOES.map(([k, t]) => {
      const cb = h("input", { type: "checkbox", checked: st.sel.has(k) });
      cb.addEventListener("change", () => (cb.checked ? st.sel.add(k) : st.sel.delete(k)));
      return h("label", { class: "chk" }, cb, h("span", { text: t }));
    });
    const gen = () => {
      if (!st.sel.size) return P.ui.toast("Marque pelo menos uma seção", "warn");
      P.app.openDoc(P.docs.report(P.app.engine, [...st.sel]));
    };
    const setAll = (on) => { st.sel = on ? new Set(P.docs.SECOES.map((s) => s[0])) : new Set(); pg.rerender(); };
    const c1 = card(cardTitle("Relatório completo de precificação", "Escolha as seções que entram no documento"), h("div", { class: "chks" }, boxes),
      h("div", { class: "bar" }, btn("Gerar relatório em PDF", gen), btn("Marcar todas", () => setAll(true), "ghost"), btn("Desmarcar todas", () => setAll(false), "ghost")));
    const other = [["Proposta técnica e comercial", "Documento no modelo da ACRS: escopo, investimento, pagamento e assinaturas", () => P.app.show("Propostas")],
      ["Análise de um serviço", "DRE unitária, preço sugerido e gráficos de um serviço ou produto", () => P.app.show("Análise de preço")],
      ["Tabela de preços", "Somente a tabela de preços de serviços e revenda", () => P.app.openDoc(P.docs.prices(P.app.engine))]];
    const c2 = card(cardTitle("Outros documentos"), h("ul", { class: "linklist" }, other.map(([t, s, fn]) => h("li", null, h("div", null, h("b", { text: t }), h("p", { class: "cs", text: s })), btn("Abrir", fn, "secondary sm")))),
      h("p", { class: "fh", text: "Os documentos abrem em uma visualização. Toque em “Imprimir / Salvar PDF” e escolha “Salvar como PDF”." }));
    return [c1, c2];
  },
});

// ====================================================================== CONFIGURACOES
function download(name, text, mime = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = h("input", { type: "file", accept, style: { display: "none" } });
    inp.addEventListener("change", () => { resolve(inp.files[0] || null); inp.remove(); });
    inp.addEventListener("cancel", () => { resolve(null); inp.remove(); });
    document.body.append(inp); inp.click();
  });
}
const readText = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(f); });
const readData = (f, how = "ArrayBuffer") => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r["readAs" + how](f); });
P.download = download;

P.definePage("Configurações", {
  subtitle: "Dados da sua empresa (aparecem nas propostas e relatórios), parâmetros, encargos e backup.",
  EMPRESA: [["empresa_nome", "Razão social / nome", 2], ["empresa_fantasia", "Nome fantasia", 1], ["empresa_cnpj", "CNPJ / CPF", 1], ["empresa_telefone", "Telefone / WhatsApp", 1], ["empresa_email", "E-mail", 1],
    ["empresa_endereco", "Endereço", 2], ["empresa_bairro", "Bairro", 1], ["empresa_cidade", "Cidade", 1], ["empresa_uf", "UF", 1], ["empresa_cep", "CEP", 1], ["empresa_sigla", "Nome curto nos textos (ex.: ACRS)", 1],
    ["empresa_site", "Site / Instagram", 1], ["proposta_assinante_empresa", "Assinante da empresa nas propostas (nome e função)", 2]],
  PARAMS: [["lucro_desejado_pct", "Lucro desejado padrão (%)"], ["proposta_proximo_numero", "Próximo nº de proposta"], ["proposta_validade_dias", "Validade das propostas (dias)"],
    ["adicional_hora_extra_pct", "Adicional de hora extra (%)"], ["adicional_noturno_pct", "Adicional noturno (%)"], ["adicional_feriado_pct", "Adicional de domingo / feriado (%)"]],
  ENC: [["enc_ferias", "Férias + 1/3 (%)"], ["enc_13", "13º salário (%)"], ["enc_13_ferias", "13º sobre férias (%)"], ["enc_inss", "INSS patronal (%)"], ["enc_sat", "SAT/RAT (%)"],
    ["enc_sal_educacao", "Salário-educação (%)"], ["enc_sistema_s", "INCRA/Sistema S (%)"], ["enc_fgts", "FGTS (%)"], ["enc_fgts_rescisao", "FGTS rescisão (%)"], ["enc_prolabore_inss", "INSS sobre pró-labore (%)"]],
  actions: () => [btn("Salvar configurações", () => P.pages["Configurações"].salvar())],
  render(pg) {
    const cfg = pg.db.config();
    const els = (this.els = {});
    const numeric = (k) => k.startsWith("enc_") || this.PARAMS.some((p) => p[0] === k);
    const mk = ([key, label, span]) => {
      const fd = { key, label, span: span || 1, kind: key === "empresa_uf" ? "combo" : numeric(key) ? "num" : "text", options: key === "empresa_uf" ? SEED.UFS : null, mode: key === "empresa_telefone" ? "tel" : key === "empresa_email" ? "email" : null };
      const v = cfg[key] ?? (P.CFG_DEFAULTS[key] ?? "");
      const inp = P.inp(fd, numeric(key) ? numInput(v, 4) : v);
      els[key] = inp;
      return P.field(fd, inp);
    };
    // logotipo
    const logoImg = h("img", { class: "logo-prev", alt: "Logotipo", src: (cfg.empresa_logo && cfg.empresa_logo.startsWith("data:")) ? cfg.empresa_logo : P.LOGO });
    const custom = !!(cfg.empresa_logo && cfg.empresa_logo.startsWith("data:"));
    const logoBox = h("div", { class: "logo-box" }, h("b", { text: custom ? "Logotipo da empresa" : "Logotipo padrão (ACRS)" }), logoImg,
      btn("Escolher imagem", () => this.escolherLogo(pg), "secondary sm"), btn("Voltar ao logo da ACRS", () => { pg.db.setCfg("empresa_logo", ""); P.app.changed("Logotipo da ACRS restaurado"); }, "ghost sm"));
    const empresa = card(cardTitle("Sua empresa", "Aparece no cabeçalho das propostas e dos relatórios"), h("div", { class: "cfg-top" }, h("div", { class: "fg" }, this.EMPRESA.map(mk)), logoBox));
    const params = card(cardTitle("Parâmetros de preço e propostas"), h("div", { class: "fg c3" }, this.PARAMS.map(([k, l]) => mk([k, l, 1]))),
      h("p", { class: "fh", text: "Hora extra e adicional noturno: percentuais somados ao custo da hora quando você escolhe “Hora extra”, “Adicional noturno” ou “Hora extra noturna” na mão de obra de um serviço (CLT: 50% e 20%). A hora extra noturna aplica os dois, um sobre o outro." }),
      h("p", { class: "fh", text: "Os textos padrão das propostas (escopo, premissas, garantia…) ficam no próprio editor de proposta: menu “Modelos de texto…” › “Salvar estes textos como padrão”." }));
    const listas = card(cardTitle("Categorias e unidades personalizadas", "Itens criados por você (aparecem nas listas junto com os padrões e sincronizam com a equipe)."),
      ...Object.entries(P.LISTAS).map(([key, def]) => {
        const custom = P.lists.custom(key);
        return h("div", { class: "lista" }, h("div", { class: "lista-h" }, h("b", { text: def.label }), btn("+ Adicionar", async () => { const v = await P.ask("Nova " + def.item, [{ key: "nome", label: "Nome", required: true }], {}, { ok: "Adicionar" }); if (v) { P.lists.add(key, v.nome); P.app.changed("Item adicionado"); } }, "secondary xs")),
          custom.length ? h("div", { class: "chips" }, custom.map((c) => h("span", { class: "chip" }, c, h("button", { type: "button", title: "Remover", text: "✕", onClick: async () => { if (await P.confirm("Remover da lista", `Remover “${c}” da lista? Os itens que já usam esse valor continuam como estão.`, "Remover", true)) { P.lists.remove(key, c); P.app.changed("Item removido"); } } }))))
            : h("p", { class: "fh", text: "Nenhum item personalizado ainda." }));
      }));
    const enc = card(cardTitle("Encargos sobre salários", "CLT: férias, 13º e FGTS (no Simples Nacional, anexos I a III, o INSS patronal é 0%). Pró-labore: 11% de INSS."),
      h("div", { class: "fg c3" }, this.ENC.map(([k, l]) => mk([k, l, 1]))), h("div", { class: "right" }, btn("Restaurar encargos padrão", () => { pg.db.setMany(SEED.ENCARGOS_PADRAO); P.app.changed("Encargos restaurados"); }, "ghost")));
    const tutOn = Math.floor(fnum(cfg.tutorial_nao_mostrar, 0)) < 1;
    const chk = h("input", { type: "checkbox", checked: tutOn });
    chk.addEventListener("change", () => { pg.db.setCfg("tutorial_nao_mostrar", chk.checked ? 0 : 1); P.ui.toast(chk.checked ? "Tutorial será exibido ao abrir" : "Tutorial desativado na abertura"); });
    const tut = card(cardTitle("Tutorial", "Um passeio rápido por cada tela do programa, com a ordem recomendada de uso."),
      h("div", { class: "bar" }, btn("Ver o tutorial agora", () => P.app.tutorial.start()), h("label", { class: "chk" }, chk, h("span", { text: "Mostrar o tutorial sempre que abrir o programa" }))));
    const dados = card(cardTitle("Dados e backup", P.app.db.persistent ? "Seus dados ficam salvos neste aparelho (no navegador). Faça backups com frequência." : "Atenção: este navegador não permite salvar dados. Use backups para não perder nada."),
      h("div", { class: "btngrid" }, btn("Importar planilha Excel (.xlsm)", () => this.importar(pg)), btn("Fazer backup", () => this.backup(pg), "secondary"), btn("Restaurar backup", () => this.restaurar(pg), "secondary"),
        btn("Carregar exemplo", () => this.exemplo(pg), "secondary"), P.app.canInstall() ? btn("Instalar como aplicativo", () => P.app.install(), "secondary") : null, btn("Apagar todos os dados", () => this.apagar(pg), "danger")));
    const sy = P.sync, dbx = sy.providers.dropbox;
    const keyInp = h("input", { class: "in", type: "text", placeholder: "fornecida pelo administrador", autocomplete: "off", value: sy.s.dropboxKey || P.SYNC_DROPBOX_KEY || "" });
    const folderInp = h("input", { class: "in", type: "text", placeholder: "ex.: Precifica-Equipe", autocomplete: "off", value: dbx.folder() });
    const saveAdv = () => { if (!P.SYNC_DROPBOX_KEY) sy.s.dropboxKey = keyInp.value.trim(); sy.s.dropboxFolder = folderInp.value.trim(); sy.save(); dbx.folderOk = null; };
    keyInp.addEventListener("change", saveAdv); folderInp.addEventListener("change", saveAdv);
    const stTxt = !sy.connected ? "Não conectado. Os dados ficam só neste aparelho." : `Conectado ao Dropbox. ${sy.label()}${sy.state === "error" ? " – " + sy.msg : ""}`;
    const baked = !!(P.SYNC_DROPBOX_KEY);
    const steps = h("ol", { class: "usteps" },
      h("li", { html: "<b>Aceite o convite</b> da pasta compartilhada. O administrador envia o convite para o seu e-mail; abra o e-mail do Dropbox e clique em <b>Aceitar</b> (ou entre em dropbox.com › <b>Compartilhado</b>). Se não recebeu, peça um novo convite." }),
      h("li", { html: "Toque em <b>Conectar ao Dropbox</b>, entre com a sua conta e toque em <b>Permitir</b>." }),
      h("li", { html: "Pronto! Tudo o que você alterar aparece para as outras pessoas e vice-versa. Funciona offline e sincroniza quando voltar a ter internet." }));
    const adv = h("details", { class: "guide" }, h("summary", { text: "Avançado" }), h("div", { class: "fg" }, baked ? null : P.field({ label: "Chave do app Dropbox (App key)", help: "Fornecida pelo administrador." }, keyInp), P.field({ label: "Pasta compartilhada no Dropbox", help: "Nome da pasta que você aceitou no convite. Deixe como veio." }, folderInp)));
    const syncCard = card(cardTitle("Sincronização entre aparelhos e pessoas (Dropbox)", "Mantém o celular, o computador e a equipe com os mesmos dados."),
      h("p", { class: "msg", text: stTxt }), sy.connected ? null : steps,
      h("div", { class: "bar" }, sy.connected ? [btn("Sincronizar agora", () => sy.run({ interactive: true }).then(() => pg.rerender()).catch((e) => P.info("Sincronização", e.message, "danger"))), btn("Desconectar", () => { sy.disconnect(); pg.rerender(); }, "secondary")]
        : [btn("Conectar ao Dropbox", () => { saveAdv(); sy.connect().catch((e) => P.info("Não foi possível conectar", e.message, "danger")); })]),
      h("p", { class: "fh", text: "Se aparecer erro ao conectar, a chave do app Dropbox pode estar errada: avise o administrador." }),
      h("p", { class: "fh", text: "Privacidade: o Dropbox vai informar que o app pode acessar arquivos. O app só lê e grava o arquivo precifica-dados.json na pasta compartilhada." }), adv);    const sobre = card(h("h3", { text: `${P.APP_NAME} ${P.APP_VERSION}` }), h("p", { class: "cs", text: `Desenvolvido pela ${P.APP_AUTHOR} (projeto de extensão PROEX – UniBrasil) como alternativa à Planilha de Precificação EG3 para quem não tem Microsoft Excel. Os cálculos seguem a planilha R02, com as correções apontadas no relatório final do projeto.` }));
    return [empresa, params, listas, enc, tut, syncCard, dados, sobre];
  },
  salvar() {
    const vals = {};
    for (const [k, w] of Object.entries(this.els)) {
      let v = w.value.trim();
      if (k.startsWith("enc_") || this.PARAMS.some((p) => p[0] === k)) v = fnum(v);
      vals[k] = v;
    }
    P.app.db.setMany(vals);
    P.app.changed("Configurações salvas");
  },
  async escolherLogo(pg) {
    const f = await pickFile("image/*");
    if (!f) return;
    try {
      const url = await readData(f, "DataURL");
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, 600 / Math.max(img.width, img.height));
      const cv = h("canvas", { width: Math.round(img.width * k), height: Math.round(img.height * k) });
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      pg.db.setCfg("empresa_logo", cv.toDataURL(f.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.92));
      P.app.changed("Logotipo atualizado");
    } catch (e) { P.info("Não foi possível usar a imagem", String(e.message || e), "danger"); }
  },
  async backup(pg) {
    pg.db._flush();
    download(`precifica_backup_${P.todayISO().replace(/-/g, "")}.json`, pg.db.exportData());
    try { localStorage.setItem("precifica.lastBackup", String(Date.now())); } catch (e) { /* ok */ }
    P.ui.toast("Backup salvo");
  },
  async restaurar(pg) {
    const f = await pickFile(".json,application/json");
    if (!f) return;
    if (!(await P.confirm("Restaurar backup", "Os dados atuais serão substituídos pelos do backup (uma cópia de segurança dos dados atuais é baixada antes). Continuar?", "Restaurar", true))) return;
    try {
      const txt = await readText(f);
      download(`precifica_antes_de_restaurar_${P.todayISO().replace(/-/g, "")}.json`, pg.db.exportData());
      pg.db.importData(txt);
      P.app.changed("Backup restaurado");
    } catch (e) { P.info("Erro ao restaurar", String(e.message || e), "danger"); }
  },
  async exemplo(pg) {
    if (await P.confirm("Carregar exemplo", "Adiciona um eletricista (pró-labore de R$ 4.000), custos fixos e o serviço “Instalação de chuveiro elétrico” com ficha técnica e previsão de vendas, para você explorar o app. Continuar?", "Carregar")) {
      pg.db.loadExample(); P.app.changed("Exemplo carregado");
    }
  },
  async apagar(pg) {
    if (await P.confirm("Apagar todos os dados", "Todos os cadastros, propostas e configurações serão apagados (um backup é baixado antes). Tem certeza?", "Apagar tudo", true)) {
      download(`precifica_antes_de_apagar_${P.todayISO().replace(/-/g, "")}.json`, pg.db.exportData());
      pg.db.resetAll(); P.app.changed("Dados apagados");
    }
  },
  async importar(pg) {
    const f = await pickFile(".xlsm,.xlsx");
    if (!f) return;
    if (!(await P.confirm("Importar planilha", "Os dados da planilha serão mesclados aos atuais (itens com o mesmo nome são atualizados). Um backup é baixado antes. Continuar?", "Importar"))) return;
    try {
      P.ui.toast("Lendo a planilha…", "info", 8000);
      const buf = await readData(f, "ArrayBuffer");
      const XLSX = await P.loadXLSX();
      download(`precifica_antes_de_importar_${P.todayISO().replace(/-/g, "")}.json`, pg.db.exportData());
      const rep = P.importXlsx(pg.db, XLSX.read(buf, { type: "array", cellFormula: false, cellDates: false }), XLSX);
      P.app.changed("Planilha importada");
      const txt = Object.entries(rep).filter(([, v]) => v).map(([k, v]) => `• ${(k.replace(/_/g, " ").charAt(0).toUpperCase() + k.replace(/_/g, " ").slice(1))}: ${v}`).join("\n");
      P.info("Importação concluída", txt || "Nenhum dado encontrado na planilha.", "ok");
    } catch (e) { P.info("Erro ao importar", String(e.message || e), "danger"); }
  },
});
