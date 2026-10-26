"use strict";
/* Precifica Web - aplicativo: menu, rotas, atualizacao das telas e inicializacao. */
const { h } = P;

const NAV = [
  ["VISÃO GERAL", [["Painel", "◆"]]],
  ["CADASTROS", [["Serviços e fichas", "▤"], ["Insumos e preços", "▦"], ["Equipe", "◉"], ["Custos fixos", "▣"], ["Capacidade produtiva", "◔"], ["Revenda", "▢"]]],
  ["PRECIFICAÇÃO", [["Tabela de preços", "☰"], ["Análise de preço", "◐"], ["Simulação", "▲"], ["Relatórios gerenciais", "▥"], ["Concorrentes", "◈"]]],
  ["COMERCIAL", [["Propostas", "✎"], ["Clientes", "☺"]]],
  ["SISTEMA", [["Exportar PDF", "⇩"], ["Configurações", "⚙"]]],
];
const TITLES = {
  "Painel": "Painel", "Serviços e fichas": "Serviços e fichas técnicas", "Insumos e preços": "Insumos e preços de referência", "Equipe": "Equipe e pró-labore", "Custos fixos": "Custos fixos e depreciação",
  "Capacidade produtiva": "Capacidade produtiva", "Revenda": "Produtos de revenda", "Tabela de preços": "Tabela de preços", "Análise de preço": "Análise de preço", "Simulação": "Simulação de vendas",
  "Relatórios gerenciais": "Relatórios gerenciais", "Concorrentes": "Análise de concorrentes", "Propostas": "Propostas comerciais", "Clientes": "Clientes", "Exportar PDF": "Exportar PDF", "Configurações": "Configurações",
};
const ALIASES = { "Serviços": "Serviços e fichas", "Simulação de vendas": "Simulação", "Insumos": "Insumos e preços" };
const TABBAR = [["Painel", "◆", "Painel"], ["Serviços e fichas", "▤", "Serviços"], ["Simulação", "▲", "Simulação"], ["Propostas", "✎", "Propostas"]];

P.app = {
  ctx: {}, current: null, deferredInstall: null,

  boot() {
    this.db = new P.Database();
    this.engine = new P.Engine(this.db);
    this.tutorial = new P.Tutorial(this);
    this.buildShell();
    addEventListener("popstate", () => {
      if (P.ui.popWasLayer) { P.ui.popWasLayer = false; return; }       // era so' o "voltar" de uma janela aberta
      const n = this.nameFromHash();
      if (n && n !== this.current && !P.ui.hasModal()) this.show(n, { push: false });
    });
    // se a tela mudou enquanto uma janela se fechava, o endereco volta a refletir a tela atual
    P.ui.afterLayerPop = () => {
      const url = "#/" + encodeURIComponent(this.current);
      if (this.current && location.hash !== url) { try { history.replaceState({ pg: this.current }, "", url); } catch (e) { /* ok */ } }
    };
    addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); this.deferredInstall = e; });
    addEventListener("error", (e) => P.ui.toast("Erro: " + (e.message || "inesperado"), "danger", 5000));
    addEventListener("unhandledrejection", (e) => P.ui.toast("Erro: " + (e.reason && e.reason.message || e.reason || "inesperado"), "danger", 5000));
    const first = this.nameFromHash() || "Painel";
    this.show(first, { push: false });
    const sp = document.getElementById("splash");
    if (sp) sp.remove();
    if (this.db.cfgNum("onboarding_ok") < 1) setTimeout(() => P.welcome(), 500);
    else if (this.db.cfgNum("tutorial_nao_mostrar") < 1) setTimeout(() => this.tutorial.start(), 700);
    P.sync.handleRedirect().finally(() => P.sync.start());
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if (!this.db.persistent) setTimeout(() => P.ui.toast("Este navegador não permite salvar dados. Faça backups para não perder o trabalho.", "warn", 7000), 1200);
  },

  // ---------------------------------------------------------------- estrutura da tela
  buildShell() {
    this.navButtons = {};
    const nav = h("nav", { class: "nav", "aria-label": "Menu principal" });
    for (const [group, items] of NAV) {
      nav.append(h("div", { class: "ng", text: group }));
      for (const [name, icon] of items) {
        const b = h("button", { type: "button", class: "ni", "data-nav": name, onClick: () => { this.closeDrawer(); this.show(name); } }, h("i", { text: icon }), h("span", { text: name }));
        this.navButtons[name] = b;
        nav.append(b);
      }
    }
    this.companyLbl = h("b", { class: "company" });
    const side = h("aside", { class: "side", id: "side" },
      h("div", { class: "brand" }, h("div", { class: "logo-card" }, (this.sideLogo = h("img", { src: P.LOGO, alt: "Logotipo" }))), h("div", { class: "bt" }, h("b", { text: "Precifica" }), h("span", { text: "PRECIFICAÇÃO E PROPOSTAS" }))),
      nav, h("div", { class: "sfoot" }, P.syncBadge(), this.companyLbl, h("span", { text: `v${P.APP_VERSION} · por ${P.APP_AUTHOR}` })));
    this.topTitle = h("span", { class: "tt" });
    const top = h("header", { class: "top" }, h("button", { type: "button", class: "burger", "aria-label": "Abrir menu", text: "☰", onClick: () => document.body.classList.toggle("nav-open") }), this.topTitle, h("span", { class: "grow" }), P.syncBadge());
    this.pageEl = h("main", { class: "page", id: "page" });
    this.tabbar = h("nav", { class: "tabbar", "aria-label": "Atalhos" }, TABBAR.map(([n, ic, lb]) => h("button", { type: "button", "data-nav": n, onClick: () => this.show(n) }, h("i", { text: ic }), h("span", { text: lb }))),
      h("button", { type: "button", onClick: () => document.body.classList.toggle("nav-open") }, h("i", { text: "☰" }), h("span", { text: "Mais" })));
    const scrim = h("div", { class: "scrim", onClick: () => this.closeDrawer() });
    document.getElementById("app").replaceChildren(side, scrim, h("div", { class: "main" }, top, this.pageEl), this.tabbar);
  },
  closeDrawer() { document.body.classList.remove("nav-open"); },
  nameFromHash() {
    const m = /^#\/(.+)$/.exec(location.hash || "");
    if (!m) return null;
    let n = decodeURIComponent(m[1]);
    n = ALIASES[n] || n;
    return P.pages[n] ? n : null;
  },
  canInstall() { return !!this.deferredInstall; },
  async install() {
    if (!this.deferredInstall) return;
    this.deferredInstall.prompt();
    await this.deferredInstall.userChoice.catch(() => {});
    this.deferredInstall = null;
  },

  // ---------------------------------------------------------------- telas
  pageCtx(name) {
    name = ALIASES[name] || name;
    if (!this.ctx[name]) {
      const app = this;
      this.ctx[name] = {
        name, app, db: this.db, dirty: true, built: false,
        get eng() { return app.engine; },
        rerender() { app.draw(this); },
      };
    }
    return this.ctx[name];
  },
  show(name, { push = true } = {}) {
    name = ALIASES[name] || name;
    const def = P.pages[name];
    if (!def) return;
    const pg = this.pageCtx(name);
    const changedPage = this.current !== name;
    if (!pg.built) {
      pg.head = h("div", { class: "phead" });
      pg.body = h("div", { class: "pbody" });
      pg.el = h("div", { class: "pg", "data-page": name }, pg.head, pg.body);
      pg.built = true;
    }
    if (changedPage || pg.dirty) this.draw(pg, changedPage);
    if (changedPage) {
      this.pageEl.replaceChildren(pg.el);
      this.current = name;
      window.scrollTo(0, 0);
      const url = "#/" + encodeURIComponent(name);
      if (location.hash !== url) {
        const replace = !push || P.ui.layerActive();             // com uma janela ainda fechando, nao empilha outra entrada
        try { replace ? history.replaceState({ pg: name }, "", url) : history.pushState({ pg: name }, "", url); } catch (e) { /* ok */ }
      }
    }
    this.markNav(name);
    this.topTitle.textContent = TITLES[name] || name;
    document.title = `${TITLES[name] || name} · Precifica`;
    this.setCompany();
    this.closeDrawer();
  },
  markNav(name) {
    document.querySelectorAll(".ni.on, .tabbar .on").forEach((b) => b.classList.remove("on"));
    document.querySelectorAll(`[data-nav="${name}"]`).forEach((b) => b.classList.add("on"));
    const sideNav = document.querySelector(".nav");
    const act = this.navButtons[name];
    if (sideNav && act && act.offsetParent) {      // mantem o item ativo visivel no menu (sem mexer na pagina)
      const r = act.getBoundingClientRect(), s = sideNav.getBoundingClientRect();
      if (r.bottom > s.bottom) sideNav.scrollTop += r.bottom - s.bottom + 12;
      else if (r.top < s.top) sideNav.scrollTop = Math.max(0, sideNav.scrollTop - (s.top - r.top) - 12);
    }
  },
  draw(pg, fresh) {
    const def = P.pages[pg.name];
    const y = window.scrollY;
    pg.head.replaceChildren(h("div", { class: "pt" }, h("h1", { text: TITLES[pg.name] || pg.name }), def.subtitle ? h("p", { class: "sub", text: def.subtitle }) : null),
      def.actions ? h("div", { class: "pact" }, def.actions(pg)) : null);
    const out = def.render.call(def, pg);
    pg.body.replaceChildren(...[].concat(out).filter(Boolean));
    pg.dirty = false;
    if (!fresh && this.current === pg.name) window.scrollTo(0, y);
  },
  changed(msg) {
    this.engine.reload();
    P.sync.schedule();
    for (const pg of Object.values(this.ctx)) pg.dirty = true;
    const pg = this.ctx[this.current];
    if (pg) this.draw(pg);
    this.setCompany();
    if (msg) P.ui.toast(msg);
  },
  setCompany() {
    const c = this.engine.cfg;
    const txt = c.empresa_fantasia || c.empresa_nome || "";
    if (this.companyLbl.textContent !== txt) this.companyLbl.textContent = txt;
    const logo = c.empresa_logo && String(c.empresa_logo).startsWith("data:") ? c.empresa_logo : P.LOGO;       // logotipo escolhido em Configuracoes vale no menu todo
    if (this.sideLogo && this.sideLogo._src !== logo) { this.sideLogo.src = logo; this.sideLogo._src = logo; }
  },
  openAnalysis(tipo, id) {
    P.pages["Análise de preço"].state.pending = { tipo, id };
    this.ctx["Análise de preço"] && (this.ctx["Análise de preço"].dirty = true);
    this.show("Análise de preço");
  },
  openDoc(d) { this.engine.reload(); return P.openDoc(d); },
};
