"use strict";
/* Precifica Web - sincronizacao entre aparelhos pela nuvem (hoje: Dropbox, pasta do app).
   O app continua offline primeiro: grava tudo no aparelho e, quando ha internet e login, junta com a copia da nuvem
   (por registro, vence a alteracao mais recente) e envia o resultado. A juncao fica em core.js (Database.mergeRemote).
   O provedor Google Drive (googleProvider) segue no codigo mas nao e oferecido na interface. */
const { h, btn } = P;

const SETTINGS_KEY = "precifica.sync.v1";          // local do aparelho (nao e sincronizado)
const PKCE_KEY = "precifica.dbx.pkce";
const FILE_NAME = "precifica-dados.json";
const load = () => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch (e) { return {}; } };
const store = (s) => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ok */ } };
const KEY_HINT = " A chave do app Dropbox pode estar errada: avise o administrador.";
const authError = () => { const e = new Error("auth"); e.auth = true; return e; };
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ====================================================================== Dropbox (OAuth PKCE, sem servidor)
const dropbox = {
  id: "dropbox", name: "Dropbox",
  key() { return (P.sync.s.dropboxKey || P.SYNC_DROPBOX_KEY || "").trim(); },
  /** Pasta compartilhada no Dropbox (ex.: "Precifica-Equipe"). Vazia = raiz da pasta do app (app tipo "App folder"). */
  folder() { return (P.sync.s.dropboxFolder !== undefined ? P.sync.s.dropboxFolder : (P.SYNC_DROPBOX_FOLDER || "")).trim().replace(/^\/+|\/+$/g, ""); },
  filePath() { return (this.folder() ? "/" + this.folder() : "") + "/" + FILE_NAME; },
  redirectUri() { return location.origin + location.pathname; },
  configured() { return !!this.key(); },
  async begin() {                                      // vai para a pagina de login do Dropbox (volta com ?code=...)
    if (!window.crypto || !crypto.subtle) throw new Error("O login do Dropbox precisa de HTTPS (ou localhost).");
    const rnd = crypto.getRandomValues(new Uint8Array(48));
    const verifier = b64url(rnd), state = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    try { localStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, redirect: this.redirectUri() })); } catch (e) { throw new Error("Não foi possível iniciar o login (armazenamento bloqueado)."); }
    const q = new URLSearchParams({ client_id: this.key(), scope: "files.content.read files.content.write" + (this.folder() ? " files.metadata.read" : ""), response_type: "code", code_challenge: challenge, code_challenge_method: "S256", token_access_type: "offline", redirect_uri: this.redirectUri(), state,
      force_reauthentication: "true", force_reapprove: "true" });   // sempre pede login/conta e a permissao de novo (nao reaproveita a sessao do navegador)
    location.href = "https://www.dropbox.com/oauth2/authorize?" + q;
    await new Promise(() => {});                       // a pagina vai ser trocada
  },
  async tokenCall(params) {
    const res = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", body: new URLSearchParams({ client_id: this.key(), ...params }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { if (j.error === "invalid_grant") throw authError(); throw new Error((j.error_description || j.error || "Dropbox " + res.status) + KEY_HINT); }
    return j;
  },
  /** Chamado ao abrir o app: se voltamos do login do Dropbox, troca o codigo pelo token de longa duracao. */
  async finish() {
    const q = new URLSearchParams(location.search);
    if (!q.has("code") && !q.has("error")) return null;
    const clean = () => { try { history.replaceState(null, "", location.pathname + "#/Configurações"); } catch (e) { /* ok */ } };
    let pk = null;
    try { pk = JSON.parse(localStorage.getItem(PKCE_KEY) || "null"); localStorage.removeItem(PKCE_KEY); } catch (e) { /* ok */ }
    const err = q.get("error_description") || q.get("error"), code = q.get("code"), state = q.get("state");
    clean();
    if (err) throw new Error(q.get("error") === "access_denied" ? "Você não autorizou o acesso ao Dropbox." : err);
    if (!pk || pk.state !== state) throw new Error("O login do Dropbox não pôde ser confirmado. Tente conectar de novo." + KEY_HINT);
    const j = await this.tokenCall({ grant_type: "authorization_code", code, code_verifier: pk.verifier, redirect_uri: pk.redirect });
    P.sync.s.refresh = j.refresh_token; P.sync.s.connected = true; P.sync.s.provider = "dropbox";
    P.sync.setToken(j.access_token, j.expires_in);
    P.sync.save();
    return true;
  },
  async token(interactive) {
    const c = P.sync.cachedToken();
    if (c) return c;
    if (!P.sync.s.refresh) { if (interactive) await this.begin(); return null; }
    try {
      const j = await this.tokenCall({ grant_type: "refresh_token", refresh_token: P.sync.s.refresh });
      P.sync.setToken(j.access_token, j.expires_in);
      return j.access_token;
    } catch (e) { if (e.auth) { P.sync.s.refresh = ""; P.sync.save(); if (interactive) await this.begin(); } if (!e.auth) throw e; return null; }
  },
  async call(url, token, arg, body, ct) {
    const headers = { Authorization: "Bearer " + token };
    if (arg) headers["Dropbox-API-Arg"] = JSON.stringify(arg);
    if (ct) headers["Content-Type"] = ct;
    const res = await fetch(url, { method: "POST", headers, body });
    if (res.status === 401) { P.sync.clearToken(); throw authError(); }
    return res;
  },
  friendly(res, text) {
    let j = null; try { j = JSON.parse(text); } catch (e) { /* ok */ }
    const sum = (j && j.error_summary) || "";
    if (/missing_scope/.test(sum + text)) return new Error("O app do Dropbox está sem alguma permissão (Permissions). Marque files.content.read, files.content.write" + (this.folder() ? " e files.metadata.read" : "") + ", clique em Submit, remova o app em dropbox.com/account/connected_apps e conecte de novo.");
    const hint = res.status === 400 || /invalid_client|client_id|app_key|app key/i.test(sum + text) ? KEY_HINT : "";
    return new Error(`Dropbox ${res.status}: ${(text || "").slice(0, 700)}${hint}`);
  },
  async checkFolder(token) {
    if (!this.folder() || this.folderOk === this.folder()) return;
    const res = await this.call("https://api.dropboxapi.com/2/files/get_metadata", token, null, JSON.stringify({ path: "/" + this.folder() }), "application/json");
    if (res.status === 409) throw new Error(`A pasta “${this.folder()}” não foi encontrada no seu Dropbox. Aceite o convite da pasta compartilhada (veja o e-mail do Dropbox ou dropbox.com › Compartilhado) e tente de novo.`);
    if (!res.ok) throw this.friendly(res, await res.text());
    this.folderOk = this.folder();
  },
  async read(token) {
    await this.checkFolder(token);
    const res = await this.call("https://content.dropboxapi.com/2/files/download", token, { path: this.filePath() });
    this.rev = null;
    if (res.status === 409) return null;               // o arquivo ainda nao existe
    if (!res.ok) throw this.friendly(res, await res.text());
    try { this.rev = JSON.parse(res.headers.get("dropbox-api-result")).rev || null; } catch (e) { /* sem rev: grava por cima */ }
    return JSON.parse(await res.text());
  },
  async write(token, data) {
    // so grava se ninguem alterou o arquivo desde a leitura (evita sobrescrever o trabalho de outra pessoa)
    const mode = this.rev ? { ".tag": "update", update: this.rev } : { ".tag": "add" };
    const res = await this.call("https://content.dropboxapi.com/2/files/upload", token, { path: this.filePath(), mode, autorename: false, mute: true }, JSON.stringify(data), "application/octet-stream");
    if (res.status === 409) { const e = new Error("conflito"); e.conflict = true; throw e; }
    if (!res.ok) throw this.friendly(res, await res.text());
  },  async revoke(token) { try { await fetch("https://api.dropboxapi.com/2/auth/token/revoke", { method: "POST", headers: { Authorization: "Bearer " + token } }); } catch (e) { /* ok */ } },
};

// ====================================================================== Google Drive (nao exposto na interface)
const googleProvider = {
  id: "google", name: "Google Drive", scope: "https://www.googleapis.com/auth/drive.appdata", api: "https://www.googleapis.com",
  key() { return (P.sync.s.clientId || "").trim(); },
  configured() { return !!this.key(); },
  loadGsi() {
    return new Promise((resolve, reject) => {
      if (window.google && google.accounts && google.accounts.oauth2) return resolve();
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.onload = () => resolve(); s.onerror = () => reject(new Error("offline"));
      document.head.append(s);
    });
  },
  async token(interactive) {
    const c = P.sync.cachedToken();
    if (c) return c;
    await this.loadGsi();
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: this.key(), scope: this.scope,
        callback: (r) => { if (r.error) return interactive ? reject(new Error(r.error_description || r.error)) : resolve(null); P.sync.setToken(r.access_token, r.expires_in); resolve(r.access_token); },
        error_callback: (e) => (interactive ? reject(new Error(e.type || "login")) : resolve(null)),
      });
      client.requestAccessToken({ prompt: interactive ? (P.sync.s.connected ? "" : "consent") : "none" });
    });
  },
  async req(method, path, body, token, extra = {}) {
    const res = await fetch((path.startsWith("http") ? "" : this.api) + path, { method, headers: { Authorization: "Bearer " + token, ...(extra.headers || {}) }, body });
    if (res.status === 401) { P.sync.clearToken(); throw authError(); }
    if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 700)}`);
    return extra.text ? res.text() : res.json();
  },
  async read(token) {
    const q = encodeURIComponent(`name='${FILE_NAME}'`);
    const r = await this.req("GET", `/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)&orderBy=modifiedTime desc&pageSize=10`, null, token);
    this.fileId = r.files && r.files.length ? r.files[0].id : null;
    return this.fileId ? JSON.parse(await this.req("GET", `/drive/v3/files/${this.fileId}?alt=media`, null, token, { text: true })) : null;
  },
  async write(token, data) {
    const meta = this.fileId ? {} : { name: FILE_NAME, parents: ["appDataFolder"] };
    const b = "pf" + Math.random().toString(36).slice(2);
    const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${b}--`;
    const url = this.fileId ? `${this.api}/upload/drive/v3/files/${this.fileId}?uploadType=multipart&fields=id` : `${this.api}/upload/drive/v3/files?uploadType=multipart&fields=id`;
    await this.req(this.fileId ? "PATCH" : "POST", url, body, token, { headers: { "Content-Type": `multipart/related; boundary=${b}` } });
  },
  async revoke(token) { try { if (window.google) google.accounts.oauth2.revoke(token, () => {}); } catch (e) { /* ok */ } },
};

// ====================================================================== nucleo (igual para qualquer provedor)
P.sync = {
  s: load(), state: "idle", msg: "", token: null, tokenExp: 0, timer: null, running: false, listeners: [], providers: { dropbox, google: googleProvider },

  get provider() { return this.providers[this.s.provider || "dropbox"]; },
  get connected() { return !!this.s.connected && this.provider.configured(); },
  save() { store(this.s); },
  on(fn) { this.listeners.push(fn); },
  set(state, msg = "") { this.state = state; this.msg = msg; this.listeners.forEach((f) => f()); },
  label() {
    if (!this.connected) return "";
    if (this.state === "syncing") return "Sincronizando…";
    if (this.state === "error") return "Erro na sincronização";
    if (this.state === "auth") return "Toque para reconectar";
    if (this.state === "offline") return "Sem internet – sincroniza depois";
    return this.s.last ? "Sincronizado às " + new Date(this.s.last).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "Conectado";
  },
  // ---- token em memoria (e na sessao) ate vencer
  setToken(t, secs) {
    this.token = t; this.tokenExp = Date.now() + (secs || 3600) * 1000;
    try { sessionStorage.setItem("precifica.sync.token", JSON.stringify({ t, exp: this.tokenExp, p: this.s.provider || "dropbox" })); } catch (e) { /* ok */ }
  },
  clearToken() { this.token = null; this.tokenExp = 0; try { sessionStorage.removeItem("precifica.sync.token"); } catch (e) { /* ok */ } },
  cachedToken() {
    if (this.token && Date.now() < this.tokenExp - 60000) return this.token;
    try { const o = JSON.parse(sessionStorage.getItem("precifica.sync.token") || "null"); if (o && o.p === (this.s.provider || "dropbox") && Date.now() < o.exp - 60000) { this.token = o.t; this.tokenExp = o.exp; return o.t; } } catch (e) { /* ok */ }
    return null;
  },

  async connect() {
    const p = this.provider;
    if (!p.configured()) throw new Error("O app não tem a chave do Dropbox configurada. Avise o administrador.");
    if (p.id === "dropbox") return p.begin();          // sai da pagina; ao voltar, handleRedirect() conclui
    await p.token(true); this.s.connected = true; this.save();
    await this.run({ interactive: true });
  },
  /** Ao abrir o app: conclui o login do Dropbox se estivermos voltando dele. */
  async handleRedirect() {
    try {
      const done = await dropbox.finish();
      if (!done) return;
      P.app.show("Configurações", { push: false });
      P.ui.toast("Dropbox conectado", "ok");
      await this.run({ interactive: true });
      P.app.draw(P.app.pageCtx("Configurações"));
    } catch (e) { P.app.show("Configurações", { push: false }); P.info("Não foi possível conectar ao Dropbox", e.message, "danger"); }
  },
  disconnect() {
    const t = this.cachedToken(), p = this.provider;
    if (t) p.revoke(t);
    this.clearToken();
    this.s = { dropboxKey: this.s.dropboxKey, dropboxFolder: this.s.dropboxFolder, clientId: this.s.clientId };
    this.save();
    this.set("idle");
  },

  // ---- ciclo de sincronizacao
  schedule(ms = 4000) {
    if (!this.connected || this.mute) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run({ interactive: false }), ms);
  },
  async run({ interactive = false } = {}) {
    if (!this.connected) return;
    if (this.running) { this.again = true; return; }
    if (!navigator.onLine) return this.set("offline");
    this.running = true; this.set("syncing");
    const db = P.app.db, p = this.provider;
    try {
      const token = await p.token(interactive);
      if (!token) { this.set("auth"); return; }
      db._flush();
      let changedLocal = false;
      for (let attempt = 0; ; attempt++) {              // se outra pessoa gravou no meio, le de novo, junta e tenta outra vez
        const remote = await p.read(token);
        if (remote && !db.state.replace && db.mergeRemote(remote)) changedLocal = true;
        const mine = db.snapshot();
        if (!remote || db.state.replace || JSON.stringify(mine) !== JSON.stringify(remote)) {
          try { await p.write(token, mine); } catch (e) { if (e.conflict && attempt < 4) continue; throw e; }
        }
        break;
      }      db.state.replace = false; db._flush();
      this.s.last = Date.now(); this.save();
      this.set("idle");
      if (changedLocal) { this.mute = true; try { P.app.changed(); } finally { this.mute = false; } P.ui.toast("Dados atualizados pela nuvem", "info"); }
      else if (interactive) P.ui.toast("Sincronizado com o " + p.name);
    } catch (e) {
      if (e.auth || e.message === "auth") { this.set("auth"); if (interactive) P.ui.toast("Faça login novamente", "warn"); }
      else if (!navigator.onLine || e.message === "offline" || /Failed to fetch|NetworkError|Load failed/i.test(e.message)) this.set("offline");
      else { this.set("error", e.message); if (interactive) throw e; }
    } finally {
      this.running = false;
      if (this.again) { this.again = false; this.schedule(1500); }
    }
  },
  start() {
    P.app.db.onChange = () => this.schedule();
    addEventListener("online", () => this.run({ interactive: false }));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") this.run({ interactive: false }); });
    if (this.connected) this.run({ interactive: false });
  },
};

// ------------------------------------------------------------------ indicador no menu / barra superior
P.syncBadge = function () {
  const el = h("button", { type: "button", class: "syncbadge", onClick: () => P.sync.run({ interactive: true }).catch((e) => P.info("Sincronização", e.message, "danger")) });
  const upd = () => { const l = P.sync.label(); el.textContent = l ? "☁ " + l : ""; el.style.display = l ? "" : "none"; el.className = "syncbadge " + P.sync.state; el.title = P.sync.msg || ""; };
  P.sync.on(upd); upd();
  return el;
};
