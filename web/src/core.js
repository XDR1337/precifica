"use strict";
/* Precifica Web - nucleo: numeros no padrao brasileiro, banco de dados local (localStorage) e motor de calculo.
   O motor reproduz precifica/engine.py (Planilha de Precificacao EG3 R02), formula por formula. */

// ------------------------------------------------------------------ numeros
P.fnum = function (v, d = 0) {
  if (v === null || v === undefined) return d;
  if (typeof v === "number") return Number.isFinite(v) ? v : d;
  let s = String(v).trim().replace(/R\$/g, "").replace(/%/g, "").replace(/[\s ]/g, "");
  if (!s) return d;
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.includes(",")) s = s.replace(/,/g, ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return d;
  return parseFloat(s);
};
const fnum = P.fnum;
P.safeDiv = (a, b, d = 0) => (b ? a / b : d);
const safeDiv = P.safeDiv;

function br(v, dec) {
  const s = Math.abs(v).toFixed(dec);
  const [i, f] = s.split(".");
  return (v < 0 ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (f ? "," + f : "");
}
P.money = (v, dec = 2) => { v = fnum(v); return (v < 0 ? "-" : "") + "R$ " + br(Math.abs(v), dec); };
P.num = (v, dec = 2) => br(fnum(v), dec);
P.pct = (v, dec = 1) => br(fnum(v) * 100, dec) + "%";          // fracao (0,15) -> 15,0%
P.pctN = (v, dec = 2) => br(fnum(v), dec) + "%";                // pontos (15) -> 15,00%
P.numInput = function (v, dec = 2) {
  v = fnum(v);
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return v.toFixed(dec).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
};
P.M = (v) => P.money(v);
P.M4 = (v) => P.money(v, Math.abs(fnum(v)) < 10 ? 4 : 2);
P.N0 = (v) => P.num(v, 0);
P.N2 = (v) => P.num(v, 2);
P.PC = (v) => P.pct(v);
P.round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
P.esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
P.todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
P.fmtDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ""); };
P.parseDateBR = (s) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || "").trim());
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  if (d.getFullYear() !== +m[3] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[1]) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};
P.json = (v, def) => {
  if (v && typeof v === "object" && (Array.isArray(v) === Array.isArray(def))) return v;
  try { const o = v ? JSON.parse(v) : def; return (o && typeof o === "object" && Array.isArray(o) === Array.isArray(def)) ? o : def; }
  catch (e) { return def; }
};

// ------------------------------------------------------------------ banco de dados (localStorage)
const COLS = {
  insumos: { descricao: "", unidade: "Unidade", qtde_bruta: 1, qtde_liquida: 1, custo: 0, categoria: "", obs: "" },
  equipe: { nome: "", salario: 0, setor: "Produtivo", cargo: "", contratacao: "CLT", vale_transporte: 0, vale_refeicao: 0, convenio: 0, carga_horaria: 176 },
  custos_fixos: { descricao: "", valor: 0 },
  imobilizado: { descricao: "", valor: 0, vida_util: 10 },
  servicos: { nome: "", descricao: "", unidade: "Serviço", preco: 0, imposto_pct: 0, cartao_pct: 0, app_pct: 0, comissao_pct: 0, previsao: 0 },
  ficha_mod: { servico_id: 0, equipe_id: 0, horas: 0, tipo_hora: "normal" },
  ficha_insumo: { servico_id: 0, insumo_id: 0, quantidade: 0 },
  revenda: { nome: "", unidade: "Unidade", qtde: 1, custo: 0, preco: 0, imposto_pct: 0, cartao_pct: 0, app_pct: 0, comissao_pct: 0, previsao: 0 },
  clientes: { nome: "", documento: "", endereco: "", complemento: "", bairro: "", cidade: "", uf: "", cep: "", email: "", telefone: "", contato: "", obs: "" },
  propostas: {
    numero: null, data: null, validade_dias: 30, status: "Rascunho", cliente_id: null, cliente_nome: "", cliente_documento: "",
    cliente_endereco: "", cliente_complemento: "", cliente_bairro: "", cliente_cidade: "", cliente_uf: "", cliente_cep: "",
    cliente_email: "", cliente_telefone: "", desconto_valor: 0, forma_pagamento: "", detalhes_pagamento: "", observacoes: "",
    criado_em: null, atualizado_em: null, titulo: "", aos_cuidados: "", objeto: "", escopo_intro: "", escopo_json: "", escopo_nota: "",
    secoes_pre_json: "", secoes_pos_json: "", parcelas_json: "", fecho: "", assinatura1: "", assinatura2: "", assinatura1_img: "", assinatura2_img: "", assinatura1_esc: 100, assinatura2_esc: 100, invest_nova_pagina: 1,
  },
  proposta_itens: { proposta_id: 0, ordem: 0, descricao: "", quantidade: 1, unidade: "", valor_unit: 0, origem: "" },
};
const ORDER = {
  insumos: "descricao", equipe: "nome", servicos: "nome", revenda: "nome", clientes: "nome",
  propostas: "-numero", proposta_itens: "ordem,id", custos_fixos: "id", imobilizado: "id", ficha_mod: "id", ficha_insumo: "id",
};
const CASCADES = {
  servicos: [["ficha_mod", "servico_id"], ["ficha_insumo", "servico_id"]],
  equipe: [["ficha_mod", "equipe_id"]],
  insumos: [["ficha_insumo", "insumo_id"]],
  propostas: [["proposta_itens", "proposta_id"]],
};
P.storeKey = (slug) => "precifica.web.v1" + (slug ? "." + slug : "");   // um banco local por empresa
P.newUid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
/** uid fixo para os dados que vem de fabrica (iguais em todos os aparelhos), para nao duplicarem na sincronizacao. */
P.seedUid = (table, r) => {
  const S = P.SEED;
  if (table === "insumos") { const s = S.PRECOS_REFERENCIA[r.id - 1]; return s && s[0] === r.descricao ? "seed-insumos-" + r.id : null; }
  if (table === "custos_fixos") { const s = S.CUSTOS_FIXOS_PADRAO[r.id - 1]; return s && s === r.descricao ? "seed-custos_fixos-" + r.id : null; }
  if (table === "imobilizado") { const s = S.IMOBILIZADO_PADRAO[r.id - 1]; return s && s[0] === r.descricao ? "seed-imobilizado-" + r.id : null; }
  return null;
};

class Database {
  constructor() {
    this.persistent = true;
    this.state = null;
    this._timer = null;
    this.onChange = null;          // chamado a cada alteracao (a sincronizacao se agenda aqui)
    this.key = P.storeKey(P.auth && P.auth.slug());
    let raw = null;
    try { raw = localStorage.getItem(this.key); } catch (e) { this.persistent = false; }
    if (raw) {
      try { this.state = JSON.parse(raw); } catch (e) { this.state = null; }
    }
    const isNew = !this.state || !this.state.t;
    if (isNew) this._blank();
    this._normalize();
    if (isNew) { this.seedInitial(); this._flush(); }
    addEventListener("pagehide", () => this._flush());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") this._flush(); });
  }
  _blank() {
    this.state = { v: 1, config: {}, t: {}, seq: {}, del: {}, cfgu: {} };
  }
  _normalize() {
    const s = this.state;
    s.config = s.config || {}; s.t = s.t || {}; s.seq = s.seq || {}; s.del = s.del || {}; s.cfgu = s.cfgu || {};
    const S = P.SEED;
    for (const t of Object.keys(COLS)) {
      s.t[t] = s.t[t] || [];
      s.seq[t] = Math.max(s.seq[t] || 0, ...s.t[t].map((r) => r.id || 0), 0);
      for (const r of s.t[t]) {            // dados antigos: toda linha ganha um identificador global (uid) para a sincronizacao
        if (!r.uid) r.uid = P.seedUid(t, r) || P.newUid();
        if (r._u === undefined) r._u = 0;
      }
    }
    for (const [k, v] of Object.entries(P.SEED.CONFIG_PADRAO)) if (!(k in s.config)) s.config[k] = String(v);
  }
  _touch() {
    if (!this._timer) this._timer = setTimeout(() => this._flush(), 200);
    if (this.onChange) this.onChange();
  }
  _bury(uid) { if (uid) this.state.del[uid] = Date.now(); }
  _flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (!this.persistent) return;
    try { localStorage.setItem(this.key, JSON.stringify(this.state)); }
    catch (e) { this.persistent = false; if (P.ui && P.ui.toast) P.ui.toast("Sem espaço para salvar neste aparelho. Faça um backup agora.", "danger", 6000); }
  }
  // ---- CRUD
  all(table, where) {
    let rows = this.state.t[table].map((r) => ({ ...r }));
    if (where) rows = rows.filter(where);
    const ord = ORDER[table];
    if (ord) {
      const keys = ord.split(",");
      rows.sort((a, b) => {
        for (let k of keys) {
          let dir = 1;
          if (k[0] === "-") { dir = -1; k = k.slice(1); }
          let x = a[k], y = b[k];
          if (typeof x === "string") x = x.toLowerCase();
          if (typeof y === "string") y = y.toLowerCase();
          if (x == null && y == null) continue;
          if (x == null) return -dir;
          if (y == null) return dir;
          if (x < y) return -dir;
          if (x > y) return dir;
        }
        return 0;
      });
    }
    return rows;
  }
  get(table, id) {
    const r = this.state.t[table].find((x) => x.id === id);
    return r ? { ...r } : null;
  }
  save(table, row) {
    const cols = COLS[table];
    const rows = this.state.t[table];
    const data = {};
    for (const k of Object.keys(cols)) if (k in row) data[k] = row[k];
    let id = row.id;
    const stamp = { _u: Date.now() };
    if (id) {
      const cur = rows.find((x) => x.id === id);
      if (cur) Object.assign(cur, data, stamp);
      else rows.push({ id, uid: P.newUid(), ...cols, ...data, ...stamp });
    } else {
      id = ++this.state.seq[table];
      rows.push({ id, uid: P.newUid(), ...cols, ...data, ...stamp });
    }
    this.state.seq[table] = Math.max(this.state.seq[table], id);
    this._touch();
    return id;
  }
  remove(table, id) {
    for (const [t, col] of CASCADES[table] || []) {
      this.state.t[t].filter((r) => r[col] === id).forEach((r) => this._bury(r.uid));
      this.state.t[t] = this.state.t[t].filter((r) => r[col] !== id);
    }
    this.state.t[table].filter((r) => r.id === id).forEach((r) => this._bury(r.uid));
    this.state.t[table] = this.state.t[table].filter((r) => r.id !== id);
    this._touch();
  }
  updateAll(table, patch) { const u = Date.now(); for (const r of this.state.t[table]) Object.assign(r, patch, { _u: u }); this._touch(); }
  clearTable(table, where) {
    this.state.t[table].filter(where).forEach((r) => this._bury(r.uid));
    this.state.t[table] = this.state.t[table].filter((r) => !where(r));
    this._touch();
  }
  _setUid(table, id, uid) { const r = this.state.t[table].find((x) => x.id === id); if (r) { r.uid = uid; r._u = 0; } return id; }
  // ---- config
  config() { return { ...this.state.config }; }
  cfg(key, def = null) { const v = this.state.config[key]; return v === undefined ? def : v; }
  cfgNum(key, def = 0) { return fnum(this.cfg(key), def); }
  setCfg(key, value) { this.setMany({ [key]: value }); }
  setMany(obj) {
    for (const [k, v] of Object.entries(obj)) {
      if (this.state.config[k] !== String(v)) { this.state.config[k] = String(v); this.state.cfgu[k] = Date.now(); }
    }
    this._touch();
  }
  // ---- propostas
  nextProposalNumber() {
    const n = Math.floor(this.cfgNum("proposta_proximo_numero", 1));
    const mx = Math.max(0, ...this.state.t.propostas.map((p) => p.numero || 0));
    return Math.max(n, mx + 1);
  }
  saveProposal(prop, itens) {
    const now = new Date().toISOString().slice(0, 19);
    prop = { ...prop, atualizado_em: now };
    if (!prop.id) {
      prop.criado_em = now;
      if (!prop.numero) prop.numero = this.nextProposalNumber();
    }
    const pid = this.save("propostas", prop);
    this.state.t.proposta_itens.filter((r) => r.proposta_id === pid).forEach((r) => this._bury(r.uid));
    this.state.t.proposta_itens = this.state.t.proposta_itens.filter((r) => r.proposta_id !== pid);
    itens.forEach((it, i) => {
      const { id, ...rest } = it;
      this.save("proposta_itens", { ...rest, proposta_id: pid, ordem: i });
    });
    const numero = Math.floor(prop.numero || 0);
    if (numero >= this.cfgNum("proposta_proximo_numero", 1)) this.setCfg("proposta_proximo_numero", numero + 1);
    this._touch();
    return pid;
  }
  proposalItems(pid) { return this.all("proposta_itens", (r) => r.proposta_id === pid); }
  // ---- sementes
  seedInitial() {
    const S = P.SEED;
    if (!this.state.t.insumos.length)
      S.PRECOS_REFERENCIA.forEach(([d, u, v], i) =>
        this._setUid("insumos", this.save("insumos", { descricao: d, unidade: u, qtde_bruta: 1, qtde_liquida: 1, custo: v, categoria: "Referência de mercado" }), "seed-insumos-" + (i + 1)));
    if (!this.state.t.custos_fixos.length) S.CUSTOS_FIXOS_PADRAO.forEach((d, i) => this._setUid("custos_fixos", this.save("custos_fixos", { descricao: d, valor: 0 }), "seed-custos_fixos-" + (i + 1)));
    if (!this.state.t.imobilizado.length) S.IMOBILIZADO_PADRAO.forEach(([d, v], i) => this._setUid("imobilizado", this.save("imobilizado", { descricao: d, valor: 0, vida_util: v }), "seed-imobilizado-" + (i + 1)));
    this._touch();
  }
  loadExample() {
    const ex = P.SEED.EXEMPLO;
    const empIds = {};
    for (const e of ex.equipe) {
      const found = this.all("equipe", (r) => r.nome === e.nome);
      empIds[e.nome] = found.length ? found[0].id : this._setUid("equipe", this.save("equipe", { ...e }), "ex-equipe-" + e.nome);
    }
    for (const [desc, val] of Object.entries(ex.custos_fixos)) {
      const found = this.all("custos_fixos", (r) => r.descricao === desc);
      if (found.length) this.save("custos_fixos", { id: found[0].id, valor: val });
      else this.save("custos_fixos", { descricao: desc, valor: val });
    }
    const insumos = Object.fromEntries(this.all("insumos").map((r) => [r.descricao, r.id]));
    for (const s of ex.servicos) {
      if (this.all("servicos").some((r) => r.nome === s.nome)) continue;
      const { mod, insumos: ins, ...srv } = s;
      const sid = this._setUid("servicos", this.save("servicos", srv), "ex-servicos-" + s.nome);
      for (const [nome, h] of mod) this._setUid("ficha_mod", this.save("ficha_mod", { servico_id: sid, equipe_id: empIds[nome], horas: h }), `ex-fm-${s.nome}-${nome}`);
      for (const [desc, q] of ins) if (desc in insumos) this._setUid("ficha_insumo", this.save("ficha_insumo", { servico_id: sid, insumo_id: insumos[desc], quantidade: q }), `ex-fi-${s.nome}-${desc}`);
    }
  }
  resetAll() {
    const tut = this.cfg("tutorial_nao_mostrar", "0");
    const del = this.state.del;
    for (const t of Object.keys(COLS)) for (const r of this.state.t[t]) if (!String(r.uid).startsWith("seed-")) del[r.uid] = Date.now();   // a exclusao tambem vale nos outros aparelhos
    for (const k of Object.keys(del)) if (k.startsWith("seed-")) delete del[k];
    this._blank(); this.state.del = del; this._normalize(); this.seedInitial();
    this.setCfg("tutorial_nao_mostrar", tut);
    this.state.replace = true;          // a proxima sincronizacao substitui a copia da nuvem
    this._flush();
  }
  // ---- backup (arquivo .json)
  exportData() { return JSON.stringify({ app: "PrecificaWeb", version: 1, exported_at: new Date().toISOString(), data: this.state }); }
  importData(text) {
    const o = JSON.parse(text);
    const st = o && o.app === "PrecificaWeb" ? o.data : null;
    if (!st || !st.t) throw new Error("Arquivo de backup inválido (esperado um backup do Precifica).");
    this.state = st;
    this._normalize();
    this.state.replace = true;          // restaurar um backup vale tambem para a copia da nuvem
    this._flush();
  }
  // ---- sincronizacao: copia de envio e juncao (por registro, vence a alteracao mais recente)
  snapshot() { const { replace, ...s } = this.state; return JSON.parse(JSON.stringify(s)); }
  mergeRemote(rem) {
    const L = this.state;
    const LOCAL_ONLY = ["onboarding_ok", "tutorial_nao_mostrar"];
    const ORDER_T = ["clientes", "insumos", "equipe", "servicos", "custos_fixos", "imobilizado", "propostas", "revenda", "ficha_mod", "ficha_insumo", "proposta_itens"];
    const FK = { ficha_mod: { servico_id: "servicos", equipe_id: "equipe" }, ficha_insumo: { servico_id: "servicos", insumo_id: "insumos" }, proposta_itens: { proposta_id: "propostas" }, propostas: { cliente_id: "clientes" } };
    const before = JSON.stringify([L.t, L.config, L.del]);
    // exclusoes: vale a mais recente de cada lado
    for (const [uid, ts] of Object.entries(rem.del || {})) L.del[uid] = Math.max(L.del[uid] || 0, ts);
    const preU = new Map(L.t.propostas.map((p) => [p.uid, p._u || 0]));   // data de alteracao local ANTES da juncao
    const idmap = {};                                  // tabela -> {id remoto: id local}
    const remoteRows = {};
    const dead = (r) => L.del[r.uid] !== undefined && L.del[r.uid] >= (r._u || 0);
    for (const t of ORDER_T) {
      const rrows = ((rem.t || {})[t] || []).map((r) => ({ ...r }));
      remoteRows[t] = rrows;
      idmap[t] = {};
      L.t[t] = L.t[t].filter((r) => !dead(r));
      if (t === "proposta_itens") continue;             // tratado a parte (o conjunto de itens acompanha a proposta mais recente)
      const byUid = new Map(L.t[t].map((r) => [r.uid, r]));
      const fix = (row) => {
        for (const [col, target] of Object.entries(FK[t] || {})) {
          if (row[col] === null || row[col] === undefined) continue;
          const nid = idmap[target][row[col]];
          if (nid === undefined) { if (t === "propostas") { row[col] = null; continue; } return false; }
          row[col] = nid;
        }
        return true;
      };
      for (const rr of rrows) {
        if (dead(rr)) continue;
        const lr = byUid.get(rr.uid);
        if (!lr) {
          const row = { ...rr, id: ++L.seq[t] };
          if (!fix(row)) continue;
          L.t[t].push(row); byUid.set(row.uid, row); idmap[t][rr.id] = row.id;
        } else {
          idmap[t][rr.id] = lr.id;
          if ((rr._u || 0) > (lr._u || 0)) { const row = { ...rr, id: lr.id }; if (fix(row)) Object.assign(lr, row); }
        }
      }
    }
    // itens de proposta: o conjunto inteiro vem do lado cuja proposta foi alterada por ultimo
    const remP = new Map(remoteRows.propostas.map((p) => [p.uid, p]));
    for (const lp of L.t.propostas) {
      const rp = remP.get(lp.uid);
      if (!rp || preU.get(lp.uid) === undefined || (rp._u || 0) <= preU.get(lp.uid)) continue;
      const lpid = lp.id;
      const items = remoteRows.proposta_itens.filter((i) => i.proposta_id === rp.id && !dead(i));
      L.t.proposta_itens = L.t.proposta_itens.filter((i) => i.proposta_id !== lpid);
      for (const it of items) L.t.proposta_itens.push({ ...it, id: ++L.seq.proposta_itens, proposta_id: lpid });
    }
    const have = new Set(L.t.proposta_itens.map((i) => i.proposta_id));
    for (const rp of remoteRows.propostas) {          // propostas novas vindas da nuvem trazem os proprios itens
      const lid = idmap.propostas[rp.id];
      if (lid === undefined || have.has(lid)) continue;
      for (const it of remoteRows.proposta_itens.filter((i) => i.proposta_id === rp.id && !dead(i)))
        L.t.proposta_itens.push({ ...it, id: ++L.seq.proposta_itens, proposta_id: lid });
    }
    // sem pai, sem registro
    const ids = (t) => new Set(L.t[t].map((r) => r.id));
    const [sv, eq, ins, pr] = [ids("servicos"), ids("equipe"), ids("insumos"), ids("propostas")];
    L.t.ficha_mod = L.t.ficha_mod.filter((r) => sv.has(r.servico_id) && eq.has(r.equipe_id));
    L.t.ficha_insumo = L.t.ficha_insumo.filter((r) => sv.has(r.servico_id) && ins.has(r.insumo_id));
    L.t.proposta_itens = L.t.proposta_itens.filter((r) => pr.has(r.proposta_id));
    // configuracoes: vale a mais recente de cada chave
    for (const [k, v] of Object.entries(rem.config || {})) {
      if (LOCAL_ONLY.includes(k)) continue;
      if (k === "proposta_proximo_numero") { L.config[k] = String(Math.max(fnum(L.config[k], 1), fnum(v, 1))); continue; }
      if ((rem.cfgu || {})[k] > (L.cfgu[k] || 0)) { L.config[k] = String(v); L.cfgu[k] = rem.cfgu[k]; }
    }
    for (const t of Object.keys(COLS)) L.seq[t] = Math.max(L.seq[t], ...L.t[t].map((r) => r.id), 0);
    const changed = before !== JSON.stringify([L.t, L.config, L.del]);
    if (changed) this._touch();
    return changed;
  }
}
P.Database = Database;

// ------------------------------------------------------------------ motor de calculo
const DED_KEYS = ["imposto_pct", "cartao_pct", "app_pct", "comissao_pct"];

class Engine {
  constructor(db) { this.db = db; this.reload(); }
  reload() {
    const db = this.db;
    this.cfg = db.config();
    this.insumos = new Map(db.all("insumos").map((r) => [r.id, r]));
    this.equipe = new Map(db.all("equipe").map((r) => [r.id, r]));
    this.cfRows = db.all("custos_fixos");
    this.imobRows = db.all("imobilizado");
    this.servicos = db.all("servicos");
    this.revendas = db.all("revenda");
    this.fmod = db.all("ficha_mod");
    this.fins = db.all("ficha_insumo");
    this._cache = new Map();
  }
  c(key, def = 0) { return fnum(this.cfg[key], def); }
  // ---- encargos / equipe
  encargosTrabPct() { return (this.c("enc_ferias") + this.c("enc_13") + this.c("enc_13_ferias")) / 100; }
  encargosSocPct() {
    return (this.c("enc_inss") + this.c("enc_sat") + this.c("enc_sal_educacao") + this.c("enc_sistema_s") + this.c("enc_fgts") + this.c("enc_fgts_rescisao")) / 100;
  }
  colaborador(e) {
    const sal = fnum(e.salario);
    const tipo = String(e.contratacao || "").toLowerCase();
    let soc, trab;
    if (tipo === "clt") { soc = sal * this.encargosSocPct(); trab = sal * this.encargosTrabPct(); }
    else if (tipo.includes("pró") || tipo.includes("pro-") || tipo.includes("pro labore") || tipo.includes("pró-labore")) { soc = sal * this.c("enc_prolabore_inss") / 100; trab = 0; }
    else { soc = 0; trab = 0; }
    const beneficios = fnum(e.vale_transporte) + fnum(e.vale_refeicao) + fnum(e.convenio);
    const total = sal + soc + trab + beneficios;
    const carga = fnum(e.carga_horaria);
    const prod = this.produtividade();
    return { ...e, enc_sociais: soc, enc_trab: trab, beneficios, total, valor_hora: safeDiv(total, carga), custo_hora: safeDiv(total, carga * prod) };
  }
  equipeCalc() { return [...this.equipe.values()].map((e) => this.colaborador(e)); }
  folhaTotal(setor = null) { return this.equipeCalc().filter((c) => setor === null || c.setor === setor).reduce((a, c) => a + c.total, 0); }
  /** Multiplicador do custo-hora: hora extra e adicional noturno vem das Configuracoes (padrao CLT: 50% e 20%). */
  multHora(tipo) {
    const he = this.c("adicional_hora_extra_pct", 50) / 100, an = this.c("adicional_noturno_pct", 20) / 100, fe = this.c("adicional_feriado_pct", 100) / 100;
    // os adicionais somam entre si: feriado a noite = 1 + 100% + 20%
    return { extra: 1 + he, noturna: 1 + an, extra_noturna: 1 + he + an, feriado: 1 + fe, feriado_noturna: 1 + fe + an }[tipo] || 1;
  }
  // ---- capacidade produtiva
  produtividade() { return Math.max(0.01, this.c("produtividade_pct", 75) / 100); }
  capacidade() {
    const n = [...this.equipe.values()].filter((e) => e.setor === "Produtivo").length;
    const hDia = this.c("horas_dia", 8), dias = this.c("dias_mes", 22), p = this.produtividade();
    const horasMax = n * hDia * dias;
    const efetMembro = hDia * dias * p;
    const efetEquipe = horasMax * p;
    const alocadas = this.servicos.reduce((a, s) => a + this.ficha(s.id).horas * fnum(s.previsao), 0);
    const vendidas = safeDiv(alocadas, efetEquipe);
    const ociosidade = efetEquipe ? Math.max(0, 1 - vendidas) : 0;
    let status, nivel;
    if (!efetEquipe) { status = "Cadastre a equipe produtiva para calcular a capacidade."; nivel = "info"; }
    else if (vendidas > 1) { status = "A capacidade produtiva já está no máximo: será necessário melhorar a produtividade ou contratar novos colaboradores."; nivel = "danger"; }
    else if (Math.abs(vendidas - 1) < 1e-6) { status = "Sua capacidade de produção está 100% preenchida."; nivel = "ok"; }
    else { status = "Existe espaço para vender mais serviços com a equipe atual."; nivel = vendidas < 0.6 ? "warn" : "ok"; }
    return { colaboradores: n, horas_dia: hDia, dias_mes: dias, produtividade: p, horas_max: horasMax, efetivas_membro: efetMembro,
      efetivas_equipe: efetEquipe, alocadas, vendidas_pct: vendidas, ociosidade_pct: ociosidade, status, nivel };
  }
  // ---- insumos
  static insumoCalc(r) {
    const qb = fnum(r.qtde_bruta, 1) || 1;
    const ql = fnum(r.qtde_liquida, qb) || qb;
    const fator = safeDiv(qb, ql, 1.0);
    const custoMedida = safeDiv(fnum(r.custo), qb) * fator;
    return { ...r, fator, custo_medida: custoMedida };
  }
  // ---- ficha tecnica
  ficha(sid) {
    const key = "ficha" + sid;
    if (this._cache.has(key)) return this._cache.get(key);
    const mod = [], ins = [];
    for (const l of this.fmod) {
      if (l.servico_id !== sid) continue;
      const e = this.equipe.get(l.equipe_id);
      if (!e) continue;
      const c = this.colaborador(e);
      const h = fnum(l.horas);
      const tipo = l.tipo_hora || "normal", mult = this.multHora(tipo);
      mod.push({ id: l.id, equipe_id: e.id, nome: e.nome, cargo: e.cargo || "", custo_hora: c.custo_hora * mult, custo_hora_base: c.custo_hora, mult, tipo_hora: tipo, horas: h, total: h * c.custo_hora * mult });
    }
    for (const l of this.fins) {
      if (l.servico_id !== sid) continue;
      const i = this.insumos.get(l.insumo_id);
      if (!i) continue;
      const ic = Engine.insumoCalc(i);
      const q = fnum(l.quantidade);
      ins.push({ id: l.id, insumo_id: i.id, descricao: i.descricao, unidade: i.unidade || "", custo_unit: ic.custo_medida, quantidade: q, total: q * ic.custo_medida });
    }
    const res = { mod, insumos: ins, horas: mod.reduce((a, x) => a + x.horas, 0), custo_mod: mod.reduce((a, x) => a + x.total, 0), custo_md: ins.reduce((a, x) => a + x.total, 0) };
    res.total = res.custo_mod + res.custo_md;
    this._cache.set(key, res);
    return res;
  }
  // ---- tabela de precificacao
  _item(tipo, r) {
    let md, mod, horas, tem, un;
    if (tipo === "servico") {
      const f = this.ficha(r.id);
      md = f.custo_md; mod = f.custo_mod; horas = f.horas;
      tem = !!(f.mod.length || f.insumos.length);
      un = r.unidade || "Serviço";
    } else {
      md = safeDiv(fnum(r.custo), fnum(r.qtde, 1) || 1);
      mod = 0; horas = 0; tem = true;
      un = r.unidade || "Unidade";
    }
    const it = {
      tipo, id: r.id, nome: r.nome || "", unidade: un, preco: fnum(r.preco), custo_md: md, custo_mod: mod, horas,
      imposto: fnum(r.imposto_pct) / 100, cartao: fnum(r.cartao_pct) / 100, app: fnum(r.app_pct) / 100, comissao: fnum(r.comissao_pct) / 100,
      previsao: fnum(r.previsao), tem_ficha: tem,
      cv: 0, ded_imposto: 0, ded_cartao: 0, ded_app: 0, ded_comissao: 0, deducoes: 0, mc: 0, mc_pct: 0,
      faturamento: 0, cv_total: 0, mod_total: 0, md_total: 0, ded_total: 0, ded_imposto_total: 0, ded_cartao_total: 0, ded_app_total: 0,
      ded_comissao_total: 0, mc_total: 0, rateio_cf: 0, lucro: 0, lucro_pct: 0, markup: 0, mix_pct: 0,
    };
    it.cv = it.custo_md + it.custo_mod;
    it.ded_imposto = it.preco * it.imposto; it.ded_cartao = it.preco * it.cartao;
    it.ded_app = it.preco * it.app; it.ded_comissao = it.preco * it.comissao;
    it.deducoes = it.ded_imposto + it.ded_cartao + it.ded_app + it.ded_comissao;
    it.mc = it.preco - it.cv - it.deducoes;
    it.mc_pct = safeDiv(it.mc, it.preco);
    it.ded_pct = it.imposto + it.cartao + it.app + it.comissao;
    it.pct_mod = safeDiv(it.custo_mod, it.preco);
    it.pct_md = safeDiv(it.custo_md, it.preco);
    it.pct_cpv = safeDiv(it.cv, it.preco);
    return it;
  }
  itens(tipo = null) {
    if (!this._cache.has("itens")) {
      const lst = this.servicos.map((r) => this._item("servico", r)).concat(this.revendas.map((r) => this._item("revenda", r)));
      this._simular(lst);
      this._cache.set("itens", lst);
    }
    return this._cache.get("itens").filter((i) => tipo === null || i.tipo === tipo);
  }
  item(tipo, id) { return this.itens(tipo).find((i) => i.id === id) || null; }
  // ---- custos fixos
  depreciacao() {
    return this.imobRows.map((r) => {
      const vida = fnum(r.vida_util);
      const taxa = safeDiv(1, vida);
      return { ...r, taxa, mensal: fnum(r.valor) * taxa / 12 };
    });
  }
  custosFixos() {
    if (this._cache.has("cf")) return this._cache.get("cf");
    const adm = this.folhaTotal("Administrativo");
    const prodTotal = this.folhaTotal("Produtivo");
    const modAlocada = this.servicos.reduce((a, s) => a + this.ficha(s.id).custo_mod * fnum(s.previsao), 0);
    const ociosidade = Math.max(0, prodTotal - modAlocada);
    const dep = this.depreciacao().reduce((a, d) => a + d.mensal, 0);
    const manuais = this.cfRows.map((r) => [r.descricao, fnum(r.valor)]);
    const linhas = [["Salários administrativos + encargos + benefícios", adm, true],
      ["Mão de obra produtiva ociosa (não alocada em serviços)", ociosidade, true],
      ["Depreciação de equipamentos", dep, true], ...manuais.map(([d, v]) => [d, v, false])];
    const total = linhas.reduce((a, l) => a + l[1], 0);
    const res = { linhas, total, adm, ociosidade, depreciacao: dep, mod_alocada: modAlocada, manuais: manuais.reduce((a, m) => a + m[1], 0) };
    this._cache.set("cf", res);
    return res;
  }
  // ---- simulacao (mix de vendas)
  _simular(lst) {
    const fatTotal = lst.reduce((a, i) => a + i.preco * i.previsao, 0);
    const cf = this.custosFixos().total;
    for (const i of lst) {
      const q = i.previsao;
      i.faturamento = i.preco * q; i.md_total = i.custo_md * q; i.mod_total = i.custo_mod * q; i.cv_total = i.cv * q;
      i.ded_imposto_total = i.ded_imposto * q; i.ded_cartao_total = i.ded_cartao * q; i.ded_app_total = i.ded_app * q;
      i.ded_comissao_total = i.ded_comissao * q; i.ded_total = i.deducoes * q; i.mc_total = i.mc * q;
      i.rateio_cf = safeDiv(cf, fatTotal) * i.faturamento;
      i.lucro = i.mc_total - i.rateio_cf;
      i.lucro_pct = safeDiv(i.lucro, i.faturamento);
      i.markup = safeDiv(i.faturamento, i.cv_total);
      i.mix_pct = safeDiv(i.faturamento, fatTotal);
    }
  }
  totais(tipo = null) {
    const lst = this.itens(tipo);
    const s = (k) => lst.reduce((a, i) => a + i[k], 0);
    const t = { quantidade: s("previsao"), faturamento: s("faturamento"), md: s("md_total"), mod: s("mod_total"), cv: s("cv_total"),
      imposto: s("ded_imposto_total"), cartao: s("ded_cartao_total"), app: s("ded_app_total"), comissao: s("ded_comissao_total"),
      deducoes: s("ded_total"), mc: s("mc_total"), rateio: s("rateio_cf"), lucro: s("lucro") };
    t.mc_pct = safeDiv(t.mc, t.faturamento); t.lucro_pct = safeDiv(t.lucro, t.faturamento); t.markup = safeDiv(t.faturamento, t.cv);
    return t;
  }
  rateioPct() { return safeDiv(this.custosFixos().total, this.totais().faturamento); }
  // ---- analise individual
  static _linhas(it, p) {
    const base = it.tipo === "servico" ? [["Mão de obra direta", it.custo_mod], ["Materiais diretos", it.custo_md]] : [["Custo da mercadoria (CMV)", it.custo_md]];
    const ded = [["Impostos", p * it.imposto], ["Taxa de maquininha", p * it.cartao], ["Taxa de aplicativos", p * it.app], ["Comissões", p * it.comissao]];
    return base.concat(ded).map(([n, v]) => [n, v, safeDiv(v, p)]);
  }
  analise(tipo, id, descontoPct = 0, lucroPct = null) {
    const it = this.item(tipo, id);
    if (!it) return null;
    if (lucroPct === null) lucroPct = this.c("lucro_desejado_pct", 15);
    const d = descontoPct / 100, L = lucroPct / 100;
    const r = this.rateioPct();
    const a = { item: it, desconto: d, lucro_desejado: L, rateio_pct: r, viavel: true, aviso: "" };
    const p = it.preco * (1 - d);
    a.preco = p;
    a.linhas = Engine._linhas(it, p);
    const cvar = a.linhas.reduce((x, l) => x + l[1], 0);
    a.mc = p - cvar; a.rateio = p * r; a.lucro = a.mc - a.rateio; a.markup = safeDiv(p, it.cv);
    const den = 1 - (it.ded_pct + r + L);
    if (den <= 0.0001) {
      a.viavel = false;
      a.aviso = "Os percentuais (impostos, taxas, comissão, rateio de custos fixos e lucro) somam 100% ou mais do preço. Reduza o lucro desejado ou os custos fixos, ou aumente a previsão de vendas.";
      a.preco_sug = 0;
    } else a.preco_sug = it.cv / den;
    const ps = a.preco_sug;
    a.linhas_sug = Engine._linhas(it, ps);
    a.mc_sug = ps - a.linhas_sug.reduce((x, l) => x + l[1], 0);
    a.rateio_sug = ps * r; a.lucro_sug = a.mc_sug - a.rateio_sug;
    a.markup_sug = a.viavel ? safeDiv(1, den) : 0;
    if (!it.tem_ficha && tipo === "servico") a.aviso = a.aviso || "Este serviço ainda não tem ficha técnica: cadastre mão de obra e insumos para calcular o custo.";
    else if (r === 0 && this.custosFixos().total > 0) a.aviso = a.aviso || "Informe a previsão de vendas (Simulação) para ratear os custos fixos no preço.";
    return a;
  }
  precoSugerido(tipo, id, lucroPct = null) { const a = this.analise(tipo, id, 0, lucroPct); return a && a.viavel ? a.preco_sug : 0; }
  // ---- relatorios gerenciais
  relatorio() {
    const t = this.totais();
    const cf = this.custosFixos().total;
    const fat = t.faturamento;
    const fatLiq = fat - t.deducoes;
    const mc = fatLiq - t.cv;
    const lucroOp = mc - cf;
    const mcPct = safeDiv(mc, fat);
    const lucroDes = this.cfg.lucro_modo === "valor" ? this.c("lucro_desejado_valor") : this.c("lucro_desejado_pct", 15) / 100 * fat;
    const pe = safeDiv(cf, mcPct);
    const peEcon = safeDiv(cf + lucroDes, mcPct);
    const ts = this.totais("servico");
    const ticket = safeDiv(ts.faturamento, ts.quantidade);
    let analise, nivel;
    if (!fat) { analise = "Informe a previsão de vendas na Simulação para gerar o resultado do mês."; nivel = "info"; }
    else if (Math.abs(lucroOp) < 0.005) { analise = "Sua empresa está no 0 a 0, ou seja, atingiu o PONTO DE EQUILÍBRIO. Nessa situação não há lucro nem prejuízo."; nivel = "warn"; }
    else if (lucroOp < 0) { analise = "ATENÇÃO: sua empresa está com PREJUÍZO. Revise a estrutura de preços, negocie melhores preços com fornecedores e reduza as despesas fixas."; nivel = "danger"; }
    else { analise = "PARABÉNS: sua empresa gera LUCRO. Continue acompanhando os números para melhorar ainda mais o lucro operacional."; nivel = "ok"; }
    const dre = [["Faturamento bruto", fat], ["(-) Deduções sobre vendas", -t.deducoes], ["(=) Faturamento líquido", fatLiq], ["(-) Custos variáveis", -t.cv],
      ["(=) Margem de contribuição", mc], ["(-) Custos fixos", -cf], ["(=) Lucro operacional", lucroOp]];
    return { dre: dre.map(([n, v]) => [n, v, safeDiv(v, fat)]), faturamento: fat, deducoes: t.deducoes, fat_liquido: fatLiq, cv: t.cv, mc, mc_pct: mcPct,
      cf, lucro: lucroOp, lucro_pct: safeDiv(lucroOp, fat), lucro_desejado: lucroDes, pe, pe_econ: peEcon, ticket, qtd_servicos: ts.quantidade,
      analise, nivel, margem_seguranca: fat && pe ? safeDiv(fat - pe, fat) : 0 };
  }
  // ---- concorrentes
  static concorrencia(dados) {
    const empresas = (dados.empresas && dados.empresas.length) ? dados.empresas : ["Empresa A", "Empresa B", "Empresa C", "Sua empresa"];
    const itens = dados.itens || [];
    const notas = dados.notas || {}, precos = dados.precos || {};
    return { empresas: empresas.map((emp, idx) => {
      let soma = 0;
      for (let i = 0; i < itens.length; i++) soma += fnum(notas[`${i}|${idx}`]);
      const preco = fnum(precos[String(idx)]);
      return { empresa: emp, fator: soma, preco, preco_por_ponto: safeDiv(preco, soma) };
    }) };
  }
  // ---- onboarding
  checklist() {
    const cfg = this.cfg;
    return [
      ["Dados da empresa", (cfg.empresa_nome || "Minha Empresa") !== "Minha Empresa", "Configurações"],
      ["Equipe e pró-labore", this.equipe.size > 0, "Equipe"],
      ["Custos fixos do mês", this.custosFixos().manuais > 0, "Custos fixos"],
      ["Serviço com ficha técnica", this.servicos.some((s) => this.ficha(s.id).total > 0), "Serviços e fichas"],
      ["Previsão de vendas", this.totais().quantidade > 0, "Simulação"],
    ];
  }
}
P.Engine = Engine;

// ------------------------------------------------------------------ utilitarios de proposta (pdfs.py / ui.py)
P.sigla = (cfg) => (cfg.empresa_sigla || cfg.empresa_fantasia || cfg.empresa_nome || "Empresa").trim();
P.empresaNome = (cfg) => (cfg.empresa_fantasia || cfg.empresa_nome || "Minha Empresa").trim();
P.proposalTotals = function (prop, itens, cfg) {
  const subtotal = itens.reduce((a, i) => a + fnum(i.quantidade, 1) * fnum(i.valor_unit), 0);
  const desconto = Math.min(fnum(prop.desconto_valor), subtotal);
  const total = subtotal - desconto;
  const pix = fnum(cfg.proposta_pix_desconto_pct, 5);
  return { subtotal, desconto, total, pix_pct: pix, total_pix: total * (1 - pix / 100) };
};
P.dividirParcelas = function (total, entrada, n, intervalo = 30, detalheEntrada = "") {
  total = P.round2(fnum(total));
  entrada = P.round2(Math.min(Math.max(fnum(entrada), 0), fnum(total)));
  n = Math.max(Math.floor(n) || 0, 0);
  const out = [];
  if (entrada > 0 || n === 0) out.push({ rotulo: "Entrada", valor: n ? entrada : total, detalhe: detalheEntrada || "no aceite da proposta" });
  if (n) {
    const resto = P.round2(total - (entrada > 0 ? entrada : 0));
    const base = P.round2(resto / n);
    for (let i = 0; i < n; i++) {
      const v = i < n - 1 ? base : P.round2(resto - base * (n - 1));
      out.push({ rotulo: `Parcela ${out.length + 1}`, valor: v, detalhe: `${intervalo * (i + 1)} dias após o aceite` });
    }
  }
  return out;
};
P.proposalContext = function (cfg, prop, itens) {
  const tot = P.proposalTotals(prop, itens, cfg);
  const dt = /^\d{4}-\d{2}-\d{2}/.test(prop.data || "") ? prop.data.slice(0, 10) : P.todayISO();
  return { empresa: P.sigla(cfg), numero: Math.floor(fnum(prop.numero)), data: dt, total: tot.total,
    validade: Math.floor(fnum(prop.validade_dias, 30)), cliente: (prop.cliente_nome || "").trim(), titulo: (prop.titulo || "").trim() };
};
P.sub = function (texto, ctx) {
  const rep = [["{EMPRESA}", ctx.empresa.toUpperCase()], ["{empresa}", ctx.empresa], ["{numero}", String(ctx.numero)],
    ["{validade_dias}", String(ctx.validade)], ["{total}", P.money(ctx.total)], ["{cliente}", ctx.cliente], ["{titulo}", ctx.titulo]];
  let s = String(texto ?? "");
  for (const [k, v] of rep) s = s.split(k).join(v);
  return s;
};
P.paras = (t) => String(t ?? "").replace(/\r/g, "").trim().split(/\n\s*\n/).map((p) => p.replace(/^\n+|\n+$/g, "")).filter((p) => p.trim());
P.rich = (t) => P.esc(t).replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
P.modeloTextos = function (cfg) {
  let m = null;
  try { m = JSON.parse(cfg.proposta_modelo_json || ""); } catch (e) { m = null; }
  m = m && typeof m === "object" ? m : {};
  const base = P.SEED.MODELO_PROPOSTA;
  return { escopo_intro: m.escopo_intro ?? base.escopo_intro, escopo_nota: m.escopo_nota ?? base.escopo_nota,
    secoes_pre: m.secoes_pre ?? base.secoes_pre, secoes_pos: m.secoes_pos ?? base.secoes_pos, fecho: m.fecho ?? P.SEED.FECHO_PADRAO };
};

// ------------------------------------------------------------------ tipos de hora e listas personalizaveis
P.TIPOS_HORA = [["normal", "Hora normal"], ["extra", "Hora extra"], ["noturna", "Adicional noturno"], ["extra_noturna", "Hora extra noturna"], ["feriado", "Domingo / feriado"], ["feriado_noturna", "Domingo / feriado noturno"]];
P.tipoHoraLabel = (k) => (P.TIPOS_HORA.find((t) => t[0] === k) || P.TIPOS_HORA[0])[1];
P.CFG_DEFAULTS = { adicional_hora_extra_pct: 50, adicional_noturno_pct: 20, adicional_feriado_pct: 100 };
P.LISTAS = {
  unidades: { label: "Unidades de medida (insumos e revenda)", item: "unidade de medida", base: () => P.SEED.UNIDADES },
  categorias: { label: "Categorias de insumos", item: "categoria", base: () => ["Material", "Mão de obra terceirizada", "Deslocamento", "Referência de mercado", "Outros"] },
  unidades_servico: { label: "Unidades dos serviços", item: "unidade do serviço", base: () => ["Serviço", "Unidade", "Metro", "Hora", "Ponto", "Diária", "Visita"] },
  unidades_proposta: { label: "Unidades nos itens da proposta", item: "unidade", base: () => ["un", "m", "m²", "km", "h", "ponto", "serviço", "diária", "kit"] },
};
/** Listas (base do programa + itens criados pelo usuario, guardados na configuracao "listas_json" e sincronizados). */
P.lists = {
  _all() { return P.json(P.app.db.cfg("listas_json"), {}); },
  custom(key) { return this._all()[key] || []; },
  get(key, current) {
    const all = [...P.LISTAS[key].base()];
    for (const c of this.custom(key)) if (!all.some((x) => x.toLowerCase() === c.toLowerCase())) all.push(c);
    if (current && !all.includes(current)) all.push(current);
    return all;
  },
  add(key, nome) {
    nome = String(nome || "").trim();
    if (!nome) return "";
    const ex = this.get(key).find((x) => x.toLowerCase() === nome.toLowerCase());
    if (ex) return ex;
    const j = this._all(); j[key] = [...(j[key] || []), nome];
    P.app.db.setCfg("listas_json", JSON.stringify(j));
    return nome;
  },
  remove(key, nome) {
    const j = this._all(); j[key] = (j[key] || []).filter((x) => x !== nome);
    P.app.db.setCfg("listas_json", JSON.stringify(j));
  },
};