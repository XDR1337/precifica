"use strict";
/* Precifica Web - identidade visual da empresa nos documentos (PDF): paleta de cores e logotipo.
   Cada empresa tem duas cores (principal e destaque) em cor_principal / cor_destaque. Delas saem as demais (tons claros, texto do destaque).
   A paleta vira variaveis CSS (--c1, --c2, ...) no documento e vale para proposta, relatorios, tabela de precos e analise. */

const hex2rgb = (h) => {
  h = String(h || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return /^[0-9a-f]{6}$/i.test(h) ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : null;
};
const rgb2hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const contrastoBranco = (c) => 1.05 / (lum(c) + 0.05);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const BRANCO = [255, 255, 255], PRETO = [0, 0, 0];
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function hsl2rgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

P.COR_PADRAO = { c1: "#1B2A3D", c2: "#FF9900" };

/** Modelos de paleta (cor principal + cor de destaque) de todas as familias de cor. */
P.PALETAS = [
  ["Azul-grafite e laranja", "#1B2A3D", "#FF9900"], ["Azul-marinho e dourado", "#0F2547", "#C9A227"], ["Azul royal e ciano", "#1E3A8A", "#06B6D4"],
  ["Azul e verde-limão", "#1D4ED8", "#84CC16"], ["Turquesa e coral", "#0F4C5C", "#F97316"], ["Verde-floresta e menta", "#0B3D2E", "#2DD4A7"],
  ["Verde-oliva e âmbar", "#3F4F1F", "#E3A008"], ["Vermelho e grafite", "#8B1A1A", "#2B2623"], ["Vinho e rosa", "#5B1233", "#E85D9B"],
  ["Roxo e lima", "#3D3A8C", "#B6E04B"], ["Roxo e rosa", "#4C1D95", "#EC4899"], ["Grafite e coral", "#2B2623", "#E8553D"],
  ["Preto e amarelo", "#111827", "#FACC15"], ["Preto e dourado", "#0B0B0B", "#D4AF37"], ["Marrom e creme", "#4A2C1A", "#D9A066"],
  ["Cinza-azulado e azul", "#1F2937", "#3B82F6"],
];

/** Paleta completa de uma empresa (cores validas, texto branco legivel sobre a principal e destaque legivel como texto). */
P.palette = (cfg) => {
  cfg = cfg || {};
  let c1 = hex2rgb(cfg.cor_principal) || hex2rgb(P.COR_PADRAO.c1), c2 = hex2rgb(cfg.cor_destaque) || hex2rgb(P.COR_PADRAO.c2);
  for (let i = 0; contrastoBranco(c1) < 4.5 && i < 30; i++) c1 = mix(c1, PRETO, 0.08);      // cabecalhos de tabela levam texto branco
  let c2d = c2;
  for (let i = 0; contrastoBranco(c2d) < 3.2 && i < 30; i++) c2d = mix(c2d, PRETO, 0.08);   // versao do destaque que se le como texto no papel branco
  return { c1: rgb2hex(c1), c2: rgb2hex(c2), c2d: rgb2hex(c2d), c2s: rgb2hex(mix(c2, BRANCO, 0.88)), c1s: rgb2hex(mix(c1, BRANCO, 0.965)) };
};
/** Variaveis CSS da paleta (aplicadas na area do documento). */
P.docVars = (pal) => `--c1:${pal.c1};--c2:${pal.c2};--c2d:${pal.c2d};--c2s:${pal.c2s};--c1s:${pal.c1s}`;

/** Logotipo para os documentos: o da empresa; sem ele, so o nome (a marca do Precifica nao vai nos documentos do cliente). */
P.logoDoc = (cfg) => (cfg.empresa_logo && String(cfg.empresa_logo).startsWith("data:") ? cfg.empresa_logo
  : /acrs/i.test(String(cfg.empresa_fantasia || cfg.empresa_nome || "")) ? P.LOGO_ACRS : "");
/** Logotipo para o menu do app: o da empresa ou a marca do Precifica. */
P.logoApp = (cfg) => P.logoDoc(cfg) || P.LOGO;

/** Cores dominantes de uma imagem (logotipo): {c1, c2, extras}. c1 = cor mais presente, c2 = cor viva diferente dela, extras = outras cores da logo. */
P.logoColors = (url) => new Promise((resolve) => {
  const img = new Image();
  img.onerror = () => resolve(null);
  img.onload = () => {
    try {
      const S = 72, k = Math.min(S / img.width, S / img.height), w = Math.max(1, Math.round(img.width * k)), hh = Math.max(1, Math.round(img.height * k));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = hh;
      const g = cv.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, w, hh);
      const d = g.getImageData(0, 0, w, hh).data, bins = new Map();
      let total = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        total++;
        const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4), b = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; bins.set(key, b);
      }
      if (!total) return resolve(null);
      const cores = [...bins.values()].map((b) => { const rgb = [b.r / b.n, b.g / b.n, b.b / b.n], [h, s, l] = rgb2hsl(rgb); return { rgb, n: b.n, h, s, l }; })
        .filter((c) => c.l < 0.88 && c.n >= total * 0.004).sort((a, b) => b.n - a.n);        // sem o fundo branco e sem poeira de pixels
      if (!cores.length) return resolve(null);
      const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const unicas = [];
      for (const c of cores) if (unicas.every((u) => dist(u.rgb, c.rgb) > 55)) unicas.push(c);
      const c1 = unicas[0];
      const dh = (a, b) => { const x = Math.abs(a - b) % 360; return Math.min(x, 360 - x); };
      let c2 = unicas.find((c) => c !== c1 && c.s > 0.35 && (c1.s < 0.2 || dh(c.h, c1.h) > 30));
      let c2rgb;
      if (c2) c2rgb = c2.rgb;
      else { const base = c1.s < 0.2 ? [28, 0.85, 0.5] : [(c1.h + 35) % 360, Math.max(0.7, c1.s), 0.52]; c2rgb = hsl2rgb(base); }      // sem 2a cor viva: gera uma que combine
      resolve({ c1: rgb2hex(c1.rgb), c2: rgb2hex(c2rgb), extras: unicas.slice(0, 6).map((c) => rgb2hex(c.rgb)) });
    } catch (e) { resolve(null); }
  };
  img.src = url;
});

// ---------------------------------------------------------------- fonte e tema do app
const SIS = 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
/** Fontes que o dono pode escolher: [nome, familia CSS, nome no Google Fonts ou null]. As do sistema funcionam sempre; as do Google sao baixadas na primeira vez e depois ficam guardadas para uso offline. */
P.FONTES = [
  ["Padrão (do sistema)", SIS, null], ["Calibri", 'Calibri,Carlito,"Segoe UI",Arial,sans-serif', null], ["Arial", "Arial,Helvetica,sans-serif", null], ["Verdana", "Verdana,Geneva,sans-serif", null],
  ["Georgia (com serifa)", "Georgia,'Times New Roman',serif", null], ["Times New Roman (com serifa)", "'Times New Roman',Times,serif", null],
  ["Inter", "Inter," + SIS, "Inter"], ["Roboto", "Roboto," + SIS, "Roboto"], ["Open Sans", "'Open Sans'," + SIS, "Open Sans"], ["Lato", "Lato," + SIS, "Lato"],
  ["Montserrat", "Montserrat," + SIS, "Montserrat"], ["Poppins", "Poppins," + SIS, "Poppins"], ["Nunito", "Nunito," + SIS, "Nunito"], ["Raleway", "Raleway," + SIS, "Raleway"],
  ["Source Sans 3", "'Source Sans 3'," + SIS, "Source Sans 3"], ["Sora", "Sora," + SIS, "Sora"], ["Manrope", "Manrope," + SIS, "Manrope"], ["DM Sans", "'DM Sans'," + SIS, "DM Sans"],
  ["Plus Jakarta Sans", "'Plus Jakarta Sans'," + SIS, "Plus Jakarta Sans"], ["Merriweather (com serifa)", "Merriweather,Georgia,serif", "Merriweather"],
  ["Playfair Display (com serifa)", "'Playfair Display',Georgia,serif", "Playfair Display"], ["Lora (com serifa)", "Lora,Georgia,serif", "Lora"],
];
P.fonteDe = (cfg) => P.FONTES.find((f) => f[0] === (cfg || {}).fonte) || null;
/** Carrega a fonte do Google (uma vez). Sem internet a pagina usa a alternativa da familia. */
P.carregaFonte = (f) => {
  if (!f || !f[2]) return;
  const id = "gf-" + f[2].replace(/\W+/g, "");
  if (document.getElementById(id)) return;
  const l = document.createElement("link");
  l.id = id; l.rel = "stylesheet"; l.crossOrigin = "anonymous";
  l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(f[2]).replace(/%20/g, "+") + ":wght@400;500;600;700&display=swap";
  document.head.append(l);
};
const _docVars = P.docVars;
P.docVars = (pal, cfg) => { const f = P.fonteDe(cfg || (P.app && P.app.engine && P.app.engine.cfg)); P.carregaFonte(f); return _docVars(pal) + (f ? `;--docfont:${f[1]}` : ""); };

/** Tema do app: as cores da empresa viram as cores do menu, botoes e destaques, e a fonte escolhida vale para toda a tela. */
P.applyTheme = (cfg) => {
  const sig = [cfg.cor_principal, cfg.cor_destaque, cfg.fonte].join("|");
  if (P._themeSig === sig) return;
  P._themeSig = sig;
  const pal = P.palette(cfg), c1 = hex2rgb(pal.c1), c2 = hex2rgb(pal.c2), st = document.documentElement.style, H = rgb2hex;
  const vars = { "--navy": pal.c1, "--navy-h": H(mix(c1, BRANCO, 0.14)), "--steel": H(mix(c1, BRANCO, 0.4)), "--side": H(mix(c1, PRETO, 0.5)), "--side-h": H(mix(c1, PRETO, 0.3)),
    "--head": H(mix(c1, BRANCO, 0.92)), "--bg": pal.c1s, "--orange": pal.c2, "--orange-h": H(mix(c2, PRETO, 0.15)), "--orange-l": H(mix(c2, BRANCO, 0.35)), "--orange-d": pal.c2d,
    "--soft": pal.c2s, "--soft2": H(mix(c2, BRANCO, 0.94)), "--on-orange": contrastoBranco(c2) >= 3.6 ? "#FFFFFF" : "#111A25" };
  const padrao = !cfg.cor_principal && !cfg.cor_destaque;
  for (const [k, v] of Object.entries(vars)) { if (padrao && k !== "--on-orange") st.removeProperty(k); else st.setProperty(k, v); }
  if (padrao) st.setProperty("--on-orange", "#111A25");
  const f = P.fonteDe(cfg);
  P.carregaFonte(f);
  if (f && cfg.fonte !== P.FONTES[0][0]) st.setProperty("--font", f[1]); else st.removeProperty("--font");
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", padrao ? "#111A25" : vars["--side"]);
};
