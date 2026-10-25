"""Teste de impressao: abre os documentos (proposta, relatorio, analise) no Edge/Chrome headless e gera PDFs em test/out/.
Uso:  python web/test/print_test.py   (depois de python web/test/parity_gen.py)"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEB = HERE.parent
OUT = HERE / "out"
BROWSERS = [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe"]
exe = next((b for b in BROWSERS if Path(b).exists()), None)
if not exe:
    sys.exit("Edge/Chrome nao encontrado")

html = (WEB / "Precifica.html").read_text(encoding="utf-8")
db = (OUT / "db_web.json").read_text(encoding="utf-8")

JOBS = {
    "proposta": """
      const ex = P.SEED.EXEMPLO_PROPOSTA;
      const prop = { numero: ex.numero, data: ex.data, validade_dias: ex.validade_dias, titulo: ex.titulo, aos_cuidados: ex.aos_cuidados, cliente_nome: ex.cliente_nome, objeto: ex.objeto,
        escopo_intro: ex.escopo_intro, escopo_json: JSON.stringify(ex.escopo), escopo_nota: ex.escopo_nota, secoes_pre_json: JSON.stringify(ex.secoes_pre), secoes_pos_json: JSON.stringify(ex.secoes_pos),
        parcelas_json: JSON.stringify(ex.parcelas), fecho: ex.fecho, assinatura1: ex.assinatura1, assinatura2: ex.assinatura2, desconto_valor: 0, invest_nova_pagina: 1 };
      P.openDoc(P.docs.proposal(P.app.engine.cfg, prop, ex.itens.map(([d, v]) => ({ descricao: d, quantidade: 1, unidade: '', valor_unit: v }))));""",
    "relatorio": "P.openDoc(P.docs.report(P.app.engine));",
    "analise": "const it = P.app.engine.itens()[0]; P.openDoc(P.docs.analysis(P.app.engine, P.app.engine.analise(it.tipo, it.id, 10, 18)));",
}
for name, js in JOBS.items():
    page = html.replace("</body>", f"""<script>
      P.welcome = () => {{}}; P.app.tutorial.start = () => {{}};
      P.app.db.importData({json.dumps(db)}); P.app.db.setMany({{onboarding_ok: 1, tutorial_nao_mostrar: 1}}); P.app.changed();
      {js}
    </script></body>""")
    f = OUT / f"print_{name}.html"
    f.write_text(page, encoding="utf-8")
    pdf = OUT / f"print_{name}.pdf"
    if pdf.exists():
        pdf.unlink()
    subprocess.run([exe, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={pdf}", "--virtual-time-budget=6000",
                    f"--user-data-dir={OUT / 'profile'}", f.as_uri()], check=False, timeout=120, capture_output=True)
    print(name, "->", pdf if pdf.exists() else "FALHOU")
