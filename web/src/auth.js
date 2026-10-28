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
const POLICY = "precifica.policy.v1", LIC = "precifica.lic.v1", TRIAL = "precifica.trial.v1", BLOCK = "precifica.block.v1";
const PRIV = "/Precifica_Admin/politica.json", PUB = "/Precifica_Admin/publico.json";   // regras do sistema (privada com e-mails / publica so com hashes)
const ADMIN = "precifica.admin.v1";               // copia local do login do administrador
const ADMIN_PATH = "/Precifica_Admin/admin.json";   // no Dropbox do proprio administrador (fora das pastas das empresas)
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
  slug() { return this.adminHome ? "__admin" : this.active ? slugOf(this.s.folder) : ""; },
  isAdmin() { return !!this.me && this.me.papel === "admin"; },
  isOwner() { return !!this.me && (this.me.papel === "dono" || this.me.papel === "admin"); },
  /** Conta Dropbox autorizada como administradora (lista P.ADMIN_IDS; enquanto a lista estiver vazia, qualquer conta pode criar o proprio login). */
  adminAllowed() { return this.connected() && (!(P.ADMIN_IDS || []).length || P.ADMIN_IDS.includes(P.sync.s.account)); },
  connected() { return !!(P.sync.s.connected && P.sync.s.refresh && P.sync.s.account); },
  email() { return String(P.sync.s.email || "").toLowerCase(); },
  policyOn() { return !!P.POLICY_URL; },
  async hashEmail(e) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("precifica:" + String(e).trim().toLowerCase()));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  },
  /** Regras do teste offline (configuradas no painel do administrador). */
  rules() { const p = rd(POLICY) || {}; return { teste: Math.max(5, +p.teste_s || 30), bloqueio: Math.max(0.05, +p.bloqueio_h || 5) }; },
  async loadPolicy() {
    if (!this.policyOn()) return null;
    try { const j = await dbx().sharedFile(await this.token(), P.POLICY_URL); wr(POLICY, j); return j; } catch (e) { return rd(POLICY); }
  },
  /** {limite} se este e-mail pode criar empresas, senao null. */
  async creatorInfo() {
    if (!this.policyOn() || this.isAdmin()) return { limite: Infinity };
    const em = this.email(), p = rd(POLICY);
    if (!em || !p) return null;
    const h = await this.hashEmail(em), c = (p.criadores || []).find((x) => x.h === h);
    return c ? { limite: c.limite === undefined || c.limite === null ? 1 : (+c.limite || Infinity) } : null;   // 0 = sem limite
  },
  /** Atualiza empresas visiveis, regras e se este e-mail tem acesso. */
  async refreshLicense() {
    const tk = await this.token();
    this.companies = await dbx().listCompanies(tk); wr("precifica.auth.companies", this.companies);
    await this.loadPolicy();
    this.creatorEntry = await this.creatorInfo();
    this.licensed = !this.policyOn() || !!this.creatorEntry || this.companies.length > 0 || (P.ADMIN_IDS || []).includes(P.sync.s.account);
    if (this.licensed && this.policyOn()) wr(LIC, { ok: true });
  },
  // ---- modo offline de teste e bloqueio (so neste aparelho: sem servidor nao ha como bloquear por IP)
  isBlocked() {
    const b = rd(BLOCK);
    if (!b) return false;
    if (Date.now() < b.until) return true;
    try { localStorage.removeItem(BLOCK); localStorage.removeItem(TRIAL); } catch (e) { /* ok */ }
    return false;
  },
  async unblockIfLicensed() {
    if (!this.connected()) return false;
    try { await this.refreshLicense(); } catch (e) { return false; }
    if (!this.licensed) return false;
    try { localStorage.removeItem(BLOCK); localStorage.removeItem(TRIAL); } catch (e) { /* ok */ }
    return true;
  },
  startTrial() {
    const r = this.rules(); let t = rd(TRIAL) || { used: 0 };
    const chip = h("div", { class: "trialchip" }), txt = h("span"), out = h("button", { type: "button", text: "Entrar com uma conta", onClick: () => this.exitLocal() });
    chip.append(txt, out); document.body.append(chip);
    const iv = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      t.used += 1; wr(TRIAL, t); tick();
    }, 1000);
    const tick = () => {
      const left = Math.ceil(r.teste - t.used);
      if (left <= 0) { clearInterval(iv); chip.remove(); wr(BLOCK, { until: Date.now() + r.bloqueio * 3600000 }); P.app.db && P.app.db._flush(); this.showBlocked(); return; }
      txt.textContent = `Modo offline de teste: ${left}s`;
    };
    tick();
  },
  showBlocked() {
    const sp = document.getElementById("splash"); if (sp) sp.remove();
    if (this.blockEl) this.blockEl.remove();
    const b = rd(BLOCK) || { until: Date.now() }, left = h("b"), card = h("div", { class: "auth-card" });
    const fmt = (ms) => { const m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`; };
    card.append(h("div", { class: "auth-brand" }, h("img", { src: P.LOGO, alt: "" }), h("div", {}, h("b", { text: "Precifica" }), h("span", { text: "Acesso bloqueado" }))),
      h("p", { class: "auth-p" }, "O tempo de teste acabou. Você poderá usar o modo offline de novo em ", left, "."),
      h("p", { class: "fh", text: "Já tem acesso? Entre com a conta do Dropbox que foi liberada." }),
      this.connected() ? h("p", { class: "fh", text: `A conta ${this.email() || "do Dropbox"} ainda não foi liberada.` }) : null,
      btn(this.connected() ? "Verificar meu acesso" : "Conectar ao Dropbox", async () => { if (!this.connected()) return P.sync.connect().catch((e) => P.info("Não foi possível conectar", e.message, "danger")); if (await this.unblockIfLicensed()) location.reload(); else P.ui.toast("Este e-mail ainda não tem acesso", "warn"); }, "primary", { class: "block" }));
    this.blockEl = h("div", { class: "auth", style: { zIndex: 300 } }, card);
    document.body.append(this.blockEl);
    const upd = () => { left.textContent = fmt(b.until - Date.now()); if (Date.now() >= b.until) location.reload(); };
    upd(); setInterval(upd, 15000);
  },
  roleLabel() { return this.me ? ROLE[this.me.papel] || "" : ""; },

  // ---------------------------------------------------------------- entrada
  /** Chamado ao abrir o app. Quando o acesso estiver liberado, chama ready(). */
  async enter(ready, redirectMsg) {
    this.ready = ready; this.notice = redirectMsg && redirectMsg !== "ok" ? redirectMsg : "";
    if (this.isBlocked() && !(await this.unblockIfLicensed())) return this.showBlocked();
    if (this.s.mode === "local") { this.active = false; if (this.policyOn() && !rd(LIC)) this.startTrial(); return ready(); }
    const me = rd(SES, sessionStorage) || (this.s.rem ? { u: this.s.rem.u, k: this.s.rem.k } : null);
    const adm = me && me.papel === "admin" ? me : (this.s.adminRem && (rd(ADMIN) || {}).hash === this.s.adminRem.k ? { u: "admin", nome: "Administrador", papel: "admin", k: this.s.adminRem.k } : null);
    if (adm && this.adminAllowed()) {
      this.me = adm;
      if (this.s.folder && this.s.admin) return this.activate();
      return this.activateHome();
    }
    if (this.s.folder) {
      const acc = rd(ACCESS + slugOf(this.s.folder));
      const u = me && acc && (acc.users || []).find((x) => x.u === me.u);
      if (u && me.k && me.k === u.hash) { this.me = { u: u.u, nome: u.nome, papel: u.papel, k: u.hash }; return this.activate(); }
    }
    if (this.s.kick) { this.notice = this.s.kick; delete this.s.kick; this.save(); }
    this.show();
  },
  /** Administrador sem empresa aberta: so o painel de administracao. */
  activateHome() {
    this.active = true; this.adminHome = true;
    dbx().forced = ""; dbx().folderOk = null; dbx().basePath = null;
    wr(SES, this.me, sessionStorage); this.save();
    this.hide(); this.ready();
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
    if (isNew && this.policyOn() && !this.isAdmin()) {
      await this.refreshLicense();
      const ent = this.creatorEntry;
      if (!ent) throw new Error("Este e-mail do Dropbox não está liberado para criar empresas. Fale com o administrador do sistema.");
      if (ent.limite !== Infinity) {
        let n = 0;
        for (const c of this.companies) { try { const a = await this.readAccess(c.name); if (a && a.criador === this.email()) n++; } catch (e) { /* sem acesso: nao conta */ } }
        if (n >= ent.limite) throw new Error(`Você já criou ${n} empresa${n === 1 ? "" : "s"}. O limite do seu acesso é ${ent.limite}. Fale com o administrador para ampliar.`);
      }
    }
    if (isNew) { folder = "Precifica-" + slugify(empresa); if (folder === "Precifica-") throw new Error("Informe o nome da empresa."); d.forced = folder; await d.createFolder(tk, folder); }
    else { d.forced = folder; d.folderOk = null; d.basePath = null; await d.checkFolder(tk); }
    const owner = await mkUser(user, nome, "dono", pw);
    const acc = { v: 1, empresa: empresa || slugOf(folder), users: [owner], criado: Date.now(), criador: this.email() };
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
    this.save(); wr(SES, this.me, sessionStorage);
    P.app.db && P.app.db._flush();
    location.reload();
  },
  /** Sai da conta (apaga o login lembrado). */
  leave(keepCompany) {
    try { sessionStorage.removeItem(SES); } catch (e) { /* ok */ }
    this.s.rem = null; this.s.adminRem = null; this.s.admin = false;
    if (!keepCompany) this.s.folder = "";
    this.s.mode = "";
    this.save();
    P.app.db && P.app.db._flush();
    location.reload();
  },
  /** Administrador: volta para a lista de empresas sem sair do login. */
  switchCompany() { this.s.folder = ""; this.s.admin = false; this.save(); P.app.db && P.app.db._flush(); location.reload(); },
  exitLocal() { this.s.mode = ""; this.save(); location.reload(); },
  // ---- login do administrador: usuario e senha guardados no Dropbox dele (so a conta autorizada acessa)
  async readAdmin() {
    try { const tk = await this.token(), r = await dbx().getJson(tk, ADMIN_PATH); if (r) wr(ADMIN, r.data); return r ? r.data : null; }
    catch (e) { const c = rd(ADMIN); if (c && !navigator.onLine) return c; throw e; }
  },
  /** Troca a senha do administrador (confere a atual antes). */
  async changeAdminPw() {
    const v = await P.ask("Trocar senha do administrador", [{ key: "old", label: "Senha atual", kind: "password", required: true }, { key: "pw", label: "Nova senha", kind: "password", required: true, help: "Mínimo de 6 caracteres." }], {}, { ok: "Trocar senha" });
    if (!v) return false;
    if (v.pw.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
    const tk = await this.token(), d = dbx(), r = await d.getJson(tk, ADMIN_PATH);
    if (!r || (await hashPw(v.old, r.data.salt)) !== r.data.hash) throw new Error("A senha atual está incorreta.");
    const salt = newSalt(), acc = { ...r.data, salt, hash: await hashPw(v.pw, salt) };
    await d.putJson(tk, ADMIN_PATH, acc, r.rev);
    wr(ADMIN, acc);
    this.me.k = acc.hash; wr(SES, this.me, sessionStorage);
    if (this.s.adminRem) { this.s.adminRem = { k: acc.hash }; this.save(); }
    return true;
  },
  async adminLogin(user, pw, remember, create) {
    if (!this.adminAllowed()) throw new Error("Esta conta do Dropbox não está autorizada como administradora.");
    let acc = await this.readAdmin();
    if (create) {
      if (acc) throw new Error("O administrador já foi criado nesta conta.");
      const salt = newSalt(); acc = { v: 1, u: user.trim().toLowerCase(), salt, hash: await hashPw(pw, salt) };
      const tk = await this.token(), d = dbx();
      await d.rpc("files/create_folder_v2", tk, { path: "/Precifica_Admin", autorename: false });      // se ja existir, tudo bem
      await d.putJson(tk, ADMIN_PATH, acc, null); wr(ADMIN, acc);
    } else if (!acc || acc.u !== user.trim().toLowerCase() || (await hashPw(pw, acc.salt)) !== acc.hash) throw new Error("Usuário ou senha incorretos.");
    this.s.adminRem = remember ? { k: acc.hash } : null;
    this.me = { u: "admin", nome: "Administrador", papel: "admin", k: acc.hash };
    wr(SES, this.me, sessionStorage); this.save();
  },
  // ---- regras do sistema (painel do administrador)
  async policyRead() {
    const r = await dbx().getJson(await this.token(), PRIV);
    return r ? r.data : { criadores: [], teste_s: 30, bloqueio_h: 5 };
  },
  async writeOver(tk, path, data) {
    const d = dbx();
    await d.rpc("files/create_folder_v2", tk, { path: "/Precifica_Admin", autorename: false });      // ja existe? tudo bem
    for (let i = 0; ; i++) {
      const cur = await d.getJson(tk, path);
      try { await d.putJson(tk, path, data, cur ? cur.rev : null); return; } catch (e) { if (e.conflict && i < 4) continue; throw e; }
    }
  },
  async policySave(p) {
    const tk = await this.token();
    await this.writeOver(tk, PRIV, p);
    const pub = { v: 1, teste_s: p.teste_s, bloqueio_h: p.bloqueio_h, criadores: await Promise.all((p.criadores || []).map(async (c) => ({ h: await this.hashEmail(c.email), limite: c.limite }))) };
    await this.writeOver(tk, PUB, pub);
    wr(POLICY, pub);
  },
  async policyLink() { const tk = await this.token(); return dbx().publicLink(tk, PUB); },
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
      { key: "email", label: "E-mail da conta Dropbox da pessoa", help: "Informe para enviar o convite da pasta e liberar o acesso dela. Pode deixar em branco se ela já tem acesso." },
      { key: "papel", label: "Papel", kind: "choice", options: ["Funcionário", "Dono"], help: "Funcionário usa o sistema; só o dono gerencia usuários, backup e configurações." }, { key: "pw", label: "Senha", kind: "password", required: true, help: "Mínimo de 6 caracteres. Passe a senha à pessoa; ela pode trocá-la depois." }], { papel: "Funcionário" }, { ok: "Adicionar" });
    if (!v) return false;
    if (v.pw.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
    const nu = await mkUser(v.u.replace(/\s+/g, ""), v.nome, v.papel === "Dono" ? "dono" : "func", v.pw);
    const em = (v.email || "").trim().toLowerCase();
    if (em) nu.email = em;
    await this.editUsers((a) => { if (a.users.some((x) => x.u === nu.u)) throw new Error("Já existe um usuário com esse login."); a.users.push(nu); });
    if (em) { try { await dbx().invite(await this.token(), em); } catch (e) { throw new Error("O usuário foi criado, mas o convite do Dropbox falhou: " + e.message + " Use “Convidar pelo Dropbox” para tentar de novo."); } }
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
    try {
      await this.refreshLicense(); this.err = "";
      if (this.policyOn() && !this.email()) this.err = "Para conferir a sua liberação, reconecte o Dropbox (“Trocar de conta do Dropbox”).";
    } catch (e) { if (navigator.onLine) this.err = e.message; }
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
    if (this.mode === "adminlogin") return this.viewAdminLogin(card);
    this.viewLogin(card);
  },
  viewConnect(card) {
    card.append(h("h2", { text: "Entrar" }), h("p", { class: "auth-p", text: "Os dados da sua empresa ficam no seu Dropbox. Conecte a sua conta para continuar." }),
      btn("Conectar ao Dropbox", () => P.sync.connect().catch((e) => { this.notice = e.message; this.view(); }), "primary", { class: "block" }),
      h("p", { class: "fh", text: "Você escolhe a conta do Dropbox na próxima tela. Se ainda não tem uma, é grátis em dropbox.com." }),
      h("button", { type: "button", class: "auth-link", text: "Usar só neste aparelho, sem login e sem sincronização", onClick: () => this.useLocal() }));
  },
  viewLogin(card) {
    if (this.policyOn() && this.licensed === false) return this.viewNoAccess(card);
    const canCreate = !this.policyOn() || !!this.creatorEntry;
    if (!canCreate) this.tab = "entrar";
    const tabs = h("div", { class: "auth-tabs" }, ["entrar", "criar"].map((t) => h("button", { type: "button", class: this.tab === t ? "on" : "", text: t === "entrar" ? "Entrar" : "Criar empresa", onClick: () => { this.tab = t; this.notice = ""; this.view(); } })));
    if (canCreate) card.append(tabs);
    if (this.err) card.append(h("div", { class: "callout danger" }, h("p", { class: "msg", text: this.err })));
    const submit = (fn) => async (ev) => {
      ev && ev.preventDefault(); this.notice = "";
      const b = card.querySelector("form button[type=submit]"); if (b) b.disabled = true;
      try { await fn(); } catch (e) { this.notice = e.message || String(e); this.view(); }
    };
    const rem = h("input", { type: "checkbox" }), remL = h("label", { class: "chk" }, rem, h("span", { text: "Lembrar meu usuário e senha neste aparelho" }));
    const f = (label, el, help) => P.field({ label, help }, el);
    const inp = (type, ph, val) => h("input", { class: "in", type, autocomplete: type === "password" ? "current-password" : "username", value: val || "", placeholder: ph || "" });
    if (this.tab === "criar" && canCreate) {
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
      const one = list.length === 1;
      if (one) sel.value = list[0].name;
      body.push(one ? h("p", { class: "auth-p" }, "Empresa: ", h("b", { text: list[0].name.replace(/^precifica-/i, "").replace(/-/g, " ") })) : f("Empresa", sel), f("Usuário", u), f("Senha", p), remL, h("button", { type: "submit", class: "btn primary block", text: "Entrar" }));
      card.append(h("form", { class: "auth-form", onSubmit: submit(async () => {
        if (!sel.value) throw new Error("Escolha a empresa.");
        this.setBusy("Entrando…");
        let r;
        try { r = await this.login(sel.value, u.value, p.value, rem.checked); } catch (e) { this.busy = ""; throw e; }
        this.busy = "";
        if (r.claim) { this.claimFolder = sel.value; this.tab = "assumir"; return this.view(); }
        await this.activate();
      }) }, body));
      card.append(btn("Entrar como administrador", () => this.startAdminLogin(), "secondary", { class: "block" }));
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
  startAdminLogin() {
    this.mode = "adminlogin"; this.notice = ""; this.adminSetup = null; this.view();
    if (!this.adminAllowed()) return;
    this.readAdmin().then((a) => { this.adminSetup = !a; this.view(); }).catch((e) => { this.notice = e.message; this.adminSetup = false; this.view(); });
  },
  viewNoAccess(card) {
    const r = this.rules();
    card.append(h("h2", { text: "Acesso restrito" }),
      h("p", { class: "auth-p", text: `A conta ${this.email() || "do Dropbox"} ainda não foi liberada. Peça ao dono da empresa para adicionar o seu e-mail, ou fale com o administrador do sistema.` }),
      !this.email() ? h("p", { class: "fh", text: "Se o seu e-mail já foi liberado, toque em “Trocar de conta do Dropbox” e conecte de novo para o app ler o e-mail." }) : null,
      btn("Verificar de novo", () => { this.companies = null; this.licensed = undefined; this.loadCompanies(); }, "primary", { class: "block" }),
      btn(`Usar o modo offline (${r.teste} segundos)`, () => this.useLocal(), "secondary", { class: "block" }),
      btn("Entrar como administrador", () => this.startAdminLogin(), "secondary", { class: "block" }), this.footer());
  },
  viewAdminLogin(card) {
    card.append(h("h2", { text: "Administrador" }));
    const back = h("button", { type: "button", class: "auth-link", text: "Voltar", onClick: () => { this.mode = ""; this.notice = ""; this.view(); } });
    if (!this.adminAllowed()) { card.append(h("div", { class: "callout danger" }, h("p", { class: "msg", text: "Esta conta do Dropbox não está autorizada como administradora do sistema. Conecte a conta do administrador (opção “Trocar de conta do Dropbox”)." })), back, this.footer()); return; }
    if (this.adminSetup === null) { card.append(h("div", { class: "auth-busy" }, h("div", { class: "spinner" }), h("p", { text: "Verificando…" })), back); return; }
    const setup = this.adminSetup;
    const u = h("input", { class: "in", type: "text", autocomplete: "username", value: setup ? "" : (rd(ADMIN) || {}).u || "" }), p1 = h("input", { class: "in", type: "password", autocomplete: setup ? "new-password" : "current-password" }), p2 = h("input", { class: "in", type: "password", autocomplete: "new-password" });
    const rem = h("input", { type: "checkbox" });
    card.append(h("p", { class: "auth-p", text: setup ? "Primeiro acesso: crie o usuário e a senha do administrador. Eles ficam guardados no seu Dropbox." : "Entre com o usuário e a senha do administrador." }),
      h("form", { class: "auth-form", onSubmit: async (ev) => {
        ev.preventDefault(); this.notice = "";
        try {
          if (!u.value.trim()) throw new Error("Informe o usuário.");
          if (setup && p1.value.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
          if (setup && p1.value !== p2.value) throw new Error("As senhas não conferem.");
          this.setBusy("Entrando…");
          try { await this.adminLogin(u.value.replace(/\s+/g, ""), p1.value, rem.checked, setup); } finally { this.busy = ""; }
          this.s.folder = ""; this.s.admin = false; this.save(); this.activateHome();
        } catch (e) { this.notice = e.message; this.view(); }
      } }, P.field({ label: "Usuário" }, u), P.field({ label: "Senha", help: setup ? "Mínimo de 6 caracteres." : "" }, p1), setup ? P.field({ label: "Repita a senha" }, p2) : null,
      h("label", { class: "chk" }, rem, h("span", { text: "Lembrar meu usuário e senha neste aparelho" })), h("button", { type: "submit", class: "btn primary block", text: setup ? "Criar administrador" : "Entrar" })), back, this.footer());
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
      btn("Sair", () => this.leave(true), "ghost xs"));
  },
  /** Cartoes da pagina Configuracoes no modo empresa. */
  configCards(pg, card) {
    const out = [];
    const guard = (fn) => async () => { try { if (await fn()) pg.rerender(); } catch (e) { P.info("Não foi possível concluir", e.message, "danger"); } };
    out.push(card(h("h3", { text: "Minha conta" }), h("p", { class: "cs", text: `${this.me.nome} · ${this.roleLabel()} · ${this.s.empresa || ""}` }),
      h("div", { class: "bar" }, this.isAdmin() ? null : btn("Trocar minha senha", guard(() => this.changeOwnPw()), "secondary"), this.isAdmin() ? btn("Voltar à Administração", () => this.switchCompany(), "secondary") : null, btn("Sair", () => this.leave(true), "secondary"))));
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
