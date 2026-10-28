"use strict";
/* Precifica Web - acesso por empresa, so com a conta do Dropbox (sem usuario e senha).
   Cada empresa tem uma pasta "Precifica-<nome>" no Dropbox com:
     precifica-dados.json   os dados (sincronizados em sync.js)
     precifica-acesso.json  quem tem acesso: e-mails e papel (dono / funcionario), criador, suspensao
   Quem entra e' identificado pelo e-mail da conta Dropbox. Com uma empresa so', entra direto; com varias, escolhe.
   O dono adiciona pessoas pelo e-mail (o app convida a pessoa para a pasta no Dropbox). O administrador entra com usuario e senha proprios
   (guardados no Dropbox dele) e ve as empresas que compartilharam a pasta com a conta dele.
   Aviso de seguranca: sem servidor proprio, estas regras sao uma trava de uso. A protecao real dos dados e a permissao da pasta no Dropbox. */
const { h, btn } = P;   // (card vem de pages-b.js por parametro)

const KEY = "precifica.auth.v1";                 // neste aparelho: ultima empresa, modo
const SES = "precifica.auth.me";                 // nesta aba: quem esta logado
const ACCESS = "precifica.acesso.v2.";           // copia local do arquivo de acesso (entrar sem internet)
const FILE = "precifica-acesso.json";
const POLICY = "precifica.policy.v1", LIC = "precifica.lic.v1", TRIAL = "precifica.trial.v1", BLOCK = "precifica.block.v1";
const PRIV = "/Precifica_Admin/politica.json", PUB = "/Precifica_Admin/publico.json";   // regras do sistema (privada com e-mails / publica so com hashes)
const DEF_FUNC = 5;                               // limite padrao de pessoas convidadas por criador
const rd = (k, st = localStorage) => { try { return JSON.parse(st.getItem(k) || "null"); } catch (e) { return null; } };
const wr = (k, v, st = localStorage) => { try { st.setItem(k, JSON.stringify(v)); } catch (e) { /* ok */ } };
const slugify = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const slugOf = (folder) => String(folder || "").replace(/^precifica-/i, "").toLowerCase();
const nice = (folder) => String(folder || "").replace(/^precifica-/i, "").replace(/-/g, " ");
const dbx = () => P.sync.providers.dropbox;
const ROLE = { dono: "Dono", func: "Funcionário", admin: "Administrador" };
const NET = /Failed to fetch|NetworkError|Load failed/i;
const lim = (v, def) => (v === undefined || v === null ? def : (+v || Infinity));   // 0 = sem limite

P.auth = {
  s: rd(KEY) || {}, me: null, active: false, pendingName: "", mine: [], unclaimed: [], accs: {},
  save() { wr(KEY, this.s); },
  slug() { return this.adminHome ? "__admin" : this.active ? slugOf(this.s.folder) : ""; },
  isAdmin() { return !!this.me && this.me.papel === "admin"; },
  isOwner() { return !!this.me && (this.me.papel === "dono" || this.me.papel === "admin"); },
  /** Administrador: a conta Dropbox conectada esta na lista P.ADMIN_IDS (variavel ADMIN_DROPBOX_IDS). Nao ha senha. */
  adminAllowed() { return this.connected() && (P.ADMIN_IDS || []).includes(P.sync.s.account); },
  supportEmail() { return String((rd(POLICY) || {}).suporte_email || P.SUPPORT_EMAIL || "").toLowerCase(); },
  connected() { return !!(P.sync.s.connected && P.sync.s.refresh && P.sync.s.account); },
  email() { return String(P.sync.s.email || "").toLowerCase(); },
  policyOn() { return !!P.POLICY_URL; },
  roleLabel() { return this.me ? ROLE[this.me.papel] || "" : ""; },
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
  /** {limite, limiteFunc} se este e-mail pode criar empresas, senao null. */
  async creatorInfo() {
    if (!this.policyOn() || this.isAdmin()) return { limite: Infinity, limiteFunc: Infinity };
    const em = this.email(), p = rd(POLICY);
    if (!em || !p) return null;
    const h = await this.hashEmail(em), c = (p.criadores || []).find((x) => x.h === h);
    return c ? { limite: lim(c.limite, 1), limiteFunc: lim(c.limite_func, DEF_FUNC) } : null;
  },
  /** A empresa so funciona enquanto o e-mail de quem a criou continua na lista do administrador (sem regras carregadas, nao bloqueia). */
  async creatorListed(email) {
    if (!this.policyOn() || !email) return true;
    const p = rd(POLICY);
    if (!p || email === this.supportEmail()) return true;
    const h = await this.hashEmail(email);
    return (p.criadores || []).some((x) => x.h === h);
  },
  /** Empresas do Dropbox, regras e em quais delas este e-mail tem acesso. */
  async refreshLicense() {
    const tk = await this.token();
    this.companies = await dbx().listCompanies(tk); wr("precifica.auth.companies", this.companies);
    await this.loadPolicy();
    this.creatorEntry = await this.creatorInfo();
    await this.loadMine();
    this.licensed = !this.policyOn() || !!this.creatorEntry || this.mine.some((c) => !c.bloqueada) || (P.ADMIN_IDS || []).includes(P.sync.s.account);
    if (this.licensed && this.policyOn()) wr(LIC, { ok: true });
    this.s.multi = this.mine.length > 1; this.save();
  },
  async loadMine() {
    const em = this.email(), d = dbx(), keep = { f: d.forced, ok: d.folderOk, bp: d.basePath };   // lista as empresas sem desviar a sincronizacao da atual
    this.mine = []; this.unclaimed = []; this.accs = {};
    for (const c of this.companies || []) {
      let acc = null;
      try { acc = await this.readAccess(c.name); } catch (e) { continue; }
      if (!acc || !Array.isArray(acc.members)) { this.unclaimed.push(c.name); continue; }
      this.accs[c.name] = acc;
      const m = em && acc.members.find((x) => x.email === em);
      if (m) this.mine.push({ name: c.name, empresa: acc.empresa || nice(c.name), papel: m.papel, suspensa: !!acc.suspensa, bloqueada: !(await this.creatorListed(acc.criador)) });
    }
    d.forced = keep.f; d.folderOk = keep.ok; d.basePath = keep.bp;
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
    const r = this.rules(); const t = rd(TRIAL) || { used: 0 };
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
      this.connected() ? h("p", { class: "fh", text: `A conta ${this.email() || "do Dropbox"} ainda não foi liberada.` }) : "",
      btn(this.connected() ? "Verificar meu acesso" : "Conectar ao Dropbox", async () => { if (!this.connected()) return P.sync.connect().catch((e) => P.info("Não foi possível conectar", e.message, "danger")); if (await this.unblockIfLicensed()) location.reload(); else P.ui.toast("Este e-mail ainda não tem acesso", "warn"); }, "primary", { class: "block" }));
    this.blockEl = h("div", { class: "auth", style: { zIndex: 300 } }, card);
    document.body.append(this.blockEl);
    const upd = () => { left.textContent = fmt(b.until - Date.now()); if (Date.now() >= b.until) location.reload(); };
    upd(); setInterval(upd, 15000);
  },

  // ---------------------------------------------------------------- entrada
  /** Chamado ao abrir o app. Quando o acesso estiver liberado, chama ready(). */
  async enter(ready, redirectMsg) {
    this.ready = ready; this.notice = redirectMsg && redirectMsg !== "ok" ? redirectMsg : "";
    if (this.isBlocked() && !(await this.unblockIfLicensed())) return this.showBlocked();
    if (this.s.mode === "local") { this.active = false; if (this.policyOn() && !rd(LIC)) this.startTrial(); return ready(); }
    if (this.adminAllowed()) {                                      // a conta do administrador entra direto no painel
      this.me = { u: "admin", nome: "Administrador", papel: "admin" };
      if (this.s.folder && this.s.admin) return this.activate();
      return this.activateHome();
    }
    if (this.s.kick) { this.notice = this.s.kick; delete this.s.kick; this.save(); }
    if (this.s.folder && this.email() && !this.s.choose) {          // abre direto a ultima empresa (copia local do acesso: funciona sem internet)
      const acc = rd(ACCESS + slugOf(this.s.folder)), m = acc && Array.isArray(acc.members) && acc.members.find((x) => x.email === this.email());
      if (m && !acc.suspensa && (await this.creatorListed(acc.criador))) { this.me = { u: this.email(), nome: this.email(), email: this.email(), papel: m.papel }; return this.activate(); }
    }
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
    delete this.s.choose; this.save();
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
    if (!this.isAdmin() && this.me.papel === "dono") setTimeout(() => this.ensureSupport(), 4000);
  },
  /** Entra na empresa escolhida (o e-mail ja foi conferido em loadMine). */
  pick(c) {
    if (c.suspensa) { this.notice = "Esta empresa está suspensa. Fale com o administrador do sistema."; return this.view(); }
    if (c.bloqueada) { this.notice = "O acesso desta empresa foi encerrado pelo administrador do sistema."; return this.view(); }
    this.s.folder = c.name; this.s.empresa = c.empresa; this.s.admin = false;
    this.me = { u: this.email(), nome: this.email(), email: this.email(), papel: c.papel };
    return this.activate();
  },

  // ---------------------------------------------------------------- operacoes
  async token() {
    const tk = await P.sync.provider.token(false);
    if (!tk) throw new Error("A conexão com o Dropbox expirou. Toque em “Trocar de conta do Dropbox” e conecte de novo.");
    return tk;
  },
  /** Aponta o Dropbox para a pasta de uma empresa. */
  useFolder(folder) { if (!folder) return; const d = dbx(); d.forced = folder; d.folderOk = null; d.basePath = null; },
  async readAccess(folder) {
    this.useFolder(folder);
    const d = dbx(), tk = await this.token();
    await d.checkFolder(tk);
    const r = await d.getJson(tk, d.basePath + "/" + FILE);
    if (r) wr(ACCESS + slugOf(folder), r.data);
    return r ? r.data : null;
  },
  /** Cria a empresa (pasta + dono) ou assume uma pasta ja existente que ainda nao tem dono. */
  async create({ empresa, folder }) {
    const em = this.email();
    if (!em) throw new Error("O app ainda não leu o e-mail da sua conta Dropbox. Toque em “Trocar de conta do Dropbox” e conecte de novo.");
    const tk = await this.token(), d = dbx();
    const isNew = !folder;
    if (isNew && this.policyOn() && !this.isAdmin()) {
      await this.refreshLicense();
      const ent = this.creatorEntry;
      if (!ent) throw new Error("Este e-mail do Dropbox não está liberado para criar empresas. Fale com o administrador do sistema.");
      if (ent.limite !== Infinity) {
        const n = Object.values(this.accs).filter((a) => a.criador === em).length;
        if (n >= ent.limite) throw new Error(`Você já criou ${n} empresa${n === 1 ? "" : "s"}. O limite do seu acesso é ${ent.limite}. Fale com o administrador para ampliar.`);
      }
    }
    if (isNew) { folder = "Precifica-" + slugify(empresa); if (folder === "Precifica-") throw new Error("Informe o nome da empresa."); d.forced = folder; await d.createFolder(tk, folder); }
    else { this.useFolder(folder); await d.checkFolder(tk); }
    const nome = empresa || nice(folder);
    const acc = { v: 2, empresa: nome, criador: em, criado: Date.now(), members: [{ email: em, papel: "dono" }] };
    await d.putJson(tk, d.basePath + "/" + FILE, acc, null);
    wr(ACCESS + slugOf(folder), acc);
    await this.shareSupport();
    this.s.folder = folder; this.s.empresa = nome; this.s.admin = false;
    this.me = { u: em, nome: em, email: em, papel: "dono" };
    const key = P.storeKey(slugOf(folder));
    if (!isNew && !localStorage.getItem(key)) { try { const old = localStorage.getItem(P.storeKey("")); if (old) localStorage.setItem(key, old); } catch (e) { /* ok */ } }   // dados que ja estavam neste aparelho
    if (isNew) { this.pendingName = empresa; this.s.pending = empresa; if ((this.companies || []).length) this.s.multi = true; this.save(); }
  },
  /** Compartilha a pasta da empresa com o e-mail do suporte (administrador), para ele poder ver e ajustar a base. */
  async shareSupport() {
    const sup = this.supportEmail();
    if (!sup || sup === this.email()) return;
    try { await dbx().invite(await this.token(), sup); await this.editAcc((a) => { a.suporte = true; }); } catch (e) { /* tenta de novo na proxima abertura pelo dono */ }
  },
  /** Empresas que ja existiam: na primeira abertura pelo dono (no maximo 1 vez por dia), compartilha com o suporte. */
  async ensureSupport() {
    const sup = this.supportEmail(), k = "precifica.sup." + this.slug();
    if (!sup || sup === this.email() || this.me.papel !== "dono") return;
    const acc = rd(ACCESS + this.slug()) || {};
    if (acc.suporte || Date.now() - (+localStorage.getItem(k) || 0) < 86400000) return;
    try { localStorage.setItem(k, String(Date.now())); } catch (e) { /* ok */ }
    await this.shareSupport();
  },
  /** Empresa recem-criada: identidade propria (sem os dados da ACRS) e um logotipo simples com o nome. */
  initCompany(db) {
    const nome = this.pendingName, sigla = nome.split(/\s+/)[0];
    const esc = (t) => t.replace(/[<>&"]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120"><rect width="320" height="120" rx="14" fill="#1B2A3D"/><rect x="18" y="62" width="14" height="30" fill="#FF9900"/><rect x="38" y="48" width="14" height="44" fill="#FF9900"/><rect x="58" y="32" width="14" height="60" fill="#FF9900"/><text x="92" y="72" font-family="Arial,sans-serif" font-size="${nome.length > 16 ? 20 : 26}" font-weight="700" fill="#fff">${esc(nome)}</text></svg>`;
    delete this.s.pending; this.save();
    db.setMany({ empresa_nome: nome, empresa_fantasia: nome, empresa_sigla: sigla, empresa_cidade: "", empresa_uf: "", empresa_logo: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) });
    this.pendingName = "";
  },
  enterAsAdmin(folder) {
    this.s.folder = folder; this.s.empresa = nice(folder); this.s.admin = true;
    this.me = { u: "admin", nome: "Administrador", papel: "admin" };
    this.save(); wr(SES, this.me, sessionStorage);
    P.app.db && P.app.db._flush();
    location.reload();
  },
  /** Sai: o administrador apaga o login lembrado; os demais desconectam o Dropbox deste aparelho. */
  leave(keepCompany) {
    try { sessionStorage.removeItem(SES); } catch (e) { /* ok */ }
    this.s.admin = false; delete this.s.choose;
    if (!keepCompany) this.s.folder = "";
    this.s.mode = "";
    this.save();
    P.app.db && P.app.db._flush();
    if (!this.s.kick) P.sync.disconnect();
    location.reload();
  },
  /** Volta para a lista de empresas (administrador: painel; demais: escolher a empresa). */
  switchCompany() {
    this.s.folder = ""; this.s.admin = false; if (!this.isAdmin()) this.s.choose = true; this.save();
    P.app.db && P.app.db._flush();
    location.reload();
  },
  exitLocal() { this.s.mode = ""; this.save(); location.reload(); },
  useLocal() { this.s.mode = "local"; this.save(); location.reload(); },
  /** Reconfere o acesso junto da nuvem (chamado depois de sincronizar, no maximo a cada 5 min). */
  async revalidate() {
    if (!this.active || this.isAdmin() || Date.now() - (this.lastCheck || 0) < 300000) return;
    this.lastCheck = Date.now();
    const d = dbx(), tk = await this.token();
    const r = await d.getJson(tk, d.basePath + "/" + FILE);
    if (!r) return;
    wr(ACCESS + this.slug(), r.data);
    const m = (r.data.members || []).find((x) => x.email === this.me.email);
    await this.loadPolicy();
    if (!(await this.creatorListed(r.data.criador))) { this.s.kick = "O acesso desta empresa foi encerrado pelo administrador do sistema."; this.leave(true); return; }
    if (r.data.suspensa) { this.s.kick = "Esta empresa foi suspensa. Fale com o administrador do sistema."; this.leave(true); return; }
    if (!m || m.papel !== this.me.papel) { this.s.kick = "O seu acesso a esta empresa foi alterado. Entre novamente."; this.leave(true); }
  },

  // ---------------------------------------------------------------- pessoas com acesso (dono e administrador)
  async editAcc(fn, folder) {
    const d = dbx(); this.useFolder(folder);
    for (let i = 0; ; i++) {
      const tk = await this.token(); await d.checkFolder(tk);
      const r = await d.getJson(tk, d.basePath + "/" + FILE);
      const acc = r ? r.data : { v: 2, empresa: this.s.empresa || nice(d.forced), members: [] };
      if (!Array.isArray(acc.members)) acc.members = [];
      fn(acc);
      if (!acc.members.some((x) => x.papel === "dono")) throw new Error("A empresa precisa ter pelo menos um dono.");
      try { await d.putJson(tk, d.basePath + "/" + FILE, acc, r ? r.rev : null); wr(ACCESS + slugOf(d.forced || this.s.folder), acc); return acc; }
      catch (e) { if (e.conflict && i < 4) continue; throw e; }
    }
  },
  async members(folder) { this.useFolder(folder); const tk = await this.token(), d = dbx(); await d.checkFolder(tk); const r = await d.getJson(tk, d.basePath + "/" + FILE); return r && Array.isArray(r.data.members) ? r.data.members : []; },
  /** Limite de pessoas convidadas: o mesmo para todas as empresas criadas pelo mesmo e-mail. */
  async checkStaffLimit(acc) {
    if (this.isAdmin() || !this.policyOn() || !acc.criador) return;
    const p = rd(POLICY) || await this.loadPolicy();
    const h = await this.hashEmail(acc.criador), e = p && (p.criadores || []).find((x) => x.h === h);
    const limit = lim(e && e.limite_func, DEF_FUNC);
    if (limit === Infinity) return;
    await this.refreshLicense();
    let n = 0;
    for (const a of Object.values(this.accs)) if (a.criador === acc.criador) n += a.members.filter((m) => m.email !== acc.criador).length;
    if (n >= limit) throw new Error(`O limite de ${limit} pessoa${limit === 1 ? "" : "s"} convidada${limit === 1 ? "" : "s"} foi atingido (somando todas as empresas do mesmo criador). Fale com o administrador para ampliar.`);
  },
  async addMember(folder) {
    const v = await P.ask("Adicionar pessoa", [{ key: "email", label: "E-mail da conta Dropbox da pessoa", required: true, mode: "email", help: "Ela recebe o convite da pasta no Dropbox e passa a ter acesso a esta empresa." },
      { key: "papel", label: "Papel", kind: "choice", options: ["Funcionário", "Dono"], help: "Funcionário usa o sistema. O dono também adiciona e remove pessoas, faz backup e muda as configurações." }], { papel: "Funcionário" }, { ok: "Adicionar" });
    if (!v) return false;
    const em = v.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) throw new Error("E-mail inválido. Confira o que foi digitado.");
    const target = folder || this.s.folder;
    const acc0 = (await this.readAccess(target)) || { members: [] };
    if ((acc0.members || []).some((m) => m.email === em)) throw new Error("Este e-mail já tem acesso a esta empresa.");
    await this.checkStaffLimit(acc0);
    await this.editAcc((a) => { if (a.members.some((m) => m.email === em)) throw new Error("Este e-mail já tem acesso a esta empresa."); a.members.push({ email: em, papel: v.papel === "Dono" ? "dono" : "func" }); }, folder);
    try { await dbx().invite(await this.token(), em); }
    catch (e) { throw new Error("A pessoa foi adicionada, mas o convite do Dropbox falhou: " + e.message + " Toque em “Reenviar convite” para tentar de novo."); }
    return true;
  },
  async setRole(m, folder) {
    const novo = m.papel === "dono" ? "func" : "dono";
    if (!(await P.confirm("Mudar papel", `${m.email} passará a ser ${novo === "dono" ? "Dono (adiciona e remove pessoas, backup e configurações)" : "Funcionário"}. Continuar?`, "Mudar"))) return false;
    await this.editAcc((a) => { const x = a.members.find((y) => y.email === m.email); if (x) x.papel = novo; }, folder);
    return true;
  },
  async removeMember(m, folder) {
    if (!(await P.confirm("Remover pessoa", `Remover o acesso de ${m.email}? Para bloquear também no Dropbox, remova-a da pasta compartilhada.`, "Remover", true))) return false;
    await this.editAcc((a) => { a.members = a.members.filter((x) => x.email !== m.email); }, folder);
    return true;
  },
  async resendInvite(m, folder) { this.useFolder(folder); await dbx().invite(await this.token(), m.email); return true; },
  /** Bloqueia ou libera o acesso de todos os usuarios de uma empresa (ex.: falta de pagamento). */
  async setSuspended(folder, on) { await this.editAcc((a) => { if (on) a.suspensa = true; else delete a.suspensa; }, folder); },
  async setOwner(folder) {
    const v = await P.ask("Definir o dono da empresa", [{ key: "email", label: "E-mail da conta Dropbox do dono", required: true, mode: "email" }], {}, { ok: "Definir dono" });
    if (!v) return false;
    const em = v.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) throw new Error("E-mail inválido. Confira o que foi digitado.");
    await this.editAcc((a) => { a.members.push({ email: em, papel: "dono" }); if (!a.criador) a.criador = em; }, folder);
    try { await dbx().invite(await this.token(), em); } catch (e) { /* o convite pode ja existir */ }
    return true;
  },
  /** Resumo de uma empresa para o painel: acesso, ultimo uso e tamanho da base. */
  async companyInfo(folder) {
    this.useFolder(folder);
    const tk = await this.token(), d = dbx();
    await d.checkFolder(tk);
    const r = await d.getJson(tk, d.basePath + "/" + FILE);
    const m = await d.rpc("files/get_metadata", tk, { path: d.basePath + "/precifica-dados.json" });
    return { acc: r ? r.data : null, last: m.res.ok ? m.j.server_modified : "", size: m.res.ok ? m.j.size : 0 };
  },
  /** Baixa a base da empresa (arquivo de backup que o app restaura em Configuracoes). */
  async companyBackup(folder) {
    this.useFolder(folder);
    const tk = await this.token(), d = dbx();
    await d.checkFolder(tk);
    const r = await d.getJson(tk, d.basePath + "/precifica-dados.json");
    if (!r) throw new Error("Esta empresa ainda não tem dados na nuvem.");
    return JSON.stringify({ app: "PrecificaWeb", version: 1, exported_at: new Date().toISOString(), data: r.data });
  },
  async invite(folder) {
    const v = await P.ask("Reenviar convite do Dropbox", [{ key: "email", label: "E-mail da conta Dropbox da pessoa", required: true, mode: "email" }], {}, { ok: "Enviar convite" });
    if (!v) return false;
    this.useFolder(folder);
    await dbx().invite(await this.token(), v.email.trim().toLowerCase());
    return true;
  },

  // ---------------------------------------------------------------- regras do sistema (administrador)
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
    const pub = { v: 1, teste_s: p.teste_s, bloqueio_h: p.bloqueio_h, suporte_email: p.suporte_email || "", criadores: await Promise.all((p.criadores || []).map(async (c) => ({ h: await this.hashEmail(c.email), limite: c.limite, limite_func: c.limite_func }))) };
    await this.writeOver(tk, PUB, pub);
    wr(POLICY, pub);
  },
  async policyLink() { const tk = await this.token(); return dbx().publicLink(tk, PUB); },

  // ---------------------------------------------------------------- telas
  setBusy(msg) { this.busy = msg; this.view(); },
  hide() { if (this.el) { this.el.remove(); this.el = null; } },
  show() {
    const sp = document.getElementById("splash"); if (sp) sp.remove();
    if (!this.el) { this.el = h("div", { class: "auth" }); document.body.append(this.el); }
    this.view();
    if (this.connected() && !this.companies) this.loadCompanies();
  },
  async loadCompanies() {
    this.companies = rd("precifica.auth.companies") || [];
    this.loading = true; this.view();
    try {
      await this.refreshLicense(); this.err = "";
      if (!this.email()) this.err = "O app ainda não leu o e-mail da sua conta. Toque em “Trocar de conta do Dropbox” e conecte de novo.";
    } catch (e) { if (navigator.onLine) this.err = e.message; }
    this.loading = false;
    if (!this.err && this.licensed !== false && this.mine.length === 1 && !this.s.choose && !this.mine[0].suspensa && !this.mine[0].bloqueada) return this.pick(this.mine[0]);   // uma empresa so: entra direto
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
    this.viewHome(card);
  },
  viewConnect(card) {
    card.append(h("h2", { text: "Entrar" }), h("p", { class: "auth-p", text: "Entre com a sua conta do Dropbox. Os dados da sua empresa ficam lá, e o seu e-mail define a que empresas você tem acesso." }),
      btn("Entrar com o Dropbox", () => P.sync.connect().catch((e) => { this.notice = e.message; this.view(); }), "primary", { class: "block" }),
      h("p", { class: "fh", text: "Você escolhe a conta do Dropbox na próxima tela. Se ainda não tem uma, é grátis em dropbox.com." }),
      h("button", { type: "button", class: "auth-link", text: "Usar só neste aparelho, sem login e sem sincronização", onClick: () => this.useLocal() }));
  },
  viewHome(card) {
    if (this.loading && !this.mine.length) { card.append(h("div", { class: "auth-busy" }, h("div", { class: "spinner" }), h("p", { text: "Verificando o seu acesso…" }))); return; }
    if (this.err) card.append(h("div", { class: "callout danger" }, h("p", { class: "msg", text: this.err })));
    if (this.policyOn() && this.licensed === false) return this.viewNoAccess(card);
    const canCreate = !this.policyOn() || !!this.creatorEntry, mine = this.mine;
    if (mine.length) {
      card.append(h("h2", { text: mine.length > 1 ? "Escolha a empresa" : "Sua empresa" }), h("p", { class: "auth-p", text: `Conectado como ${this.email()}.` }),
        h("div", { class: "auth-list" }, mine.map((c) => h("div", { class: "auth-row" }, h("div", {}, h("b", { text: c.empresa }), h("span", { text: ROLE[c.papel] + (c.suspensa ? " · suspensa" : c.bloqueada ? " · acesso encerrado" : "") })),
          btn(c.suspensa ? "Suspensa" : c.bloqueada ? "Encerrada" : "Entrar", () => this.pick(c), c.suspensa || c.bloqueada ? "secondary sm" : "primary sm")))));
    } else {
      card.append(h("h2", { text: "Nenhuma empresa para este e-mail" }), h("p", { class: "auth-p", text: `Conectado como ${this.email() || "(e-mail não lido)"}. ${canCreate ? "Você pode criar uma empresa." : "Peça ao dono da empresa para adicionar o seu e-mail e aceite o convite do Dropbox (e-mail ou dropbox.com › Compartilhado)."}` }));
    }
    if (canCreate) {
      const nome = h("input", { class: "in", type: "text", placeholder: "Ex.: Silva Elétrica" });
      card.append(h("h3", { class: "auth-h3", text: "Criar empresa" }),
        h("form", { class: "auth-form", onSubmit: async (ev) => {
          ev.preventDefault(); this.notice = "";
          try {
            if (!nome.value.trim()) throw new Error("Informe o nome da empresa.");
            this.setBusy("Criando a empresa…");
            try { await this.create({ empresa: nome.value.trim() }); } finally { this.busy = ""; }
            await this.activate();
          } catch (e) { this.notice = e.message; this.view(); }
        } }, P.field({ label: "Nome da empresa" }, nome), h("button", { type: "submit", class: "btn primary block", text: "Criar empresa" })));
    }
    card.append(btn("Verificar de novo", () => { this.companies = null; this.loadCompanies(); }, "ghost sm"), this.footer());
  },
  viewNoAccess(card) {
    const r = this.rules();
    const perdida = this.mine.find((c) => c.bloqueada);
    card.append(h("h2", { text: "Acesso restrito" }),
      perdida ? h("div", { class: "callout danger" }, h("p", { class: "msg", text: `O acesso à empresa “${perdida.empresa}” foi encerrado pelo administrador do sistema. Fale com ele para reativar.` })) : "",
      h("p", { class: "auth-p", text: `A conta ${this.email() || "do Dropbox"} ainda não foi liberada. Peça ao dono da empresa para adicionar o seu e-mail, ou fale com o administrador do sistema.` }),
      !this.email() ? h("p", { class: "fh", text: "Se o seu e-mail já foi liberado, toque em “Trocar de conta do Dropbox” e conecte de novo para o app ler o e-mail." }) : "",
      btn("Verificar de novo", () => { this.companies = null; this.licensed = undefined; this.loadCompanies(); }, "primary", { class: "block" }),
      btn(`Usar o modo offline (${r.teste} segundos)`, () => this.useLocal(), "secondary", { class: "block" }), this.footer());
  },
  footer() {
    const id = P.sync.s.account || "";
    return h("div", { class: "auth-foot" }, h("button", { type: "button", class: "auth-link", text: "Trocar de conta do Dropbox", onClick: () => { P.sync.disconnect(); this.companies = null; this.licensed = undefined; this.mode = ""; this.view(); } }),
      id ? h("details", {}, h("summary", { text: "Informações da conta" }), h("p", { class: "fh", text: "ID da conta Dropbox: " + id + (this.email() ? " · " + this.email() : "") })) : null,
      h("button", { type: "button", class: "auth-link", text: "Usar só neste aparelho (sem login)", onClick: () => this.useLocal() }));
  },

  // ---------------------------------------------------------------- pecas da tela principal
  /** Rodape do menu: quem esta logado, empresa, trocar de empresa e sair. */
  shellUser() {
    if (!this.active || !this.me) return null;
    const many = !this.isAdmin() && (this.mine.length > 1 || this.s.multi);
    return h("div", { class: "whoami" }, h("div", {}, h("b", { text: this.isAdmin() ? this.me.nome : this.me.email }), h("span", { text: this.roleLabel() + (this.s.empresa ? " · " + this.s.empresa : "") })),
      h("div", { class: "bar" }, many ? btn("Trocar", () => this.switchCompany(), "ghost xs", { title: "Trocar de empresa" }) : null, btn("Sair", () => this.leave(true), "ghost xs")));
  },
  /** Cartoes da pagina Configuracoes no modo empresa. */
  configCards(pg, card) {
    const out = [];
    const guard = (fn) => async () => { try { if (await fn()) pg.rerender(); } catch (e) { P.info("Não foi possível concluir", e.message, "danger"); } };
    const many = !this.isAdmin() && (this.mine.length > 1 || this.s.multi);
    if (this.policyOn() && !this.isAdmin() && this.isOwner()) {
      const txt = h("p", { class: "cs", text: "Consultando os seus limites…" }), bar = h("div", { class: "bar" });
      (async () => {
        try { await this.refreshLicense(); } catch (e) { txt.textContent = "Não foi possível consultar os limites: " + e.message; return; }
        const ent = this.creatorEntry, em = this.email();
        if (!ent) { txt.textContent = "Este e-mail não está liberado para criar empresas."; return; }
        const mias = Object.values(this.accs).filter((a) => a.criador === em);
        const pessoas = mias.reduce((n, a) => n + a.members.filter((m) => m.email !== em).length, 0);
        const L = (v, un) => (v === Infinity ? "sem limite" : `${v} ${un}${v === 1 ? "" : "s"}`);
        txt.textContent = `Empresas criadas por você: ${mias.length} (limite: ${L(ent.limite, "empresa")}). Pessoas convidadas: ${pessoas} (limite: ${L(ent.limiteFunc, "pessoa")}).`;
        if (mias.length < ent.limite) bar.append(btn("+ Criar nova empresa", guard(async () => {
          const v = await P.ask("Nova empresa", [{ key: "nome", label: "Nome da empresa", required: true }], {}, { ok: "Criar empresa" });
          if (!v) return false;
          await this.create({ empresa: v.nome.trim() });
          wr(SES, this.me, sessionStorage); P.app.db && P.app.db._flush();
          location.reload();
          return false;
        })));
        else bar.append(h("span", { class: "fh", text: "Você atingiu o limite de empresas. Para criar mais, fale com o administrador." }));
      })();
      out.push(card(h("h3", { text: "Limites do seu acesso" }), txt, bar));
    }
    out.push(card(h("h3", { text: "Minha conta" }), h("p", { class: "cs", text: `${this.isAdmin() ? "Administrador" : this.me.email} · ${this.roleLabel()} · ${this.s.empresa || ""}` }),
      h("div", { class: "bar" }, this.isAdmin() ? btn("Voltar à Administração", () => this.switchCompany(), "secondary") : null, many ? btn("Trocar de empresa", () => this.switchCompany(), "secondary") : null, btn("Sair", () => this.leave(true), "secondary"))));
    if (this.isOwner()) {
      const box = h("div", { class: "ulist" }, h("p", { class: "fh", text: "Carregando…" }));
      const draw = async () => {
        let ms = [];
        try { ms = await this.members(); } catch (e) { box.replaceChildren(h("p", { class: "fh", text: "Não foi possível carregar: " + e.message })); return; }
        box.replaceChildren(...ms.map((m) => h("div", { class: "auth-row" }, h("div", {}, h("b", { text: m.email }), h("span", { text: ROLE[m.papel] })),
          m.email === (this.me.email || "") ? null : h("div", { class: "bar" }, btn(m.papel === "dono" ? "Tornar funcionário" : "Tornar dono", guard(async () => { if (await this.setRole(m)) draw(); return false; }), "secondary xs"),
            btn("Reenviar convite", guard(async () => { await this.resendInvite(m); P.ui.toast("Convite enviado"); return false; }), "secondary xs"),
            btn("Remover", guard(async () => { if (await this.removeMember(m)) draw(); return false; }), "danger xs")))));
      };
      draw();
      out.push(card(h("h3", { text: "Pessoas com acesso" }), h("p", { class: "cs", text: "Quem pode entrar nesta empresa. Basta informar o e-mail do Dropbox da pessoa: o app envia o convite da pasta e libera o acesso." }), box,
        h("div", { class: "bar" }, btn("+ Adicionar pessoa", guard(async () => { if (await this.addMember()) draw(); return false; })),
          P.SUPPORT_EMAIL ? btn("Compartilhar com o suporte", guard(async () => { if (!(await P.confirm("Compartilhar com o suporte", "Dá acesso à pasta desta empresa à equipe de suporte do Precifica, que poderá abrir e ajustar a base de dados. Continuar?", "Compartilhar"))) return false; await dbx().invite(await this.token(), P.SUPPORT_EMAIL); P.ui.toast("Pasta compartilhada com o suporte"); return false; }), "secondary") : null),
        h("p", { class: "fh", text: "Funcionários não adicionam nem removem pessoas. O limite de pessoas convidadas é definido pelo administrador do sistema." })));
    }
    return out;
  },
};
P.auth.pendingName = P.auth.s.pending || "";   // empresa criada ha pouco (a tela recarrega depois de criar)
