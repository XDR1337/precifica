"use strict";
/* Precifica Web - login por empresa (tudo pelo Dropbox).
   Cada empresa tem uma pasta "Precifica-<nome>" no Dropbox com:
     precifica-dados.json   os dados (sincronizados em sync.js)
     precifica-acesso.json  usuarios da empresa: login, papel (dono/funcionario) e senha (hash PBKDF2, nunca a senha)
   Quem tem a pasta compartilhada no Dropbox entra na empresa; o app pede usuario e senha. O administrador (conta Dropbox listada em
   P.ADMIN_IDS) ve as empresas que compartilharam a pasta com ele e abre qualquer uma com um clique.
   Aviso de seguranca: sem servidor proprio, a senha do app e uma trava de uso. A protecao real dos dados e a permissao da pasta no Dropbox. */
const { h, btn } = P;   // (card vem de pages-b.js por parametro)

const KEY = "precifica.auth.v1";                 // neste aparelho: ultima empresa, usuario lembrado, modo
const SES = "precifica.auth.me";                 // nesta aba: quem esta logado
const ACCESS = "precifica.acesso.v1.";           // copia local do arquivo de acesso (entrar sem internet)
const FILE = "precifica-acesso.json";
const ITER = 150000;
const rd = (k, st = localStorage) => { try { return JSON.parse(st.getItem(k) || "null"); } catch (e) { return null; } };
const wr = (k, v, st = localStorage) => { try { st.setItem(k, JSON.stringify(v)); } catch (e) { /* ok */ } };
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const slugify = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const slugOf = (folder) => String(folder || "").replace(/^precifica-/i, "").toLowerCase();
const dbx = () => P.sync.providers.dropbox;
const ROLE = { dono: "Dono", func: "Funcionário", admin: "Administrador" };

async function hashPw(pw, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: ITER }, key, 256));
}
const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));
async function mkUser(u, nome, papel, pw) { const salt = newSalt(); return { u: u.trim().toLowerCase(), nome: nome.trim() || u.trim(), papel, salt, hash: await hashPw(pw, salt) }; }

P.auth = {
  s: rd(KEY) || {}, me: null, active: false, pendingName: "", acc: null,
  save() { wr(KEY, this.s); },
  slug() { return this.active ? slugOf(this.s.folder) : ""; },
  isAdmin() { return !!this.me && this.me.papel === "admin"; },
  isOwner() { return !!this.me && (this.me.papel === "dono" || this.me.papel === "admin"); },
  accountIsAdmin() { return !!(P.sync.s.account && (P.ADMIN_IDS || []).includes(P.sync.s.account)); },
  connected() { return !!(P.sync.s.connected && P.sync.s.refresh && P.sync.s.account); },
  roleLabel() { return this.me ? ROLE[this.me.papel] || "" : ""; },

  // ---------------------------------------------------------------- entrada
  /** Chamado ao abrir o app. Quando o acesso estiver liberado, chama ready(). */
  async enter(ready, redirectMsg) {
    this.ready = ready; this.notice = redirectMsg && redirectMsg !== "ok" ? redirectMsg : "";
    if (this.s.mode === "local") { this.active = false; return ready(); }
    const me = rd(SES, sessionStorage) || (this.s.rem ? { u: this.s.rem.u, k: this.s.rem.k } : null);
    if (this.s.folder) {
      if (this.s.admin && this.accountIsAdmin()) { this.me = { u: "admin", nome: "Administrador", papel: "admin" }; return this.activate(); }
      const acc = rd(ACCESS + slugOf(this.s.folder));
      const u = me && acc && (acc.users || []).find((x) => x.u === me.u);
      if (u && me.k && me.k === u.hash) { this.me = { u: u.u, nome: u.nome, papel: u.papel, k: u.hash }; return this.activate(); }
    }
    if (this.accountIsAdmin() && this.s.admin) this.mode = "admin";
    if (this.s.kick) { this.notice = this.s.kick; delete this.s.kick; this.save(); }
    this.show();
  },
  async activate() {
    this.active = true;
    dbx().forced = this.s.folder; dbx().folderOk = null; dbx().basePath = null;
    wr(SES, this.me, sessionStorage);
    this.save();
    try {                                              // primeira vez neste aparelho: baixa a base da empresa antes de abrir
      const key = P.storeKey(this.slug());
      if (!localStorage.getItem(key) && this.connected() && navigator.onLine) {
        this.setBusy("Carregando os dados da empresa…");
        const tk = await P.sync.provider.token(false);
        if (tk) { const remote = await dbx().read(tk); if (remote && remote.t) localStorage.setItem(key, JSON.stringify(remote)); }
      }
    } catch (e) { this.notice = "Não foi possível baixar os dados agora: " + e.message; }
    this.hide();
    this.ready();
  },

  // ---------------------------------------------------------------- operacoes
  async token() {
    const tk = await P.sync.provider.token(false);
    if (!tk) throw new Error("A conexão com o Dropbox expirou. Toque em “Trocar de conta do Dropbox” e conecte de novo.");
    return tk;
  },
  async readAccess(folder) {
    const d = dbx(); d.forced = folder; d.folderOk = null; d.basePath = null;
    const tk = await this.token();
    await d.checkFolder(tk);
    const r = await d.getJson(tk, d.basePath + "/" + FILE);
    this.accRev = r ? r.rev : null;
    if (r) wr(ACCESS + slugOf(folder), r.data);
    return r ? r.data : null;
  },
  async login(folder, user, pw, remember) {
    let acc = null;
    try { acc = await this.readAccess(folder); }
    catch (e) { if (navigator.onLine && !/Failed to fetch|NetworkError|Load failed/i.test(e.message)) throw e; acc = rd(ACCESS + slugOf(folder)); if (!acc) throw new Error("Sem internet e esta empresa ainda não foi aberta neste aparelho."); }
    if (!acc) return { claim: true };
    const u = (acc.users || []).find((x) => x.u === user.trim().toLowerCase());
    if (!u || (await hashPw(pw, u.salt)) !== u.hash) throw new Error("Usuário ou senha incorretos.");
    this.s.folder = folder; this.s.empresa = acc.empresa || ""; this.s.admin = false; this.s.lastUser = u.u;
    this.s.rem = remember ? { u: u.u, k: u.hash } : null;
    this.me = { u: u.u, nome: u.nome, papel: u.papel, k: u.hash };
    return { ok: true };
  },
  /** Cria a empresa (pasta + dono) ou assume uma pasta ja existente que ainda nao tem usuarios. */
  async create({ empresa, nome, user, pw, folder, remember }) {
    const tk = await this.token(), d = dbx();
    const isNew = !folder;
    if (isNew) { folder = "Precifica-" + slugify(empresa); if (folder === "Precifica-") throw new Error("Informe o nome da empresa."); d.forced = folder; await d.createFolder(tk, folder); }
    else { d.forced = folder; d.folderOk = null; d.basePath = null; await d.checkFolder(tk); }
    const owner = await mkUser(user, nome, "dono", pw);
    const acc = { v: 1, empresa: empresa || slugOf(folder), users: [owner], criado: Date.now() };
    await d.putJson(tk, d.basePath + "/" + FILE, acc, null);
    wr(ACCESS + slugOf(folder), acc);
    this.s.folder = folder; this.s.empresa = acc.empresa; this.s.admin = false; this.s.lastUser = owner.u; this.s.rem = remember ? { u: owner.u, k: owner.hash } : null;
    this.me = { u: owner.u, nome: owner.nome, papel: "dono", k: owner.hash };
    const key = P.storeKey(slugOf(folder));
    if (!isNew && !localStorage.getItem(key)) { try { const old = localStorage.getItem(P.storeKey("")); if (old) localStorage.setItem(key, old); } catch (e) { /* ok */ } }   // dados que ja estavam neste aparelho
    if (isNew) this.pendingName = empresa;
  },
  /** Empresa recem-criada: identidade propria (sem os dados da ACRS) e um logotipo simples com o nome. */
  initCompany(db) {
    const nome = this.pendingName, sigla = nome.split(/\s+/)[0];
    const esc = (t) => t.replace(/[<>&"]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120"><rect width="320" height="120" rx="14" fill="#1B2A3D"/><rect x="18" y="62" width="14" height="30" fill="#FF9900"/><rect x="38" y="48" width="14" height="44" fill="#FF9900"/><rect x="58" y="32" width="14" height="60" fill="#FF9900"/><text x="92" y="72" font-family="Arial,sans-serif" font-size="${nome.length > 16 ? 20 : 26}" font-weight="700" fill="#fff">${esc(nome)}</text></svg>`;
    db.setMany({ empresa_nome: nome, empresa_fantasia: nome, empresa_sigla: sigla, empresa_cidade: "", empresa_uf: "", empresa_logo: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) });
    this.pendingName = "";
  },
  enterAsAdmin(folder) {
    this.s.folder = folder; this.s.empresa = slugOf(folder); this.s.admin = true; this.s.rem = null;
    this.me = { u: "admin", nome: "Administrador", papel: "admin" };
    return this.activate();
  },
  /** Troca a empresa (admin) ou sai da conta. */
  leave(keepCompany) {
    try { sessionStorage.removeItem(SES); } catch (e) { /* ok */ }
    this.s.rem = null;
    if (!keepCompany) { this.s.folder = ""; this.s.admin = this.s.admin && this.accountIsAdmin(); }
    this.s.mode = "";
    this.save();
    P.app.db && P.app.db._flush();
    location.reload();
  },
  useLocal() { this.s.mode = "local"; this.save(); location.reload(); },
  /** Reconfere o acesso junto da nuvem (chamado depois de sincronizar, no maximo a cada 5 min). */
  async revalidate() {
    if (!this.active || this.isAdmin() || Date.now() - (this.lastCheck || 0) < 300000) return;
    this.lastCheck = Date.now();
    const d = dbx(), tk = await this.token();
    const r = await d.getJson(tk, d.basePath + "/" + FILE);
    if (!r) return;
    wr(ACCESS + this.slug(), r.data);
    const u = (r.data.users || []).find((x) => x.u === this.me.u);
    if (!u || u.hash !== this.me.k || u.papel !== this.me.papel) { this.s.kick = "Seu acesso a esta empresa foi alterado. Entre novamente."; this.leave(true); }
  },

  // ---------------------------------------------------------------- usuarios (dono)
  async editUsers(fn) {
    const d = dbx();
    for (let i = 0; ; i++) {
      const tk = await this.token(); await d.checkFolder(tk);
      const r = await d.getJson(tk, d.basePath + "/" + FILE);
      const acc = r ? r.data : { v: 1, empresa: this.s.empresa, users: [] };
      fn(acc);
      if (!(acc.users || []).some((x) => x.papel === "dono")) throw new Error("A empresa precisa ter pelo menos um dono.");
      try { await d.putJson(tk, d.basePath + "/" + FILE, acc, r ? r.rev : null); wr(ACCESS + this.slug(), acc); return acc; }
      catch (e) { if (e.conflict && i < 4) continue; throw e; }
    }
  },
  async users() { const tk = await this.token(), d = dbx(); await d.checkFolder(tk); const r = await d.getJson(tk, d.basePath + "/" + FILE); return r ? r.data.users || [] : []; },
  async addUser() {
    const v = await P.ask("Novo usuário", [{ key: "nome", label: "Nome da pessoa", required: true }, { key: "u", label: "Usuário (login)", required: true, help: "Sem espaços. Ex.: maria" },
      { key: "papel", label: "Papel", kind: "choice", options: ["Funcionário", "Dono"], help: "Funcionário usa o sistema; só o dono gerencia usuários, backup e configurações." }, { key: "pw", label: "Senha", kind: "password", required: true, help: "Mínimo de 6 caracteres. Passe a senha à pessoa; ela pode trocá-la depois." }], { papel: "Funcionário" }, { ok: "Adicionar" });
    if (!v) return false;
    if (v.pw.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
    const nu = await mkUser(v.u.replace(/\s+/g, ""), v.nome, v.papel === "Dono" ? "dono" : "func", v.pw);
    await this.editUsers((a) => { if (a.users.some((x) => x.u === nu.u)) throw new Error("Já existe um usuário com esse login."); a.users.push(nu); });
    return true;
  },
  async resetPw(u) {
    const v = await P.ask("Nova senha de " + u.nome, [{ key: "pw", label: "Nova senha", kind: "password", required: true, help: "Mínimo de 6 caracteres." }], {}, { ok: "Trocar senha" });
    if (!v) return false;
    if (v.pw.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
    const salt = newSalt(), hash = await hashPw(v.pw, salt);
    await this.editUsers((a) => { const x = a.users.find((y) => y.u === u.u); if (x) { x.salt = salt; x.hash = hash; } });
    return true;
  },
  async removeUser(u) {
    if (!(await P.confirm("Remover usuário", `Remover o acesso de ${u.nome} (${u.u})? Para bloquear também no Dropbox, remova a pessoa da pasta compartilhada.`, "Remover", true))) return false;
    await this.editUsers((a) => { a.users = a.users.filter((x) => x.u !== u.u); });
    return true;
  },
  async changeOwnPw() {
    const v = await P.ask("Trocar minha senha", [{ key: "old", label: "Senha atual", kind: "password", required: true }, { key: "pw", label: "Nova senha", kind: "password", required: true, help: "Mínimo de 6 caracteres." }], {}, { ok: "Trocar senha" });
    if (!v) return false;
    if (v.pw.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
    if ((await hashPw(v.old, (await this.users()).find((y) => y.u === this.me.u).salt)) !== this.me.k) throw new Error("A senha atual está incorreta.");
    const salt = newSalt(), hash = await hashPw(v.pw, salt);
    await this.editUsers((a) => { const x = a.users.find((y) => y.u === this.me.u); if (!x) throw new Error("Usuário não encontrado."); x.salt = salt; x.hash = hash; });
    this.me.k = hash; wr(SES, this.me, sessionStorage);
    if (this.s.rem) { this.s.rem.k = hash; this.save(); }
    return true;
  },
  async invite() {
    const v = await P.ask("Convidar para a pasta do Dropbox", [{ key: "email", label: "E-mail da conta Dropbox da pessoa", required: true, help: "A pessoa recebe um convite do Dropbox e precisa aceitá-lo. Depois crie o usuário dela em “Adicionar usuário”." }], {}, { ok: "Enviar convite" });
    if (!v) return false;
    await dbx().invite(await this.token(), v.email.trim());
    return true;
  },

  // ---------------------------------------------------------------- telas
  setBusy(msg) { this.busy = msg; this.view(); },
  hide() { if (this.el) { this.el.remove(); this.el = null; } },
  show() {
    const sp = document.getElementById("splash"); if (sp) sp.remove();
    if (!this.el) { this.el = h("div", { class: "auth" }); document.body.append(this.el); }
    this.tab = this.tab || "entrar"; this.view();
    if (this.connected() && !this.companies) this.loadCompanies();
  },
  async loadCompanies() {
    this.companies = rd("precifica.auth.companies") || [];
    this.view();
    try { this.companies = await dbx().listCompanies(await this.token()); wr("precifica.auth.companies", this.companies); this.err = ""; }
    catch (e) { if (navigator.onLine) this.err = e.message; }
    this.view();
  },
  view() {
    if (!this.el) return;
    const el = this.el, card = h("div", { class: "auth-card" });
    el.replaceChildren(card);
    card.append(h("div", { class: "auth-brand" }, h("img", { src: P.LOGO, alt: "" }), h("div", {}, h("b", { text: "Precifica" }), h("span", { text: "Precificação e propostas" }))));
    if (this.busy) { card.append(h("div", { class: "auth-busy" }, h("div", { class: "spinner" }), h("p", { text: this.busy }))); return; }
    if (this.notice) card.append(h("div", { class: "callout danger" }, h("p", { class: "msg", text: this.notice })));
    if (!this.connected()) return this.viewConnect(card);
    if (this.mode === "admin") return this.viewAdmin(card);
    this.viewLogin(card);
  },
  viewConnect(card) {
    card.append(h("h2", { text: "Entrar" }), h("p", { class: "auth-p", text: "Os dados da sua empresa ficam no seu Dropbox. Conecte a sua conta para continuar." }),
      btn("Conectar ao Dropbox", () => P.sync.connect().catch((e) => { this.notice = e.message; this.view(); }), "primary", { class: "block" }),
      h("p", { class: "fh", text: "Você escolhe a conta do Dropbox na próxima tela. Se ainda não tem uma, é grátis em dropbox.com." }),
      h("button", { type: "button", class: "auth-link", text: "Usar só neste aparelho, sem login e sem sincronização", onClick: () => this.useLocal() }));
  },
  viewLogin(card) {
    const tabs = h("div", { class: "auth-tabs" }, ["entrar", "criar"].map((t) => h("button", { type: "button", class: this.tab === t ? "on" : "", text: t === "entrar" ? "Entrar" : "Criar empresa", onClick: () => { this.tab = t; this.notice = ""; this.view(); } })));
    card.append(tabs);
    if (this.err) card.append(h("div", { class: "callout danger" }, h("p", { class: "msg", text: this.err })));
    const submit = (fn) => async (ev) => {
      ev && ev.preventDefault(); this.notice = "";
      const b = card.querySelector("form button[type=submit]"); if (b) b.disabled = true;
      try { await fn(); } catch (e) { this.notice = e.message || String(e); this.view(); }
    };
    const rem = h("input", { type: "checkbox" }), remL = h("label", { class: "chk" }, rem, h("span", { text: "Lembrar meu usuário e senha neste aparelho" }));
    const f = (label, el, help) => P.field({ label, help }, el);
    const inp = (type, ph, val) => h("input", { class: "in", type, autocomplete: type === "password" ? "current-password" : "username", value: val || "", placeholder: ph || "" });
    if (this.tab === "criar") {
      const emp = inp("text", "Ex.: Silva Elétrica"), nome = inp("text"), u = inp("text"), p1 = inp("password"), p2 = inp("password");
      p1.autocomplete = p2.autocomplete = "new-password";
      card.append(h("p", { class: "auth-p", text: "Cria a base de dados da empresa no seu Dropbox. Você será o dono e depois cria os logins dos funcionários." }),
        h("form", { class: "auth-form", onSubmit: submit(async () => {
          if (!emp.value.trim() || !nome.value.trim() || !u.value.trim()) throw new Error("Preencha o nome da empresa, o seu nome e o usuário.");
          if (p1.value.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
          if (p1.value !== p2.value) throw new Error("As senhas não conferem.");
          this.setBusy("Criando a empresa…");
          try { await this.create({ empresa: emp.value.trim(), nome: nome.value, user: u.value.replace(/\s+/g, ""), pw: p1.value, remember: rem.checked }); } catch (e) { this.busy = ""; throw e; }
          this.busy = ""; await this.activate();
        }) }, f("Nome da empresa", emp), f("Seu nome", nome), f("Usuário (login)", u, "Sem espaços."), f("Senha", p1, "Mínimo de 6 caracteres."), f("Repita a senha", p2), remL,
          h("button", { type: "submit", class: "btn primary block", text: "Criar empresa" })));
    } else {
      const list = this.companies || [];
      const sel = h("select", { class: "in" }, list.length ? list.map((c) => h("option", { value: c.name, text: c.name.replace(/^precifica-/i, "").replace(/-/g, " ") + (c.pending ? " (convite novo)" : "") })) : [h("option", { value: "", text: "Nenhuma empresa encontrada" })]);
      if (this.s.folder && list.some((c) => c.name === this.s.folder)) sel.value = this.s.folder;
      const u = inp("text", "", this.s.lastUser), p = inp("password");
      const body = [];
      if (!list.length) body.push(h("div", { class: "callout" }, h("p", { class: "msg", text: "Não achei nenhuma empresa no seu Dropbox. Peça ao dono da empresa o convite da pasta (e aceite em dropbox.com › Compartilhado) ou crie uma empresa nova na aba “Criar empresa”." })));
      body.push(f("Empresa", sel), f("Usuário", u), f("Senha", p), remL, h("button", { type: "submit", class: "btn primary block", text: "Entrar" }));
      card.append(h("form", { class: "auth-form", onSubmit: submit(async () => {
        if (!sel.value) throw new Error("Escolha a empresa.");
        this.setBusy("Entrando…");
        let r;
        try { r = await this.login(sel.value, u.value, p.value, rem.checked); } catch (e) { this.busy = ""; throw e; }
        this.busy = "";
        if (r.claim) { this.claimFolder = sel.value; this.tab = "assumir"; return this.view(); }
        await this.activate();
      }) }, body));
      if (this.accountIsAdmin()) card.append(btn("Entrar como administrador", () => { this.mode = "admin"; this.view(); }, "secondary", { class: "block" }));
    }
    card.append(this.footer());
    if (this.tab === "assumir") this.viewClaim(card);
  },
  viewClaim(card) {
    const nome = h("input", { class: "in", type: "text" }), u = h("input", { class: "in", type: "text" }), p1 = h("input", { class: "in", type: "password", autocomplete: "new-password" }), p2 = h("input", { class: "in", type: "password", autocomplete: "new-password" });
    card.replaceChildren(h("div", { class: "auth-brand" }, h("img", { src: P.LOGO, alt: "" }), h("div", {}, h("b", { text: "Precifica" }), h("span", { text: "Primeiro acesso" }))),
      this.notice ? h("div", { class: "callout danger" }, h("p", { class: "msg", text: this.notice })) : null,
      h("p", { class: "auth-p", text: `A pasta “${this.claimFolder}” ainda não tem usuários. Defina o dono dela (você). Os dados que já existem na pasta continuam.` }),
      h("form", { class: "auth-form", onSubmit: async (ev) => {
        ev.preventDefault(); this.notice = "";
        try {
          if (!nome.value.trim() || !u.value.trim()) throw new Error("Preencha o seu nome e o usuário.");
          if (p1.value.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
          if (p1.value !== p2.value) throw new Error("As senhas não conferem.");
          this.setBusy("Salvando…");
          try { await this.create({ empresa: slugOf(this.claimFolder).replace(/-/g, " "), nome: nome.value, user: u.value.replace(/\s+/g, ""), pw: p1.value, folder: this.claimFolder, remember: false }); } catch (e) { this.busy = ""; throw e; }
          this.busy = ""; await this.activate();
        } catch (e) { this.notice = e.message; this.viewClaimAgain(); }
      } }, P.field({ label: "Seu nome" }, nome), P.field({ label: "Usuário (login)" }, u), P.field({ label: "Senha", help: "Mínimo de 6 caracteres." }, p1), P.field({ label: "Repita a senha" }, p2),
      h("button", { type: "submit", class: "btn primary block", text: "Definir dono e entrar" })),
      h("button", { type: "button", class: "auth-link", text: "Voltar", onClick: () => { this.tab = "entrar"; this.view(); } }));
  },
  viewClaimAgain() { this.view(); },
  viewAdmin(card) {
    card.append(h("h2", { text: "Administração" }), h("p", { class: "auth-p", text: "Empresas que compartilharam a pasta com a sua conta do Dropbox. Toque em Abrir para carregar a base de dados da empresa." }));
    const list = this.companies || [];
    if (this.err) card.append(h("div", { class: "callout danger" }, h("p", { class: "msg", text: this.err })));
    card.append(list.length ? h("div", { class: "auth-list" }, list.map((c) => h("div", { class: "auth-row" }, h("div", {}, h("b", { text: c.name.replace(/^precifica-/i, "").replace(/-/g, " ") }), h("span", { text: c.name + (c.pending ? " · convite novo" : "") })),
      btn("Abrir", async () => { try { this.setBusy("Carregando " + c.name + "…"); await this.enterAsAdmin(c.name); } catch (e) { this.busy = ""; this.notice = e.message; this.view(); } }, "primary sm")))) : h("p", { class: "fh", text: "Nenhuma empresa encontrada. Cada empresa precisa compartilhar a pasta “Precifica-…” com esta conta do Dropbox." }));
    card.append(h("div", { class: "auth-actions" }, btn("Atualizar lista", () => { this.companies = null; this.loadCompanies(); }, "secondary sm"), btn("Voltar", () => { this.mode = ""; this.view(); }, "ghost sm")), this.footer());
  },
  footer() {
    const id = P.sync.s.account || "";
    return h("div", { class: "auth-foot" }, h("button", { type: "button", class: "auth-link", text: "Trocar de conta do Dropbox", onClick: () => { P.sync.disconnect(); this.companies = null; this.view(); } }),
      id ? h("details", {}, h("summary", { text: "Informações da conta" }), h("p", { class: "fh", text: "ID da conta Dropbox: " + id })) : null,
      h("button", { type: "button", class: "auth-link", text: "Usar só neste aparelho (sem login)", onClick: () => this.useLocal() }));
  },

  // ---------------------------------------------------------------- pecas da tela principal
  /** Rodape do menu: quem esta logado, empresa e botao de sair/trocar. */
  shellUser() {
    if (!this.active || !this.me) return null;
    return h("div", { class: "whoami" }, h("div", {}, h("b", { text: this.me.nome }), h("span", { text: this.roleLabel() + (this.s.empresa ? " · " + this.s.empresa : "") })),
      btn(this.isAdmin() ? "Trocar empresa" : "Sair", () => this.leave(!this.isAdmin()), "ghost xs"));
  },
  /** Cartoes da pagina Configuracoes no modo empresa. */
  configCards(pg, card) {
    const out = [];
    const guard = (fn) => async () => { try { if (await fn()) pg.rerender(); } catch (e) { P.info("Não foi possível concluir", e.message, "danger"); } };
    out.push(card(h("h3", { text: "Minha conta" }), h("p", { class: "cs", text: `${this.me.nome} · ${this.roleLabel()} · ${this.s.empresa || ""}` }),
      h("div", { class: "bar" }, this.isAdmin() ? null : btn("Trocar minha senha", guard(() => this.changeOwnPw()), "secondary"), btn(this.isAdmin() ? "Trocar de empresa" : "Sair", () => this.leave(!this.isAdmin()), "secondary"))));
    if (this.isOwner()) {
      const box = h("div", { class: "ulist" }, h("p", { class: "fh", text: "Carregando…" }));
      const draw = async () => {
        let us = [];
        try { us = await this.users(); } catch (e) { box.replaceChildren(h("p", { class: "fh", text: "Não foi possível carregar os usuários: " + e.message })); return; }
        box.replaceChildren(...us.map((u) => h("div", { class: "auth-row" }, h("div", {}, h("b", { text: u.nome }), h("span", { text: `${u.u} · ${ROLE[u.papel]}` })),
          h("div", { class: "bar" }, btn("Nova senha", async () => { try { if (await this.resetPw(u)) { P.ui.toast("Senha alterada"); draw(); } } catch (e) { P.info("Erro", e.message, "danger"); } }, "secondary xs"),
            u.u === this.me.u ? null : btn("Remover", async () => { try { if (await this.removeUser(u)) { P.ui.toast("Usuário removido"); draw(); } } catch (e) { P.info("Erro", e.message, "danger"); } }, "danger xs")))));
      };
      draw();
      out.push(card(h("h3", { text: "Usuários da empresa" }), h("p", { class: "cs", text: "Quem pode entrar no sistema. Funcionários usam o sistema; só o dono gerencia usuários, backup e configurações." }), box,
        h("div", { class: "bar" }, btn("+ Adicionar usuário", guard(async () => { const ok = await this.addUser(); if (ok) draw(); return false; })), btn("Convidar pelo Dropbox", guard(async () => { if (await this.invite()) P.ui.toast("Convite enviado"); return false; }), "secondary"),
          P.SUPPORT_EMAIL ? btn("Compartilhar com o suporte", guard(async () => { if (!(await P.confirm("Compartilhar com o suporte", "Dá acesso à pasta desta empresa à equipe de suporte do Precifica, que poderá abrir e ajustar a base de dados. Continuar?", "Compartilhar"))) return false; await dbx().invite(await this.token(), P.SUPPORT_EMAIL); P.ui.toast("Pasta compartilhada com o suporte"); return false; }), "secondary") : null),
        h("p", { class: "fh", text: "Para uma pessoa entrar: 1) convide o e-mail do Dropbox dela; 2) crie o usuário e a senha dela aqui; 3) ela abre o app, conecta o Dropbox, aceita o convite e entra com o usuário e a senha." })));
    }
    return out;
  },
};
