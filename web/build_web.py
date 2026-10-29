"""Gera a versao web do Precifica.

  web/Precifica.html   -> pagina unica, autocontida (abre direto do arquivo, funciona offline)
  web/pwa/             -> mesma pagina + manifest, service worker e icones (aplicativo instalavel no celular)

Os dados iniciais (precos de referencia, modelo de proposta, exemplos...) saem de precifica/seed.py, e o logotipo de
precifica/assets.py, para a versao web nunca ficar diferente da versao desktop.
Uso:  python web/build_web.py
"""
import base64
import hashlib
import json
import math
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from precifica import seed                      # noqa: E402
from precifica.assets import ACRS_LOGO_PNG       # noqa: E402
from precifica.core import APP_AUTHOR, APP_VERSION  # noqa: E402

SRC = os.path.join(HERE, "src")
JS_ORDER = ["core.js", "ui-base.js", "docs.js", "signature.js", "pages-a.js", "pages-b.js", "proposal.js", "tutorial.js", "importer.js", "sync.js", "auth.js", "admin.js", "app.js"]
APP_NAME = "Precifica"


def dropbox_key() -> str:
    """Chave do app Dropbox (App key; nao e segredo). Fica em web/dropbox_app_key.txt ou na variavel PRECIFICA_DROPBOX_KEY."""
    p = os.path.join(HERE, "dropbox_app_key.txt")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return f.read().strip()
    return os.environ.get("PRECIFICA_DROPBOX_KEY", "").strip()


def dropbox_folder() -> str:
    """Pasta compartilhada do Dropbox usada na sincronizacao em equipe (ex.: Precifica-Equipe). Vazia = pasta do app."""
    p = os.path.join(HERE, "dropbox_folder.txt")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return f.read().strip()
    return os.environ.get("PRECIFICA_DROPBOX_FOLDER", "").strip()


def _cfg(fname: str, env: str) -> str:
    p = os.path.join(HERE, fname)
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return f.read().strip()
    return os.environ.get(env, "").strip()


def seed_js() -> str:
    data = {
        "UNIDADES": seed.UNIDADES, "SETORES": seed.SETORES, "CONTRATACOES": seed.CONTRATACOES, "STATUS_PROPOSTA": seed.STATUS_PROPOSTA,
        "FORMAS_PAGAMENTO": seed.FORMAS_PAGAMENTO, "UFS": seed.UFS, "PRECOS_REFERENCIA": seed.PRECOS_REFERENCIA,
        "CUSTOS_FIXOS_PADRAO": seed.CUSTOS_FIXOS_PADRAO, "IMOBILIZADO_PADRAO": seed.IMOBILIZADO_PADRAO,
        "ENCARGOS_PADRAO": seed.ENCARGOS_PADRAO, "CONFIG_PADRAO": seed.CONFIG_PADRAO, "EXEMPLO": seed.EXEMPLO,
        "FECHO_PADRAO": seed.FECHO_PADRAO, "MODELO_PROPOSTA": seed.MODELO_PROPOSTA, "EXEMPLO_PROPOSTA": seed.EXEMPLO_PROPOSTA,
    }
    logo = "data:image/png;base64," + base64.b64encode(ACRS_LOGO_PNG).decode("ascii")
    return (f"P.SEED = {json.dumps(data, ensure_ascii=False, separators=(',', ':'))};\n"
            f"P.LOGO = {json.dumps(logo)};\n"
            f"P.SYNC_DROPBOX_KEY = {json.dumps(dropbox_key())};\n"
            'P.SYNC_DROPBOX_FOLDER = "";\n'   # a pasta unica (Precifica-Equipe) nao e mais usada: cada empresa tem a sua
            f"P.ADMIN_IDS = {json.dumps([x.strip() for x in _cfg('admin_ids.txt', 'PRECIFICA_ADMIN_IDS').replace(chr(10), ',').split(',') if x.strip()])};\n"
            f"P.POLICY_URL = {json.dumps(_cfg('policy_url.txt', 'PRECIFICA_POLICY_URL'))};\n"
            f"P.SUPPORT_EMAIL = {json.dumps(_cfg('support_email.txt', 'PRECIFICA_SUPPORT_EMAIL'))};\n"
            f"P.APP_NAME = {json.dumps(APP_NAME)}; P.APP_VERSION = {json.dumps(APP_VERSION)}; P.APP_AUTHOR = {json.dumps(APP_AUTHOR)};\n")


def read(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as f:
        return f.read()


def bundle_js() -> str:
    parts = ["const P = {};", "(function(){\n" + seed_js() + "\n})();"]
    for n in JS_ORDER:
        parts.append(f"/* ===== {n} ===== */\n(function(){{\n{read(n)}\n}})();")
    return "\n".join(parts).replace("</script", "<\\/script")


# ------------------------------------------------------------------ icones (PNG sem biblioteca de imagem)
def png(size, pixels):
    raw = b"".join(b"\x00" + bytes(pixels[y * size * 4:(y + 1) * size * 4]) for y in range(size))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def icon(size, maskable=False):
    """Quadrado azul-grafite arredondado com tres barras laranja crescentes (supersampling 2x2)."""
    scale = 0.72 if maskable else 1.0
    bars = [(0.22, 0.55, 0.20), (0.41, 0.40, 0.20), (0.60, 0.24, 0.20)]     # (x, topo, largura) em fracao
    radius = 0.22
    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for sy in (0.25, 0.75):
                for sx in (0.25, 0.75):
                    u, v = (x + sx) / size, (y + sy) / size
                    if not maskable:
                        cx, cy = min(max(u, radius), 1 - radius), min(max(v, radius), 1 - radius)
                        if math.hypot(u - cx, v - cy) > radius:
                            continue
                    t = (u + v) / 2
                    col = (27 + (44 - 27) * t, 42 + (62 - 42) * t, 61 + (86 - 61) * t)       # #1B2A3D -> #2C3E56
                    uu, vv = 0.5 + (u - 0.5) / scale, 0.5 + (v - 0.5) / scale
                    for bx, top, bw in bars:
                        if bx <= uu <= bx + bw * 0.9 and top <= vv <= 0.78:
                            col = (255, 153, 0)
                    if 0.20 <= uu <= 0.80 and 0.80 <= vv <= 0.83:
                        col = (255, 255, 255)
                    r += col[0]; g += col[1]; b += col[2]; a += 255
            o = (y * size + x) * 4
            if a:
                out[o:o + 4] = bytes((round(r / (a / 255)), round(g / (a / 255)), round(b / (a / 255)), round(a / 4)))
    return png(size, out)


def build_pwa(html):
    folder = os.path.join(HERE, "pwa")
    os.makedirs(folder, exist_ok=True)
    version = hashlib.sha1(html.encode("utf-8")).hexdigest()[:10]
    head = ('<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icon-192.png">\n</head>')
    register = ("<script>if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) "
                "addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>\n</body>")
    page = html.replace("</head>", head, 1).replace("</body>", register, 1)
    with open(os.path.join(folder, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(page)
    manifest = {"name": "Precifica – Precificação e Propostas", "short_name": "Precifica", "description": "Descubra quanto cobrar pelos seus serviços e gere propostas comerciais. Funciona offline.",
                "start_url": "./index.html", "scope": "./", "display": "standalone", "orientation": "any", "lang": "pt-BR", "background_color": "#F4F5F7", "theme_color": "#111A25",
                "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"}, {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                          {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
    with open(os.path.join(folder, "manifest.webmanifest"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    sw = f"""// Service worker do Precifica: a pagina e' um unico arquivo; depois do primeiro acesso funciona totalmente offline.
const CACHE = 'precifica-{version}';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
self.addEventListener('install', (e) => {{ e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); }});
self.addEventListener('activate', (e) => {{ e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); }});
self.addEventListener('fetch', (e) => {{
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isLib = url.hostname === 'cdnjs.cloudflare.com';          // leitor de planilhas (SheetJS): guardado apos o primeiro uso
  e.respondWith(caches.match(e.request, {{ ignoreSearch: !isLib }}).then((hit) => hit || fetch(e.request).then((res) => {{
    if (isLib && res && res.status === 200) {{ const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }}
    return res;
  }}).catch(() => caches.match('./index.html'))));
}});
"""
    with open(os.path.join(folder, "sw.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(sw)
    for name, size, mask in (("icon-192.png", 192, False), ("icon-512.png", 512, False), ("icon-maskable-512.png", 512, True)):
        with open(os.path.join(folder, name), "wb") as f:
            f.write(icon(size, mask))
    with open(os.path.join(folder, "HOSTING.txt"), "w", encoding="utf-8") as f:
        f.write("Precifica como aplicativo instalavel (celular e computador)\n"
                "1. Envie esta pasta inteira para qualquer hospedagem estatica com HTTPS (GitHub Pages, Netlify, Cloudflare Pages, seu servidor).\n"
                "2. Abra o endereco no celular; o navegador oferece 'Instalar app' / 'Adicionar a tela inicial'. Depois abre em tela cheia e funciona offline.\n"
                "3. Teste local: execute 'servir_na_rede.bat' (ou python -m http.server 8000 nesta pasta) e abra http://localhost:8000.\n"
                "   Para abrir no celular na mesma rede Wi-Fi, use o endereco IP do computador (ex.: http://192.168.0.10:8000). Sem HTTPS o app funciona, mas nao instala offline.\n"
                "Os dados ficam no navegador de cada aparelho (Configuracoes > Fazer backup exporta um arquivo .json).\n")
    print(f"{folder}: aplicativo instalavel ({version})")


def main():
    with open(os.path.join(HERE, "index.template.html"), encoding="utf-8") as f:
        html = f.read()
    html = html.replace("/*{{CSS}}*/", read("style.css")).replace("/*{{JS}}*/", bundle_js())
    out = os.path.join(HERE, "Precifica.html")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print(f"{out}: {len(html) / 1e6:.2f} MB")
    build_pwa(html)


if __name__ == "__main__":
    main()
