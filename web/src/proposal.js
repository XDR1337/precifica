"use strict";
/* Precifica Web - Propostas comerciais e editor de proposta tecnica e comercial (5 etapas). */
const { h, btn, card, cardTitle, kpis, callout, table, seg, progress, searchBox, filterRows } = P;
const { fnum, money, num, pct, numInput, safeDiv, M, N0 } = P;
const SEED = P.SEED;
const { PRIMARY, NAVY, GREEN } = P.colors;

/** Dias ate a proposta vencer (negativo = vencida). null se nao houver data. */
P.diasParaVencer = (p, hoje) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.data || "");
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]); d.setDate(d.getDate() + Math.floor(fnum(p.validade_dias, 30)));
  const h0 = new Date(hoje); h0.setHours(0, 0, 0, 0);
  return Math.round((d - h0) / 864e5);
};
const resumo = (t, n = 95) => { t = String(t || "").split(/\s+/).filter(Boolean).join(" "); return t.length <= n ? t : t.slice(0, n - 1) + "…"; };
const AJUDA_TEXTO = "Dica: use {empresa}, {validade_dias}, {numero}, {total} e {cliente} para o programa preencher sozinho  ·  **texto** fica em negrito  ·  uma linha em branco separa os parágrafos";
const ESCOPO_FIELDS = [
  { key: "titulo", label: "Título da etapa", required: true, span: 2, help: "Ex.: Projeto Elétrico  ·  Aparece antes dos dois pontos: “Projeto Elétrico: descrição…”" },
  { key: "texto", label: "Descrição da etapa", kind: "textarea", height: 140, span: 2 },
  { key: "topicos", label: "Tópicos com seta ➢ (um por linha) – opcional", kind: "textarea", height: 110, span: 2, help: "Use para listar itens abaixo da descrição, como no escopo das instalações internas." }];
const SECAO_FIELDS = [
  { key: "titulo", label: "Título da seção", required: true, span: 2, help: "Aparece em negrito e sublinhado. Ex.: PREMISSAS TÉCNICAS, FORA DO ESCOPO, GARANTIA" },
  { key: "texto", label: "Texto", kind: "textarea", height: 230, span: 2, help: AJUDA_TEXTO },
  { key: "nova_pagina", label: "Começar esta seção em uma nova página?", kind: "choice", options: ["Não", "Sim"], span: 2 }];
const PARCELA_FIELDS = [
  { key: "rotulo", label: "Nome da parcela", required: true, help: "Ex.: Entrada, Parcela 2" }, { key: "valor", label: "Valor (R$)", kind: "money", min: 0 },
  { key: "detalhe", label: "Detalhe entre parênteses", span: 2, help: "Ex.: 30 dias após o aceite  ·  sai impresso como “Parcela 2: R$ 5.611,67 (30 dias após o aceite).”" }];
const ITEM_FIELDS = [
  { key: "descricao", label: "Descrição do item", kind: "textarea", height: 90, required: true, span: 2 }, { key: "quantidade", label: "Quantidade", kind: "num", min: 0 },
  { key: "unidade", label: "Unidade", kind: "list", listKey: "unidades_proposta" },
  { key: "valor_unit", label: "Valor unitário (R$)", kind: "money", min: 0, span: 2, help: "No PDF sai só o valor do item (quantidade × valor unitário). Quando a quantidade não é 1, ela aparece entre parênteses na descrição." }];
const secaoToForm = (it) => ({ ...it, nova_pagina: it.nova_pagina ? "Sim" : "Não" });
const secaoFromForm = (v) => ({ ...v, nova_pagina: v.nova_pagina === "Sim" });

/** Lista editavel de blocos (adicionar, editar, duplicar, remover, reordenar). */
P.listEditor = function ({ items, fields, summary, dialogTitle, defaults = {}, toForm, fromForm, onChange, addText = "+ Adicionar", empty = "Nada cadastrado ainda.", adders, wide = true, sub }) {
  const L = { items: (items || []).map((i) => ({ ...i })) };
  const list = h("div", { class: "li-list" });
  const change = () => { draw(); onChange && onChange(); };
  const form = async (values, title) => {
    const v = await P.ask(title, fields, toForm ? toForm(values) : values, { wide, sub });
    return v ? (fromForm ? fromForm(v) : v) : null;
  };
  const addNew = async () => { const v = await form({ ...defaults }, `Novo: ${dialogTitle}`); if (v) { L.items.push(v); change(); } };
  const edit = async (i) => { const v = await form(L.items[i], `Editar: ${dialogTitle}`); if (v) { L.items[i] = { ...L.items[i], ...v }; change(); } };
  const move = (i, d) => { const j = i + d; if (j >= 0 && j < L.items.length) { [L.items[i], L.items[j]] = [L.items[j], L.items[i]]; change(); } };
  const dup = (i) => { L.items.splice(i + 1, 0, { ...L.items[i] }); change(); };
  const del = async (i) => { if (await P.confirm("Remover", "Remover este item da lista?", "Remover", true)) { L.items.splice(i, 1); change(); } };
  L.edit = edit;
  function draw() {
    list.replaceChildren(...(L.items.length ? L.items.map((it, i) => {
      const s = summary(it, i);
      return h("div", { class: "li" }, h("button", { type: "button", class: "li-main", onClick: () => (adders ? adders.edit(L, i) : edit(i)) },
        h("span", { class: "li-n", text: String(i + 1) }), h("span", { class: "li-t" }, h("b", { text: s.title }), s.sub ? h("em", { text: s.sub }) : null), s.right ? h("span", { class: "li-r", text: s.right }) : null),
        h("div", { class: "li-act" }, h("button", { type: "button", title: "Subir", onClick: () => move(i, -1), text: "▲", disabled: i === 0 }),
          h("button", { type: "button", title: "Descer", onClick: () => move(i, 1), text: "▼", disabled: i === L.items.length - 1 }),
          h("button", { type: "button", title: "Duplicar", onClick: () => dup(i), text: "⧉" }), h("button", { type: "button", class: "x", title: "Remover", onClick: () => del(i), text: "✕" })));
    }) : [P.empty(empty)]));
  }
  const bar = h("div", { class: "bar" }, ...(adders ? adders.buttons(L, change) : [btn(addText, addNew, "primary sm")]));
  L.el = h("div", { class: "listed" }, bar, list);
  L.get = () => L.items.map((i) => ({ ...i }));
  L.set = (arr) => { L.items = (arr || []).map((i) => ({ ...i })); change(); };
  draw();
  return L;
};

// ====================================================================== EDITOR DE PROPOSTA
class ProposalEditor {
  constructor(page, prop, itens, cliente) {
    this.app = P.app; this.db = P.app.db;
    this.prop = { ...(prop || {}) };
    this.itens = (itens || []).map((i) => ({ ...i }));
    const cfg = (this.cfg = P.app.engine.cfg);
    const p = this.prop;
    const numero = Math.floor(fnum(p.numero)) || this.db.nextProposalNumber();
    p.numero = numero;
    const novo = !p.id && !["objeto", "escopo_intro", "escopo_json", "secoes_pre_json", "secoes_pos_json"].some((k) => p[k]);
    const mod = novo ? P.modeloTextos(cfg) : {};
    const escopo = P.json(p.escopo_json, []);
    const pre = P.json(p.secoes_pre_json, []).length ? P.json(p.secoes_pre_json, []) : (mod.secoes_pre || []);
    let pos = P.json(p.secoes_pos_json, []).length ? P.json(p.secoes_pos_json, []) : (mod.secoes_pos || []);
    if (!pos.length && (p.observacoes || "").trim()) pos = [{ titulo: "OBSERVAÇÕES COMERCIAIS IMPORTANTES", texto: p.observacoes }];
    const parcelas = P.json(p.parcelas_json, []);
    this.title = h("span", { text: `Proposta técnica e comercial nº ${numero}` });

    const tabNames = ["1 Dados e cliente", "2 Objetivo e escopo", "3 Textos", "4 Investimento e pagamento", "5 Fechamento"];
    this.panes = [h("div", { class: "pane" }), h("div", { class: "pane" }), h("div", { class: "pane" }), h("div", { class: "pane" }), h("div", { class: "pane" })];
    this.tabs = seg(tabNames, tabNames[0], (v) => { this.panes.forEach((pn, i) => pn.classList.toggle("on", tabNames[i] === v)); if (v === tabNames[4]) requestAnimationFrame(() => this.updateSigPreview()); });
    this.tabs.classList.add("scroll");
    this.panes[0].classList.add("on");
    this.tabDados(this.panes[0]);
    this.tabEscopo(this.panes[1], escopo);
    this.tabTextos(this.panes[2], pre, pos);
    this.tabInvest(this.panes[3], parcelas);
    this.tabFecho(this.panes[4]);
    this.load(cliente, mod);

    const modelBtn = btn("Modelos de texto…", () => this.modelos(), "secondary sm");
    const bar = [btn("Cancelar", () => this.close(), "secondary"), h("span", { class: "grow" }), btn("Pré-visualizar", () => this.preview(), "secondary"), btn("Salvar", () => this.save(), "navy"), btn("Salvar e gerar PDF", () => this.save(true))];
    this.m = P.modal({ title: `Proposta técnica e comercial nº ${numero}`, body: [h("div", { class: "pe-top" }, this.tabs, modelBtn), ...this.panes], footer: bar, cls: "full editor", dismiss: false });
  }
  close() { this.m.close(); }

  // ---- blocos de tela
  ent(label, span = 1) { const f = { label, span }; const el = P.inp(f, ""); return { el, wrap: P.field(f, el) }; }
  txt(label, height, help) { const f = { label, kind: "textarea", height, help, span: 2 }; const el = P.inp(f, ""); return { el, wrap: P.field(f, el) }; }
  tabDados(t) {
    const a = this.ent("Nº da proposta"), b = this.ent("Data (dd/mm/aaaa)"), c = this.ent("Validade (dias)");
    const st = P.inp({ kind: "choice", options: SEED.STATUS_PROPOSTA }, "Rascunho");
    const stw = P.field({ label: "Situação" }, st);
    const ti = this.ent("Título (ex.: Projeto e Execução Elétrica - Obra Kitnets)", 2), ac = this.ent("A/C. – aos cuidados de", 2);
    Object.assign(this, { e_num: a.el, e_data: b.el, e_val: c.el, o_status: st, e_titulo: ti.el, e_ac: ac.el });
    a.el.setAttribute("inputmode", "numeric"); c.el.setAttribute("inputmode", "numeric");
    const prop = card(cardTitle("Proposta", "Cabeçalho do documento: “PROPOSTA TÉCNICA E COMERCIAL: N° … - título”"), h("div", { class: "fg" }, a.wrap, b.wrap, c.wrap, stw, ti.wrap, ac.wrap));
    const labels = { nome: "Nome / razão social", documento: "CPF / CNPJ", telefone: "Telefone", email: "E-mail", endereco: "Endereço", complemento: "Complemento", bairro: "Bairro", cidade: "Cidade", uf: "UF", cep: "CEP" };
    const spans = { nome: 2, email: 2, endereco: 2 };
    this.cli = {};
    const grid = h("div", { class: "fg" });
    for (const k of ProposalEditor.CLI_KEYS) { const e = this.ent(labels[k], spans[k] || 1); this.cli[k] = e.el; grid.append(e.wrap); }
    this.chk_save = h("input", { type: "checkbox" });
    const cli = card(cardTitle("Cliente", null, btn("Escolher do cadastro", () => this.escolherCliente(), "ghost sm")), grid, h("label", { class: "chk" }, this.chk_save, h("span", { text: "Salvar / atualizar no cadastro de clientes" })));
    t.append(h("div", { class: "cols23" }, prop, cli));
  }
  tabEscopo(t, escopo) {
    const o = this.txt("Texto do objetivo", 110);
    this.t_objeto = o.el;
    const i = this.txt("Frase de introdução", 52), n = this.txt("Nota final do escopo", 56);
    this.t_intro = i.el; this.t_nota = n.el;
    this.l_escopo = P.listEditor({ items: escopo, fields: ESCOPO_FIELDS, dialogTitle: "etapa do escopo", addText: "+ Adicionar etapa", empty: "Nenhuma etapa. Toque em “+ Adicionar etapa”.",
      sub: "Dica: **texto** fica em negrito. Campos {empresa} e {numero} são preenchidos automaticamente.",
      summary: (it) => { const tp = String(it.topicos || "").split("\n").filter((x) => x.trim()).length; return { title: it.titulo || "(sem título)", sub: resumo(it.texto), right: tp ? `${tp} tópico(s)` : "" }; } });
    t.append(card(cardTitle("Objetivo", "Resumo do que está sendo contratado (parágrafo logo abaixo de “OBJETIVO”)."), o.wrap),
      card(cardTitle("Escopo dos serviços", "Cada etapa sai impressa como “Título: descrição”; os tópicos saem com uma seta ➢ abaixo da etapa."), i.wrap, h("div", { class: "fl pad", text: "Etapas" }), this.l_escopo.el, n.wrap));
  }
  tabTextos(t, pre, pos) {
    const mk = (items) => P.listEditor({ items, fields: SECAO_FIELDS, dialogTitle: "seção de texto", defaults: { titulo: "", texto: "", nova_pagina: false }, toForm: secaoToForm, fromForm: secaoFromForm,
      addText: "+ Adicionar seção", empty: "Nenhuma seção. Toque em “+ Adicionar seção”.", summary: (it) => ({ title: it.titulo || "(sem título)", sub: resumo(it.texto), right: it.nova_pagina ? "nova pág." : "" }) });
    this.l_pre = mk(pre); this.l_pos = mk(pos);
    t.append(card(cardTitle("Seções antes do Investimento", "Documentos considerados, premissas, fora do escopo, responsabilidades, prazo… Cada seção vira um título sublinhado seguido do texto. Seções sem texto não saem no PDF."), this.l_pre.el),
      card(cardTitle("Seções depois das condições de pagamento", "Validade da proposta, garantia, observações comerciais importantes… (saem logo abaixo de “CONDIÇÕES DE PAGAMENTO”)."), this.l_pos.el));
  }
  tabInvest(t, parcelas) {
    this.lbl_tot = h("b", { class: "totv" }); this.lbl_sub = h("span", { class: "fh" });
    this.e_desc = P.inp({ kind: "money" }, 0);
    this.e_desc.addEventListener("input", () => this.updateTotals());
    this.chk_pag = h("input", { type: "checkbox" });
    const self = this;
    this.l_itens = P.listEditor({
      items: this.itens, fields: ITEM_FIELDS, dialogTitle: "item do orçamento", empty: "Adicione serviços do catálogo ou itens livres", wide: true,
      onChange: () => { this.itens = this.l_itens ? this.l_itens.items : this.itens; this.updateTotals(); },
      summary: (it) => { const q = fnum(it.quantidade, 1); return { title: it.descricao || "", sub: `${num(q, Math.abs(q - Math.round(q)) < 1e-9 ? 0 : 2)}${it.unidade ? " " + it.unidade : ""} × ${money(it.valor_unit)}`, right: money(q * fnum(it.valor_unit)) }; },
      adders: {
        buttons: (L, change) => [btn("+ Do catálogo", () => self.addCatalog(L, change), "primary sm"), btn("+ Item livre", () => self.addFree(L, change), "secondary sm")],
        edit: (L, i) => L.edit(i),
      },
    });
    const inv = card(cardTitle("Investimento", "Tabela cinza do PDF: item, descrição e valor."), this.l_itens.el,
      h("div", { class: "tot-row" }, P.field({ label: "Desconto (R$)", kind: "money" }, this.e_desc), h("div", { class: "tot-box" }, this.lbl_tot, this.lbl_sub)),
      h("label", { class: "chk" }, this.chk_pag, h("span", { text: "Começar o INVESTIMENTO em uma nova página (como no modelo)" })));
    this.lbl_parc = h("p", { class: "fh right" });
    this.l_parc = P.listEditor({ items: parcelas, fields: PARCELA_FIELDS, dialogTitle: "parcela", defaults: { rotulo: "Parcela", valor: 0, detalhe: "" }, addText: "+ Adicionar parcela",
      empty: "Sem parcelas. Use “Gerar entrada + parcelas…” ou “+ Adicionar parcela”.", onChange: () => this.parcInfo(),
      summary: (it) => ({ title: it.rotulo || "", sub: it.detalhe || "", right: money(it.valor) }) });
    const det = this.txt("Texto livre de pagamento (opcional – só sai se não houver parcelas)", 56);
    this.t_det = det.el;
    const pay = card(cardTitle("Condições de pagamento", "Cada parcela sai como “Entrada: R$ 7.000,00 (no aceite da proposta).”", btn("Gerar entrada + parcelas…", () => this.genParcelas(), "secondary sm")), this.l_parc.el, this.lbl_parc, det.wrap);
    t.append(inv, pay);
  }
  tabFecho(t) {
    const f = this.txt("Frase de fechamento", 56);
    this.t_fecho = f.el;
    const a1 = this.ent("Nome do cliente na assinatura (ex.: Nome do Cliente (Resp.))"), a2 = this.ent("Seu nome na assinatura – empresa (ex.: Nome do Responsável (Administrativo))");
    this.e_ass1 = a1.el; this.e_ass2 = a2.el;
    this.sig1 = P.sigField({ label: "Imagem da assinatura do cliente (opcional)", title: "Recortar assinatura do cliente", getName: () => this.e_ass1.value, onChange: () => this.updateSigPreview() });
    this.sig2 = P.sigField({ label: "Imagem da sua assinatura (empresa)", title: "Recortar assinatura da empresa", getName: () => this.e_ass2.value, onChange: () => this.updateSigPreview() });
    this.chk_sigdef = h("input", { type: "checkbox" });
    this.sigPrev = h("div", { class: "paper prop sigprev" });
    this.sigPrevWrap = h("div", { class: "sigprev-wrap" }, this.sigPrev);
    for (const el of [this.t_fecho, this.e_ass1, this.e_ass2]) el.addEventListener("input", () => this.updateSigPreview());
    this._fitPrev = null;
    t.append(card(cardTitle("Fechamento e assinaturas", "Última página: frase de despedida, linha “Aprovo as condições acima descritas em __/__/__ e assinamos:” (fixa) e as duas linhas de assinatura."), f.wrap,
        h("div", { class: "fg sigsides" },
          h("div", { class: "stack sigside cli" }, h("span", { class: "side-tag", text: "CLIENTE · lado esquerdo da proposta" }), a1.wrap, this.sig1.el),
          h("div", { class: "stack sigside emp" }, h("span", { class: "side-tag emp", text: "EMPRESA (você) · lado direito da proposta" }), a2.wrap, this.sig2.el,
            h("label", { class: "chk" }, this.chk_sigdef, h("span", { text: "Usar esta assinatura da empresa como padrão nas próximas propostas" }))))),
      card(cardTitle("Como fica na proposta", "Prévia reduzida só das assinaturas (as linhas de assinatura e os nomes)."), this.sigPrevWrap));
  }
  updateSigPreview() {
    if (!this.sigPrev) return;
    const cfg = this.app.engine.cfg;
    const prop = { fecho: this.t_fecho.value, assinatura1: this.e_ass1.value.trim(), assinatura2: this.e_ass2.value.trim(), assinatura1_img: this.sig1.get(), assinatura2_img: this.sig2.get(), assinatura1_esc: this.sig1.getScale(), assinatura2_esc: this.sig2.getScale() };
    const ctx = P.proposalContext(cfg, { numero: this.e_num.value, validade_dias: this.e_val.value, cliente_nome: this.cli.nome.value, titulo: this.e_titulo.value, data: P.parseDateBR(this.e_data.value) || P.todayISO() }, this.l_itens ? this.l_itens.items : []);
    this.sigPrev.innerHTML = P.docs.closing(cfg, prop, ctx, this.e_ac.value.trim(), true);
    if (!this._fitPrev) this._fitPrev = P.fitPaper(this.sigPrev); else this._fitPrev();
  }
  // ---- valores iniciais
  load(cliente, mod) {
    const p = this.prop, cfg = this.cfg;
    const d = /^\d{4}-\d{2}-\d{2}/.test(p.data || "") ? p.data.slice(0, 10) : P.todayISO();
    this.e_num.value = String(Math.floor(fnum(p.numero)));
    this.e_data.value = P.fmtDate(d);
    this.e_val.value = String(Math.floor(fnum(p.validade_dias, fnum(cfg.proposta_validade_dias, 30))));
    this.o_status.value = p.status || "Rascunho";
    this.e_titulo.value = p.titulo || ""; this.e_ac.value = p.aos_cuidados || "";
    if (cliente) {
      for (const k of ProposalEditor.CLI_KEYS) this.cli[k].value = cliente[k] || "";
      this.prop.cliente_id = cliente.id;
      if (!this.e_ac.value) this.e_ac.value = cliente.contato || cliente.nome || "";
    } else for (const k of ProposalEditor.CLI_KEYS) this.cli[k].value = p[`cliente_${k}`] || "";
    if (!p.id && !cliente) {
      if (!this.cli.cidade.value) this.cli.cidade.value = cfg.empresa_cidade || "";
      if (!this.cli.uf.value) this.cli.uf.value = cfg.empresa_uf || "";
      this.chk_save.checked = true;
    }
    this.t_objeto.value = p.objeto || "";
    this.t_intro.value = p.escopo_intro || mod.escopo_intro || "";
    this.t_nota.value = p.escopo_nota || mod.escopo_nota || "";
    this.e_desc.value = numInput(p.desconto_valor || 0);
    this.chk_pag.checked = !!(Math.floor(fnum(p.invest_nova_pagina, 1)) || !p.id);
    this.t_det.value = p.detalhes_pagamento || "";
    this.t_fecho.value = p.fecho || mod.fecho || "";
    this.e_ass1.value = p.assinatura1 || "";
    this.e_ass2.value = p.assinatura2 || (!p.id ? cfg.proposta_assinante_empresa || "" : "");
    this.sig1.set(p.assinatura1_img || "", fnum(p.assinatura1_esc, 100));
    this.sig2.set(p.assinatura2_img || (!p.id ? cfg.assinatura_empresa_img || "" : ""), p.assinatura2_img ? fnum(p.assinatura2_esc, 100) : fnum(cfg.assinatura_empresa_esc, 100));
    this.chk_sigdef.checked = !!(cfg.assinatura_empresa_img && !p.id);
    this.l_itens.set(this.itens);
    this.parcInfo();
    this.updateSigPreview();
  }

  // ---- modelos de texto
  async modelos() {
    const m = await P.menu("Modelos de texto", [
      { text: "Aplicar os textos padrão", fn: async () => {
        if (await P.confirm("Aplicar os textos padrão", "Substituir a introdução, a nota do escopo, as seções de texto e o fechamento pelos textos padrão? O objetivo, as etapas do escopo, os itens e as parcelas não mudam.", "Aplicar")) {
          const md = P.modeloTextos(this.cfg);
          this.t_intro.value = md.escopo_intro; this.t_nota.value = md.escopo_nota; this.t_fecho.value = md.fecho;
          this.l_pre.set(md.secoes_pre); this.l_pos.set(md.secoes_pos);
        } } },
      { text: "Salvar estes textos como padrão", fn: () => {
        const modelo = { escopo_intro: this.t_intro.value.trim(), escopo_nota: this.t_nota.value.trim(), fecho: this.t_fecho.value.trim(), secoes_pre: this.l_pre.get(), secoes_pos: this.l_pos.get() };
        this.db.setCfg("proposta_modelo_json", JSON.stringify(modelo));
        if (this.e_ass2.value.trim()) this.db.setCfg("proposta_assinante_empresa", this.e_ass2.value.trim());
        this.app.engine.reload(); this.cfg = this.app.engine.cfg;
        P.ui.toast("Textos padrão salvos – valem para as próximas propostas", "ok", 3500);
      } },
      { text: "Carregar o exemplo (Nº 787 – Obra Kitnets)", fn: async () => {
        if (await P.confirm("Carregar o exemplo", "Preencher TODOS os campos com a proposta nº 787 (Obra Kitnets 200A) que serviu de modelo? O que está digitado aqui será substituído.", "Carregar exemplo")) this.loadExample();
      } }]);
    return m;
  }
  loadExample() {
    const ex = SEED.EXEMPLO_PROPOSTA;
    this.e_num.value = String(ex.numero); this.e_data.value = P.fmtDate(ex.data); this.e_val.value = String(ex.validade_dias); this.e_titulo.value = ex.titulo; this.e_ac.value = ex.aos_cuidados;
    this.e_ass1.value = ex.assinatura1; this.e_ass2.value = ex.assinatura2; this.cli.nome.value = ex.cliente_nome; this.sig1.set(""); this.sig2.set("");
    this.t_objeto.value = ex.objeto; this.t_intro.value = ex.escopo_intro; this.t_nota.value = ex.escopo_nota; this.t_fecho.value = ex.fecho; this.t_det.value = "";
    this.l_escopo.set(ex.escopo); this.l_pre.set(ex.secoes_pre); this.l_pos.set(ex.secoes_pos); this.l_parc.set(ex.parcelas);
    this.l_itens.set(ex.itens.map(([d, v]) => ({ descricao: d, quantidade: 1, unidade: "", valor_unit: v, origem: "livre" })));
    this.e_desc.value = "0"; this.chk_pag.checked = true;
    this.updateSigPreview();
    P.ui.toast("Exemplo carregado – edite o que quiser", "ok", 3000);
  }

  // ---- itens / totais
  totals() { return P.proposalTotals({ desconto_valor: fnum(this.e_desc.value) }, this.l_itens ? this.l_itens.items : this.itens, this.app.engine.cfg); }
  updateTotals() {
    if (!this.lbl_tot) return;
    const tot = this.totals();
    this.lbl_tot.textContent = `Valor total: ${money(tot.total)}`;
    this.lbl_sub.textContent = `Subtotal ${money(tot.subtotal)}` + (tot.desconto ? ` · desconto ${money(tot.desconto)}` : "");
    this.parcInfo();
  }
  parcInfo() {
    if (!this.lbl_parc || !this.l_parc || !this.e_desc) return;
    const tot = this.totals().total;
    const soma = this.l_parc.items.reduce((a, p) => a + fnum(p.valor), 0);
    this.lbl_parc.className = "fh right";
    if (!this.l_parc.items.length) this.lbl_parc.textContent = "";
    else if (Math.abs(soma - tot) < 0.005) { this.lbl_parc.textContent = `Soma das parcelas ${money(soma)} = valor total ✓`; this.lbl_parc.classList.add("okc"); }
    else { this.lbl_parc.textContent = `Soma das parcelas ${money(soma)} · valor total ${money(tot)} · diferença ${money(tot - soma)}`; this.lbl_parc.classList.add("badc"); }
  }
  async genParcelas() {
    const tot = this.totals().total;
    const v = await P.ask("Gerar entrada + parcelas", [
      { key: "entrada", label: "Valor da entrada (R$)", kind: "money", min: 0 }, { key: "n", label: "Quantidade de parcelas depois da entrada", kind: "int", min: 0 },
      { key: "intervalo", label: "Intervalo entre as parcelas (dias)", kind: "int", min: 1 },
      { key: "detalhe", label: "Detalhe da entrada", span: 2, help: "Sai entre parênteses. Ex.: no aceite da proposta, referente aos custos iniciais" }],
    { entrada: 0, n: 3, intervalo: 30, detalhe: "no aceite da proposta" }, { sub: `Valor total da proposta: ${money(tot)}. O que sobrar da divisão em centavos vai para a última parcela.`, ok: "Gerar" });
    if (v) this.l_parc.set(P.dividirParcelas(tot, v.entrada, v.n, Math.max(v.intervalo, 1), v.detalhe));
  }
  async addCatalog(L, change) {
    const e = this.app.engine;
    const rows = e.itens().map((it) => ({ id: `${it.tipo}-${it.id}`, tipo: it.tipo, item_id: it.id, tipo_txt: it.tipo === "servico" ? "Serviço" : "Revenda", nome: it.nome, preco: it.preco, sug: e.precoSugerido(it.tipo, it.id), unidade: it.unidade }));
    const r = await P.pick("Adicionar do catálogo", [{ key: "tipo_txt", label: "Tipo", hm: true }, { key: "nome", label: "Item", pri: true }, { key: "preco", label: "Preço atual", align: "r", fmt: M }, { key: "sug", label: "Preço sugerido", align: "r", fmt: M }],
      rows, { sub: "Escolha um serviço ou produto. Você poderá ajustar quantidade e valor." });
    if (!r) return;
    let desc = r.nome;
    if (r.tipo === "servico") { const s = e.servicos.find((x) => x.id === r.item_id) || {}; if (s.descricao) desc = `${r.nome} – ${s.descricao}`; }
    const un = { "Serviço": "serviço", "Unidade": "un", "Metro": "m", "Hora": "h" }[r.unidade] || (r.unidade || "un").toLowerCase();
    const valor = r.preco || r.sug;
    const v = await P.ask("Item do orçamento", ITEM_FIELDS, { descricao: desc, quantidade: 1, unidade: un, valor_unit: P.round2(valor) }, { sub: `Preço atual ${money(r.preco)} · preço sugerido ${money(r.sug)}`, ok: "Adicionar", wide: true });
    if (v) { v.origem = r.id; L.items.push(v); change(); }
  }
  async addFree(L, change) {
    const v = await P.ask("Item livre", ITEM_FIELDS, { quantidade: 1, unidade: "" }, { ok: "Adicionar", wide: true });
    if (v) { v.origem = "livre"; L.items.push(v); change(); }
  }
  async escolherCliente() {
    const rows = this.db.all("clientes");
    if (!rows.length) return P.info("Nenhum cliente", "Ainda não há clientes cadastrados. Preencha os dados aqui mesmo e deixe marcada a opção de salvar no cadastro.");
    const r = await P.pick("Escolher cliente", [{ key: "nome", label: "Cliente", pri: true }, { key: "documento", label: "CPF/CNPJ", hm: true }, { key: "telefone", label: "Telefone" }, { key: "cidade", label: "Cidade", hm: true }], rows);
    if (r) {
      for (const k of ProposalEditor.CLI_KEYS) this.cli[k].value = r[k] || "";
      if (!this.e_ac.value.trim()) this.e_ac.value = r.contato || r.nome || "";
      this.prop.cliente_id = r.id; this.chk_save.checked = false;
    }
  }

  // ---- salvar
  collect() {
    const d = P.parseDateBR(this.e_data.value);
    if (!d) throw new Error("Data inválida. Use o formato dd/mm/aaaa.");
    const numero = Math.floor(fnum(this.e_num.value));
    if (numero < 1) throw new Error("Informe o número da proposta (1 ou maior).");
    const outra = this.db.all("propostas", (r) => r.numero === numero && r.id !== (this.prop.id || 0));
    if (outra.length) throw new Error(`Já existe outra proposta com o nº ${numero}. Escolha outro número.`);
    if (!this.cli.nome.value.trim()) throw new Error("Informe o nome do cliente.");
    if (!this.l_itens.items.length) throw new Error("Adicione pelo menos um item ao investimento.");
    const dump = (v) => JSON.stringify(v);
    const p = { ...this.prop, numero, data: d, validade_dias: Math.floor(fnum(this.e_val.value, 30)) || 30, status: this.o_status.value, titulo: this.e_titulo.value.trim(),
      aos_cuidados: this.e_ac.value.trim(), objeto: this.t_objeto.value.trim(), escopo_intro: this.t_intro.value.trim(), escopo_json: dump(this.l_escopo.get()), escopo_nota: this.t_nota.value.trim(),
      secoes_pre_json: dump(this.l_pre.get()), secoes_pos_json: dump(this.l_pos.get()), parcelas_json: dump(this.l_parc.get()), desconto_valor: fnum(this.e_desc.value),
      invest_nova_pagina: this.chk_pag.checked ? 1 : 0, detalhes_pagamento: this.t_det.value.trim(), fecho: this.t_fecho.value.trim(), assinatura1: this.e_ass1.value.trim(),
      assinatura2: this.e_ass2.value.trim(), assinatura1_img: this.sig1.get(), assinatura2_img: this.sig2.get(), assinatura1_esc: this.sig1.getScale(), assinatura2_esc: this.sig2.getScale(), observacoes: "", forma_pagamento: "" };
    for (const k of ProposalEditor.CLI_KEYS) p[`cliente_${k}`] = this.cli[k].value.trim();
    return p;
  }
  preview() {
    let p;
    try { p = this.collect(); } catch (e) { return P.info("Verifique a proposta", e.message, "warn"); }
    P.openDoc(P.docs.proposal(this.app.engine.cfg, p, this.l_itens.get()));
  }
  save(pdf = false) {
    let p;
    try { p = this.collect(); } catch (e) { return P.info("Verifique a proposta", e.message, "warn"); }
    if (this.chk_save.checked) {
      const cli = {};
      for (const k of ProposalEditor.CLI_KEYS) cli[k] = p[`cliente_${k}`];
      if (p.cliente_id && this.db.get("clientes", p.cliente_id)) cli.id = p.cliente_id;
      p.cliente_id = this.db.save("clientes", cli);
    }
    if (this.chk_sigdef.checked) this.db.setMany({ assinatura_empresa_img: this.sig2.get(), assinatura_empresa_esc: this.sig2.getScale() });
    const itens = this.l_itens.get().map((it) => ({ descricao: it.descricao, quantidade: it.quantidade, unidade: it.unidade, valor_unit: it.valor_unit, origem: it.origem }));
    const pid = this.db.saveProposal(p, itens);
    const saved = this.db.get("propostas", pid);
    this.m.close();
    this.app.changed(`Proposta ${Math.floor(saved.numero)} salva`);
    if (pdf) P.pages["Propostas"].gerarPdf(saved);
  }
}
ProposalEditor.CLI_KEYS = ["nome", "documento", "telefone", "email", "endereco", "complemento", "bairro", "cidade", "uf", "cep"];

// ====================================================================== PROPOSTAS (lista)
P.definePage("Propostas", {
  subtitle: "Monte a proposta técnica e comercial (escopo, textos, investimento e pagamento) e gere o PDF no modelo da ACRS.",
  state: { filtro: "Todas" },
  actions: () => [btn("+ Nova proposta", () => P.pages["Propostas"].newProposal())],
  render(pg) {
    const cfg = pg.eng.cfg, st = this.state;
    const rows = [], stats = Object.fromEntries(SEED.STATUS_PROPOSTA.map((s) => [s, [0, 0]]));
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    let aVencer = 0, vencidas = 0;
    for (const p of pg.db.all("propostas")) {
      const itens = pg.db.proposalItems(p.id);
      const tot = P.proposalTotals(p, itens, cfg).total;
      const s = p.status || "Rascunho";
      if (s in stats) { stats[s][0]++; stats[s][1] += tot; }
      const dias = P.diasParaVencer(p, hoje), aberta = s === "Rascunho" || s === "Enviada";
      if (aberta && dias !== null) { if (dias < 0) vencidas++; else if (dias <= 7) aVencer++; }
      if (st.filtro !== "Todas" && s !== st.filtro) continue;
      const valid = !aberta || dias === null ? "—" : dias < 0 ? `vencida há ${-dias} d` : dias === 0 ? "vence hoje" : `vence em ${dias} d`;
      rows.push({ ...p, numero_txt: String(Math.floor(fnum(p.numero))), data_txt: P.fmtDate(p.data), itens: itens.length, total: tot, validade_txt: valid,
        _tag: aberta && dias !== null && dias < 0 ? "warn" : { Aprovada: "good", Recusada: "neg", Rascunho: "muted" }[s] || null });
    }
    const aberto = stats.Rascunho[1] + stats.Enviada[1];
    const dec = stats.Aprovada[0] + stats.Recusada[0];
    const k = kpis([{ title: "Propostas em aberto", value: money(aberto), sub: `${stats.Rascunho[0] + stats.Enviada[0]} proposta(s)`, accent: PRIMARY }, { title: "Aprovadas", value: money(stats.Aprovada[1]), sub: `${stats.Aprovada[0]} proposta(s)`, accent: GREEN },
      { title: "Taxa de aprovação", value: dec ? pct(safeDiv(stats.Aprovada[0], dec)) : "—", sub: "aprovadas ÷ (aprovadas + recusadas)", accent: PRIMARY },
      { title: "Ticket médio aprovado", value: stats.Aprovada[0] ? money(safeDiv(stats.Aprovada[1], stats.Aprovada[0])) : "—", accent: NAVY },
      { title: "Vencem em 7 dias", value: String(aVencer), sub: vencidas ? `${vencidas} já vencida(s) em aberto` : "propostas em aberto", color: vencidas ? "#B45309" : NAVY, accent: "#B45309" }]);
    const tabs = seg(["Todas", ...SEED.STATUS_PROPOSTA], st.filtro, (v) => { st.filtro = v; pg.rerender(); });
    tabs.classList.add("scroll");
    const tbl = card(table([{ key: "numero_txt", label: "Nº" }, { key: "data_txt", label: "Data", hm: true }, { key: "cliente_nome", label: "Cliente", pri: true }, { key: "itens", label: "Itens", align: "r", fmt: N0, hm: true },
      { key: "total", label: "Total", align: "r", fmt: M }, { key: "titulo", label: "Título", hm: true }, { key: "status", label: "Situação" }, { key: "validade_txt", label: "Validade" }], rows, { onOpen: (r) => this.acoes(r), empty: "Nenhuma proposta. Toque em “+ Nova proposta”." }));
    return [k, h("div", { class: "bar" }, tabs), tbl];
  },
  acoes(r) {
    const marcar = SEED.STATUS_PROPOSTA.filter((s) => s !== r.status).map((s) => ({ text: `Marcar como ${s}`, fn: () => { P.app.db.save("propostas", { id: r.id, status: s, atualizado_em: new Date().toISOString().slice(0, 19) }); P.app.changed(`Proposta marcada como ${s}`); } }));
    P.menu(`Proposta ${r.numero_txt} – ${r.cliente_nome}`, [
      { text: "Abrir / editar", fn: () => this.edit(r.id) }, { text: "Gerar PDF", fn: () => this.gerarPdf(P.app.db.get("propostas", r.id)) },
      { text: "Enviar resumo por WhatsApp", fn: () => this.whatsapp(P.app.db.get("propostas", r.id)) }, ...marcar,
      { text: "Duplicar", fn: () => this.dup(r.id) }, { text: "Excluir", kind: "danger", fn: () => this.excluir(r) }]);
  },
  /** Abre o WhatsApp com um resumo da proposta (valor, condicoes e validade). */
  whatsapp(prop) {
    const e = P.app.engine, cfg = e.cfg, itens = P.app.db.proposalItems(prop.id);
    const tot = P.proposalTotals(prop, itens, cfg).total;
    const parc = P.json(prop.parcelas_json, []).filter((x) => x.rotulo || fnum(x.valor));
    const dias = P.diasParaVencer(prop, new Date());
    const venc = dias === null ? "" : (() => { const d = new Date(String(prop.data).slice(0, 10) + "T12:00:00"); d.setDate(d.getDate() + Math.floor(fnum(prop.validade_dias, 30))); return d.toLocaleDateString("pt-BR"); })();
    const linhas = [`*Proposta nº ${Math.floor(fnum(prop.numero))}*${prop.titulo ? " – " + prop.titulo : ""}`, prop.cliente_nome ? `Cliente: ${prop.cliente_nome}` : "", "",
      ...itens.map((i) => `• ${String(i.descricao || "").split("\n")[0].slice(0, 80)} – ${money(fnum(i.quantidade, 1) * fnum(i.valor_unit))}`), "", `*Valor total: ${money(tot)}*`,
      ...(parc.length ? ["", "Condições de pagamento:", ...parc.map((x) => `${x.rotulo ? x.rotulo + ": " : ""}${money(x.valor)}${x.detalhe ? " (" + x.detalhe + ")" : ""}`)] : []),
      venc ? `\nProposta válida até ${venc}.` : "", "", P.empresaNome(cfg)].filter((l, i, a) => !(l === "" && a[i - 1] === ""));
    const fone = String(prop.cliente_telefone || "").replace(/\D/g, "");
    const num = fone.length >= 10 && fone.length <= 11 ? "55" + fone : fone.length > 11 ? fone : "";
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(linhas.join("\n").trim())}`, "_blank", "noopener");
  },
  newProposal(cliente) { P.app.show("Propostas"); return new ProposalEditor(this, null, [], cliente || null); },
  edit(id) { return new ProposalEditor(this, P.app.db.get("propostas", id), P.app.db.proposalItems(id)); },
  dup(id) {
    const p = P.app.db.get("propostas", id);
    for (const k of ["id", "numero", "criado_em", "atualizado_em"]) delete p[k];
    Object.assign(p, { status: "Rascunho", data: P.todayISO() });
    return new ProposalEditor(this, p, P.app.db.proposalItems(id));
  },
  async excluir(r) {
    if (await P.confirm("Excluir proposta", `Excluir a proposta ${r.numero_txt} de ${r.cliente_nome}?`, "Excluir", true)) { P.app.db.remove("propostas", r.id); P.app.changed("Proposta excluída"); }
  },
  gerarPdf(prop) {
    P.app.engine.reload();
    P.app.openDoc(P.docs.proposal(P.app.engine.cfg, prop, P.app.db.proposalItems(prop.id)));
  },
});
