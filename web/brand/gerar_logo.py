"""Gera os logotipos do Precifica em SVG (marca + palavra desenhada em curvas, sem depender de fonte instalada).
Uso: python web/brand/gerar_logo.py caminho/para/Sora.ttf     (Sora: fonte aberta, licenca OFL)
Saidas (nesta pasta): precifica-marca.svg, precifica-logo.svg (horizontal), precifica-logo-branco.svg (para fundo escuro)."""
import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = Path(__file__).resolve().parent
NAVY, ORANGE, ORANGE_L = "#1B2A3D", "#FF9900", "#FFB84D"


def mark(body, hole, bar_a, bar_b, bar_c, ox=0, oy=0):
    """Etiqueta de preco com tres barras crescentes (64 x 64)."""
    t = f' transform="translate({ox} {oy})"' if ox or oy else ""
    return (f'<g{t}><path d="M16 6H36.2a4 4 0 0 1 2.8 1.2l15.8 15.8a4 4 0 0 1 1.2 2.8V54a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4Z" fill="{body}"/>'
            f'<circle cx="40.5" cy="14.5" r="3.4" fill="{hole}"/>'
            f'<rect x="18" y="40" width="8" height="12" rx="1.8" fill="{bar_a}"/><rect x="28.5" y="32" width="8" height="20" rx="1.8" fill="{bar_b}"/>'
            f'<rect x="39" y="24" width="8" height="28" rx="1.8" fill="{bar_c}"/></g>')


def palavra(font_path, texto, size, cor):
    f = TTFont(font_path)
    f = instancer.instantiateVariableFont(f, {"wght": 700})
    gs, cmap, upm = f.getGlyphSet(), f.getBestCmap(), f["head"].unitsPerEm
    k = size / upm
    x, partes = 0.0, []
    for ch in texto:
        nome = cmap[ord(ch)]
        pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
        gs[nome].draw(TransformPen(pen, (k, 0, 0, -k, x, 0)))
        partes.append(pen.getCommands())
        x += gs[nome].width * k
    bp = BoundsPen(gs)
    gs["P"].draw(bp)
    cap = (bp.bounds[3] - bp.bounds[1]) * k
    return f'<path d="{" ".join(partes)}" fill="{cor}"/>', x, cap


def main(font_path):
    marca = mark(NAVY, "#FFFFFF", ORANGE, ORANGE, ORANGE_L)
    (HERE / "precifica-marca.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img"><title>Precifica</title>{marca}</svg>', encoding="utf-8")
    for nome, corpo, furo, texto in (("precifica-logo.svg", NAVY, "#FFFFFF", NAVY), ("precifica-logo-branco.svg", "#FFFFFF", NAVY, "#FFFFFF")):
        p, w, cap = palavra(font_path, "Precifica", 34, texto)
        gap = 14
        largura = 64 + gap + w + 4
        base = 32 + cap / 2                      # centraliza a altura das maiusculas com a marca
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {largura:.0f} 64" role="img"><title>Precifica</title>'
               f'{mark(corpo, furo, ORANGE, ORANGE, ORANGE_L)}<g transform="translate({64 + gap} {base:.2f})">{p}</g></svg>')
        (HERE / nome).write_text(svg, encoding="utf-8")
    print("gerado em", HERE)


if __name__ == "__main__":
    main(sys.argv[1])
