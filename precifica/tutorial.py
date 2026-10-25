# -*- coding: utf-8 -*-
"""Tutorial guiado do Precifica Desktop: um cartao flutuante que percorre cada tela do programa."""
from __future__ import annotations

import customtkinter as ctk

from .widgets import ACCENT, BORDER, CARD, F, INK, INK2, MUTED, ON_PRIMARY, PRIMARY, PRIMARY_SOFT, btn

CFG_KEY = "tutorial_nao_mostrar"   # 1 = nao abrir o tutorial ao iniciar o programa

# page = tela exibida | nav = botao do menu destacado | tip = dica extra (opcional)
STEPS = [
    dict(page="Painel", nav=None, title="Bem-vindo ao Precifica Desktop",
         text=("Este tour rápido mostra cada parte do programa, em cerca de 2 minutos. Você pode pular a qualquer "
               "momento e rever depois em Configurações › Tutorial."),
         tip="Use os botões “Próximo” e “Anterior” aqui embaixo para andar pelo tour."),
    dict(page="Painel", nav=None, title="O menu lateral",
         text=("À esquerda ficam todas as telas, agrupadas por etapa: Cadastros → Precificação → Comercial → Sistema. "
               "Na primeira vez, siga de cima para baixo: primeiro você cadastra a empresa e os custos; depois o "
               "programa calcula os preços sozinho."),
         tip="Os dados ficam salvos neste computador. Não precisa de internet nem de Excel."),
    dict(page="Painel", nav="Painel", title="Painel — a visão geral",
         text=("Mostra quanto você vai faturar no mês, a margem de contribuição, o lucro, o ponto de equilíbrio e quanto "
               "da capacidade da equipe está vendida. O gráfico “Resultado do mês” resume faturamento, custos e lucro."),
         tip=("“Primeiros passos” é um checklist do que falta cadastrar. Em “Seus preços estão saudáveis?”, clique duas "
              "vezes em um item para abrir a análise dele.")),
    dict(page="Serviços e fichas", nav="Serviços e fichas", title="Serviços e fichas técnicas",
         text=("Cadastre cada serviço e monte a ficha técnica: horas de mão de obra + insumos. A lista com busca fica à "
               "esquerda e os detalhes à direita. O custo direto, o preço sugerido e a margem aparecem na hora."),
         tip=("“Usar preço sugerido” copia o valor calculado para o cadastro. “Duplicar” ajuda a criar serviços "
              "parecidos.")),
    dict(page="Insumos e preços", nav="Insumos e preços", title="Insumos e preços",
         text=("Materiais, deslocamento e serviços de terceiros usados nas fichas. O app já vem com 96 preços de "
               "referência de serviços elétricos (Curitiba, set/2026)."),
         tip="Cadastre os seus com “+ Novo insumo” e mantenha os preços atualizados para a sua região."),
    dict(page="Equipe", nav="Equipe", title="Equipe e pró-labore",
         text=("Cadastre quem trabalha na empresa, inclusive você (pró-labore). O programa calcula o custo-hora de cada "
               "pessoa, que entra na ficha técnica dos serviços."),
         tip="Os percentuais de encargos podem ser ajustados em Configurações › Encargos."),
    dict(page="Custos fixos", nav="Custos fixos", title="Custos fixos e depreciação",
         text=("Despesas que existem mesmo sem vender: aluguel, contador, internet, depreciação de ferramentas… "
               "Elas são rateadas no preço de cada serviço, proporcionalmente ao faturamento previsto."),
         tip="Quanto mais completo este cadastro, mais fiel é o preço sugerido."),
    dict(page="Capacidade produtiva", nav="Capacidade produtiva", title="Capacidade produtiva",
         text=("Informe as horas por dia, os dias trabalhados no mês e a produtividade (ninguém produz 100% do tempo: "
               "há pausas, deslocamentos e orçamentos). O app mostra as horas efetivas da equipe e quanto já está "
               "vendido."),
         tip="Depois de ajustar, clique em “Salvar parâmetros”."),
    dict(page="Revenda", nav="Revenda", title="Produtos de revenda",
         text=("Materiais que você compra e revende ao cliente, como disjuntores, tomadas e luminárias. Eles ganham "
               "preço sugerido e margem como os serviços."),
         tip="Cadastre com “+ Novo produto”."),
    dict(page="Tabela de preços", nav="Tabela de preços", title="Tabela de preços",
         text=("Todos os itens com custo, deduções e margem de contribuição no preço atual. Vermelho significa prejuízo; "
               "laranja, margem abaixo de 20%."),
         tip="O botão “Exportar PDF” gera a tabela pronta para imprimir ou enviar."),
    dict(page="Análise de preço", nav="Análise de preço", title="Análise de preço",
         text=("Simule descontos e descubra o preço ideal para o lucro desejado. À esquerda fica o preço que você "
               "pratica hoje; à direita, o preço sugerido."),
         tip="Digite o lucro desejado, clique em “Calcular” e depois em “Aplicar o preço sugerido ao cadastro”."),
    dict(page="Simulação", nav="Simulação", title="Simulação de vendas",
         text=("Informe quantas vezes por mês você vende cada serviço ou produto. Essa previsão define o rateio dos "
               "custos fixos, o lucro do mês e as horas vendidas da equipe."),
         tip="Dê dois cliques em uma linha da tabela para alterar a quantidade. “Zerar previsões” limpa tudo."),
    dict(page="Relatórios gerenciais", nav="Relatórios gerenciais", title="Relatórios gerenciais",
         text="Resultado do mês, ponto de equilíbrio, ticket médio e uso da capacidade da equipe, tudo em um só lugar.",
         tip="Serve para saber se o negócio fecha o mês no azul."),
    dict(page="Concorrentes", nav="Concorrentes", title="Análise de concorrentes",
         text=("Defina o seu cliente-alvo e compare-se com a concorrência. As notas vão de 1 a 3: 1 = baixo valor "
               "agregado, 2 = médio, 3 = alto."),
         tip="O fator de valor ajuda a justificar o seu preço. Clique em “Salvar” ao terminar."),
    dict(page="Propostas", nav="Propostas", title="Propostas técnicas e comerciais",
         text=("Gera o PDF no mesmo modelo da ACRS: logotipo, título com o nº da proposta, A/C, objetivo, escopo, "
               "textos (premissas, responsabilidades, prazo…), tabela de investimento, condições de pagamento, garantia, "
               "observações e linhas de assinatura. Tudo é preenchido em um editor com 5 abas."),
         tip=("Comece em “+ Nova proposta”. O botão “Pré-visualizar PDF” mostra o resultado sem fechar o editor. "
              "Para ver um documento completo de exemplo, use o menu “Modelos de texto…” › “Carregar o exemplo”.")),
    dict(page="Propostas", nav="Propostas", title="Proposta · aba 1: Dados e cliente",
         text=("Informe o nº da proposta (sai no título como “N° 787”), a data, a validade em dias, o título do serviço "
               "(ex.: Projeto e Execução Elétrica - Obra Kitnets) e o A/C, a pessoa que recebe a proposta. Ao lado ficam "
               "os dados do cliente, que podem vir do cadastro."),
         tip="O número é sugerido automaticamente, mas você pode trocá-lo (o programa avisa se já existir)."),
    dict(page="Propostas", nav="Propostas", title="Proposta · aba 2: Objetivo e escopo",
         text=("Escreva o objetivo (o que está sendo contratado), a frase de introdução e as etapas do escopo. Cada etapa "
               "tem título e descrição e pode ter uma lista de tópicos com seta ➢. Use ▲ ▼ para mudar a ordem e "
               "“Duplicar” para aproveitar uma etapa parecida. No fim há a nota do escopo."),
         tip="Use {empresa} no texto para o programa colocar o nome curto da empresa (ex.: ACRS)."),
    dict(page="Propostas", nav="Propostas", title="Proposta · aba 3: Textos da proposta",
         text=("Seções de texto livres, cada uma com título sublinhado: antes do Investimento (documentos considerados, "
               "premissas técnicas, fora do escopo, responsabilidades da contratante e da empresa, prazo, responsabilidade "
               "técnica) e depois das condições de pagamento (validade, garantia, observações importantes). "
               "Crie, edite e reordene quantas quiser."),
         tip=("Linha em branco = novo parágrafo · **texto** = negrito · {validade_dias}, {numero}, {total} e {cliente} "
              "são preenchidos sozinhos · “Começar em nova página” força a quebra de página.")),
    dict(page="Propostas", nav="Propostas", title="Proposta · aba 4: Investimento e pagamento",
         text=("Os itens (do catálogo de serviços ou livres) viram a tabela cinza de investimento, com o valor total. "
               "Em “Condições de pagamento”, use “Gerar entrada + parcelas…” para dividir o saldo (os centavos que sobram "
               "vão para a última parcela) ou adicione as parcelas à mão. O programa confere se a soma bate com o total."),
         tip="Marque “Começar o INVESTIMENTO em uma nova página” para reproduzir o modelo da ACRS."),
    dict(page="Propostas", nav="Propostas", title="Proposta · aba 5: Fechamento e modelos",
         text=("Defina a frase de despedida e os nomes das duas assinaturas (cliente e empresa). A linha “Aprovo as "
               "condições acima descritas em __/__/__ e assinamos:” sai sempre. Para não digitar tudo de novo, use "
               "“Modelos de texto…” › “Salvar estes textos como padrão”: as próximas propostas já nascem com eles."),
         tip="“Aplicar os textos padrão” restaura os textos salvos em uma proposta que você já começou."),
    dict(page="Clientes", nav="Clientes", title="Clientes",
         text="Cadastro de clientes para preencher as propostas comerciais automaticamente.",
         tip="Cadastre com “+ Novo cliente”."),
    dict(page="Exportar PDF", nav="Exportar PDF", title="Exportar PDF",
         text=("Gera o relatório completo de precificação em PDF, o equivalente à planilha inteira, para imprimir ou "
               "enviar a quem não tem Excel. Escolha as seções que entram no documento."),
         tip="Aqui também ficam atalhos para proposta, análise de um serviço e tabela de preços."),
    dict(page="Configurações", nav="Configurações", title="Configurações",
         text=("Dados da empresa e logotipo (já vem o da ACRS; aparece nas propostas e relatórios), nome curto usado nos "
               "textos (ex.: ACRS), assinante da empresa nas propostas, parâmetros de preço, encargos e backup. "
               "Também dá para importar a planilha Excel da EG3 e carregar um exemplo pronto."),
         tip=("Para rever este tutorial depois, use o cartão “Tutorial” desta tela. Lembre de clicar em “Salvar "
              "configurações” ao editar os campos.")),
    dict(page="Painel", nav=None, title="Pronto! Por onde começar",
         text=("Roteiro sugerido: 1) Configurações (dados da empresa) → 2) Equipe → 3) Custos fixos → "
               "4) Capacidade → 5) Insumos → 6) Serviços e fichas → 7) Simulação de vendas → 8) Tabela de preços e "
               "Análise → 9) Propostas técnicas e comerciais (modelo ACRS)."),
         tip="Quer ver o programa preenchido? Em Configurações, use “Carregar exemplo”."),
]


class Tutorial:
    """Cartao flutuante (nao modal) que navega pelas telas e destaca o item do menu."""

    WIDTH = 470

    def __init__(self, app):
        self.app = app
        self.i = 0
        self.side = "right"
        self.card: ctk.CTkFrame | None = None
        self.highlighted: str | None = None

    @property
    def active(self):
        return self.card is not None

    # ---------------------------------------------------------------- ciclo
    def start(self, index=0):
        if self.card is not None:
            return
        self.i = index
        self.side = "right"
        self._build()
        self._render()

    def close(self):
        """Fecha o tour; grava a escolha 'nunca mais mostrar'."""
        if self.card is None:
            return
        try:
            self.app.db.set_cfg(CFG_KEY, 1 if self.never.get() else 0)
        except Exception:
            pass
        self._highlight(None)
        self.card.place_forget()
        self.card.destroy()
        self.card = None
        try:
            cfg = self.app.pages.get("Configurações")
            if cfg:
                cfg.dirty = True
                if self.app.current is cfg:
                    self.app._refresh(cfg)
        except Exception:
            pass

    # ---------------------------------------------------------------- interface
    def _build(self):
        c = ctk.CTkFrame(self.app.content, width=self.WIDTH, corner_radius=16, fg_color=CARD, border_width=2,
                         border_color=PRIMARY)
        self.card = c
        ctk.CTkFrame(c, width=self.WIDTH - 8, height=1, fg_color="transparent").pack()   # largura fixa entre os passos
        head = ctk.CTkFrame(c, fg_color="transparent")
        head.pack(fill="x", padx=20, pady=(16, 4))
        self.step_lbl = ctk.CTkLabel(head, text="", font=F(11, "bold"), text_color="#B36B00")
        self.step_lbl.pack(side="left")
        btn(head, "⇄ Mover", self._flip, "ghost", width=70, height=26).pack(side="right")
        self.bar = ctk.CTkProgressBar(c, height=6, fg_color=BORDER, progress_color=PRIMARY)
        self.bar.pack(fill="x", padx=20, pady=(0, 10))
        self.title_lbl = ctk.CTkLabel(c, text="", font=F(19, "bold"), text_color=INK, anchor="w", justify="left",
                                      wraplength=self.WIDTH - 44)
        self.title_lbl.pack(anchor="w", padx=22)
        self.text_lbl = ctk.CTkLabel(c, text="", font=F(13), text_color=INK2, anchor="w", justify="left",
                                     wraplength=self.WIDTH - 44)
        self.text_lbl.pack(anchor="w", padx=22, pady=(6, 8))
        self.tip_lbl = ctk.CTkLabel(c, text="", font=F(12), text_color=INK2, anchor="w", justify="left",
                                    fg_color=PRIMARY_SOFT, corner_radius=8, wraplength=self.WIDTH - 72)
        self.never = ctk.CTkCheckBox(c, text="Não mostrar este tutorial novamente", font=F(12), text_color=MUTED,
                                     fg_color=PRIMARY, hover_color=PRIMARY, checkmark_color=ON_PRIMARY, border_color=BORDER, checkbox_width=18,
                                     checkbox_height=18, corner_radius=5)
        self.never.pack(anchor="w", padx=22, pady=(10, 6))
        if self.app.db.cfg_num(CFG_KEY) >= 1:
            self.never.select()
        row = ctk.CTkFrame(c, fg_color="transparent")
        row.pack(fill="x", padx=16, pady=(4, 16))
        self.skip_btn = btn(row, "Pular tutorial", self.close, "ghost", width=110)
        self.skip_btn.pack(side="left")
        self.next_btn = btn(row, "Próximo  →", self._next, "primary", width=110)
        self.next_btn.pack(side="right")
        self.prev_btn = btn(row, "←  Anterior", self._prev, "secondary", width=110)
        self.prev_btn.pack(side="right", padx=(0, 8))

    def _render(self):
        s = STEPS[self.i]
        n = len(STEPS)
        last = self.i == n - 1
        self.step_lbl.configure(text=f"PASSO {self.i + 1} DE {n}")
        self.bar.set((self.i + 1) / n)
        self.title_lbl.configure(text=s["title"])
        self.text_lbl.configure(text=s["text"])
        if s.get("tip"):
            self.tip_lbl.configure(text="  Dica: " + s["tip"] + "  ")
            self.tip_lbl.pack(anchor="w", padx=22, pady=(0, 2), before=self.never)
        else:
            self.tip_lbl.pack_forget()
        self.next_btn.configure(text="Concluir" if last else "Próximo  →")
        self.prev_btn.configure(state="disabled" if self.i == 0 else "normal")
        self.skip_btn.configure(text="Fechar" if last else "Pular tutorial")
        self.app.show(s["page"])
        self._highlight(s.get("nav"))
        self._place()

    def _place(self):
        if self.card is None:
            return
        if self.side == "right":
            self.card.place(relx=1.0, rely=1.0, x=-24, y=-24, anchor="se")
        else:
            self.card.place(relx=0.0, rely=1.0, x=24, y=-24, anchor="sw")
        self.card.lift()

    def _highlight(self, name):
        if self.highlighted == name:
            return
        old = self.app.nav_buttons.get(self.highlighted) if self.highlighted else None
        if old is not None:
            old.configure(border_width=0)
        new = self.app.nav_buttons.get(name) if name else None
        if new is not None:
            new.configure(border_width=2, border_color=ACCENT)
        self.highlighted = name

    # ---------------------------------------------------------------- acoes
    def _next(self):
        if self.i >= len(STEPS) - 1:
            self.close()
            return
        self.i += 1
        self._render()

    def _prev(self):
        if self.i > 0:
            self.i -= 1
            self._render()

    def _flip(self):
        self.side = "left" if self.side == "right" else "right"
        self._place()
