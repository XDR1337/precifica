"use strict";
/* Precifica Web - telas: Painel, Servicos e fichas, Insumos, Equipe, Custos fixos, Capacidade, Revenda. */
P.pages = {};
P.definePage = (name, def) => { P.pages[name] = def; def.name = name; };
const { h, btn, card, cardTitle, kpis, callout, table, seg, progress, searchBox, filterRows } = P;
const { fnum, money, num, pct, pctN, numInput, safeDiv, M, M4, N0, N2, PC } = P;
const SEED = P.SEED;
const mcTag = P.mcTag = (v) => (v < 0 ? "neg" : v < 0.2 ? "warn" : null);
const PRIMARY = "#FF9900", NAVY = "#1B2A3D", STEEL = "#52617F", GREEN = "#15803D", RED = "#C62828";
P.colors = { PRIMARY, NAVY, STEEL, GREEN, RED };

/** Reajuste de precos em lote (%): P.bulkAdjust({ title, table, field, label, rows, groups }) */
P.bulkAdjust = async function ({ title, table, field, label, rows, groups }) {
  groups = groups || [{ name: "Todos", test: () => true }];
  const opts = groups.map((g) => `${g.name} (${rows.filter(g.test).length})`);
  const v = await P.ask(title, [
    { key: "pct", label: "Reajuste (%)", kind: "num", required: true, help: "Use um valor positivo para aumentar (ex.: 5) ou negativo para reduzir (ex.: -3)." },
    { key: "grupo", label: "Aplicar em", kind: "choice", options: opts }], { pct: 5, grupo: opts[0] }, { ok: "Continuar", sub: `Altera o campo “${label}”.` });
  if (!v) return false;
  const g = groups[Math.max(0, opts.indexOf(v.grupo))];
  const alvo = rows.filter(g.test);
  if (!alvo.length) { P.ui.toast("Nenhum item nesse grupo", "warn"); return false; }
  if (!v.pct) { P.ui.toast("Informe um percentual diferente de zero", "warn"); return false; }
  const f = 1 + v.pct / 100, ex = alvo[0];
  const ok = await P.confirm("Confirmar reajuste", `${alvo.length} item(ns) terão o campo “${label}” alterado em ${P.num(v.pct, 2)}%.\nExemplo: ${ex.nome || ex.descricao}: ${P.money(ex[field])} → ${P.money(ex[field] * f)}.\n\nA alteração fica registrada como edição recente (e sincroniza com a equipe).`, "Reajustar");
  if (!ok) return false;
  for (const r of alvo) P.app.db.save(table, { id: r.id, [field]: P.round2(fnum(r[field]) * f) });
  P.app.changed(`${alvo.length} preço(s) reajustado(s)`);
  return true;
};
/** Lembrete de backup: so quando nao ha sincronizacao e ja existem dados. */
P.backupDue = function (eng) {
  try {
    if (P.sync && P.sync.connected) return false;
    if (!(eng.servicos.length || eng.revendas.length || P.app.db.all("propostas").length)) return false;
    const last = +localStorage.getItem("precifica.lastBackup") || 0, snooze = +localStorage.getItem("precifica.backupSnooze") || 0;
    return Date.now() - last > 14 * 864e5 && Date.now() > snooze;
  } catch (e) { return false; }
};

// ====================================================================== PAINEL
P.definePage("Painel", {
  subtitle: "Visão geral do mês: quanto você vai faturar, quanto sobra e se os preços cobrem os custos.",
  actions: () => [btn("Nova proposta", () => P.pages["Propostas"].newProposal(), "secondary"), btn("Relatório em PDF", () => P.app.show("Exportar PDF"))],
  render(pg) {
    const e = pg.eng, rel = e.relatorio(), cap = e.capacidade();
    const k = kpis([
      { title: "Faturamento previsto", value: money(rel.faturamento), sub: `${num(rel.qtd_servicos, 0)} serviços previstos`, accent: NAVY },
      { title: "Margem de contribuição", value: pct(rel.mc_pct), sub: money(rel.mc) + " no mês", accent: PRIMARY },
      { title: "Lucro operacional", value: money(rel.lucro), sub: pct(rel.lucro_pct) + " do faturamento", color: rel.lucro >= 0 ? GREEN : RED, accent: GREEN },
      { title: "Ponto de equilíbrio", value: money(rel.pe), sub: "vender pelo menos isto no mês", accent: STEEL },
      { title: "Capacidade vendida", value: pct(cap.vendidas_pct), sub: `${num(cap.alocadas, 0)} de ${num(cap.efetivas_equipe, 0)} h efetivas`, color: cap.vendidas_pct > 1 ? RED : NAVY, accent: PRIMARY },
    ]);
    const chart = card(cardTitle("Resultado do mês", "Faturamento, custos e lucro previstos"),
      h("div", { html: P.chart.bars(["Faturamento", "Deduções", "Custos variáveis", "Custos fixos", "Lucro"], [rel.faturamento, rel.deducoes, rel.cv, rel.cf, rel.lucro],
        [PRIMARY, "#94A3B8", NAVY, STEEL, rel.lucro >= 0 ? "#16A34A" : "#DC2626"]) }));
    const steps = e.checklist();
    const done = steps.filter((s) => s[1]).length;
    const stepsCard = card(cardTitle("Primeiros passos", "Complete as etapas para ter preços confiáveis"), progress(done / steps.length),
      h("ul", { class: "steps" }, steps.map(([txt, ok, page], i) => h("li", { class: ok ? "ok" : "" },
        h("i", { text: ok ? "✓" : String(i + 1) }), h("span", { text: txt }), ok ? null : btn("Abrir", () => P.app.show(page), "ghost sm")))));
    const rows = e.itens().map((it) => {
      const sug = e.precoSugerido(it.tipo, it.id);
      let sit, tag;
      if (it.tipo === "servico" && !it.tem_ficha) { sit = "Sem ficha técnica (custo zerado)"; tag = "muted"; }
      else if (it.preco <= 0) { sit = "Defina o preço atual"; tag = "warn"; }
      else if (sug && it.preco < sug * 0.98) { sit = `Abaixo do sugerido (${pct(safeDiv(it.preco - sug, sug))})`; tag = "neg"; }
      else if (it.mc < 0) { sit = "Prejuízo em cada venda"; tag = "neg"; }
      else { sit = "Preço cobre os custos e o lucro"; tag = "good"; }
      return { id: it.id, tipo: it.tipo, tipo_txt: it.tipo === "servico" ? "Serviço" : "Revenda", nome: it.nome, preco: it.preco, sug, mc_pct: it.mc_pct, situacao: sit, _tag: tag };
    });
    const tbl = card(cardTitle("Seus preços estão saudáveis?", "Preço atual comparado ao preço sugerido (que cobre custos, impostos, taxas e o lucro desejado). Toque em um item para abrir a análise."),
      table([{ key: "tipo_txt", label: "Tipo", hm: true }, { key: "nome", label: "Serviço / produto", pri: true }, { key: "preco", label: "Preço atual", align: "r", fmt: M },
        { key: "sug", label: "Preço sugerido", align: "r", fmt: M }, { key: "mc_pct", label: "Margem contrib.", align: "r", fmt: PC }, { key: "situacao", label: "Situação" }], rows,
      { onOpen: (r) => P.app.openAnalysis(r.tipo, r.id), empty: "Cadastre seus serviços em “Serviços e fichas”." }));
    const lembrete = P.backupDue(e) ? h("div", { class: "callout warn remind" }, h("p", { text: "Faz tempo que você não faz um backup (ou nunca fez). Seus dados ficam só neste aparelho." }),
      h("div", { class: "bar" }, btn("Fazer backup agora", () => P.pages["Configurações"].backup(P.app.pageCtx("Configurações")).then(() => P.app.draw(pg)), "primary sm"),
        btn("Lembrar em 7 dias", () => { try { localStorage.setItem("precifica.backupSnooze", String(Date.now() + 7 * 864e5)); } catch (e2) { /* ok */ } P.app.draw(pg); }, "ghost sm"))) : null;
    return [lembrete, k, callout(rel.analise, rel.nivel), h("div", { class: "cols32" }, chart, stepsCard), tbl];
  },
});

// ====================================================================== SERVICOS + FICHA TECNICA
P.definePage("Serviços e fichas", {
  subtitle: "Cadastre cada serviço e monte a ficha técnica: horas de mão de obra + insumos. O app calcula o custo direto e o preço sugerido na hora.",
  actions: () => [btn("Reajustar preços", () => P.bulkAdjust({ title: "Reajustar preços de venda dos serviços", table: "servicos", field: "preco", label: "Preço atual", rows: P.app.engine.servicos }), "secondary"), btn("+ Novo serviço", () => P.pages["Serviços e fichas"].novo())],
  state: { cur: null, detail: false, q: "" },
  render(pg) {
    const e = pg.eng, st = this.state;
    const list = e.servicos.map((s) => ({ id: s.id, nome: s.nome, preco: fnum(s.preco) }));
    if (st.cur && !list.some((r) => r.id === st.cur)) { st.cur = null; st.detail = false; }
    if (st.cur === null && list.length && P.fine() && matchMedia("(min-width:900px)").matches) st.cur = list[0].id;
    const search = searchBox("Pesquisar serviço…", (q) => { st.q = q; draw(); }, st.q);
    const listBox = h("div");
    const draw = () => {
      const rows = filterRows(list, st.q, ["nome"]).map((r) => ({ ...r, _cls: r.id === st.cur ? "sel" : "" }));
      listBox.replaceChildren(table([{ key: "nome", label: "Serviço", pri: true }, { key: "preco", label: "Preço", align: "r", fmt: M }], rows,
        { onOpen: (r) => { st.cur = r.id; st.detail = true; pg.rerender(); }, empty: "Nenhum serviço" }));
    };
    draw();
    const left = h("aside", { class: "md-list card" }, search, listBox);
    const right = h("div", { class: "md-detail" });
    if (st.cur) right.append(...this.detail(pg, st.cur));
    else right.append(P.empty("Selecione um serviço à esquerda ou clique em “+ Novo serviço”."));
    return h("div", { class: "md" + (st.detail && st.cur ? " show-detail" : "") }, left, right);
  },
  detail(pg, sid) {
    const e = pg.eng, st = this.state;
    const s = e.servicos.find((x) => x.id === sid);
    const f = e.ficha(sid), it = e.item("servico", sid), sug = e.precoSugerido("servico", sid);
    const back = btn("‹ Voltar à lista", () => { st.detail = false; pg.rerender(); }, "ghost back");
    const k = kpis([
      { title: "Custo direto", value: money(f.total), sub: `MO ${money(f.custo_mod)} + materiais ${money(f.custo_md)}`, accent: NAVY },
      { title: "Margem no preço atual", value: it.preco ? pct(it.mc_pct) : "—", sub: money(it.mc) + " por serviço", color: it.mc < 0 ? RED : NAVY, accent: PRIMARY },
      { title: "Preço sugerido", value: sug ? money(sug) : "—", sub: `lucro de ${P.pctN(e.c("lucro_desejado_pct", 15), 0)} + rateio de ${pct(e.rateioPct())}`, accent: GREEN },
      { title: "Horas de mão de obra", value: `${num(f.horas, 2)} h`, sub: `${num(f.horas * it.previsao, 1)} h no mês`, accent: PRIMARY },
    ]);
    // dados do servico
    const fields = [{ key: "nome", label: "Nome do serviço", span: 2 }, { key: "unidade", label: "Unidade", kind: "combo", options: ["Serviço", "Unidade", "Metro", "Hora", "Ponto", "Diária", "Visita"] },
      { key: "preco", label: "Preço atual (R$)", kind: "money" }, { key: "imposto_pct", label: "Impostos sobre vendas (%)", kind: "pct" }, { key: "cartao_pct", label: "Taxa da maquininha (%)", kind: "pct" },
      { key: "app_pct", label: "Taxa de aplicativo (%)", kind: "pct" }, { key: "comissao_pct", label: "Comissão (%)", kind: "pct" }, { key: "previsao", label: "Previsão de vendas/mês", kind: "num" },
      { key: "descricao", label: "Descrição para propostas", kind: "textarea", span: 2, height: 60 }];
    const els = {};
    const grid = h("div", { class: "fg" });
    fields.forEach((fd) => { const inp = P.inp(fd, fd.kind ? (fd.kind === "textarea" ? s[fd.key] : s[fd.key]) : s[fd.key]); els[fd.key] = inp; grid.append(P.field(fd, inp)); });
    const save = () => {
      const nome = els.nome.value.trim();
      if (!nome) return P.ui.toast("Informe o nome do serviço", "warn");
      const row = { id: sid, nome, unidade: els.unidade.value.trim() || "Serviço", descricao: els.descricao.value.trim() };
      for (const k2 of ["preco", "imposto_pct", "cartao_pct", "app_pct", "comissao_pct", "previsao"]) row[k2] = Math.max(0, fnum(els[k2].value));
      pg.db.save("servicos", row);
      P.app.changed("Serviço salvo");
    };
    const dados = card(cardTitle("Dados e preço do serviço", null, [btn("Usar preço sugerido", () => this.usarSugerido(pg, sid), "secondary sm"), btn("Ver análise completa", () => P.app.openAnalysis("servico", sid), "ghost sm")]),
      grid, h("p", { class: "fh", text: "Dica: no Simples Nacional (Anexo III) a alíquota inicial é 6%. Informe a alíquota efetiva do seu enquadramento." }),
      h("div", { class: "right" }, btn("Salvar dados do serviço", save)));
    // mao de obra
    const mo = card(cardTitle("Mão de obra", "Quem executa e quantas horas leva (inclua o tempo no cliente)", btn("+ Adicionar", () => this.addMod(pg, sid), "sm")),
      table([{ key: "nome", label: "Colaborador", pri: true }, { key: "cargo", label: "Cargo", hm: true }, { key: "custo_hora", label: "Custo/hora", align: "r", fmt: M },
        { key: "horas", label: "Horas", align: "r", fmt: N2 }, { key: "total", label: "Custo total", align: "r", fmt: M }], f.mod,
      { onOpen: (r) => this.editLine(pg, r, "ficha_mod", "horas", "Horas de " + r.nome, "Horas atualizadas"), empty: "Adicione quem executa o serviço" }));
    const ins = card(cardTitle("Insumos, materiais e terceiros", "Itens do cadastro de insumos (inclusive deslocamento em km)", btn("+ Adicionar", () => this.addIns(pg, sid), "sm")),
      table([{ key: "descricao", label: "Insumo", pri: true }, { key: "unidade", label: "Medida", hm: true }, { key: "custo_unit", label: "Custo unitário", align: "r", fmt: M4 },
        { key: "quantidade", label: "Qtde", align: "r", fmt: N2 }, { key: "total", label: "Custo total", align: "r", fmt: M }], f.insumos,
      { onOpen: (r) => this.editLine(pg, r, "ficha_insumo", "quantidade", `Quantidade (${r.unidade})`, "Quantidade atualizada"), empty: "Adicione materiais, deslocamento ou terceiros" }));
    const bar = h("div", { class: "detail-bar" }, back, h("h2", { text: s.nome }), h("span", { class: "grow" }),
      btn("Duplicar", () => this.dup(pg, sid), "secondary sm"), btn("Excluir", () => this.excluir(pg, s), "danger sm"));
    return [bar, k, dados, mo, ins];
  },
  async novo() {
    const pg = P.app.pageCtx("Serviços e fichas");
    const v = await P.ask("Novo serviço", [
      { key: "nome", label: "Nome do serviço", required: true, span: 2 },
      { key: "preco", label: "Preço que você cobra hoje (R$)", kind: "money", min: 0, help: "Deixe 0 se ainda não sabe: use o preço sugerido." },
      { key: "previsao", label: "Quantos vende por mês", kind: "num", min: 0 }, { key: "imposto_pct", label: "Impostos sobre vendas (%)", kind: "pct", min: 0 },
      { key: "cartao_pct", label: "Taxa da maquininha (%)", kind: "pct", min: 0 }], { imposto_pct: 6, cartao_pct: 0 }, { sub: "Depois monte a ficha técnica com mão de obra e insumos." });
    if (v) {
      this.state.cur = P.app.db.save("servicos", v); this.state.detail = true;
      P.app.changed("Serviço criado"); P.app.show("Serviços e fichas");
    }
    return pg;
  },
  dup(pg, sid) {
    const s = { ...pg.eng.servicos.find((x) => x.id === sid) };
    delete s.id; s.nome += " (cópia)";
    const nid = pg.db.save("servicos", s);
    for (const l of pg.db.all("ficha_mod", (r) => r.servico_id === sid)) pg.db.save("ficha_mod", { servico_id: nid, equipe_id: l.equipe_id, horas: l.horas });
    for (const l of pg.db.all("ficha_insumo", (r) => r.servico_id === sid)) pg.db.save("ficha_insumo", { servico_id: nid, insumo_id: l.insumo_id, quantidade: l.quantidade });
    this.state.cur = nid;
    P.app.changed("Serviço duplicado");
  },
  async excluir(pg, s) {
    if (await P.confirm("Excluir serviço", `Excluir “${s.nome}” e a ficha técnica?`, "Excluir", true)) {
      pg.db.remove("servicos", s.id); this.state.cur = null; this.state.detail = false;
      P.app.changed("Serviço excluído");
    }
  },
  usarSugerido(pg, sid) {
    const sug = pg.eng.precoSugerido("servico", sid);
    if (!sug) return P.ui.toast("Monte a ficha técnica para calcular o preço sugerido", "warn");
    pg.db.save("servicos", { id: sid, preco: P.round2(sug) });
    P.app.changed(`Preço atualizado para ${money(sug)}`);
  },
  async addMod(pg, sid) {
    const e = pg.eng;
    if (!e.equipe.size) { await P.info("Cadastre a equipe", "Antes, cadastre você e/ou seus colaboradores na tela “Equipe”.", "warn"); return P.app.show("Equipe"); }
    const r = await P.pick("Escolha o colaborador", [{ key: "nome", label: "Nome", pri: true }, { key: "cargo", label: "Cargo" }, { key: "setor", label: "Setor", hm: true },
      { key: "custo_hora", label: "Custo/hora", align: "r", fmt: M }], e.equipeCalc());
    if (!r) return;
    const v = await P.ask("Horas de mão de obra", [{ key: "horas", label: `Horas de ${r.nome} neste serviço`, kind: "num", required: true, min: 0, help: "Ex.: 1,5 = uma hora e meia" }], { horas: 1 }, { ok: "Adicionar" });
    if (v) { pg.db.save("ficha_mod", { servico_id: sid, equipe_id: r.id, horas: v.horas }); P.app.changed("Mão de obra adicionada"); }
  },
  async addIns(pg, sid) {
    const rows = [...pg.eng.insumos.values()].map((r) => P.Engine.insumoCalc(r)).sort((a, b) => a.descricao.toLowerCase() < b.descricao.toLowerCase() ? -1 : 1);
    const r = await P.pick("Escolha o insumo", [{ key: "descricao", label: "Descrição", pri: true }, { key: "unidade", label: "Unidade", hm: true }, { key: "custo_medida", label: "Custo por medida", align: "r", fmt: M4 }],
      rows, { sub: "Digite para filtrar. Para um item novo, cadastre-o antes em “Insumos e preços”." });
    if (!r) return;
    const v = await P.ask("Quantidade", [{ key: "quantidade", label: `Quantidade de “${r.descricao}” (${r.unidade})`, kind: "num", required: true, min: 0 }], { quantidade: 1 }, { ok: "Adicionar" });
    if (v) { pg.db.save("ficha_insumo", { servico_id: sid, insumo_id: r.id, quantidade: v.quantidade }); P.app.changed("Insumo adicionado"); }
  },
  async editLine(pg, r, table, key, label, msg) {
    const v = await P.ask("Editar", [{ key, label, kind: "num", required: true, min: 0 }], r, { extra: [{ text: "Remover", kind: "danger-ghost", fn: () => { pg.db.remove(table, r.id); P.app.changed("Item removido"); } }] });
    if (v) { pg.db.save(table, { id: r.id, [key]: v[key] }); P.app.changed(msg); }
  },
});

// ====================================================================== lista simples (insumos, equipe, revenda, clientes)
P.crud = function (pg, o) {
  const st = (o.state = o.state || { q: "" });
  const draw = () => {
    const rows = filterRows(o.rows(pg), st.q, o.searchKeys);
    box.replaceChildren(table(o.columns, rows, { onOpen: (r) => o.edit(r), empty: o.empty }));
  };
  const box = h("div");
  draw();
  const bar = h("div", { class: "bar" }, o.search === false ? null : searchBox(o.searchText || "Pesquisar…", (q) => { st.q = q; draw(); }, st.q), h("span", { class: "grow" }), ...(o.barExtra || []));
  return [o.top ? o.top(pg) : null, bar, card(box)];
};
P.rowForm = async function (title, fields, values, o) {
  return P.ask(title, fields, values, o);
};

// ====================================================================== INSUMOS
P.definePage("Insumos e preços", {
  subtitle: `Materiais, deslocamento, terceiros e preços de mercado usados nas fichas técnicas. Já vem com ${SEED.PRECOS_REFERENCIA.length} preços de referência de serviços elétricos levantados pela EG3 (Curitiba, set/2026).`,
  actions: () => [btn("Reajustar preços", () => P.pages["Insumos e preços"].reajustar(), "secondary"), btn("+ Novo insumo", () => P.pages["Insumos e preços"].novo())],
  FIELDS: [
    { key: "descricao", label: "Descrição", required: true, span: 2 }, { key: "unidade", label: "Unidade de medida", kind: "combo", options: SEED.UNIDADES },
    { key: "categoria", label: "Categoria", kind: "combo", options: ["Material", "Mão de obra terceirizada", "Deslocamento", "Referência de mercado", "Outros"] },
    { key: "custo", label: "Custo pago (R$)", kind: "money", required: true, min: 0, help: "Quanto você paga pela quantidade bruta." },
    { key: "qtde_bruta", label: "Quantidade bruta", kind: "num", min: 0, help: "Quantidade comprada (ex.: rolo de 100 m)." },
    { key: "qtde_liquida", label: "Quantidade líquida (aproveitada)", kind: "num", min: 0, help: "O que realmente é usado após perdas (ex.: 95 m)." },
    { key: "obs", label: "Observações", span: 2 }],
  render(pg) {
    return P.crud(pg, { state: this.state = this.state || { q: "" }, empty: "Nenhum insumo cadastrado.", searchText: "Pesquisar insumo…", searchKeys: ["descricao", "unidade", "categoria"],
      rows: (p) => [...p.eng.insumos.values()].map((r) => P.Engine.insumoCalc(r)),
      columns: [{ key: "descricao", label: "Descrição", pri: true }, { key: "unidade", label: "Unidade", hm: true }, { key: "qtde_bruta", label: "Qtd bruta", align: "r", fmt: N2, hm: true },
        { key: "qtde_liquida", label: "Qtd líquida", align: "r", fmt: N2, hm: true }, { key: "custo", label: "Custo pago", align: "r", fmt: M },
        { key: "fator", label: "Fator perda", align: "r", fmt: (v) => num(v, 3), hm: true }, { key: "custo_medida", label: "Custo por medida", align: "r", fmt: M4 },
        { key: "categoria", label: "Categoria", hm: true },
        { key: "_u", label: "Preço atualizado", hm: true, fmt: (u) => (u ? (Date.now() - u < 864e5 ? "hoje" : `há ${Math.floor((Date.now() - u) / 864e5)} dias`) : "referência EG3") }],
      edit: (r) => this.editar(pg, r) });
  },
  reajustar() {
    const rows = [...P.app.engine.insumos.values()];
    const cats = [...new Set(rows.map((r) => r.categoria || "Sem categoria"))].sort();
    return P.bulkAdjust({ title: "Reajustar preços dos insumos", table: "insumos", field: "custo", label: "Custo pago", rows,
      groups: [{ name: "Todos os insumos", test: () => true }, { name: "Só os que eu cadastrei ou alterei", test: (r) => r._u > 0 }, ...cats.map((c) => ({ name: "Categoria: " + c, test: (r) => (r.categoria || "Sem categoria") === c }))] });
  },
  fix(v) { v.qtde_bruta = v.qtde_bruta || 1; v.qtde_liquida = v.qtde_liquida || v.qtde_bruta; return v; },
  async novo(values) {
    const v = await P.ask("Novo insumo", this.FIELDS, values || { unidade: "Unidade", qtde_bruta: 1, qtde_liquida: 1, categoria: "Material" }, { sub: "O custo por medida é calculado assim: custo ÷ quantidade bruta × fator de perda." });
    if (v) { P.app.db.save("insumos", this.fix(v)); P.app.changed("Insumo salvo"); }
  },
  async editar(pg, r) {
    const v = await P.ask("Editar insumo", this.FIELDS, r, { extra: [
      { text: "Excluir", kind: "danger-ghost", fn: () => this.excluir(r) }, { text: "Duplicar", kind: "ghost", fn: () => this.novo({ ...r, descricao: r.descricao + " (cópia)" }) }] });
    if (v) { v.id = r.id; P.app.db.save("insumos", this.fix(v)); P.app.changed("Insumo atualizado"); }
  },
  async excluir(r) {
    if (await P.confirm("Excluir insumo", `Excluir “${r.descricao}”? Ele também sai das fichas técnicas.`, "Excluir", true)) { P.app.db.remove("insumos", r.id); P.app.changed("Insumo excluído"); }
  },
});

// ====================================================================== EQUIPE
P.definePage("Equipe", {
  subtitle: "Cadastre quem trabalha na empresa, inclusive você (pró-labore). O custo-hora de cada pessoa entra na ficha técnica dos serviços.",
  actions: () => [btn("+ Novo colaborador", () => P.pages["Equipe"].novo())],
  FIELDS: [
    { key: "nome", label: "Nome", required: true }, { key: "cargo", label: "Cargo / função" },
    { key: "setor", label: "Setor", kind: "choice", options: SEED.SETORES, help: "Produtivo = executa serviços; Administrativo = entra nos custos fixos." },
    { key: "contratacao", label: "Contratação", kind: "choice", options: SEED.CONTRATACOES, help: "CLT: encargos completos · Pró-labore: INSS · PJ/Estágio: sem encargos." },
    { key: "salario", label: "Salário / pró-labore (R$)", kind: "money", required: true, min: 0 }, { key: "carga_horaria", label: "Carga horária mensal (h)", kind: "num", min: 1 },
    { key: "vale_transporte", label: "Vale-transporte (R$)", kind: "money", min: 0 }, { key: "vale_refeicao", label: "Vale-refeição (R$)", kind: "money", min: 0 },
    { key: "convenio", label: "Convênio médico (R$)", kind: "money", min: 0 }],
  render(pg) {
    const eq = pg.eng.equipeCalc();
    const prod = eq.filter((c) => c.setor === "Produtivo"), adm = eq.filter((c) => c.setor !== "Produtivo");
    const media = safeDiv(prod.reduce((a, c) => a + c.custo_hora, 0), prod.length);
    const top = () => kpis([
      { title: "Custo total da folha", value: money(eq.reduce((a, c) => a + c.total, 0)), sub: `${eq.length} pessoa(s)`, accent: NAVY },
      { title: "Equipe produtiva", value: money(prod.reduce((a, c) => a + c.total, 0)), sub: `${prod.length} pessoa(s) executando serviços`, accent: PRIMARY },
      { title: "Equipe administrativa", value: money(adm.reduce((a, c) => a + c.total, 0)), sub: "vai para os custos fixos", accent: STEEL },
      { title: "Custo-hora médio produtivo", value: money(media), sub: `com produtividade de ${pct(pg.eng.produtividade())}`, accent: PRIMARY }], 4);
    return P.crud(pg, { state: this.state = this.state || { q: "" }, top, empty: "Cadastre você e sua equipe para calcular o custo da mão de obra.", searchKeys: ["nome", "cargo", "setor"],
      searchText: "Pesquisar pessoa…", rows: () => eq.map((c) => ({ ...c, encargos: c.enc_sociais + c.enc_trab })),
      barExtra: [h("span", { class: "fh", text: "Os percentuais de encargos podem ser ajustados em Configurações › Encargos." })],
      columns: [{ key: "nome", label: "Nome", pri: true }, { key: "cargo", label: "Cargo", hm: true }, { key: "setor", label: "Setor" }, { key: "contratacao", label: "Contratação", hm: true },
        { key: "salario", label: "Salário", align: "r", fmt: M }, { key: "encargos", label: "Encargos", align: "r", fmt: M, hm: true }, { key: "beneficios", label: "Benefícios", align: "r", fmt: M, hm: true },
        { key: "total", label: "Custo total", align: "r", fmt: M }, { key: "carga_horaria", label: "Horas/mês", align: "r", fmt: N0, hm: true }, { key: "valor_hora", label: "Valor/hora", align: "r", fmt: M, hm: true },
        { key: "custo_hora", label: "Custo-hora na ficha", align: "r", fmt: M }],
      edit: (r) => this.editar(r) });
  },
  async novo() {
    const v = await P.ask("Novo colaborador", this.FIELDS, { setor: "Produtivo", contratacao: "CLT", carga_horaria: 176 });
    if (v) { P.app.db.save("equipe", v); P.app.changed("Colaborador salvo"); }
  },
  async editar(r) {
    const v = await P.ask("Editar colaborador", this.FIELDS, r, { extra: [{ text: "Excluir", kind: "danger-ghost", fn: () => this.excluir(r) }] });
    if (v) { v.id = r.id; P.app.db.save("equipe", v); P.app.changed("Colaborador atualizado"); }
  },
  async excluir(r) {
    if (await P.confirm("Excluir colaborador", `Excluir “${r.nome}”? As horas dele saem das fichas técnicas.`, "Excluir", true)) { P.app.db.remove("equipe", r.id); P.app.changed("Colaborador excluído"); }
  },
});

// ====================================================================== CUSTOS FIXOS
P.definePage("Custos fixos", {
  subtitle: "Despesas que existem mesmo sem vender (aluguel, contador, internet…). Elas são rateadas no preço de cada serviço proporcionalmente ao faturamento previsto.",
  CF: [{ key: "descricao", label: "Descrição", required: true, span: 2 }, { key: "valor", label: "Valor mensal (R$)", kind: "money", min: 0 }],
  IM: [{ key: "descricao", label: "Bem / categoria", required: true, span: 2 }, { key: "valor", label: "Valor do bem (R$)", kind: "money", min: 0 }, { key: "vida_util", label: "Vida útil (anos)", kind: "num", min: 0.1 }],
  render(pg) {
    const e = pg.eng, cf = e.custosFixos();
    const k = kpis([{ title: "Total de custos fixos", value: money(cf.total), sub: `rateio de ${pct(e.rateioPct())} no preço`, accent: NAVY },
      { title: "Despesas lançadas", value: money(cf.manuais), sub: "despesas desta tela", accent: PRIMARY },
      { title: "Pessoal adm. + ociosidade", value: money(cf.adm + cf.ociosidade), sub: `ociosidade: ${money(cf.ociosidade)}`, accent: PRIMARY },
      { title: "Depreciação mensal", value: money(cf.depreciacao), accent: STEEL }], 4);
    const c1 = card(cardTitle("Despesas mensais", "Toque em uma despesa para informar o valor", btn("+ Despesa", () => this.novoCf(), "sm")),
      table([{ key: "descricao", label: "Descrição", pri: true }, { key: "valor", label: "Valor mensal", align: "r", fmt: M }], e.cfRows, { onOpen: (r) => this.editCf(r), empty: "Nenhuma despesa" }));
    const c2 = card(cardTitle("Calculados automaticamente", "Vêm da equipe e do imobilizado"),
      table([{ key: "descricao", label: "Descrição", pri: true }, { key: "valor", label: "Valor mensal", align: "r", fmt: M }], cf.linhas.filter((l) => l[2]).map(([d, v]) => ({ descricao: d, valor: v }))));
    const c3 = card(cardTitle("Imobilizado (depreciação)", "Bens da empresa e sua vida útil", btn("+ Bem", () => this.novoIm(), "sm")),
      table([{ key: "descricao", label: "Bem", pri: true }, { key: "valor", label: "Valor", align: "r", fmt: M }, { key: "vida_util", label: "Vida útil", align: "r", fmt: (v) => `${num(v, 0)} anos`, hm: true },
        { key: "taxa", label: "Taxa/ano", align: "r", fmt: PC, hm: true }, { key: "mensal", label: "Por mês", align: "r", fmt: M }], e.depreciacao(), { onOpen: (r) => this.editIm(r), empty: "Nenhum bem" }));
    return [k, h("div", { class: "cols2" }, c1, h("div", { class: "stack" }, c2, c3))];
  },
  async novoCf() { const v = await P.ask("Nova despesa fixa", this.CF); if (v) { P.app.db.save("custos_fixos", v); P.app.changed("Despesa salva"); } },
  async editCf(r) {
    const v = await P.ask("Despesa fixa", this.CF, r, { extra: [{ text: "Excluir", kind: "danger-ghost", fn: async () => { if (await P.confirm("Excluir despesa", `Excluir “${r.descricao}”?`, "Excluir", true)) { P.app.db.remove("custos_fixos", r.id); P.app.changed("Despesa excluída"); } } }] });
    if (v) { v.id = r.id; P.app.db.save("custos_fixos", v); P.app.changed("Despesa atualizada"); }
  },
  async novoIm() { const v = await P.ask("Novo bem", this.IM, { vida_util: 5 }); if (v) { P.app.db.save("imobilizado", v); P.app.changed("Bem salvo"); } },
  async editIm(r) {
    const v = await P.ask("Bem do imobilizado", this.IM, r, { extra: [{ text: "Excluir", kind: "danger-ghost", fn: async () => { if (await P.confirm("Excluir bem", `Excluir “${r.descricao}”?`, "Excluir", true)) { P.app.db.remove("imobilizado", r.id); P.app.changed("Bem excluído"); } } }] });
    if (v) { v.id = r.id; P.app.db.save("imobilizado", v); P.app.changed("Bem atualizado"); }
  },
});

// ====================================================================== CAPACIDADE
P.definePage("Capacidade produtiva", {
  subtitle: "Quantas horas a equipe produtiva consegue vender no mês. Ninguém produz 100% do tempo: a produtividade desconta pausas, deslocamentos entre clientes, orçamentos e imprevistos.",
  render(pg) {
    const e = pg.eng, cap = e.capacidade();
    const f1 = { key: "horas_dia", label: "Horas trabalhadas por dia", kind: "num", help: "sem almoço" };
    const f2 = { key: "dias_mes", label: "Dias trabalhados no mês", kind: "num", help: "sem domingos e feriados" };
    const i1 = P.inp(f1, e.c("horas_dia")), i2 = P.inp(f2, e.c("dias_mes"));
    const p0 = Math.round(e.c("produtividade_pct", 75));
    const lbl = h("span", { class: "fl", text: `Produtividade: ${p0}%` });
    const slider = h("input", { type: "range", min: 30, max: 100, step: 1, value: p0, class: "range" });
    slider.addEventListener("input", () => (lbl.textContent = `Produtividade: ${slider.value}%`));
    const save = () => { pg.db.setMany({ horas_dia: fnum(i1.value, 8), dias_mes: fnum(i2.value, 22), produtividade_pct: parseInt(slider.value) }); P.app.changed("Parâmetros salvos"); };
    const params = card(cardTitle("Parâmetros", "Valem para toda a equipe produtiva"), P.field(f1, i1), P.field(f2, i2), h("label", { class: "fld" }, lbl, slider),
      h("div", { class: "right" }, btn("Salvar parâmetros", save)));
    const res = card(cardTitle("Resultado", "Calculado com a equipe produtiva e a previsão de vendas"), kpis([
      { title: "Colaboradores produtivos", value: num(cap.colaboradores, 0), accent: PRIMARY }, { title: "Horas máximas da equipe", value: `${num(cap.horas_max, 0)} h`, accent: STEEL },
      { title: "Horas efetivas por pessoa", value: `${num(cap.efetivas_membro, 1)} h`, accent: PRIMARY }, { title: "Horas efetivas da equipe", value: `${num(cap.efetivas_equipe, 1)} h`, accent: STEEL },
      { title: "Horas vendidas (previsão)", value: `${num(cap.alocadas, 1)} h`, sub: `${pct(cap.vendidas_pct)} da capacidade`, accent: PRIMARY }, { title: "Ociosidade", value: pct(cap.ociosidade_pct), accent: STEEL }], 2),
    progress(cap.vendidas_pct, cap.vendidas_pct > 1), callout(cap.status, cap.nivel));
    return h("div", { class: "cols23" }, params, res);
  },
});

// ====================================================================== REVENDA
P.definePage("Revenda", {
  subtitle: "Materiais que você compra e revende ao cliente (ex.: disjuntores, tomadas, luminárias).",
  actions: () => [btn("Reajustar preços", () => P.bulkAdjust({ title: "Reajustar preços de venda da revenda", table: "revenda", field: "preco", label: "Preço de venda", rows: P.app.engine.revendas }), "secondary"), btn("+ Novo produto", () => P.pages["Revenda"].novo())],
  FIELDS: [
    { key: "nome", label: "Produto", required: true, span: 2 }, { key: "unidade", label: "Unidade de medida", kind: "combo", options: SEED.UNIDADES },
    { key: "qtde", label: "Quantidade comprada", kind: "num", min: 0, help: "Ex.: caixa com 10 unidades" }, { key: "custo", label: "Valor pago na compra (R$)", kind: "money", min: 0, help: "Valor total pela quantidade" },
    { key: "preco", label: "Preço de venda unitário (R$)", kind: "money", min: 0 }, { key: "imposto_pct", label: "Impostos (%)", kind: "pct", min: 0 },
    { key: "cartao_pct", label: "Maquininha (%)", kind: "pct", min: 0 }, { key: "app_pct", label: "Aplicativo (%)", kind: "pct", min: 0 },
    { key: "comissao_pct", label: "Comissão (%)", kind: "pct", min: 0 }, { key: "previsao", label: "Previsão de vendas/mês", kind: "num", min: 0 }],
  render(pg) {
    return P.crud(pg, { state: this.state = this.state || { q: "" }, empty: "Nenhum produto de revenda cadastrado.", searchText: "Pesquisar produto…", searchKeys: ["nome", "unidade"],
      rows: (p) => p.eng.revendas.map((r) => { const it = p.eng.item("revenda", r.id); return { ...r, custo_unit: it.custo_md, deducoes: it.deducoes, mc: it.mc, mc_pct: it.mc_pct, sug: p.eng.precoSugerido("revenda", r.id), _tag: it.preco ? mcTag(it.mc_pct) : null }; }),
      columns: [{ key: "nome", label: "Produto", pri: true }, { key: "unidade", label: "Unidade", hm: true }, { key: "custo_unit", label: "Custo unitário", align: "r", fmt: M4 },
        { key: "preco", label: "Preço de venda", align: "r", fmt: M }, { key: "deducoes", label: "Deduções", align: "r", fmt: M, hm: true }, { key: "mc", label: "Margem contrib.", align: "r", fmt: M, hm: true },
        { key: "mc_pct", label: "MC %", align: "r", fmt: PC }, { key: "sug", label: "Preço sugerido", align: "r", fmt: M }, { key: "previsao", label: "Venda/mês", align: "r", fmt: N0, hm: true }],
      edit: (r) => this.editar(r) });
  },
  async novo() {
    const v = await P.ask("Novo produto de revenda", this.FIELDS, { unidade: "Unidade", qtde: 1, imposto_pct: 6 });
    if (v) { v.qtde = v.qtde || 1; P.app.db.save("revenda", v); P.app.changed("Produto salvo"); }
  },
  async editar(r) {
    const v = await P.ask("Editar produto", this.FIELDS, r, { extra: [{ text: "Excluir", kind: "danger-ghost", fn: async () => { if (await P.confirm("Excluir produto", `Excluir “${r.nome}”?`, "Excluir", true)) { P.app.db.remove("revenda", r.id); P.app.changed("Produto excluído"); } } }] });
    if (v) { v.id = r.id; v.qtde = v.qtde || 1; P.app.db.save("revenda", v); P.app.changed("Produto atualizado"); }
  },
});
