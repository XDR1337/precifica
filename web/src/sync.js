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
  folder() { if (this.forced) return this.forced; return (P.sync.s.dropboxFolder !== undefined ? P.sync.s.dropboxFolder : (P.SYNC_DROPBOX_FOLDER || "")).trim().replace(/^\/+|\/+$/g, ""); },
  filePath() { return (this.folder() ? (this.basePath || "/" + this.folder()) : "") + "/" + FILE_NAME; },
  redirectUri() { return location.origin + location.pathname; },
  configured() { return !!this.key(); },
  async begin() {                                      // vai para a pagina de login do Dropbox (volta com ?code=...)
    if (!window.crypto || !crypto.subtle) throw new Error("O login do Dropbox precisa de HTTPS (ou localhost).");
    const rnd = crypto.getRandomValues(new Uint8Array(48));
    const verifier = b64url(rnd), state = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    try { localStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, redirect: this.redirectUri() })); } catch (e) { throw new Error("Não foi possível iniciar o login (armazenamento bloqueado)."); }
    const q = new URLSearchParams({ client_id: this.key(), scope: "files.content.read files.content.write files.metadata.read sharing.read sharing.write account_info.read", response_type: "code", code_challenge: challenge, code_challenge_method: "S256", token_access_type: "offline", redirect_uri: this.redirectUri(), state,
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
    const clean = () => { try { history.replaceState(null, "", location.pathname); } catch (e) { /* ok */ } };
    let pk = null;
    try { pk = JSON.parse(localStorage.getItem(PKCE_KEY) || "null"); localStorage.removeItem(PKCE_KEY); } catch (e) { /* ok */ }
    const err = q.get("error_description") || q.get("error"), code = q.get("code"), state = q.get("state");
    clean();
    if (err) throw new Error(q.get("error") === "access_denied" ? "Você não autorizou o acesso ao Dropbox." : err);
    if (!pk || pk.state !== state) throw new Error("O login do Dropbox não pôde ser confirmado. Tente conectar de novo." + KEY_HINT);
    const j = await this.tokenCall({ grant_type: "authorization_code", code, code_verifier: pk.verifier, redirect_uri: pk.redirect });
    P.sync.s.refresh = j.refresh_token; P.sync.s.account = j.account_id || ""; P.sync.s.connected = true; P.sync.s.provider = "dropbox";
    P.sync.setToken(j.access_token, j.expires_in);
    try {                                              // e-mail da conta (para a lista de quem pode criar empresas)
      const r = await fetch("https://api.dropboxapi.com/2/users/get_current_account", { method: "POST", headers: { Authorization: "Bearer " + j.access_token } });
      if (r.ok) P.sync.s.email = String((await r.json()).email || "").toLowerCase();
    } catch (e) { /* sem e-mail: o app pede para reconectar quando precisar */ }
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
  async rpc(path, token, body) {
    const res = await this.call("https://api.dropboxapi.com/2/" + path, token, null, JSON.stringify(body || {}), "application/json");
    const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch (e) { /* ok */ }
    return { res, j, text };
  },
  /** Acha a pasta compartilhada pelo nome: ja montada, convite pendente (aceita sozinho) ou montada com outro nome/lugar. */
  async checkFolder(token) {
    const name = this.folder();
    if (!name) { this.basePath = ""; return; }
    if (this.folderOk === name && this.basePath) return;
    let path = null, scopeMissing = false;
    const miss = (r) => /missing_scope/.test(r.text);
    const meta = await this.rpc("files/get_metadata", token, { path: "/" + name });
    if (meta.res.ok) path = meta.j.path_display || "/" + name;
    else if (miss(meta)) throw this.friendly(meta.res, meta.text);
    const same = (n) => String(n || "").toLowerCase() === name.toLowerCase();
    if (!path) {                                          // convite recebido e ainda nao aceito: aceita aqui
      const m = await this.rpc("sharing/list_mountable_folders", token, {});
      if (m.res.ok) {
        const f = (m.j.entries || []).find((e) => same(e.name));
        if (f) { const mt = await this.rpc("sharing/mount_folder", token, { shared_folder_id: f.shared_folder_id }); if (mt.res.ok) path = mt.j.path_display || mt.j.path_lower || "/" + f.name; }
      } else if (miss(m)) scopeMissing = true;
    }
    let seen = [];
    if (!path) {                                          // ja aceita, mas com outro nome ou em outro lugar
      const l = await this.rpc("sharing/list_folders", token, {});
      if (l.res.ok) {
        seen = (l.j.entries || []).map((e) => e.name);
        const f = (l.j.entries || []).find((e) => same(e.name) && e.path_lower) || (l.j.entries || []).find((e) => String(e.name).toLowerCase().startsWith(name.toLowerCase()) && e.path_lower);
        if (f) path = f.path_lower;
      } else if (miss(l)) scopeMissing = true;
    }
    if (!path) {
      if (scopeMissing) throw new Error("O app precisa de uma permissão nova do Dropbox. Toque em Desconectar, depois em Conectar ao Dropbox e toque em Permitir. Se continuar, avise o administrador (permissões sharing.read e sharing.write).");
      throw new Error(`A pasta “${name}” não foi encontrada no seu Dropbox. Confirme com o administrador que o convite foi enviado ao e-mail desta conta Dropbox e aceite-o em dropbox.com › Compartilhado.${seen.length ? " Pastas compartilhadas que encontrei: " + seen.slice(0, 8).join(", ") + "." : ""}`);
    }
    this.basePath = path.replace(/\/+$/, ""); this.folderOk = name;
  },  async read(token) {
    await this.checkFolder(token);
    const res = await this.call("https://content.dropboxapi.com/2/files/download", token, { path: this.filePath() });
    this.rev = null;
    if (res.status === 409) { await this.verifyFolder(token); return null; }   // o arquivo ainda nao existe (mas a pasta tem que existir)
    if (!res.ok) throw this.friendly(res, await res.text());
    try { this.rev = JSON.parse(res.headers.get("dropbox-api-result")).rev || null; } catch (e) { /* sem rev: grava por cima */ }
    return JSON.parse(await res.text());
  },
  /** Se a pasta da empresa foi apagada, o upload a recriaria sozinho (o Dropbox cria as pastas que faltam). Confere antes de gravar. */
  async verifyFolder(token) {
    if (!this.basePath) return;
    const m = await this.rpc("files/get_metadata", token, { path: this.basePath });
    if (m.res.ok) return;
    this.folderOk = null; this.basePath = null;
    await this.checkFolder(token);                       // lanca "A pasta ... nao foi encontrada" se realmente nao existe
  },
  async write(token, data) {
    // so grava se ninguem alterou o arquivo desde a leitura (evita sobrescrever o trabalho de outra pessoa)
    const mode = this.rev ? { ".tag": "update", update: this.rev } : { ".tag": "add" };
    const res = await this.call("https://content.dropboxapi.com/2/files/upload", token, { path: this.filePath(), mode, autorename: false, mute: true }, JSON.stringify(data), "application/octet-stream");
    if (res.status === 409) { const e = new Error("conflito"); e.conflict = true; throw e; }
    if (!res.ok) throw this.friendly(res, await res.text());
  },  // ---- arquivos e pastas das empresas (login multiempresa, ver auth.js)
  async listCompanies(token) {
    const out = new Map();
    const add = (n, pending, sid) => { if (/^precifica-/i.test(n || "") && !out.has(n.toLowerCase())) out.set(n.toLowerCase(), { name: n, pending: !!pending, sid: sid || null }); };
    let r = await this.rpc("files/list_folder", token, { path: "", limit: 500 });
    if (!r.res.ok) throw this.friendly(r.res, r.text);
    for (;;) {
      (r.j.entries || []).filter((e) => e[".tag"] === "folder").forEach((e) => add(e.name));
      if (!r.j.has_more) break;
      r = await this.rpc("files/list_folder/continue", token, { cursor: r.j.cursor });
      if (!r.res.ok) break;
    }
    const m = await this.rpc("sharing/list_mountable_folders", token, {});
    if (m.res.ok) (m.j.entries || []).forEach((e) => add(e.name, true, e.shared_folder_id));
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  },
  async getJson(token, path) {
    const res = await this.call("https://content.dropboxapi.com/2/files/download", token, { path });
    if (res.status === 409) { if (this.basePath && path.toLowerCase().startsWith(this.basePath.toLowerCase() + "/")) await this.verifyFolder(token); return null; }
    if (!res.ok) throw this.friendly(res, await res.text());
    let rev = null; try { rev = JSON.parse(res.headers.get("dropbox-api-result")).rev || null; } catch (e) { /* ok */ }
    return { data: JSON.parse(await res.text()), rev };
  },
  async putJson(token, path, data, rev) {
    const mode = rev ? { ".tag": "update", update: rev } : { ".tag": "add" };
    const res = await this.call("https://content.dropboxapi.com/2/files/upload", token, { path, mode, autorename: false, mute: true }, JSON.stringify(data), "application/octet-stream");
    if (res.status === 409) { const e = new Error("conflito"); e.conflict = true; throw e; }
    if (!res.ok) throw this.friendly(res, await res.text());
  },
  async createFolder(token, name) {
    const r = await this.rpc("files/create_folder_v2", token, { path: "/" + name, autorename: false });
    if (!r.res.ok) { if (/conflict/.test(r.text)) throw new Error("Já existe uma pasta com esse nome no seu Dropbox. Escolha outro nome para a empresa."); throw this.friendly(r.res, r.text); }
    this.basePath = "/" + name; this.folderOk = name;
  },
  /** Convida uma pessoa (e-mail do Dropbox) para a pasta da empresa, como editora. */
  async invite(token, email) {
    await this.checkFolder(token);
    let id = null;
    const meta = await this.rpc("files/get_metadata", token, { path: this.basePath });
    if (meta.res.ok && meta.j.sharing_info && meta.j.sharing_info.shared_folder_id) id = meta.j.sharing_info.shared_folder_id;
    if (!id) {
      const sh = await this.rpc("sharing/share_folder", token, { path: this.basePath, acl_update_policy: "editors", member_policy: "anyone", force_async: false });
      if (!sh.res.ok) throw this.friendly(sh.res, sh.text);
      id = sh.j.shared_folder_id || null;
      for (let k = 0; !id && sh.j.async_job_id && k < 10; k++) {
        await new Promise((r) => setTimeout(r, 800));
        const st = await this.rpc("sharing/check_share_job_status", token, { async_job_id: sh.j.async_job_id });
        if (st.j && st.j[".tag"] === "complete") id = st.j.shared_folder_id;
        else if (st.j && st.j[".tag"] === "failed") throw new Error("O Dropbox não conseguiu compartilhar a pasta.");
      }
    }
    if (!id) throw new Error("Não foi possível compartilhar a pasta agora. Tente de novo.");
    const r = await this.rpc("sharing/add_folder_member", token, { shared_folder_id: id, quiet: false, members: [{ member: { ".tag": "email", email }, access_level: { ".tag": "editor" } }] });
    if (!r.res.ok) throw this.friendly(r.res, r.text);
  },
  /** Onde esta a pasta e quem e' o dono dela no Dropbox (so o dono apaga para todos; os demais apenas saem). */
  async folderInfo(token, name) {
    this.forced = name; this.folderOk = null; this.basePath = null;
    await this.checkFolder(token);
    const meta = await this.rpc("files/get_metadata", token, { path: this.basePath });
    const sid = meta.res.ok && meta.j.sharing_info ? meta.j.sharing_info.shared_folder_id || null : null;
    let owner = true;
    if (sid) { const fm = await this.rpc("sharing/get_folder_metadata", token, { shared_folder_id: sid }); owner = fm.res.ok ? !!(fm.j.access_type && fm.j.access_type[".tag"] === "owner") : false; }
    return { path: this.basePath, sid, owner };
  },
  /** Tira da pasta compartilhada todas as pessoas (membros e convites pendentes), menos o dono. Devolve quantas foram removidas. */
  async removeAllMembers(token, sid) {
    const alvos = [];
    let r = await this.rpc("sharing/list_folder_members", token, { shared_folder_id: sid, limit: 200 });
    if (!r.res.ok) throw this.friendly(r.res, r.text);
    for (;;) {
      for (const u of r.j.users || []) if (!(u.access_type && u.access_type[".tag"] === "owner") && u.user) alvos.push({ ".tag": "dropbox_id", dropbox_id: u.user.account_id });
      for (const i of r.j.invitees || []) { const iv = i.invitee || {}; alvos.push(iv[".tag"] === "email" ? { ".tag": "email", email: iv.email } : { ".tag": "dropbox_id", dropbox_id: iv.dropbox_id }); }
      if (!r.j.cursor) break;
      r = await this.rpc("sharing/list_folder_members/continue", token, { cursor: r.j.cursor });
      if (!r.res.ok) break;
    }
    let n = 0;
    for (const member of alvos) {
      const x = await this.rpc("sharing/remove_folder_member", token, { shared_folder_id: sid, member, leave_a_copy: false });
      if (!x.res.ok) continue;                                   // uma pessoa que nao saiu nao impede as outras
      n++;
      const job = x.j && x.j.async_job_id;
      for (let k = 0; job && k < 8; k++) {
        await new Promise((t) => setTimeout(t, 600));
        const st = await this.rpc("sharing/check_job_status", token, { async_job_id: job });
        if (st.j && st.j[".tag"] !== "in_progress") break;
      }
    }
    return n;
  },
  /** Dono: apaga a pasta para todos. Quem nao e' dono: sai da pasta compartilhada (ela some so da lista dele). */
  async removeFolder(token, name) {
    const i = await this.folderInfo(token, name);
    if (i.sid && !i.owner) {
      const r = await this.rpc("sharing/relinquish_folder_membership", token, { shared_folder_id: i.sid, leave_a_copy: false });
      if (!r.res.ok) throw this.friendly(r.res, r.text);
      return "saiu";
    }
    if (i.sid) await this.removeAllMembers(token, i.sid);              // primeiro tira todas as pessoas da pasta, depois apaga
    const r = await this.rpc("files/delete_v2", token, { path: i.path });
    if (!r.res.ok) throw this.friendly(r.res, r.text);
    return "apagada";
  },
  /** Recusa o convite de uma pasta compartilhada que ainda nao foi aceita (sem montar a pasta no Dropbox). */
  async declineInvite(token, sid) {
    const r = await this.rpc("sharing/relinquish_folder_membership", token, { shared_folder_id: sid, leave_a_copy: false });
    if (!r.res.ok && /folder_owner/.test(r.text)) { const e = new Error("folder_owner"); e.owner = true; throw e; }
    if (!r.res.ok) throw new Error("O Dropbox não deixou recusar o convite por aqui. Recuse em dropbox.com › Compartilhado › Convites, ou peça a quem criou a pasta para remover a sua conta. " + (r.text || "").slice(0, 200));
  },
  /** Transfere a propriedade da pasta compartilhada para outra conta (que ja precisa ser membro dela). */
  async transferFolder(token, sid, toId) {
    const r = await this.rpc("sharing/transfer_folder", token, { shared_folder_id: sid, to_dropbox_id: toId });
    if (!r.res.ok) throw this.friendly(r.res, r.text);
  },
  /** Pasta compartilhada que e' sua mas nao esta montada: encerra o compartilhamento e apaga a pasta. */
  async unshareAndDelete(token, sid, name) {
    const r = await this.rpc("sharing/unshare_folder", token, { shared_folder_id: sid, leave_a_copy: false });
    if (!r.res.ok) throw this.friendly(r.res, r.text);
    const job = r.j && (r.j.async_job_id || null);
    for (let k = 0; job && k < 15; k++) {
      await new Promise((x) => setTimeout(x, 800));
      const st = await this.rpc("sharing/check_job_status", token, { async_job_id: job });
      const tag = st.j && st.j[".tag"];
      if (tag === "complete") break;
      if (tag === "failed") throw new Error("O Dropbox não conseguiu encerrar o compartilhamento da pasta.");
    }
    const d = await this.rpc("files/delete_v2", token, { path: "/" + name });
    return d.res.ok ? "apagada" : "descompartilhada";
  },
  async deleteFolder(token, name) {
    const r = await this.rpc("files/delete_v2", token, { path: "/" + name });
    if (!r.res.ok) throw this.friendly(r.res, r.text);
  },
  /** Cria (ou acha) o link publico de um arquivo do proprio Dropbox. */
  async publicLink(token, path) {
    const r = await this.rpc("sharing/create_shared_link_with_settings", token, { path, settings: { requested_visibility: "public", audience: "public", access: "viewer" } });
    if (r.res.ok) return r.j.url;
    const l = await this.rpc("sharing/list_shared_links", token, { path, direct_only: true });
    if (l.res.ok && l.j.links && l.j.links[0]) return l.j.links[0].url;
    throw this.friendly(r.res, r.text);
  },
  /** Le um arquivo por link compartilhado, com o token de qualquer conta (nao precisa ser dona do arquivo). */
  async sharedFile(token, url) {
    const res = await this.call("https://content.dropboxapi.com/2/sharing/get_shared_link_file", token, { url });
    if (!res.ok) throw this.friendly(res, await res.text());
    return JSON.parse(await res.text());
  },
  async revoke(token) { try { await fetch("https://api.dropboxapi.com/2/auth/token/revoke", { method: "POST", headers: { Authorization: "Bearer " + token } }); } catch (e) { /* ok */ } },
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
  get connected() { return !!this.s.connected && this.provider.configured() && !(P.auth && P.auth.adminHome); },
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
  /** Ao abrir o app: conclui o login do Dropbox se estivermos voltando dele. Devolve "ok", "" (nao era retorno) ou o texto do erro. */
  async handleRedirect() {
    try { return (await dropbox.finish()) ? "ok" : ""; } catch (e) { return e.message || "Não foi possível conectar ao Dropbox."; }
  },
  disconnect() {
    const t = this.cachedToken(), p = this.provider;
    if (t) p.revoke(t);
    this.clearToken(); dropbox.folderOk = null; dropbox.basePath = null;
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
      if (P.auth && P.auth.active) { try { await P.auth.revalidate(); } catch (e) { /* so confere quando da */ } }
      this.s.last = Date.now(); this.save();
      this.set("idle");
      if (changedLocal) { this.mute = true; try { P.app.changed(); } finally { this.mute = false; } P.ui.toast("Dados atualizados pela nuvem", "info"); }
      else if (interactive) P.ui.toast("Sincronizado com o " + p.name);
    } catch (e) {
      if (e.auth || e.message === "auth") { this.set("auth"); if (interactive) P.ui.toast("Faça login novamente", "warn"); }
      else if (P.auth && P.auth.active && !P.auth.isAdmin() && this.s.last && /A pasta “.*” não foi encontrada/.test(e.message)) { P.auth.forget("Esta empresa não existe mais (foi excluída)."); }
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
    // com a tela aberta, confere a nuvem de tempos em tempos (quem esta editando junto ve as alteracoes sem recarregar)
    setInterval(() => { if (document.visibilityState === "visible" && this.connected && !this.running) this.run({ interactive: false }); }, 25000);
  },
};

// ------------------------------------------------------------------ indicador no menu / barra superior
P.syncBadge = function () {
  const el = h("button", { type: "button", class: "syncbadge", onClick: () => P.sync.run({ interactive: true }).catch((e) => P.info("Sincronização", e.message, "danger")) });
  const upd = () => { const l = P.sync.label(); el.textContent = l ? "☁ " + l : ""; el.style.display = l ? "" : "none"; el.className = "syncbadge " + P.sync.state; el.title = P.sync.msg || ""; };
  P.sync.on(upd); upd();
  return el;
};
