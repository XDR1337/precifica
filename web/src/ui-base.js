"use strict";
/* Precifica Web - componentes de interface: elementos, janelas, tabelas responsivas, indicadores e graficos SVG. */
P.ui = {};
const { fnum, money, num, pct, pctN, esc, numInput, safeDiv } = P;

// ------------------------------------------------------------------ criacao de elementos
const h = P.h = function (tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "style" && typeof v === "object") { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith("--")) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k === "value") value = v;
      else if (k === "checked" || k === "disabled" || k === "selected" || k === "readOnly") el[k] = !!v;
      else if (k.length > 2 && k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  if (value !== undefined) el.value = value;
  return el;
};
P.frag = (...kids) => { const f = document.createDocumentFragment(); kids.flat(Infinity).forEach((c) => c && f.append(c.nodeType ? c : document.createTextNode(String(c)))); return f; };
P.fine = () => matchMedia("(pointer:fine)").matches;

// ------------------------------------------------------------------ aviso rapido
let toastTimer = null;
P.ui.toast = function (text, nivel = "ok", ms = 2600) {
  let t = document.getElementById("toast");
  if (!t) { t = h("div", { id: "toast", role: "status" }); document.body.append(t); }
  t.className = "toast show " + nivel;
  t.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
};
const toast = P.ui.toast;

// ------------------------------------------------------------------ janelas (com suporte ao botao "voltar" do celular)
const stack = [];
let layerPushed = false, ignorePop = 0;

function pushLayer() {
  if (layerPushed) return;
  try { history.pushState({ pm: 1 }, ""); layerPushed = true; } catch (e) { /* ok */ }
}
function popLayerSoon() {
  setTimeout(() => {
    if (!stack.length && layerPushed) { layerPushed = false; ignorePop++; try { history.back(); } catch (e) { ignorePop--; } }
  }, 40);
}
P.ui.popWasLayer = false;
addEventListener("popstate", () => {
  P.ui.popWasLayer = false;
  if (ignorePop > 0) { ignorePop--; P.ui.popWasLayer = true; if (P.ui.afterLayerPop) P.ui.afterLayerPop(); return; }
  if (layerPushed && stack.length) {
    P.ui.popWasLayer = true;
    layerPushed = false;
    stack[stack.length - 1].close(undefined, true);
    if (stack.length) pushLayer();
  }
});
P.ui.layerActive = () => layerPushed;

P.modal = function ({ title, sub, body, footer, cls = "", onClose, dismiss = true }) {
  const closeBtn = h("button", { class: "mo-x", type: "button", "aria-label": "Fechar", text: "✕" });
  const head = h("div", { class: "mo-h" }, h("div", { class: "mo-t" }, h("h3", { text: title || "" }), sub ? h("p", { class: "mo-s", text: sub }) : null), closeBtn);
  const bodyEl = h("div", { class: "mo-b" }, body);
  const footEl = footer ? h("div", { class: "mo-f" }, footer) : null;
  const box = h("div", { class: "mo-box " + cls, role: "dialog", "aria-modal": "true" }, head, bodyEl, footEl);
  const root = h("div", { class: "mo " + cls }, box);
  const m = { el: root, box, body: bodyEl, closed: false, promise: null };
  m.promise = new Promise((resolve) => {
    m.close = (result, fromPop) => {
      if (m.closed) return;
      m.closed = true;
      const i = stack.indexOf(m);
      if (i >= 0) stack.splice(i, 1);
      root.remove();
      if (!stack.length) document.body.classList.remove("modal-open");
      if (!fromPop) popLayerSoon();
      if (onClose) onClose(result);
      resolve(result);
    };
  });
  closeBtn.addEventListener("click", () => m.close(undefined));
  root.addEventListener("mousedown", (e) => { if (dismiss && e.target === root) m.close(undefined); });
  root.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); m.close(undefined); } });
  document.body.append(root);
  document.body.classList.add("modal-open");
  stack.push(m);
  pushLayer();
  return m;
};
P.ui.closeAll = () => { while (stack.length) stack[stack.length - 1].close(undefined); };
P.ui.hasModal = () => stack.length > 0;

P.btn = function (text, onClick, kind = "primary", extra = {}) {
  return h("button", { type: "button", class: "btn " + kind + (extra.class ? " " + extra.class : ""), onClick, text, title: extra.title });
};

// ------------------------------------------------------------------ campos de formulario
P.inp = function (f, value) {
  const kind = f.kind || "text";
  let el;
  if (kind === "choice") {
    const opts = f.options && f.options.length ? f.options : [""];
    el = h("select", { class: "in" }, opts.map((o) => h("option", { value: o, text: o || "—" })));
    const cur = value !== null && value !== undefined && value !== "" ? String(value) : opts[0];
    if (!opts.includes(cur)) el.append(h("option", { value: cur, text: cur }));
    el.value = cur;
  } else if (kind === "list") {                      // lista com "criar nova..." (categorias, unidades)
    const NEW = "__novo__";
    el = h("select", { class: "in" });
    const fill = (cur) => {
      const opts = P.lists.get(f.listKey, cur);
      el.replaceChildren(...(cur ? [] : [h("option", { value: "", text: "—" })]), ...opts.map((o) => h("option", { value: o, text: o })), h("option", { value: NEW, text: "➕ Criar nova…" }));
      el.value = cur || ""; el._prev = el.value;
    };
    fill(value !== null && value !== undefined ? String(value) : "");
    el.addEventListener("change", async () => {
      if (el.value !== NEW) { el._prev = el.value; return; }
      const prev = el._prev;
      const v = await P.ask("Nova " + (P.LISTAS[f.listKey].item), [{ key: "nome", label: "Nome", required: true }], {}, { ok: "Adicionar" });
      if (v) fill(P.lists.add(f.listKey, v.nome)); else el.value = prev;
    });
  } else if (kind === "combo") {
    const id = "dl" + Math.random().toString(36).slice(2, 8);
    el = h("input", { class: "in", type: "text", list: id, autocomplete: "off", value: value == null ? "" : String(value) });
    el._dl = h("datalist", { id }, (f.options || []).map((o) => h("option", { value: o })));
  } else if (kind === "textarea") {
    el = h("textarea", { class: "in", rows: Math.max(2, Math.round((f.height || 80) / 22)), value: value || "" });
  } else {
    const numeric = ["num", "money", "pct", "int"].includes(kind);
    el = h("input", { class: "in", type: kind === "password" ? "password" : "text", autocomplete: kind === "password" ? "new-password" : "off", inputmode: numeric ? "decimal" : (f.mode || "text"), placeholder: f.placeholder || null,
      value: value !== null && value !== undefined && value !== "" ? (numeric ? numInput(value, 4) : String(value)) : "" });
    if (kind === "int") el.setAttribute("inputmode", "numeric");
  }
  return el;
};
P.fieldValue = function (f, el) {
  const kind = f.kind || "text";
  if (kind === "textarea") return el.value.trim();
  const raw = el.value.trim();
  if (kind === "list") return raw === "__novo__" ? "" : raw;
  if (kind === "num" || kind === "money" || kind === "pct") {
    if (raw && fnum(raw, null) === null) throw new Error(`“${f.label}” precisa ser um número.`);
    const v = fnum(raw);
    if (f.min !== undefined && f.min !== null && v < f.min) throw new Error(`“${f.label}” deve ser no mínimo ${f.min}.`);
    return v;
  }
  if (kind === "int") return Math.round(fnum(raw));
  return raw;
};
P.field = function (f, el, cls = "") {
  const wrap = h("label", { class: "fld " + cls + (f.span === 2 ? " span2" : "") },
    h("span", { class: "fl", text: f.label + (f.required ? " *" : "") }),
    f.kind === "money" ? h("div", { class: "ad" }, h("i", { text: "R$" }), el) : f.kind === "pct" ? h("div", { class: "ad r" }, el, h("i", { text: "%" })) : el,
    el._dl || null,
    f.help ? h("span", { class: "fh", text: f.help }) : null);
  return wrap;
};

/** Formulario em janela. Retorna Promise com os valores (ou null se cancelado).
 *  fields: {key,label,kind:'text|num|money|pct|int|choice|combo|textarea',options,help,span,required,min,height} */
P.ask = function (title, fields, values = {}, o = {}) {
  const els = {};
  const grid = h("div", { class: "fg" });
  for (const f of fields) {
    const el = P.inp(f, values[f.key]);
    els[f.key] = el;
    grid.append(P.field(f, el));
  }
  const err = h("div", { class: "err", role: "alert" });
  let m;
  const submit = () => {
    const out = {};
    try {
      for (const f of fields) {
        const v = P.fieldValue(f, els[f.key]);
        if (f.required && (v === "" || v === null || v === undefined)) throw new Error(`Preencha o campo “${f.label}”.`);
        out[f.key] = v;
      }
    } catch (e) { err.textContent = e.message; err.scrollIntoView({ block: "nearest" }); return; }
    m.close(out);
  };
  const extra = (o.extra || []).map((x) => P.btn(x.text, () => { m.close(null); x.fn(); }, x.kind || "ghost"));
  const footer = [...extra, h("span", { class: "grow" }), P.btn("Cancelar", () => m.close(null), "secondary"), P.btn(o.ok || "Salvar", submit, o.danger ? "danger" : "primary")];
  m = P.modal({ title, sub: o.sub, body: [grid, err], footer, cls: o.wide ? "wide" : "" });
  grid.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); submit(); } });
  if (P.fine()) { const first = fields.length ? els[fields[0].key] : null; if (first) setTimeout(() => first.focus(), 60); }
  return m.promise.then((r) => r || null);
};

/** Lista pesquisavel para escolher um registro. */
P.pick = function (title, columns, rows, o = {}) {
  const box = h("div", { class: "pick" });
  const search = h("input", { class: "in", type: "search", placeholder: "Pesquisar…", autocomplete: "off" });
  let m;
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = q ? rows.filter((r) => columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q))) : rows;
    box.replaceChildren(P.table(columns, shown, { onOpen: (r) => m.close(r), empty: "Nada encontrado." }));
  };
  search.addEventListener("input", draw);
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const q = search.value.trim().toLowerCase(); const shown = q ? rows.filter((r) => columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q))) : rows; if (shown.length === 1) m.close(shown[0]); }
  });
  m = P.modal({ title, sub: o.sub, body: [search, box], footer: [h("span", { class: "grow" }), P.btn("Cancelar", () => m.close(null), "secondary")], cls: "wide pickmo" });
  draw();
  if (P.fine()) setTimeout(() => search.focus(), 60);
  return m.promise.then((r) => r || null);
};

P.confirm = function (title, text, ok = "Confirmar", danger = false) {
  let m;
  m = P.modal({ title, body: h("p", { class: "msg", text }), footer: [h("span", { class: "grow" }), P.btn("Cancelar", () => m.close(false), "secondary"), P.btn(ok, () => m.close(true), danger ? "danger" : "primary")], cls: "sm" });
  return m.promise.then((r) => !!r);
};
P.info = function (title, text, nivel = "info") {
  let m;
  m = P.modal({ title, body: h("div", { class: "callout " + nivel }, h("p", { class: "msg", text })), footer: [h("span", { class: "grow" }), P.btn("OK", () => m.close(true))], cls: "sm" });
  return m.promise;
};
/** Lista de acoes (equivale ao menu de contexto). items: [{text, kind, fn}] */
P.menu = function (title, items, sub) {
  let m;
  const list = h("div", { class: "menu" }, items.map((it) => h("button", { type: "button", class: "mi " + (it.kind || ""), text: it.text, onClick: () => { m.close(true); it.fn(); } })));
  m = P.modal({ title, sub, body: list, cls: "sm" });
  return m.promise;
};

// ------------------------------------------------------------------ blocos de tela
P.card = (...kids) => h("section", { class: "card" }, kids);
P.cardTitle = (title, sub, actions) => h("div", { class: "ct" }, h("div", null, h("h3", { text: title }), sub ? h("p", { class: "cs", text: sub }) : null), actions ? h("div", { class: "ca" }, actions) : null);
P.callout = (text, nivel = "info") => h("div", { class: "callout " + nivel }, h("p", { text }));
P.kpis = function (items, cols) {
  return h("div", { class: "kpis", style: cols ? { "--cols": cols } : null }, items.map((k) =>
    h("div", { class: "kpi", style: { "--ac": k.accent || "var(--orange)" } },
      h("div", { class: "kt", text: k.title }),
      h("div", { class: "kv", text: k.value ?? "—", style: k.color ? { color: k.color } : null }),
      k.sub ? h("div", { class: "ks", text: k.sub }) : null)));
};
P.seg = function (options, value, onChange) {
  const wrap = h("div", { class: "seg", role: "tablist" });
  const set = (v) => { wrap._v = v; [...wrap.children].forEach((b) => b.classList.toggle("on", b.dataset.v === v)); };
  options.forEach((o) => wrap.append(h("button", { type: "button", "data-v": o, text: o, role: "tab", onClick: () => { set(o); onChange && onChange(o); } })));
  set(value);
  wrap.get = () => wrap._v;
  wrap.set = set;
  return wrap;
};
P.progress = (frac, danger) => h("div", { class: "prog" + (danger ? " danger" : "") }, h("i", { style: { width: Math.max(0, Math.min(1, frac)) * 100 + "%" } }));
P.empty = (text) => h("p", { class: "empty", text });
P.searchBox = (placeholder, onInput, value = "") => {
  const el = h("input", { class: "in search", type: "search", placeholder, value, autocomplete: "off" });
  el.addEventListener("input", () => onInput(el.value));
  return el;
};

/** Tabela que vira lista de cartoes no celular.
 *  columns: {key,label,align:'l|r|c',fmt,pri (titulo do cartao),hm (esconde no celular),w}
 *  rows: objetos; _tag: neg|warn|good|muted|total */
P.table = function (columns, rows, o = {}) {
  if (!rows.length) return h("div", { class: "tbl-empty" }, P.empty(o.empty || "Nenhum registro."));
  const thead = h("thead", null, h("tr", null, columns.map((c) => h("th", { class: "a" + (c.align || "l") + (c.hm ? " hm" : ""), text: c.label, style: c.w ? { width: c.w } : null }))));
  const tbody = h("tbody");
  for (const r of rows) {
    const tr = h("tr", { class: (r._tag || "") + (o.onOpen && !r._fixed ? " click" : "") + (r._cls ? " " + r._cls : "") });
    columns.forEach((c) => {
      const raw = r[c.key];
      const txt = c.fmt ? c.fmt(raw, r) : (raw ?? "");
      const td = h("td", { class: "a" + (c.align || "l") + (c.pri ? " pri" : "") + (c.hm ? " hm" : ""), "data-label": c.label });
      if (txt instanceof Node) td.append(txt); else td.textContent = txt;
      tr.append(td);
    });
    if (o.onOpen && !r._fixed) {
      tr.tabIndex = 0;
      tr.addEventListener("click", () => o.onOpen(r));
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") o.onOpen(r); });
    }
    tbody.append(tr);
  }
  return h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" + (o.cls ? " " + o.cls : "") }, thead, tbody));
};
P.filterRows = (rows, q, keys) => {
  q = (q || "").trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => (keys || Object.keys(r)).some((k) => String(r[k] ?? "").toLowerCase().includes(q)));
};

// ------------------------------------------------------------------ graficos SVG
const svgEsc = esc;
P.chart = {
  /** Barras verticais (Resultado do mes). */
  bars(labels, vals, colors, { w = 420, hgt = 230 } = {}) {
    const padT = 24, padB = 44, padX = 8;
    const innerH = hgt - padT - padB;
    const mx = Math.max(...vals, 0), mn = Math.min(...vals, 0);
    const range = (mx - mn) || 1;
    const zero = padT + innerH * (mx / range);
    const bw = (w - padX * 2) / vals.length;
    let s = `<svg viewBox="0 0 ${w} ${hgt}" class="chart" role="img" aria-label="Gráfico de barras">`;
    s += `<line x1="${padX}" x2="${w - padX}" y1="${zero}" y2="${zero}" stroke="#C9CFD8" stroke-width="1"/>`;
    vals.forEach((v, i) => {
      const bh = Math.abs(v) / range * innerH;
      const x = padX + i * bw + bw * 0.18, ww = bw * 0.64;
      const y = v >= 0 ? zero - bh : zero;
      s += `<rect x="${x}" y="${y}" width="${ww}" height="${Math.max(bh, 0.5)}" rx="3" fill="${colors[i]}"/>`;
      const ty = v >= 0 ? y - 5 : zero - 5;          // negativo: rotulo acima da linha base (nao colide com o nome da barra)
      s += `<text x="${x + ww / 2}" y="${ty}" text-anchor="middle" font-size="11" font-weight="600" fill="#111A25">${svgEsc(money(v, 0))}</text>`;
      const words = String(labels[i]).split(" ");
      words.forEach((wd, k) => { s += `<text x="${x + ww / 2}" y="${hgt - padB + 16 + k * 13}" text-anchor="middle" font-size="11" fill="#2F3B4B">${svgEsc(wd)}</text>`; });
    });
    return s + "</svg>";
  },
  /** Rosca com legenda. parts: [{label,value,color}] */
  donut(parts, center) {
    const tot = parts.reduce((a, p) => a + p.value, 0);
    if (!tot) return '<div class="chart-empty">Sem dados</div>';
    const R = 38, C = 2 * Math.PI * R;
    let off = 0, s = '<svg viewBox="0 0 100 100" class="chart donut" role="img" aria-label="Gráfico de rosca"><g transform="rotate(-90 50 50)">';
    parts.forEach((p) => {
      const len = p.value / tot * C;
      s += `<circle cx="50" cy="50" r="${R}" fill="none" stroke="${p.color}" stroke-width="15" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"/>`;
      off += len;
    });
    s += "</g>";
    if (center) s += `<text x="50" y="52" text-anchor="middle" font-size="8.5" font-weight="700" fill="#1B2A3D">${svgEsc(center)}</text>`;
    s += "</svg>";
    const legend = parts.map((p) => `<li><i style="background:${p.color}"></i>${svgEsc(p.label)} <b>${Math.round(p.value / tot * 100)}%</b></li>`).join("");
    return `<div class="donut-wrap">${s}<ul class="legend">${legend}</ul></div>`;
  },
  /** Barra horizontal empilhada (composicao do faturamento). */
  stack(parts, total) {
    if (!(total > 0)) return '<div class="chart-empty">Informe a previsão de vendas</div>';
    const segs = parts.map((p) => ({ ...p, f: p.value / total })).filter((p) => p.f > 0);
    const bar = segs.map((p) => `<span style="width:${p.f * 100}%;background:${p.color}">${p.f > 0.06 ? Math.round(p.f * 100) + "%" : ""}</span>`).join("");
    const legend = segs.map((p) => `<li><i style="background:${p.color}"></i>${svgEsc(p.label)} <b>${money(p.value, 0)}</b></li>`).join("");
    return `<div class="stackbar">${bar}</div><ul class="legend row">${legend}</ul>`;
  },
};
P.html = (s) => { const t = document.createElement("template"); t.innerHTML = s; return t.content; };
