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
    // aceita antes de tudo o convite da pasta de regras enviado por outro administrador (assim todos leem e gravam o mesmo estado)
    const prep = A.token().then((tk) => dbx().acceptAdminDir(tk)).catch(() => {});
    // convites recusados/aceitos ficam no arquivo de regras compartilhado: valem para todos os administradores
    let estado = { ign: [], acc: [] };
    const carregaEstado = async () => { try { const p = await A.policyRead(); estado = { ign: p.ign, acc: p.acc }; } catch (e) { /* sem estado: lista vazia */ } };
    const guarda = async (k, nome) => { try { const p = await A.policyRead(); if (!p[k].includes(nome)) { p[k].push(nome); await A.policySave(p); } estado[k] = p[k]; } catch (e) { /* ok */ } };
    const ignorados = () => estado.ign, aceitos = () => estado.acc;
    const drawCompanies = async () => {
      let list = [];
      try {
        await prep; await carregaEstado();
        const tk = await A.token();
        list = await dbx().listCompanies(tk);
        const ign = ignorados(), ja = aceitos();
        // convite que este painel ja aceitou e voltou a ficar pendente = a pasta foi apagada aqui: recusa de vez (senao o Dropbox continua oferecendo)
        for (const c of list.filter((x) => x.pending && x.sid && ja.includes(x.name.toLowerCase()))) { try { await dbx().declineInvite(tk, c.sid); } catch (e) { /* dono da pasta ou erro: ao menos some do painel */ } await guarda("ign", c.name.toLowerCase()); }
        const novos = list.filter((c) => c.pending && c.sid && !ja.includes(c.name.toLowerCase()) && !ign.includes(c.name.toLowerCase()));
        if (novos.length && A.supportEmail()) {                       // convites dos clientes para o suporte: aceita uma vez so (os recusados ou ja aceitos antes ficam de fora)
          for (const c of novos) { await dbx().rpc("sharing/mount_folder", tk, { shared_folder_id: c.sid }); await guarda("acc", c.name.toLowerCase()); }
          list = await dbx().listCompanies(tk);
        }
      } catch (e) { box.replaceChildren(h("p", { class: "fh", text: "Não foi possível listar: " + e.message })); return; }
      list = list.filter((c) => !(c.pending && ignorados().includes(c.name.toLowerCase())));      // convites recusados ficam fora da lista e nunca sao aceitos sozinhos
      box.replaceChildren(...(list.length ? list.map((c) => h("div", { class: "auth-row" }, h("div", {}, h("b", { text: nice(c.name) }), h("span", { text: c.name + (c.pending ? " · convite novo" : "") })),
        h("div", { class: "bar" }, btn("Gerenciar", () => gerenciar(c), "primary xs"), c.pending ? null : btn("Backup", async () => { try { P.download(`precifica_${c.name}_${new Date().toISOString().slice(0, 10)}.json`, await A.companyBackup(c.name)); } catch (e) { err(e); } }, "secondary xs"), btn("Abrir", () => A.enterAsAdmin(c.name), "secondary xs"), btn(c.pending ? "Recusar convite" : "Excluir", () => excluir(c), "danger xs")))) : [h("p", { class: "fh", text: "Nenhuma empresa encontrada. Cada empresa precisa compartilhar a pasta “Precifica-…” com a sua conta do Dropbox." })]));
    };
    const excluir = async (c) => {
      try {
        if (c.pending && c.sid) {                       // convite que ainda nao foi aceito: recusa sem criar a pasta no seu Dropbox
          if (!(await P.confirm("Recusar convite", `A pasta “${c.name}” está aparecendo como um compartilhamento pendente. Se for de outra conta, o convite é recusado e a pasta dela não é apagada. Continuar?`, "Continuar", true))) return;
          const tk = await A.token();
          await guarda("ign", c.name.toLowerCase());
          try { await dbx().declineInvite(tk, c.sid); P.ui.toast("Convite recusado"); }
          catch (e) {
            if (!e.owner) { P.info("Convite ocultado", "O Dropbox não deixou recusar por aqui, mas o convite foi ocultado deste painel e não será aceito sozinho. Para sumir de vez, recuse em dropbox.com › Compartilhado, ou peça a quem criou a pasta para remover a sua conta.", "warn"); drawCompanies(); return; }
            if (!(await P.confirm("A pasta é sua", `Você é o dono de “${c.name}”. Para fazê-la sumir, o compartilhamento será encerrado e a pasta apagada para todos que ainda a tenham (o Dropbox guarda arquivos apagados por 30 dias). Apagar?`, "Encerrar e apagar", true))) return;
            const r = await dbx().unshareAndDelete(tk, c.sid, c.name);
            P.ui.toast(r === "apagada" ? "Pasta apagada" : "Compartilhamento encerrado");
            if (r !== "apagada") P.info("Falta um passo", "O compartilhamento foi encerrado, mas a pasta continua no seu Dropbox. Atualize a lista e toque em Excluir nela.", "warn");
          }
          drawCompanies(); return;
        }
        const r = await A.deleteCompany(c.name);
        if (r) { await guarda("ign", c.name.toLowerCase()); P.ui.toast(r === "apagada" ? "Empresa excluída" : "Pasta removida da sua lista"); drawCompanies(); }
      } catch (e) { err(e); }
    };
    const when = (t) => (t ? new Date(t).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
    /** Janela de gerenciamento de uma empresa: usuarios, convites, suspensao, backup. */
    const gerenciar = async (c) => {
      const body = h("div", { class: "adm-rows" }, h("p", { class: "fh", text: "Carregando…" }));
      const m = P.modal({ title: nice(c.name), sub: c.name, body, cls: "wide" });
      const run = (fn) => async () => { try { if (await fn()) draw(); } catch (e) { err(e); } };
      const draw = async () => {
        let info;
        try { info = await A.companyInfo(c.name); } catch (e) { body.replaceChildren(h("p", { class: "fh", text: "Não foi possível abrir: " + e.message })); return; }
        const acc = info.acc, members = acc && Array.isArray(acc.members) ? acc.members : [];
        const kv = (k, v) => h("div", {}, h("span", { class: "fh", text: k }), h("b", { text: v }));
        const parts = [h("div", { class: "adm-kv" }, kv("Criada por", acc && acc.criador || "—"), kv("Criada em", acc ? when(acc.criado) : "—"), kv("Último uso", when(info.last)), kv("Tamanho", info.size ? Math.round(info.size / 1024) + " KB" : "—"), kv("Situação", !members.length ? "Sem dono" : acc.suspensa ? "Suspensa" : "Ativa"))];
        if (!members.length) {
          parts.push(h("div", { class: "callout" }, h("p", { class: "msg", text: "Esta empresa ainda não tem dono. Informe o e-mail do dono para que ele consiga entrar." })), h("div", { class: "bar" }, btn("Definir dono", run(() => A.setOwner(c.name)))));
        } else {
          parts.push(h("h4", { text: "Pessoas com acesso" }), ...members.map((u) => h("div", { class: "auth-row" }, h("div", {}, h("b", { text: u.email }), h("span", { text: u.papel === "dono" ? "Dono" : "Funcionário" })),
            h("div", { class: "bar" }, btn(u.papel === "dono" ? "Tornar funcionário" : "Tornar dono", run(() => A.setRole(u, c.name)), "secondary xs"), btn("Reenviar convite", run(async () => { await A.resendInvite(u, c.name); P.ui.toast("Convite enviado"); return false; }), "secondary xs"), btn("Remover", run(() => A.removeMember(u, c.name)), "danger xs")))),
            h("div", { class: "bar" }, btn("+ Adicionar pessoa", run(() => A.addMember(c.name)), "secondary sm")));
        }
        parts.push(h("h4", { text: "Ações" }), h("div", { class: "bar" },
          btn("Abrir empresa", () => { m.close(); A.enterAsAdmin(c.name); }),
          btn("Baixar backup", async () => { try { P.download(`precifica_${c.name}_${new Date().toISOString().slice(0, 10)}.json`, await A.companyBackup(c.name)); } catch (e) { err(e); } }, "secondary"),
          acc ? btn(acc.suspensa ? "Reativar empresa" : "Suspender empresa", run(async () => {
            if (!acc.suspensa && !(await P.confirm("Suspender empresa", "Ninguém desta empresa conseguirá entrar até você reativar (quem estiver dentro é desconectado em alguns minutos). Os dados não são apagados.", "Suspender", true))) return false;
            await A.setSuspended(c.name, !acc.suspensa); return true;
          }), acc.suspensa ? "primary" : "secondary") : null));
        body.replaceChildren(...parts);
      };
      draw();
    };
    drawCompanies();
    out.push(card(cardTitle("Empresas", "Pastas “Precifica-…” que estão no seu Dropbox (compartilhadas com você)."), box,
      h("div", { class: "bar" }, btn("+ Criar empresa", async () => {
        const v = await P.ask("Criar empresa", [{ key: "nome", label: "Nome da empresa", required: true }, { key: "email", label: "E-mail do dono (conta Dropbox)", mode: "email", help: "O dono recebe o convite da pasta e passa a gerenciar a empresa. Deixe em branco para ficar com você. Empresas criadas por você não contam nos limites de ninguém." }], {}, { ok: "Criar empresa" });
        if (!v) return;
        const ld = A.loader("Criando a empresa…", ["Criando a pasta no Dropbox", "Definindo o dono", "Enviando o convite", "Preparando a base de dados"]);
        try {
          const r = await A.createByAdmin(v.nome, v.email);
          ld.close();
          if (r.aviso) P.info("Empresa criada", r.aviso, "warn"); else P.ui.toast("Empresa criada");
          drawCompanies();
        } catch (e) { ld.close(); err(e); }
      }), btn("Atualizar lista", () => drawCompanies(), "secondary sm"))));

    // ---------------------------------------------------------------- regras (e-mails + teste)
    const rulesBox = h("div", { class: "adm-rows" }, h("p", { class: "fh", text: "Carregando…" }));
    const fSup = h("input", { class: "in", type: "text", inputmode: "email", autocomplete: "off", placeholder: "e-mail do seu Dropbox" });
    let pol = { criadores: [], admins: [], ign: [], acc: [], teste_s: 30, bloqueio_h: 5 };
    const admBox = h("div", { class: "adm-rows" });
    const drawAdmins = () => {
      const eu = (A.email() || "").toLowerCase();
      admBox.replaceChildren(h("div", { class: "auth-row" }, h("div", {}, h("b", { text: eu || "Você" }), h("span", { text: "Você (esta conta)" }))),
        ...(pol.admins || []).filter((x) => String(x.email).toLowerCase() !== eu).map((x) => h("div", { class: "auth-row" }, h("div", {}, h("b", { text: x.email }), h("span", { text: "Administrador" })),
          btn("Remover", async () => { if (await P.confirm("Remover administrador", `Remover ${x.email} da lista? Ele deixa de receber novas empresas. Para tirar o acesso que ele já tem, remova-o das pastas no Dropbox e tire o ID dele da variável ADMIN_DROPBOX_IDS.`, "Remover", true)) { pol.admins = pol.admins.filter((y) => y !== x); save("Administrador removido"); } }, "danger xs"))));
    };
    const runSync = async (mostrar) => {
      try { const r = await A.syncAdmins(); if (mostrar) P.info("Administradores sincronizados", r.resumo, r.erros.length ? "warn" : "ok"); }
      catch (e) { if (mostrar) err(e); }
    };
    const save = async (msg) => { try { await A.policySave(pol); P.ui.toast(msg || "Salvo"); drawRules(); } catch (e) { err(e); } };
    const drawRules = async () => {
      try { await prep; pol = await A.policyRead(); } catch (e) { rulesBox.replaceChildren(h("p", { class: "fh", text: "Não foi possível carregar as regras: " + e.message })); return; }
      pol.criadores = pol.criadores || [];
      if (!fSup.value) fSup.value = pol.suporte_email || A.email() || "";
      drawAdmins();
      if ((pol.admins || []).length && Date.now() - (+localStorage.getItem("precifica.admin.sync") || 0) > 600000) { try { localStorage.setItem("precifica.admin.sync", String(Date.now())); } catch (e) { /* ok */ } runSync(false); }
      const L = (v, def) => (v === 0 ? "sem limite" : v === undefined ? def : v);
      rulesBox.replaceChildren(...(pol.criadores.length ? pol.criadores.map((c) => h("div", { class: "auth-row" }, h("div", {}, h("b", { text: c.nome || c.email }),
        h("span", { text: c.nome ? c.email : "" }), c.celular ? h("span", { text: "Celular: " + c.celular }) : "",
        h("span", { text: `Empresas: ${L(c.limite, 1)} · Pessoas convidadas: ${L(c.limite_func, 5)}` })),
        h("div", { class: "bar" }, btn("Editar", async () => {
          const v = await P.ask("Editar " + c.email, [{ key: "nome", label: "Nome", required: true }, { key: "celular", label: "Celular (opcional)", mode: "tel", help: "Com DDD. Só você vê." },
            { key: "limite", label: "Quantas empresas pode criar?", kind: "int", required: true, min: 0, help: "0 = sem limite." },
            { key: "limite_func", label: "Quantas pessoas pode convidar?", kind: "int", required: true, min: 0, help: "Vale para todas as empresas criadas por este e-mail somadas. 0 = sem limite." }],
            { nome: c.nome || "", celular: c.celular || "", limite: c.limite, limite_func: c.limite_func === undefined ? 5 : c.limite_func }, { ok: "Salvar" });
          if (v) { c.nome = v.nome.trim(); c.celular = (v.celular || "").trim(); c.limite = Math.max(0, v.limite); c.limite_func = Math.max(0, v.limite_func); save("Dados atualizados"); }
        }, "secondary xs"), btn("Remover", async () => {
          if (await P.confirm("Remover e-mail", `Remover ${c.email}? Ele não poderá mais criar empresas e as empresas que ele criou ficam com o acesso encerrado.`, "Remover", true)) { pol.criadores = pol.criadores.filter((x) => x !== c); save("E-mail removido"); }
        }, "danger xs")))) : [h("p", { class: "fh", text: "Nenhum e-mail liberado ainda. Sem a lista, ninguém consegue criar empresas." })]));
    };
    drawRules();
    out.push(card(cardTitle("Quem pode criar empresas", "Só os e-mails desta lista criam empresas novas, cada um com o seu limite de empresas e de pessoas convidadas. Quem entra pelo convite de um dono usa a empresa dele sem precisar estar aqui."), rulesBox,
      h("div", { class: "bar" }, btn("+ Liberar e-mail", async () => {
        const v = await P.ask("Liberar e-mail", [{ key: "nome", label: "Nome da pessoa ou empresa", required: true }, { key: "email", label: "E-mail da conta Dropbox", required: true, mode: "email" },
          { key: "celular", label: "Celular (opcional)", mode: "tel", help: "Com DDD. Só você vê." },
          { key: "limite", label: "Quantas empresas pode criar", kind: "int", min: 0, help: "0 = sem limite." },
          { key: "limite_func", label: "Quantas pessoas pode convidar", kind: "int", min: 0, help: "Somando todas as empresas dele. 0 = sem limite." }], { limite: 1, limite_func: 5 }, { ok: "Liberar" });
        if (!v) return;
        const em = v.email.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(em)) return P.info("E-mail inválido", "Confira o e-mail digitado.", "warn");
        if (pol.criadores.some((c) => c.email === em)) return P.info("Já está na lista", "Use “Editar” para mudar os dados dele.", "warn");
        pol.criadores.push({ nome: v.nome.trim(), email: em, celular: (v.celular || "").trim(), limite: Math.max(0, v.limite), limite_func: Math.max(0, v.limite_func) }); save("E-mail liberado");
      }))));

    out.push(card(cardTitle("Administradores", "Todos os administradores enxergam as mesmas empresas e usam as mesmas regras (e-mails liberados, limites e convites recusados)."), admBox,
      h("div", { class: "bar" }, btn("+ Adicionar administrador", async () => {
        const v = await P.ask("Adicionar administrador", [{ key: "email", label: "E-mail da conta Dropbox do administrador", required: true, mode: "email", help: "Ele recebe as pastas por convite e este painel as aceita sozinho. Depois coloque o ID dele em ADMIN_DROPBOX_IDS (GitHub) e rode o deploy." }], {}, { ok: "Adicionar" });
        if (!v) return;
        const em = v.email.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(em)) return P.info("E-mail inválido", "Confira o e-mail digitado.", "warn");
        if ((pol.admins || []).some((x) => String(x.email).toLowerCase() === em)) return P.info("Já está na lista", "Esse administrador já foi adicionado.", "warn");
        const eu = (A.email() || "").toLowerCase();
        pol.admins = [...(pol.admins || []), ...(eu && !(pol.admins || []).some((x) => String(x.email).toLowerCase() === eu) ? [{ email: eu }] : []), { email: em }];
        try { await A.policySave(pol); await runSync(true); drawRules(); } catch (e) { err(e); }
      }), btn("Sincronizar agora", () => runSync(true), "secondary")),
      h("p", { class: "fh", text: "A sincronização compartilha a pasta de regras e todas as empresas com os outros administradores. Quem já tem acesso não é convidado de novo." })));
    out.push(card(cardTitle("Suporte: acesso a todas as empresas", "Quando um cliente cria uma empresa, este e-mail é convidado para a pasta e, depois que você aceitar o convite, passa a ser o proprietário dela no Dropbox. É assim que você vê, entra e edita a base de qualquer cliente."),
      P.field({ label: "E-mail do suporte (a sua conta do Dropbox)" }, fSup),
      h("div", { class: "bar" }, btn("Salvar e-mail do suporte", async () => {
        const em = fSup.value.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(em)) return P.info("E-mail inválido", "Confira o e-mail digitado.", "warn");
        pol.suporte_email = em; pol.suporte_id = P.sync.s.account || ""; save("E-mail do suporte salvo");
      })), h("p", { class: "fh", text: "O convite chega ao seu Dropbox e este painel aceita sozinho os convites das empresas quando você abre a lista. A propriedade passa para você na próxima vez que o dono abrir a empresa (até 1 hora depois). Salve este e-mail estando conectado na conta que será a proprietária." })));
    // ---------------------------------------------------------------- publicar as regras
    const st = P.POLICY_URL ? "Ativa: o site já está lendo as regras acima." : "Ainda não ativada: sem o link, o site deixa todo mundo criar empresas e não aplica os limites.";
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
    out.push(card(cardTitle("Minha conta de administrador", "Você entra só com a conta do Dropbox. O ID abaixo é o que vai na variável ADMIN_DROPBOX_IDS do GitHub."), A.contaInfo(), h("div", { class: "bar" },
      btn("Sair", () => A.leave(true), "secondary"))));
    return out;
  },
});
