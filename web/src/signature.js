"use strict";
/* Precifica Web - imagem da assinatura: escolher, recortar (funciona com o dedo), tirar o fundo branco e ver como fica na proposta. */
const { h, btn } = P;

P.loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Não foi possível abrir essa imagem. Escolha um arquivo JPG ou PNG.")); i.src = src; });
P.fileToDataURL = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("Não foi possível ler o arquivo.")); r.readAsDataURL(f); });
P.pickImageFile = () => new Promise((resolve) => {
  const inp = h("input", { type: "file", accept: "image/*", style: { display: "none" } });
  inp.addEventListener("change", () => { resolve(inp.files[0] || null); inp.remove(); });
  inp.addEventListener("cancel", () => { resolve(null); inp.remove(); });
  document.body.append(inp); inp.click();
});
const mk = (w, hh) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hh)); return c; };

/** Transforma o papel branco em transparente, mantendo a tinta. thr = 60..250 (quanto maior, mais claro some). */
function keyOutWhite(c, thr) {
  const ctx = c.getContext("2d"), d = ctx.getImageData(0, 0, c.width, c.height), a = d.data, lo = thr - 50;
  for (let i = 0; i < a.length; i += 4) {
    const l = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
    const al = l >= thr ? 0 : l <= lo ? 255 : Math.round(((thr - l) / (thr - lo)) * 255);
    a[i + 3] = Math.min(a[i + 3], al);
  }
  ctx.putImageData(d, 0, 0);
}

/** HTML de uma assinatura (linha + nome, com a imagem acima da linha). Usado na proposta e nas previas. */
P.docs.sigPiece = (img, name) => `<div><div class="sigarea">${img ? `<img src="${img}" alt="">` : ""}</div><i></i><span>${P.esc((name || "").trim())}</span></div>`;
P.docs.sigRow = (i1, n1, i2, n2) => `<div class="psig">${P.docs.sigPiece(i1, n1)}${P.docs.sigPiece(i2, n2)}</div>`;

/** Abre o recortador. src = data URL ou URL. Retorna Promise<string|null> (data URL final) */
P.cropImage = async function (src, { name = "", title = "Recortar assinatura", canRemoveBg = true } = {}) {
  let img;
  try { img = await P.loadImage(src); } catch (e) { P.info("Imagem", e.message, "danger"); return null; }
  // area de trabalho (no maximo 1600 px para ficar leve no celular)
  const k0 = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  let work = mk(img.naturalWidth * k0, img.naturalHeight * k0);
  work.getContext("2d").drawImage(img, 0, 0, work.width, work.height);
  const st = { crop: { x: 0, y: 0, w: work.width, h: work.height }, remove: true, thr: 205 };
  const view = mk(work.width, work.height);
  view.className = "cr-canvas";
  const box = h("div", { class: "cr-box" });
  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((id) => h("i", { class: "cr-h " + id, "data-h": id }));
  box.append(...handles);
  const hole = h("div", { class: "cr-hole" });
  const shade = h("div", { class: "cr-shade" }, hole);                 // escurece so a imagem, fora do recorte
  const stage = h("div", { class: "cr-stage" }, view, shade, box);
  const outCanvas = h("canvas", { class: "cr-out" });
  const piece = h("div", { class: "paper prop sigprev1" });
  const redraw = () => { view.width = work.width; view.height = work.height; view.getContext("2d").drawImage(work, 0, 0); };
  const result = () => {
    const { x, y, w, h: hh } = st.crop, k = Math.min(1, 700 / w);
    const out = mk(w * k, hh * k);
    const ctx = out.getContext("2d");
    if (!st.remove) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, out.width, out.height); }
    ctx.drawImage(work, x, y, w, hh, 0, 0, out.width, out.height);
    if (st.remove) keyOutWhite(out, st.thr);
    return out;
  };
  let raf = 0;
  const refresh = () => {
    const { x, y, w, h: hh } = st.crop, W = work.width, H = work.height;
    const pos = { left: (x / W) * 100 + "%", top: (y / H) * 100 + "%", width: (w / W) * 100 + "%", height: (hh / H) * 100 + "%" };
    Object.assign(box.style, pos); Object.assign(hole.style, pos);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const out = result();
      outCanvas.width = out.width; outCanvas.height = out.height;
      outCanvas.getContext("2d").drawImage(out, 0, 0);
      piece.innerHTML = P.docs.sigPiece(out.toDataURL("image/png"), name || "Nome do assinante");
    });
  };
  // ---- arrastar / redimensionar (mouse e toque)
  let drag = null;
  const MIN = () => Math.max(24, Math.min(work.width, work.height) * 0.06);
  stage.addEventListener("pointerdown", (e) => {
    const hid = e.target.dataset && e.target.dataset.h ? e.target.dataset.h : e.target === box ? "move" : null;
    if (!hid) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    drag = { hid, sx: e.clientX, sy: e.clientY, c: { ...st.crop }, r: view.getBoundingClientRect() };
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const W = work.width, H = work.height, k = W / drag.r.width;
    const dx = (e.clientX - drag.sx) * k, dy = (e.clientY - drag.sy) * k, c = drag.c, m = MIN();
    let { x, y, w, h: hh } = c;
    if (drag.hid === "move") { x = Math.min(Math.max(0, c.x + dx), W - c.w); y = Math.min(Math.max(0, c.y + dy), H - c.h); }
    else {
      if (drag.hid.includes("w")) { x = Math.min(Math.max(0, c.x + dx), c.x + c.w - m); w = c.x + c.w - x; }
      if (drag.hid.includes("e")) w = Math.min(Math.max(m, c.w + dx), W - c.x);
      if (drag.hid.includes("n")) { y = Math.min(Math.max(0, c.y + dy), c.y + c.h - m); hh = c.y + c.h - y; }
      if (drag.hid.includes("s")) hh = Math.min(Math.max(m, c.h + dy), H - c.y);
    }
    st.crop = { x, y, w, h: hh };
    refresh();
  });
  const end = () => { drag = null; };
  stage.addEventListener("pointerup", end); stage.addEventListener("pointercancel", end);
  // ---- controles
  const rotate = () => {
    const n = mk(work.height, work.width), ctx = n.getContext("2d");
    ctx.translate(n.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(work, 0, 0);
    work = n; st.crop = { x: 0, y: 0, w: work.width, h: work.height };
    redraw(); refresh();
  };
  const reset = () => { st.crop = { x: 0, y: 0, w: work.width, h: work.height }; refresh(); };
  const chk = h("input", { type: "checkbox", checked: st.remove });
  const thr = h("input", { type: "range", min: 90, max: 250, step: 1, value: st.thr, class: "range" });
  const thrWrap = h("label", { class: "fld" }, h("span", { class: "fl", text: "Força para apagar o fundo" }), thr, h("span", { class: "fh", text: "Se sobrar mancha do papel, aumente. Se a letra ficar fraca, diminua." }));
  chk.addEventListener("change", () => { st.remove = chk.checked; thrWrap.style.display = st.remove ? "" : "none"; refresh(); });
  thr.addEventListener("input", () => { st.thr = +thr.value; refresh(); });
  const removeRow = canRemoveBg ? [h("label", { class: "chk" }, chk, h("span", { text: "Apagar o fundo branco (deixar só a tinta)" })), thrWrap] : [];
  const body = h("div", { class: "cr" },
    h("p", { class: "fh", text: "Arraste o retângulo laranja ou as bolinhas das bordas para escolher a parte da imagem." }),
    h("div", { class: "cr-wrap" }, stage),
    h("div", { class: "bar" }, btn("⟳ Girar", rotate, "secondary sm"), btn("Usar a imagem toda", reset, "secondary sm")),
    ...removeRow,
    h("div", { class: "cr-prevs" },
      h("div", null, h("div", { class: "fl", text: "Resultado" }), h("div", { class: "cr-chk" }, outCanvas)),
      h("div", null, h("div", { class: "fl", text: "Como fica na proposta" }), piece)));
  redraw(); refresh();
  let m;
  m = P.modal({ title, body, cls: "full cropmo", dismiss: false,
    footer: [btn("Cancelar", () => m.close(null), "secondary"), h("span", { class: "grow" }), btn("Usar assinatura", () => { const out = result(); m.close(st.remove ? out.toDataURL("image/png") : out.toDataURL("image/jpeg", 0.9)); })] });
  return m.promise.then((r) => r || null);
};

/** Campo "imagem da assinatura": miniatura + escolher / recortar / remover. */
P.sigField = function ({ label, getName, onChange }) {
  const S = { value: "" };
  const thumb = h("div", { class: "sig-thumb" });
  const bEscolher = btn("Escolher imagem", () => choose(), "secondary sm");
  const bEditar = btn("Recortar", () => edit(), "secondary sm");
  const bRemover = btn("Remover", () => { S.value = ""; draw(); onChange && onChange(); }, "danger-ghost sm");
  const draw = () => {
    thumb.replaceChildren(S.value ? h("img", { src: S.value, alt: "Assinatura" }) : h("span", { text: "Sem imagem" }));
    bEscolher.textContent = S.value ? "Trocar imagem" : "Escolher imagem";
    bEditar.style.display = bRemover.style.display = S.value ? "" : "none";
  };
  async function choose() {
    const f = await P.pickImageFile();
    if (!f) return;
    try {
      const url = await P.fileToDataURL(f);
      const out = await P.cropImage(url, { name: getName ? getName() : "" });
      if (out) { S.value = out; draw(); onChange && onChange(); }
    } catch (e) { P.info("Imagem", e.message, "danger"); }
  }
  async function edit() {
    const out = await P.cropImage(S.value, { name: getName ? getName() : "", canRemoveBg: false, title: "Recortar assinatura" });
    if (out) { S.value = out; draw(); onChange && onChange(); }
  }
  S.el = h("div", { class: "sigfield" }, h("span", { class: "fl", text: label }), thumb, h("div", { class: "bar" }, bEscolher, bEditar, bRemover));
  S.get = () => S.value;
  S.set = (v) => { S.value = v || ""; draw(); };
  draw();
  return S;
};

/** Mostra um HTML de proposta (bloco de fechamento) reduzido para caber na largura disponivel. */
P.fitPaper = function (el) {
  const fit = () => {
    const avail = el.parentElement ? el.parentElement.clientWidth : 0;
    el.style.zoom = "";
    const w = el.getBoundingClientRect().width;
    el.style.zoom = avail > 40 && w > avail ? String(avail / w) : "";
  };
  requestAnimationFrame(fit); setTimeout(fit, 150);
  return fit;
};
