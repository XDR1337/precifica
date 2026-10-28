"use strict";
/* Precifica Web - painel do administrador (item proprio do menu, so aparece para o administrador).
   Empresas (abrir/excluir), quem pode criar empresas e quantas, regras do modo offline de teste, link das regras e senha. */
const { h, btn, card, cardTitle } = P;

const dbx = () => P.sync.providers.dropbox;
const err = (e) => P.info("Não foi possível concluir", e.message || String(e), "danger");
const nice = (n) => n.replace(/^precifica-/i, "").replace(/-/g, " ");

P.definePage("Administração", {
  subtitle: "Empresas do sistema, quem pode criar empresas e as regras do modo offline de teste.",
  render(pg) {
    const A = P.auth;
    if (!A.isAdmin()) return [h("p", { class: "msg", text: "Área do administrador." })];
    const out = [];

    // ---------------------------------------------------------------- empresas
    const box = h("div", { class: "adm-rows" }, h("p", { class: "fh", text: "Carregando…" }));
    const drawCompanies = async () => {
      let list = [];
      try { list = await dbx().listCompanies(await A.token()); } catch (e) { box.replaceChildren(h("p", { class: "fh", text: "Não foi possível listar: " + e.message })); return; }
      box.replaceChildren(...(list.length ? list.map((c) => h("div", { class: "auth-row" }, h("div", {}, h("b", { text: nice(c.name) }), h("span", { text: c.name + (c.pending ? " · convite novo" : "") })),
        h("div", { class: "bar" }, btn("Abrir", () => A.enterAsAdmin(c.name), "primary xs"), btn("Excluir", () => excluir(c), "danger xs")))) : [h("p", { class: "fh", text: "Nenhuma empresa encontrada. Cada empresa precisa compartilhar a pasta “Precifica-…” com a sua conta do Dropbox." })]));
    };
    const excluir = async (c) => {
      const v = await P.ask("Excluir empresa", [{ key: "nome", label: `Digite o nome da pasta para confirmar: ${c.name}`, required: true, help: "Apaga a pasta e todos os dados desta empresa do Dropbox (o Dropbox guarda arquivos apagados por 30 dias). Se a pasta for de outra conta, o Dropbox pode apenas removê-la da sua lista." }], {}, { ok: "Excluir para sempre", danger: true });
      if (!v) return;
      if (v.nome.trim().toLowerCase() !== c.name.toLowerCase()) return P.info("Nome não confere", "A empresa não foi excluída.", "warn");
      try {
        await dbx().deleteFolder(await A.token(), c.name);
        const slug = c.name.replace(/^precifica-/i, "").toLowerCase();
        try { localStorage.removeItem(P.storeKey(slug)); localStorage.removeItem("precifica.acesso.v1." + slug); } catch (e) { /* ok */ }
        P.ui.toast("Empresa excluída"); drawCompanies();
      } catch (e) { err(e); }
    };
    drawCompanies();
    out.push(card(cardTitle("Empresas", "Pastas “Precifica-…” que estão no seu Dropbox (compartilhadas com você)."), box,
      h("div", { class: "bar" }, btn("Atualizar lista", () => drawCompanies(), "secondary sm"))));

    // ---------------------------------------------------------------- regras (e-mails + teste)
    const rulesBox = h("div", { class: "adm-rows" }, h("p", { class: "fh", text: "Carregando…" }));
    const mk = (id, label) => { const el = P.inp({ kind: "int" }, ""); return { id, label, el }; };
    const fTeste = mk("teste_s", "Tempo do modo offline de teste (segundos)"), fBloq = mk("bloqueio_h", "Tempo de bloqueio depois do teste (horas)");
    let pol = { criadores: [], teste_s: 30, bloqueio_h: 5 };
    const save = async (msg) => { try { await A.policySave(pol); P.ui.toast(msg || "Salvo"); drawRules(); } catch (e) { err(e); } };
    const drawRules = async () => {
      try { pol = await A.policyRead(); } catch (e) { rulesBox.replaceChildren(h("p", { class: "fh", text: "Não foi possível carregar as regras: " + e.message })); return; }
      pol.criadores = pol.criadores || [];
      fTeste.el.value = String(pol.teste_s || 30); fBloq.el.value = String(pol.bloqueio_h || 5);
      rulesBox.replaceChildren(...(pol.criadores.length ? pol.criadores.map((c) => h("div", { class: "auth-row" }, h("div", {}, h("b", { text: c.email }), h("span", { text: `Pode criar ${c.limite === 0 ? "ilimitadas" : c.limite} empresa${c.limite === 1 ? "" : "s"}` })),
        h("div", { class: "bar" }, btn("Limite", async () => {
          const v = await P.ask("Limite de empresas", [{ key: "limite", label: "Quantas empresas este e-mail pode criar?", kind: "int", required: true, min: 0, help: "0 = sem limite." }], { limite: c.limite }, { ok: "Salvar" });
          if (v) { c.limite = Math.max(0, v.limite); save("Limite atualizado"); }
        }, "secondary xs"), btn("Remover", async () => {
          if (await P.confirm("Remover e-mail", `Remover ${c.email}? Ele não poderá mais criar empresas (as que já existem continuam).`, "Remover", true)) { pol.criadores = pol.criadores.filter((x) => x !== c); save("E-mail removido"); }
        }, "danger xs")))) : [h("p", { class: "fh", text: "Nenhum e-mail liberado ainda. Sem a lista, ninguém consegue criar empresas." })]));
    };
    drawRules();
    out.push(card(cardTitle("Quem pode criar empresas", "Só os e-mails desta lista criam empresas novas. Quem entra pelo convite de um dono usa a empresa dele sem precisar estar aqui."), rulesBox,
      h("div", { class: "bar" }, btn("+ Liberar e-mail", async () => {
        const v = await P.ask("Liberar e-mail", [{ key: "email", label: "E-mail da conta Dropbox", required: true, mode: "email" }, { key: "limite", label: "Quantas empresas pode criar", kind: "int", min: 0, help: "0 = sem limite." }], { limite: 1 }, { ok: "Liberar" });
        if (!v) return;
        const em = v.email.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(em)) return P.info("E-mail inválido", "Confira o e-mail digitado.", "warn");
        if (pol.criadores.some((c) => c.email === em)) return P.info("Já está na lista", "Use “Limite” para mudar o limite dele.", "warn");
        pol.criadores.push({ email: em, limite: Math.max(0, v.limite) }); save("E-mail liberado");
      }))));

    out.push(card(cardTitle("Modo offline de teste", "Quem entra sem e-mail liberado e sem convite pode usar o modo offline por alguns segundos; depois o aparelho fica bloqueado."),
      h("div", { class: "fg" }, P.field({ label: fTeste.label }, fTeste.el), P.field({ label: fBloq.label }, fBloq.el)),
      h("div", { class: "bar" }, btn("Salvar regras", async () => {
        const t = Math.round(+String(fTeste.el.value).replace(",", ".")), b = +String(fBloq.el.value).replace(",", ".");
        if (!(t >= 5) || !(b > 0)) return P.info("Valores inválidos", "O teste deve ter pelo menos 5 segundos e o bloqueio mais de 0 hora.", "warn");
        pol.teste_s = t; pol.bloqueio_h = b; save("Regras salvas");
      })),
      h("p", { class: "fh", text: "Atenção: o bloqueio vale para o aparelho/navegador. Este sistema não tem servidor, então não dá para bloquear por IP; quem limpar os dados do navegador consegue um novo teste." })));

    // ---------------------------------------------------------------- publicar as regras
    const st = P.POLICY_URL ? "Ativa: o site já está lendo as regras acima." : "Ainda não ativada: sem o link, o site deixa todo mundo criar empresas e não aplica o bloqueio.";
    out.push(card(cardTitle("Ativar as regras no site", st),
      h("div", { class: "bar" }, btn("Gerar o link das regras", async () => {
        try {
          if (!pol.criadores.length && !(await P.confirm("Lista vazia", "Não há nenhum e-mail liberado. Se ativar assim, só você (administrador) poderá criar empresas. Continuar?", "Continuar"))) return;
          await A.policySave(pol);
          const url = await A.policyLink();
          P.ask("Link das regras", [{ key: "url", label: "Copie este link", kind: "textarea", height: 70 }], { url }, { ok: "Fechar" });
        } catch (e) { err(e); }
      }, "secondary")),
      h("ol", { class: "usteps" }, h("li", { html: "Toque em <b>Gerar o link das regras</b> e copie o link." }), h("li", { html: "No GitHub: <b>Settings › Secrets and variables › Actions › Variables › New repository variable</b>, nome <code>POLICY_URL</code>, valor = o link." }),
        h("li", { html: "Na aba <b>Actions</b>, rode o workflow de novo (Run workflow). Depois disso as regras valem para todos." }))));

    // ---------------------------------------------------------------- senha
    out.push(card(cardTitle("Minha conta de administrador"), h("div", { class: "bar" },
      btn("Trocar senha", async () => { try { if (await A.changeAdminPw()) P.ui.toast("Senha alterada"); } catch (e) { err(e); } }, "secondary"),
      btn("Sair", () => A.leave(true), "secondary"))));
    return out;
  },
});
