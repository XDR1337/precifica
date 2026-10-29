"use strict";
/* Precifica Web - tutorial guiado (cartao flutuante que percorre cada tela) e boas-vindas. */
const { h, btn } = P;

const STEPS = [
  { page: "Painel", nav: null, title: "Bem-vindo ao Precifica", text: "Este tour rápido mostra cada parte do programa, em cerca de 2 minutos. Você pode pular a qualquer momento e rever depois em Configurações › Tutorial.", tip: "Use os botões “Próximo” e “Anterior” aqui embaixo para andar pelo tour." },
  { page: "Painel", nav: null, title: "O menu", text: "Todas as telas ficam agrupadas por etapa: Cadastros → Precificação → Comercial → Sistema. No celular, toque em ☰ para abrir o menu completo. Na primeira vez, siga de cima para baixo: primeiro você cadastra a empresa e os custos; depois o programa calcula os preços sozinho.", tip: "Os dados ficam salvos neste aparelho. Depois do primeiro acesso, não precisa de internet nem de Excel." },
  { page: "Painel", nav: "Painel", title: "Painel — a visão geral", text: "Mostra quanto você vai faturar no mês, a margem de contribuição, o lucro, o ponto de equilíbrio e quanto da capacidade da equipe está vendida. O gráfico “Resultado do mês” resume faturamento, custos e lucro.", tip: "“Primeiros passos” é um checklist do que falta cadastrar. Em “Seus preços estão saudáveis?”, toque em um item para abrir a análise dele." },
  { page: "Serviços e fichas", nav: "Serviços e fichas", title: "Serviços e fichas técnicas", text: "Cadastre cada serviço e monte a ficha técnica: horas de mão de obra + insumos. A lista com busca fica à esquerda (no celular, é a primeira tela) e os detalhes à direita. O custo direto, o preço sugerido e a margem aparecem na hora.", tip: "“Usar preço sugerido” copia o valor calculado para o cadastro. “Duplicar” ajuda a criar serviços parecidos." },
  { page: "Insumos e preços", nav: "Insumos e preços", title: "Insumos e preços", text: `Materiais, deslocamento e serviços de terceiros usados nas fichas. O app já vem com ${P.SEED.PRECOS_REFERENCIA.length} preços de referência de serviços elétricos (Curitiba, set/2026).`, tip: "Cadastre os seus com “+ Novo insumo” e mantenha os preços atualizados para a sua região." },
  { page: "Equipe", nav: "Equipe", title: "Equipe e pró-labore", text: "Cadastre quem trabalha na empresa, inclusive você (pró-labore). O programa calcula o custo-hora de cada pessoa, que entra na ficha técnica dos serviços.", tip: "Os percentuais de encargos podem ser ajustados em Configurações › Encargos." },
  { page: "Custos fixos", nav: "Custos fixos", title: "Custos fixos e depreciação", text: "Despesas que existem mesmo sem vender: aluguel, contador, internet, depreciação de ferramentas… Elas são rateadas no preço de cada serviço, proporcionalmente ao faturamento previsto.", tip: "Quanto mais completo este cadastro, mais fiel é o preço sugerido." },
  { page: "Capacidade produtiva", nav: "Capacidade produtiva", title: "Capacidade produtiva", text: "Informe as horas por dia, os dias trabalhados no mês e a produtividade (ninguém produz 100% do tempo: há pausas, deslocamentos e orçamentos). O app mostra as horas efetivas da equipe e quanto já está vendido.", tip: "Depois de ajustar, toque em “Salvar parâmetros”." },
  { page: "Revenda", nav: "Revenda", title: "Produtos de revenda", text: "Materiais que você compra e revende ao cliente, como disjuntores, tomadas e luminárias. Eles ganham preço sugerido e margem como os serviços.", tip: "Cadastre com “+ Novo produto”." },
  { page: "Tabela de preços", nav: "Tabela de preços", title: "Tabela de preços", text: "Todos os itens com custo, deduções e margem de contribuição no preço atual. Vermelho significa prejuízo; laranja, margem abaixo de 20%.", tip: "O botão “Exportar PDF” gera a tabela pronta para imprimir ou enviar." },
  { page: "Análise de preço", nav: "Análise de preço", title: "Análise de preço", text: "Simule descontos e descubra o preço ideal para o lucro desejado. À esquerda fica o preço que você pratica hoje; à direita, o preço sugerido.", tip: "Digite o lucro desejado e depois toque em “Aplicar o preço sugerido ao cadastro”." },
  { page: "Simulação", nav: "Simulação", title: "Simulação de vendas", text: "Informe quantas vezes por mês você vende cada serviço ou produto. Essa previsão define o rateio dos custos fixos, o lucro do mês e as horas vendidas da equipe.", tip: "Toque em uma linha da tabela para alterar a quantidade. “Zerar previsões” limpa tudo." },
  { page: "Relatórios gerenciais", nav: "Relatórios gerenciais", title: "Relatórios gerenciais", text: "Resultado do mês, ponto de equilíbrio, ticket médio e uso da capacidade da equipe, tudo em um só lugar.", tip: "Serve para saber se o negócio fecha o mês no azul." },
  { page: "Concorrentes", nav: "Concorrentes", title: "Análise de concorrentes", text: "Defina o seu cliente-alvo e compare-se com a concorrência. As notas vão de 1 a 3: 1 = baixo valor agregado, 2 = médio, 3 = alto.", tip: "O fator de valor ajuda a justificar o seu preço. Toque em “Salvar” ao terminar." },
  { page: "Propostas", nav: "Propostas", title: "Propostas técnicas e comerciais", text: "Gera o PDF da proposta: logotipo, título com o nº da proposta, A/C, objetivo, escopo, textos (premissas, responsabilidades, prazo…), tabela de investimento, condições de pagamento, garantia, observações e linhas de assinatura. Tudo é preenchido em um editor com 5 abas.", tip: "Comece em “+ Nova proposta”. O botão “Pré-visualizar” mostra o resultado sem fechar o editor. Para ver um documento completo de exemplo, use o menu “Modelos de texto…” › “Carregar o exemplo”." },
  { page: "Propostas", nav: "Propostas", title: "Proposta · aba 1: Dados e cliente", text: "Informe o nº da proposta (sai no cabeçalho como “PROPOSTA Nº 1”), a data, a validade em dias, o título do serviço (ex.: Instalação e manutenção de equipamentos) e o A/C, a pessoa que recebe a proposta. Ao lado ficam os dados do cliente, que podem vir do cadastro.", tip: "O número é sugerido automaticamente, mas você pode trocá-lo (o programa avisa se já existir)." },
  { page: "Propostas", nav: "Propostas", title: "Proposta · aba 2: Objetivo e escopo", text: "Escreva o objetivo (o que está sendo contratado), a frase de introdução e as etapas do escopo. Cada etapa tem título e descrição e pode ter uma lista de tópicos com seta ➢. Use ▲ ▼ para mudar a ordem e ⧉ para aproveitar uma etapa parecida. No fim há a nota do escopo.", tip: "Use {empresa} no texto para o programa colocar o nome curto da empresa (ex.: o primeiro nome da empresa)." },
  { page: "Propostas", nav: "Propostas", title: "Proposta · aba 3: Textos da proposta", text: "Seções de texto livres, cada uma com título sublinhado: antes do Investimento (documentos considerados, premissas técnicas, fora do escopo, responsabilidades da contratante e da empresa, prazo, responsabilidade técnica) e depois das condições de pagamento (validade, garantia, observações importantes). Crie, edite e reordene quantas quiser.", tip: "Linha em branco = novo parágrafo · **texto** = negrito · {validade_dias}, {numero}, {total} e {cliente} são preenchidos sozinhos · “Começar em nova página” força a quebra de página." },
  { page: "Propostas", nav: "Propostas", title: "Proposta · aba 4: Investimento e pagamento", text: "Os itens (do catálogo de serviços ou livres) viram a tabela cinza de investimento, com o valor total. Em “Condições de pagamento”, use “Gerar entrada + parcelas…” para dividir o saldo (os centavos que sobram vão para a última parcela) ou adicione as parcelas à mão. O programa confere se a soma bate com o total.", tip: "Marque “Começar o INVESTIMENTO em uma nova página” quando quiser o investimento numa página só." },
  { page: "Propostas", nav: "Propostas", title: "Proposta · aba 5: Fechamento e modelos", text: "Defina a frase de despedida e os nomes das duas assinaturas (cliente e empresa). A linha “Aprovo as condições acima descritas em __/__/__ e assinamos:” sai sempre. Para não digitar tudo de novo, use “Modelos de texto…” › “Salvar estes textos como padrão”: as próximas propostas já nascem com eles.", tip: "“Aplicar os textos padrão” restaura os textos salvos em uma proposta que você já começou." },
  { page: "Clientes", nav: "Clientes", title: "Clientes", text: "Cadastro de clientes para preencher as propostas comerciais automaticamente.", tip: "Cadastre com “+ Novo cliente”." },
  { page: "Exportar PDF", nav: "Exportar PDF", title: "Exportar PDF", text: "Gera o relatório completo de precificação em PDF, o equivalente à planilha inteira, para imprimir ou enviar a quem não tem Excel. Escolha as seções que entram no documento.", tip: "Aqui também ficam atalhos para proposta, análise de um serviço e tabela de preços." },
  { page: "Configurações", nav: "Configurações", title: "Configurações", text: "Dados da empresa e logotipo e cores (aparecem nas propostas e relatórios), nome curto usado nos textos (ex.: o primeiro nome da empresa), assinante da empresa nas propostas, parâmetros de preço, encargos e backup. Também dá para importar a planilha Excel da EG3 e carregar um exemplo pronto.", tip: "Para rever este tutorial depois, use o cartão “Tutorial” desta tela. Lembre de tocar em “Salvar configurações” ao editar os campos." },
  { page: "Painel", nav: null, title: "Pronto! Por onde começar", text: "Roteiro sugerido: 1) Configurações (dados da empresa) → 2) Equipe → 3) Custos fixos → 4) Capacidade → 5) Insumos → 6) Serviços e fichas → 7) Simulação de vendas → 8) Tabela de preços e Análise → 9) Propostas técnicas e comerciais .", tip: "Quer ver o programa preenchido? Em Configurações, use “Carregar exemplo”." },
];

P.Tutorial = class Tutorial {
  constructor(app) { this.app = app; this.i = 0; this.pos = "end"; this.card = null; this.hl = null; }
  get active() { return !!this.card; }
  start(index = 0) {
    if (this.card) return;
    this.i = index;
    this.build();
    this.render();
  }
  close() {
    if (!this.card) return;
    try { this.app.db.setCfg("tutorial_nao_mostrar", this.never.checked ? 1 : 0); } catch (e) { /* ok */ }
    this.highlight(null);
    this.card.remove(); this.card = null;
    document.body.classList.remove("tutorial-on");
    if (this.app.current === "Configurações") this.app.draw(this.app.pageCtx("Configurações"));
  }
  build() {
    this.step = h("span", { class: "tut-step" });
    this.bar = h("div", { class: "prog" }, h("i"));
    this.title = h("h3"); this.text = h("p", { class: "tut-text" }); this.tip = h("p", { class: "tut-tip" });
    this.never = h("input", { type: "checkbox", checked: this.app.db.cfgNum("tutorial_nao_mostrar") >= 1 });
    this.skip = btn("Pular tutorial", () => this.close(), "ghost sm");
    this.prev = btn("← Anterior", () => { if (this.i > 0) { this.i--; this.render(); } }, "secondary sm");
    this.next = btn("Próximo →", () => { if (this.i >= STEPS.length - 1) this.close(); else { this.i++; this.render(); } }, "primary sm");
    this.card = h("aside", { class: "tutorial", role: "dialog", "aria-label": "Tutorial" },
      h("div", { class: "tut-h" }, this.step, btn("⇅ Mover", () => { this.pos = this.pos === "end" ? "start" : "end"; this.card.dataset.pos = this.pos; }, "ghost xs")),
      this.bar, this.title, this.text, this.tip, h("label", { class: "chk" }, this.never, h("span", { text: "Não mostrar este tutorial novamente" })),
      h("div", { class: "tut-b" }, this.skip, h("span", { class: "grow" }), this.prev, this.next));
    this.card.dataset.pos = this.pos;
    document.body.append(this.card);
    document.body.classList.add("tutorial-on");
  }
  render() {
    const s = STEPS[this.i], n = STEPS.length, last = this.i === n - 1;
    this.step.textContent = `PASSO ${this.i + 1} DE ${n}`;
    this.bar.firstChild.style.width = ((this.i + 1) / n) * 100 + "%";
    this.title.textContent = s.title; this.text.textContent = s.text;
    this.tip.textContent = s.tip ? "Dica: " + s.tip : ""; this.tip.style.display = s.tip ? "" : "none";
    this.next.textContent = last ? "Concluir" : "Próximo →";
    this.prev.disabled = this.i === 0;
    this.skip.textContent = last ? "Fechar" : "Pular tutorial";
    this.app.show(s.page, { push: false });
    this.highlight(s.nav);
  }
  highlight(name) {
    document.querySelectorAll(".nav-hl").forEach((b) => b.classList.remove("nav-hl"));
    this.hl = name;
    if (name) document.querySelectorAll(`[data-nav="${name}"]`).forEach((b) => b.classList.add("nav-hl"));
  }
};

P.welcome = function () {
  const app = P.app;
  let m;
  const go = (action) => {
    app.db.setCfg("onboarding_ok", 1);
    m.close();
    if (action === "exemplo") { app.db.loadExample(); app.changed("Exemplo carregado"); }
    else if (action === "importar") { app.show("Configurações"); setTimeout(() => P.pages["Configurações"].importar(app.pageCtx("Configurações")), 50); }
    else app.show("Configurações");
    if (app.db.cfgNum("tutorial_nao_mostrar") < 1) setTimeout(() => app.tutorial.start(), 400);
    else if (action === "zero") P.ui.toast("Comece preenchendo os dados da sua empresa", "info", 4000);
  };
  const opts = [["Começar do zero", "Preencha sua empresa, equipe, custos e serviços (recomendado).", "zero", "primary"],
    ["Ver um exemplo pronto", "Eletricista autônomo com o serviço de instalação de chuveiro.", "exemplo", "secondary"],
    ["Importar a planilha EG3", "Traga os dados da Planilha de Precificação (.xlsm).", "importar", "secondary"]];
  m = P.modal({ title: "Bem-vindo ao Precifica", sub: `Descubra quanto cobrar pelos seus serviços sem precisar de Excel. O app já vem com ${P.SEED.PRECOS_REFERENCIA.length} preços de referência de serviços elétricos. Como você quer começar?`,
    body: h("div", { class: "welcome" }, opts.map(([t, s, a, k]) => h("div", { class: "wopt" }, h("div", null, h("b", { text: t }), h("p", { class: "cs", text: s })), btn("Escolher", () => go(a), k)))), cls: "sm", onClose: () => { /* fechar = começar do zero */ } });
  m.promise.then((r) => { if (r === undefined && app.db.cfgNum("onboarding_ok") < 1) go("zero"); });
};
