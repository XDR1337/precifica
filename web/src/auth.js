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
const POLICY = "precifica.policy.v1";
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
  supportId() { return String((rd(POLICY) || {}).suporte_id || (P.ADMIN_IDS || [])[0] || ""); },
  /** E-mails de todos os administradores que recebem acesso as empresas (o primeiro e' o do suporte, que tambem recebe a propriedade da pasta). */
  supportEmails() { const p = rd(POLICY) || {}; return (p.suporte_emails && p.suporte_emails.length ? p.suporte_emails : [this.supportEmail()]).map((e) => String(e).toLowerCase()).filter(Boolean); },
  supportEmail() { return String((rd(POLICY) || {}).suporte_email || P.SUPPORT_EMAIL || "").toLowerCase(); },
  connected() { return !!(P.sync.s.connected && P.sync.s.refresh && P.sync.s.account); },
  email() { return String(P.sync.s.email || "").toLowerCase(); },
  policyOn() { return !!P.POLICY_URL; },
  roleLabel() { return this.me ? ROLE[this.me.papel] || "" : ""; },
  async hashEmail(e) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("precifica:" + String(e).trim().toLowerCase()));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  },
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
  async creatorListed(email, acc) {
    if (!this.policyOn() || !email || (acc && acc.porAdmin)) return true;
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
    this.s.multi = this.mine.length > 1; this.save();
  },
  async loadMine() {
    const em = this.email();
    this.mine = []; this.unclaimed = []; this.accs = {};
    for (const c of this.companies || []) {
      let acc = null;
      try { acc = await this.readAccess(c.name); } catch (e) { continue; }
      if ((acc && acc.excluida) || this.recentlyClosed(c.name)) continue;      // empresa sendo excluida: nao aparece para ninguem
      if (!acc || !Array.isArray(acc.members)) { this.unclaimed.push(c.name); continue; }
      this.accs[c.name] = acc;
      const m = em && acc.members.find((x) => x.email === em);
      if (m) this.mine.push({ name: c.name, empresa: acc.empresa || nice(c.name), papel: m.papel, suspensa: !!acc.suspensa, bloqueada: !(await this.creatorListed(acc.criador, acc)) });
    }
  },
  // ---------------------------------------------------------------- entrada
  /** Chamado ao abrir o app. Quando o acesso estiver liberado, chama ready(). */
  async enter(ready, redirectMsg) {
    this.ready = ready; this.notice = redirectMsg && redirectMsg !== "ok" ? redirectMsg : "";
    if (this.s.mode) { delete this.s.mode; this.save(); }          // o modo sem conta (local/teste) nao existe mais
    if (this.adminAllowed()) {                                      // a conta do administrador entra direto no painel
      this.me = { u: "admin", nome: "Administrador", papel: "admin" };
      if (this.s.folder && this.s.admin) return this.activate();
      return this.activateHome();
    }
    if (this.s.kick) { this.notice = this.s.kick; delete this.s.kick; this.save(); }
    if (this.s.folder && this.email() && !this.s.choose) {          // abre direto a ultima empresa (copia local do acesso: funciona sem internet)
      const acc = rd(ACCESS + slugOf(this.s.folder)), m = acc && Array.isArray(acc.members) && acc.members.find((x) => x.email === this.email());
      if (m && !acc.suspensa && (await this.creatorListed(acc.criador, acc))) { this.me = { u: this.email(), nome: this.email(), email: this.email(), papel: m.papel }; return this.activate(); }
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
    const cached = rd(ACCESS + this.slug()); if (cached && cached.empresa) this.s.empresa = cached.empresa;   // nome sempre igual ao da empresa aberta
    delete this.s.choose; this.save();
    try {                                              // primeira vez neste aparelho: baixa a base da empresa antes de abrir
      const key = P.storeKey(this.slug());
      if (!localStorage.getItem(key) && this.connected() && navigator.onLine) {
        this.setBusy("Carregando os dados da empresa…");
        const tk = await P.sync.provider.token(false);
        if (tk) {
          const remote = await dbx().read(tk), cached = rd(ACCESS + this.slug());
          if (remote && remote.t) localStorage.setItem(key, JSON.stringify(remote));
          else if (cached && cached.nova) this.pendingName = cached.empresa || this.pendingName;
        }
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
    const d = dbx(), tk = await this.token();
    const base = await d.locate(tk, folder);                 // nao troca a pasta da sincronizacao em andamento
    const r = await d.getJson(tk, base + "/" + FILE);
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
  /** O administrador cria uma empresa (para um cliente ou para si). Nao conta no limite de ninguem. */
  async createByAdmin(empresa, ownerEmail) {
    const adm = this.email(), owner = String(ownerEmail || "").trim().toLowerCase(), nome = String(empresa || "").trim();
    if (!nome) throw new Error("Informe o nome da empresa.");
    if (owner && !/^\S+@\S+\.\S+$/.test(owner)) throw new Error("E-mail do dono inválido.");
    const dono = owner || adm;
    if (!dono) throw new Error("Informe o e-mail do dono da empresa (o app ainda não leu o e-mail da sua conta).");
    const folder = "Precifica-" + slugify(nome);
    if (folder === "Precifica-") throw new Error("Informe o nome da empresa.");
    const tk = await this.token(), d = dbx();
    d.forced = folder; await d.createFolder(tk, folder);
    const acc = { v: 2, empresa: nome, criador: adm || dono, criado: Date.now(), porAdmin: true, nova: true, members: [{ email: dono, papel: "dono" }] };
    await d.putJson(tk, d.basePath + "/" + FILE, acc, null);
    wr(ACCESS + slugOf(folder), acc);
    let aviso = "";
    if (owner && owner !== adm) { try { await d.invite(tk, owner); } catch (e) { aviso = "A empresa foi criada, mas o convite do Dropbox para " + owner + " falhou: " + e.message; } }
    return { folder, aviso };
  },
  /** Convida os administradores para a pasta; quando o do suporte aceitar, a propriedade da pasta passa para ele (tryTransfer). */
  async shareSupport() {
    const cache = rd(ACCESS + this.slug()) || {};
    const conv = cache.admins_conv || (cache.suporte ? [this.supportEmail()] : []);
    const faltam = this.supportEmails().filter((e) => e !== this.email() && !conv.includes(e));
    if (faltam.length) {
      const ok = [];
      for (const e of faltam) { try { await dbx().invite(await this.token(), e); ok.push(e); } catch (x) { /* tenta de novo na proxima abertura pelo dono */ } }
      if (ok.length) { try { await this.editAcc((a) => { a.suporte = true; a.admins_conv = [...new Set([...(a.admins_conv || conv), ...ok])]; }); } catch (e) { /* ok */ } }
    }
    await this.tryTransfer();
  },
  /** Torna o administrador proprietario da pasta no Dropbox. So funciona depois que ele aceitou o convite; senao tenta de novo na proxima vez. */
  async tryTransfer() {
    const id = this.supportId();
    if (!id || id === P.sync.s.account) return;
    try {
      const tk = await this.token(), d = dbx(), info = await d.folderInfo(tk, d.forced || this.s.folder);
      if (!info.owner) { await this.editAcc((a) => { a.transferido = true; }); return; }     // ja pertence a outra conta
      if (!info.sid) return;
      await d.transferFolder(tk, info.sid, id);
      await this.editAcc((a) => { a.transferido = true; });
    } catch (e) { /* o administrador ainda nao aceitou o convite: tenta de novo mais tarde */ }
  },
  /** Na abertura pelo dono (no maximo 1 vez por hora): convida os administradores que faltam e tenta passar a propriedade da pasta. */
  async ensureSupport() {
    const sup = this.supportEmail(), k = "precifica.sup." + this.slug();
    if (!sup || this.me.papel !== "dono") return;
    const acc = rd(ACCESS + this.slug()) || {};
    const conv = acc.admins_conv || (acc.suporte ? [sup] : []);
    const tudo = this.supportEmails().filter((e) => e !== this.email()).every((e) => conv.includes(e));
    if (acc.porAdmin || (acc.transferido && tudo) || Date.now() - (+localStorage.getItem(k) || 0) < 3600000) return;
    try { localStorage.setItem(k, String(Date.now())); } catch (e) { /* ok */ }
    await this.shareSupport();
  },
  /** Empresa recem-criada: identidade propria (sem os dados da ACRS) e um logotipo simples com o nome. */
  initCompany(db) {
    this.brand(db, this.pendingName);
    delete this.s.pending; this.save();
    this.editAcc((a) => { delete a.nova; }).catch(() => {});
    this.pendingName = "";
  },
  /** Depois de "Apagar todos os dados": volta a identidade da empresa (nome + logotipo simples), sem dados da ACRS. */
  resetIdentity(db) { if (this.active && this.s.empresa) this.brand(db, this.s.empresa); },
  brand(db, nome) {
    const sigla = nome.split(/\s+/)[0];
    const esc = (t) => t.replace(/[<>&"]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120"><rect width="320" height="120" rx="14" fill="#1B2A3D"/><rect x="18" y="62" width="14" height="30" fill="#FF9900"/><rect x="38" y="48" width="14" height="44" fill="#FF9900"/><rect x="58" y="32" width="14" height="60" fill="#FF9900"/><text x="92" y="72" font-family="Arial,sans-serif" font-size="${nome.length > 16 ? 20 : 26}" font-weight="700" fill="#fff">${esc(nome)}</text></svg>`;
    db.setMany({ empresa_nome: nome, empresa_fantasia: nome, empresa_sigla: sigla, empresa_cidade: "", empresa_uf: "", empresa_logo: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) });
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
  /** A empresa deixou de existir: esquece a pasta e a copia do acesso, para o app nao tentar abri-la de novo. */
  /** Empresa encerrada pelo administrador: se a pasta for do dono, ele a passa para o administrador antes de sair (assim o administrador pode apaga-la de vez). */
  async closeAndLeave(msg) {
    try { if (!this.isAdmin() && this.me && this.me.papel === "dono") await this.tryTransfer(); } catch (e) { /* sai mesmo assim */ }
    this.forget(msg);
  },
  /** Administrador espera o dono da pasta passar a propriedade (o app do dono faz isso ao ver o aviso de encerramento). */
  waitOwnership(folder, seg = 90) {
    return new Promise((resolve) => {
      const d = dbx(); let n = seg, busy = false, iv = null;
      const txt = h("p", { class: "msg" });
      const fim = (ok) => { clearInterval(iv); m.close(); resolve(ok); };
      const m = P.modal({ title: "Passando a pasta para você…", body: [h("div", { class: "auth-busy" }, h("div", { class: "spinner" }), txt), h("p", { class: "fh", text: "O dono da empresa precisa estar com o app aberto: ao ver o aviso de encerramento, o app dele passa a propriedade da pasta para você sozinho." })], footer: [h("span", { class: "grow" }), btn("Cancelar", () => fim(false), "secondary")], dismiss: false });
      iv = setInterval(async () => {
        txt.textContent = `Aguardando… ${n}s`;
        if (n-- <= 0) return fim(false);
        if (busy || n % 3) return;
        busy = true;
        try { const tk = await this.token(); const i = await d.folderInfo(tk, folder); if (i.owner) fim(true); } catch (e) { /* tenta de novo */ } finally { busy = false; }
      }, 1000);
    });
  },
  recentlyClosed(folder) { const c = rd("precifica.closed") || {}; return Date.now() - (c[slugOf(folder)] || 0) < 86400000; },
  forget(msg) {
    const slug = this.slug();
    try { const c = rd("precifica.closed") || {}; c[slug] = Date.now(); wr("precifica.closed", c); } catch (e) { /* ok */ }
    try { localStorage.removeItem(ACCESS + slug); } catch (e) { /* ok */ }
    this.s.folder = ""; this.s.kick = msg; this.save();
    P.app.db && (P.app.db.persistent = false);
    try { localStorage.removeItem(P.storeKey(slug)); } catch (e) { /* ok */ }
    this.leave(true);
  },
  /** Volta para a lista de empresas (administrador: painel; demais: escolher a empresa). */
  switchCompany() {
    this.s.folder = ""; this.s.admin = false; if (!this.isAdmin()) this.s.choose = true; this.save();
    P.app.db && P.app.db._flush();
    location.reload();
  },
  /** Reconfere o acesso junto da nuvem (chamado depois de sincronizar, no maximo a cada 5 min). */
  async revalidate() {
    if (!this.active || this.isAdmin() || Date.now() - (this.lastCheck || 0) < 300000) return;
    this.lastCheck = Date.now();
    const d = dbx(), tk = await this.token();
    const r = await d.getJson(tk, d.basePath + "/" + FILE);
    if (!r) return;
    wr(ACCESS + this.slug(), r.data);
    const m = (r.data.members || []).find((x) => x.email === this.me.email);
    if (r.data.excluida) { await this.closeAndLeave("Esta empresa foi encerrada pelo administrador."); return; }
    await this.loadPolicy();
    if (!(await this.creatorListed(r.data.criador, r.data))) { this.s.kick = "O acesso desta empresa foi encerrado pelo administrador do sistema."; this.leave(true); return; }
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
    if (this.isAdmin() || !this.policyOn() || !acc.criador || acc.porAdmin) return;
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
  /** Exclui uma empresa (ou, se a pasta for de outra conta, tira da lista). Pede para digitar o nome da pasta. */
  async deleteCompany(folder) {
    this.useFolder(folder);
    const tk = await this.token(), d = dbx(), info = await d.folderInfo(tk, folder);
    const admToma = !info.owner && this.isAdmin();         // a pasta e' de um cliente: o administrador pede a propriedade antes de apagar
    const msg = admToma
      ? "Esta pasta pertence a outra conta do Dropbox. O app avisa todas as pessoas para saírem, pede ao dono para passar a propriedade da pasta para você (o app dele faz isso sozinho), tira todas as pessoas e só então apaga a pasta e TODOS os dados. O Dropbox guarda arquivos apagados por 30 dias."
      : info.owner
      ? "Primeiro desconecta todas as pessoas da empresa (donos e funcionários que estiverem com ela aberta), depois tira todas da pasta no Dropbox e só então apaga a pasta e TODOS os dados. O Dropbox guarda arquivos apagados por 30 dias."
      : "Esta pasta pertence a outra conta do Dropbox (por exemplo, o administrador do sistema). Isto só tira a empresa da sua lista; o limite de empresas volta a ficar livre e os dados continuam guardados com o proprietário da pasta.";
    const v = await P.ask(info.owner || admToma ? "Excluir empresa" : "Sair da empresa", [{ key: "nome", label: `Digite o nome da pasta para confirmar: ${folder}`, required: true, help: msg }], {}, { ok: info.owner || admToma ? "Excluir para sempre" : "Remover da minha lista", danger: true });
    if (!v) return false;
    if (v.nome.trim().toLowerCase() !== folder.toLowerCase()) throw new Error("O nome não confere. Nada foi excluído.");
    const espera = (ms) => new Promise((x) => setTimeout(x, ms));
    let dono = info.owner;
    if (dono || admToma) {
      // 1) para a sincronizacao desta aba e avisa todo mundo (donos e funcionarios): quem estiver com a empresa aberta e' desconectado
      if (this.active && !this.isAdmin()) P.sync.stop();
      await this.markClosing(folder);
      if (admToma) {
        dono = await this.waitOwnership(folder);
        if (!dono) throw new Error("A propriedade da pasta ainda não passou para você: o dono não abriu o app neste tempo. A empresa já está marcada como encerrada; quando ele abrir o app a propriedade passa para você, e então é só excluir de novo.");
      }
      await this.waitClients(dono && admToma ? 20 : 35);
    }
    // 2) tira as pessoas da pasta e apaga
    await d.removeFolder(tk, folder);
    if (dono) {                                         // 3) confere se a pasta sumiu de vez (alguem com versao antiga do app pode recria-la)
      await espera(4000);
      let ainda = await d.rpc("files/get_metadata", tk, { path: "/" + folder });
      if (ainda.res.ok) { await d.removeFolder(tk, folder).catch(() => {}); await espera(4000); ainda = await d.rpc("files/get_metadata", tk, { path: "/" + folder }); }
      if (ainda.res.ok) throw new Error("A pasta voltou a aparecer: alguém ainda está com a empresa aberta numa versão antiga do app e a recriou. Peça para fechar o app (ou desconectar o Dropbox) e exclua de novo.");
    }
    const slug = slugOf(folder);
    try { localStorage.removeItem(P.storeKey(slug)); localStorage.removeItem(ACCESS + slug); } catch (e) { /* ok */ }
    return dono ? "apagada" : "saiu";
  },
  /** Marca a empresa como encerrada nos dois arquivos; quem estiver com ela aberta le a marca na proxima sincronizacao e sai. */
  async markClosing(folder) {
    await this.editAcc((a) => { a.excluida = true; }, folder);
    const tk = await this.token(), d = dbx(), p = d.basePath + "/precifica-dados.json";
    const r = await d.getJson(tk, p);
    if (r) { try { await d.putJson(tk, p, { ...r.data, encerrada: true }, r.rev); } catch (e) { /* alguem gravou junto: a marca no acesso tambem vale */ } }
  },
  /** Espera as pessoas serem desconectadas (a tela de cada uma confere a nuvem a cada ~25 s). */
  waitClients(seg = 35) {
    return new Promise((resolve) => {
      let n = seg, iv = null;
      const txt = h("p", { class: "msg" }), pular = btn("Pular a espera", () => fim(), "secondary");
      const m = P.modal({ title: "Desconectando as pessoas…", body: [h("div", { class: "auth-busy" }, h("div", { class: "spinner" }), txt), h("p", { class: "fh", text: "Quem estiver com a empresa aberta recebe o aviso e sai sozinho. Depois a pasta é apagada." })], footer: [h("span", { class: "grow" }), pular], dismiss: false });
      const fim = () => { clearInterval(iv); m.close(); resolve(); };
      const tick = () => { txt.textContent = `Aguardando ${n}s para apagar…`; if (n-- <= 0) fim(); };
      iv = setInterval(tick, 1000); tick();
    });
  },
  async invite(folder) {
    const v = await P.ask("Reenviar convite do Dropbox", [{ key: "email", label: "E-mail da conta Dropbox da pessoa", required: true, mode: "email" }], {}, { ok: "Enviar convite" });
    if (!v) return false;
    this.useFolder(folder);
    await dbx().invite(await this.token(), v.email.trim().toLowerCase());
    return true;
  },

  // ---------------------------------------------------------------- regras do sistema (administrador)
  /** Pasta das regras (compartilhada entre os administradores) e os dois arquivos dentro dela. */
  async adminPaths(tk) { const dir = await dbx().adminDir(tk); return { dir, priv: dir + "/politica.json", pub: dir + "/publico.json" }; },
  async policyRead() {
    const tk = await this.token(), r = await dbx().getJson(tk, (await this.adminPaths(tk)).priv);
    const p = r ? r.data : { teste_s: 30, bloqueio_h: 5 };
    for (const k of ["criadores", "admins", "ign", "acc"]) p[k] = p[k] || [];     // admins: outros administradores; ign/acc: convites de pastas recusados/aceitos (valem para todos os administradores)
    return p;
  },
  async writeOver(tk, path, data) {
    const d = dbx();
    await d.rpc("files/create_folder_v2", tk, { path: path.slice(0, path.lastIndexOf("/")), autorename: false });      // ja existe? tudo bem
    for (let i = 0; ; i++) {
      const cur = await d.getJson(tk, path);
      try { await d.putJson(tk, path, data, cur ? cur.rev : null); return; } catch (e) { if (e.conflict && i < 4) continue; throw e; }
    }
  },
  async policySave(p) {
    const tk = await this.token();
    const { priv, pub: pubPath } = await this.adminPaths(tk);
    await this.writeOver(tk, priv, p);
    const pub = { v: 1, teste_s: p.teste_s, bloqueio_h: p.bloqueio_h, suporte_email: p.suporte_email || "", suporte_id: p.suporte_id || "", suporte_emails: [...new Set([p.suporte_email, ...(p.admins || []).map((x) => x.email)].map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))], criadores: await Promise.all((p.criadores || []).map(async (c) => ({ h: await this.hashEmail(c.email), limite: c.limite, limite_func: c.limite_func }))) };
    await this.writeOver(tk, pubPath, pub);
    wr(POLICY, pub);
  },
  async policyLink() { const tk = await this.token(); return dbx().publicLink(tk, (await this.adminPaths(tk)).pub); },
  /** Deixa todos os administradores na mesma situacao: a pasta de regras e todas as empresas compartilhadas com cada um (como editores). */
  async syncAdmins() {
    const tk = await this.token(), d = dbx(), p = await this.policyRead(), eu = this.email(), erros = [];
    const emails = [...new Set((p.admins || []).map((x) => String(x.email || "").toLowerCase()))].filter((e) => e && e !== eu);
    if (!emails.length) return { resumo: "Nenhum outro administrador cadastrado.", erros };
    const { dir } = await this.adminPaths(tk);
    await d.rpc("files/create_folder_v2", tk, { path: dir, autorename: false });
    const alvo = [{ nome: "Regras do sistema", path: dir }];
    for (const c of await d.listCompanies(tk)) { if (c.pending) continue; try { alvo.push({ nome: c.name, path: await d.locate(tk, c.name) }); } catch (e) { /* sem acesso */ } }
    let novos = 0;
    for (const t of alvo) {
      let ja = new Set();
      try { ja = (await d.memberEmails(tk, t.path)).emails; } catch (e) { /* nao conseguiu ler: tenta convidar mesmo assim */ }
      for (const em of emails) if (!ja.has(em)) { try { await d.shareFolderPath(tk, t.path, em); novos++; } catch (e) { erros.push(`${t.nome} → ${em}: ${String(e.message).slice(0, 90)}`); } }
    }
    return { resumo: `${novos} convite(s) novo(s) em ${alvo.length} pasta(s).` + (erros.length ? " Falhas: " + erros.join("; ") : ""), erros };
  },

  // ---------------------------------------------------------------- telas
  setBusy(msg, steps) { this.busy = msg; this.busySteps = steps || null; this.view(); },
  /** Animacao de carregamento: barras que sobem (o icone do app), barra de progresso e as etapas aparecendo uma a uma. */
  loaderEl(msg, steps) {
    const items = (steps || []).map((t) => h("li", { text: t }));
    const el = h("div", { class: "loader", role: "status", "aria-live": "polite" }, h("div", { class: "ld-bars" }, h("i"), h("i"), h("i")), h("p", { class: "ld-t", text: msg }),
      h("div", { class: "ld-bar" }, h("i")), items.length ? h("ul", { class: "ld-steps" }, items) : "");
    let i = 0;
    const paint = () => items.forEach((li, k) => { li.className = k < i ? "done" : k === i ? "now" : ""; });
    paint();
    if (items.length > 1) { const iv = setInterval(() => { if (!el.isConnected && i) return clearInterval(iv); if (i < items.length - 1) { i++; paint(); } else clearInterval(iv); }, 1400); }
    return el;
  },
  /** Cobre a tela com a animacao enquanto algo e' criado. Devolve um objeto com close(). */
  loader(msg, steps) {
    const el = h("div", { class: "auth", style: { zIndex: 320 } }, h("div", { class: "auth-card" }, h("div", { class: "auth-brand" }, h("img", { src: P.LOGO, alt: "" }), h("div", {}, h("b", { text: "Precifica" }), h("span", { text: "Precificação e propostas" }))), this.loaderEl(msg, steps)));
    document.body.append(el);
    return { close: () => el.remove() };
  },
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
    if (this.busy) { card.append(this.loaderEl(this.busy, this.busySteps)); return; }
    if (this.notice) card.append(h("div", { class: "callout danger" }, h("p", { class: "msg", text: this.notice })));
    if (!this.connected()) return this.viewConnect(card);
    this.viewHome(card);
  },
  viewConnect(card) {
    card.append(h("h2", { text: "Entrar" }), h("p", { class: "auth-p", text: "Entre com a sua conta do Dropbox. Os dados da sua empresa ficam lá, e o seu e-mail define a que empresas você tem acesso." }),
      btn("Entrar com o Dropbox", () => P.sync.connect().catch((e) => { this.notice = e.message; this.view(); }), "primary", { class: "block" }),
      h("p", { class: "fh", text: "Você escolhe a conta do Dropbox na próxima tela. Se ainda não tem uma, é grátis em dropbox.com." }),
      "");
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
            this.setBusy("Criando a sua empresa…", ["Criando a pasta no Dropbox", "Definindo você como dono", "Convidando os administradores", "Preparando a base de dados"]);
            try { await this.create({ empresa: nome.value.trim() }); } finally { this.busy = ""; }
            await this.activate();
          } catch (e) { this.notice = e.message; this.view(); }
        } }, P.field({ label: "Nome da empresa" }, nome), h("button", { type: "submit", class: "btn primary block", text: "Criar empresa" })));
    }
    card.append(btn("Verificar de novo", () => { this.companies = null; this.loadCompanies(); }, "ghost sm"), this.footer());
  },
  viewNoAccess(card) {
    const perdida = this.mine.find((c) => c.bloqueada);
    card.append(h("h2", { text: "Acesso restrito" }),
      perdida ? h("div", { class: "callout danger" }, h("p", { class: "msg", text: `O acesso à empresa “${perdida.empresa}” foi encerrado pelo administrador do sistema. Fale com ele para reativar.` })) : "",
      h("p", { class: "auth-p", text: `A conta ${this.email() || "do Dropbox"} ainda não foi liberada. Peça ao dono da empresa para adicionar o seu e-mail, ou fale com o administrador do sistema.` }),
      !this.email() ? h("p", { class: "fh", text: "Se o seu e-mail já foi liberado, toque em “Trocar de conta do Dropbox” e conecte de novo para o app ler o e-mail." }) : "",
      btn("Verificar de novo", () => { this.companies = null; this.licensed = undefined; this.loadCompanies(); }, "primary", { class: "block" }),
      h("p", { class: "fh", text: "Se for pedir a liberação, envie o e-mail e o ID abaixo." }), this.contaInfo(), this.footer(true));
  },
  /** Copia um texto (com alternativa para navegadores que bloqueiam a area de transferencia). */
  async copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* tenta o metodo antigo */ }
    try { const t = h("textarea", { value: text, style: { position: "fixed", opacity: 0 } }); document.body.append(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok; } catch (e) { return false; }
  },
  /** Linha "titulo + valor + Copiar" (e-mail e ID da conta Dropbox). */
  copyRow(label, value) {
    const b = btn("Copiar", async () => { const ok = await this.copy(value); b.textContent = ok ? "Copiado ✓" : "Selecione e copie"; setTimeout(() => { b.textContent = "Copiar"; }, 1800); }, "secondary xs");
    return h("div", { class: "copyrow" }, h("div", {}, h("span", { class: "fh", text: label }), h("code", { text: value })), b);
  },
  /** E-mail e ID da conta Dropbox conectada, com botao de copiar. */
  contaInfo() {
    const em = this.email(), id = P.sync.s.account || "";
    return h("div", { class: "copybox" }, em ? this.copyRow("E-mail da conta Dropbox", em) : "", id ? this.copyRow("ID da conta Dropbox", id) : "");
  },
  footer(semInfo) {
    return h("div", { class: "auth-foot" }, h("button", { type: "button", class: "auth-link", text: "Trocar de conta do Dropbox", onClick: () => { P.sync.disconnect(); this.companies = null; this.licensed = undefined; this.mode = ""; this.view(); } }),
      this.connected() && !semInfo ? h("details", {}, h("summary", { text: "Informações da conta" }), this.contaInfo()) : "");
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
          const ld = this.loader("Criando a sua empresa…", ["Criando a pasta no Dropbox", "Definindo você como dono", "Convidando os administradores", "Preparando a base de dados"]);
          try { await this.create({ empresa: v.nome.trim() }); } catch (e) { ld.close(); throw e; }
          wr(SES, this.me, sessionStorage); P.app.db && P.app.db._flush();
          location.reload();
          return false;
        })));
        else bar.append(h("span", { class: "fh", text: "Você atingiu o limite de empresas. Para criar mais, fale com o administrador." }));
      })();
      out.push(card(h("h3", { text: "Limites do seu acesso" }), txt, bar));
    }
    if (this.me.papel === "dono" && !this.isAdmin()) {
      out.push(card(h("h3", { text: "Excluir esta empresa" }), h("p", { class: "cs", text: "Apaga a empresa e todos os dados dela. Se você tem limite de empresas, o espaço volta a ficar livre para criar outra. Faça um backup antes, se precisar guardar algo." }),
        h("div", { class: "bar" }, btn("Excluir esta empresa", async () => {
          try {
            const folder = this.s.folder, r = await this.deleteCompany(folder);
            if (!r) return;
            if (P.app.db) P.app.db.persistent = false;                  // impede que a base apagada seja regravada ao fechar a tela
            try { localStorage.removeItem(P.storeKey(slugOf(folder))); sessionStorage.removeItem(SES); } catch (e) { /* ok */ }
            this.s.folder = ""; delete this.s.choose; delete this.s.pending; this.save();
            P.ui.toast(r === "apagada" ? "Empresa excluída" : "Você saiu da empresa");
            setTimeout(() => location.reload(), 600);
          } catch (e) { P.info("Não foi possível excluir", e.message, "danger"); }
        }, "danger"))));
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
