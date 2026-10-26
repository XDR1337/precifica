# -*- coding: utf-8 -*-
"""Dados iniciais do Precifica Desktop.

O banco de precos de referencia foi levantado pela EG3 Empresa Jr. (set/2026) para
servicos eletricos em Curitiba e Regiao Metropolitana e e o mesmo da aba CadInsumos
da Planilha de Precificacao R02 (com a unidade do deslocamento corrigida para km).
"""

UNIDADES = [
    "Unidade", "Metro", "Metro Quadrado", "Centímetro", "Milímetro", "Quilômetro",
    "Hora", "Diária", "Metro de altura mensal", "Grama", "Quilo", "Ml", "Litro",
    "Pacote", "Fardo", "Dúzia", "Rolo", "Caixa", "Kit", "Serviço",
]

SETORES = ["Produtivo", "Administrativo"]
CONTRATACOES = ["CLT", "Pró-Labore", "PJ", "Estágio"]
STATUS_PROPOSTA = ["Rascunho", "Enviada", "Aprovada", "Recusada"]
FORMAS_PAGAMENTO = ["Boleto bancário", "PIX", "Cartão crédito / débito"]
UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB",
       "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]

# (descricao, unidade, preco de referencia R$)
PRECOS_REFERENCIA = [
    ('Ajudante (Experiente)', 'Diária', 180),
    ('Ajudante (Iniciante)', 'Diária', 100),
    ('Ajudante (Intermediário)', 'Diária', 140),
    ('Alimentação para motores', 'Unidade', 250),
    ('Aluguel de andaime', 'Metro de altura mensal', 45),
    ('Almoço', 'Unidade', 40),
    ('Arandela de Parede (Instalação)', 'Unidade', 70),
    ('ART', 'Unidade', 108),
    ('Aterramento (Haste)', 'Unidade', 250),
    ('Automação: Assistente de Voz (Configuração)', 'Unidade', 250),
    ('Automação: Fechadura Inteligente', 'Unidade', 250),
    ('Automação: Interruptor Inteligente', 'Unidade', 100),
    ('Automação: Relé Dimmer', 'Unidade', 250),
    ('Automação: Tomada Inteligente', 'Unidade', 200),
    ('Automatização de portão', 'Unidade', 300),
    ('Balizadores (Embutidos ou fixados)', 'Unidade', 80),
    ('Barramento Pente Monopolar (Instalação no QDC)', 'Unidade', 70),
    ('Calha Perfurada (Instalação)', 'Metro', 70),
    ('Câmeras CFTV Wi-Fi (Sem/Com ponto)', 'Unidade', 150),
    ('Campainha Elétrica (Residência)', 'Unidade', 100),
    ('Carregador Veicular (Instalação)', 'Unidade', 1600),
    ('Cerca Elétrica (Instalação)', 'Metro', 100),
    ('Chamado Técnico simples em horário Comercial', 'Hora', 200),
    ('Chave de boia superior e inferior', 'Unidade', 350),
    ('Chuveiro Elétrico (Instalação)', 'Unidade', 120),
    ('Configuração de controlador básico para fita LED', 'Unidade', 70),
    ('Contator com relé térmico', 'Unidade', 200),
    ('Contator trifásico simples', 'Unidade', 200),
    ('Deslocamento', 'Quilômetro', 1.8),
    ('Dimmer (Controle de Intensidade)', 'Unidade', 80),
    ('Disjuntor Bifásico (Substituição)', 'Unidade', 80),
    ('Disjuntor DR (Instalação)', 'Unidade', 80),
    ('Disjuntor Monofásico (Substituição)', 'Unidade', 80),
    ('Disjuntor Trifásico (Substituição/Instalação)', 'Unidade', 80),
    ('Dispositivo de Proteção contra Surtos (DPS)', 'Unidade', 80),
    ('Eletricista (Experiente)', 'Diária', 350),
    ('Eletricista (Intermediário)', 'Diária', 270),
    ('Eletricista (Meio Oficial)', 'Diária', 200),
    ('Eletroduto Corrugado (Instalação)', 'Metro', 21),
    ('Eletroduto Galvanizado (Instalação)', 'Metro', 32),
    ('Entrada monofasica para QDC até 20m', 'Unidade', 250),
    ('Entrada bifásica ou trifásica para QDC até 20m', 'Unidade', 300),
    ('Exaustor cozinha ou casa de banho', 'Unidade', 200),
    ('Fechadura Eletrônica', 'Unidade', 250),
    ('Fiação para Ar-Condicionado', 'Unidade', 300),
    ('Fita de LED RGB (Instalação)', 'Metro', 70),
    ('Fita de LED Simples (Instalação)', 'Metro', 50),
    ('Fonte para fita de LED (Instalação/Configuração)', 'Unidade', 50),
    ('Fotocélula (Instalação ou reparo)', 'Unidade', 140),
    ('Iluminação de jardim', 'Unidade', 100),
    ('Iluminação de quadro (foco)', 'Unidade', 70),
    ('Iluminação em Nicho ou Sanca de Gesso', 'Unidade', 80),
    ('Iluminação no Frame', 'Unidade', 100),
    ('Instalação cabo trifásico acima 10 mm', 'Metro', 35),
    ('Instalação de bomba centrífuga ou sapo', 'Unidade', 350),
    ('Instalação de cabos 2 fases + Neutro + Terra', 'Metro', 30),
    ('Instalação Elétrica Geral - Casa (4 a 6 Cômodos)', 'Unidade', 3950),
    ('Instalação Elétrica Geral - Sobrado (5 a 10 Cômodos)', 'Unidade', 5500),
    ('Instalação em sancas ou nichos (Fitas LED)', 'Metro', 80),
    ('Interfone (1 a 2 chamadas)', 'Unidade', 300),
    ('Interruptor Duplo', 'Unidade', 40),
    ('Interruptor Paralelo / Three-way / Four-way', 'Unidade', 60),
    ('Interruptor Simples', 'Unidade', 40),
    ('Kit de spots (3 a 5 unidades)', 'Unidade', 250),
    ('Lâmpada fluorescente / calha dupla', 'Unidade', 80),
    ('Lâmpada H-O', 'Unidade', 90),
    ('Lâmpada Simples (soquete)', 'Unidade', 50),
    ('Luminária de emergência (simples ou embutir)', 'Unidade', 70),
    ('Luminária de Teto', 'Unidade', 65),
    ('Lustres grandes ou de cristais', 'Unidade', 350),
    ('Lustres simples (pequeno ou médio)', 'Unidade', 200),
    ('Medidor Padrão Bifásico (220V)', 'Unidade', 1600),
    ('Medidor Padrão Monofásico (220V)', 'Unidade', 1600),
    ('No-break (0 a 10kva - várias faixas)', 'Unidade', 550),
    ('Novo ponto de tomada (sem quebrar parede)', 'Unidade', 70),
    ('Passagem de Cabo em Calha', 'Metro', 20),
    ('Passagem de Conduíte em Parede', 'Metro', 25),
    ('Perfil com fita LED RGB', 'Metro', 75),
    ('Perfil de alumínio (para fita LED)', 'Metro', 65),
    ('Perfil de LED com difusor (Embutido)', 'Metro', 80),
    ('Quadro Elétrico (QDC) - Instalação', 'Unidade', 800),
    ('Quadro Elétrico (QDC) - Instalação e Montagem (Até 12 a 48 circuitos + DR/DPS)', 'Unidade', 1200),
    ('Refletor de jardim', 'Unidade', 150),
    ('Sensor de Presença', 'Unidade', 80),
    ('Tomada 220V até 20m', 'Unidade', 80),
    ('Tomada de rede ou telefone', 'Unidade', 80),
    ('Tomada Industrial 3P+Terra', 'Unidade', 80),
    ('Tomada Simples', 'Unidade', 80),
    ('Tomada USB', 'Unidade', 80),
    ('Tomadas de Sobrepor', 'Unidade', 80),
    ('Torneira elétrica ou trituradores', 'Unidade', 120),
    ('Troca de Chuveiro Elétrico', 'Unidade', 80),
    ('Troca de resistência de chuveiro', 'Unidade', 40),
    ('Troca dos Condutores do Chuveiro', 'Unidade', 250),
    ('Ventilador de Parede até 60 CM Dimmer', 'Unidade', 250),
    ('Ventilador de Teto', 'Unidade', 300),
]

CUSTOS_FIXOS_PADRAO = [
    "Energia Elétrica", "Aluguel + IPTU", "Alarme + Segurança", "Internet + Telefone", "Água",
    "Pró-Labore (sócios sem cadastro na equipe)", "Contabilidade", "Suporte de TI", "Sistemas de Gestão",
    "Publicidade e Marketing", "Combustível (uso administrativo)", "Manutenção Predial",
    "Manutenção do Veículo", "Material de Escritório", "Seguros", "EPI e ferramentas de reposição",
]

# (descricao, vida util em anos)
IMOBILIZADO_PADRAO = [
    ("Edifícios", 25), ("Máquinas e Equipamentos", 10), ("Instalações", 10),
    ("Móveis e Utensílios", 10), ("Veículos", 5), ("Computadores e Periféricos", 5),
    ("Ferramentas elétricas", 5),
]

# Encargos (percentuais sobre o salario) - mesmos da aba CadFopag
ENCARGOS_PADRAO = {
    "enc_ferias": 11.11,          # Provisao ferias + 1/3
    "enc_13": 8.33,               # Provisao 13o salario
    "enc_13_ferias": 2.33,        # Previsao 13o sobre ferias
    "enc_inss": 0.0,              # INSS patronal (0 no Simples Nacional - anexos I a III)
    "enc_sat": 0.0,               # SAT/RAT
    "enc_sal_educacao": 0.0,      # Salario educacao
    "enc_sistema_s": 0.0,         # INCRA/SEST/SEBRAE/SENAT
    "enc_fgts": 8.0,              # FGTS
    "enc_fgts_rescisao": 4.0,     # FGTS + provisao de rescisao
    "enc_prolabore_inss": 11.0,   # INSS sobre pro-labore
}

CONFIG_PADRAO = {
    "empresa_nome": "ACRS Engenharia Elétrica e Soluções",
    "empresa_fantasia": "ACRS",
    "empresa_sigla": "ACRS",
    "empresa_cnpj": "",
    "empresa_endereco": "",
    "empresa_bairro": "",
    "empresa_cidade": "Curitiba",
    "empresa_uf": "PR",
    "empresa_cep": "",
    "empresa_telefone": "",
    "empresa_email": "",
    "empresa_site": "",
    "empresa_logo": "",
    "horas_dia": 8,
    "dias_mes": 22,
    "produtividade_pct": 75,
    "lucro_desejado_pct": 15,
    "lucro_desejado_valor": 0,
    "lucro_modo": "pct",
    "proposta_proximo_numero": 1,
    "proposta_validade_dias": 30,
    "proposta_pix_desconto_pct": 5,
    "proposta_boleto_dias": 21,
    "proposta_obs_padrao": "Proposta válida por 30 dias. Materiais não inclusos, salvo quando descritos.",
    "proposta_assinante_empresa": "",
    "proposta_modelo_json": "",
    "concorrentes_json": "",
    "onboarding_ok": 0,
    "tutorial_nao_mostrar": 0,
    **ENCARGOS_PADRAO,
}

# Exemplo didatico (o mesmo cenario de teste usado no relatorio final do PROEX)
EXEMPLO = {
    "equipe": [
        dict(nome="Eletricista Titular", salario=4000, setor="Produtivo", cargo="Eletricista",
             contratacao="Pró-Labore", vale_transporte=0, vale_refeicao=0, convenio=0, carga_horaria=176),
    ],
    "custos_fixos": {"Energia Elétrica": 150, "Internet + Telefone": 120, "Contabilidade": 300,
                     "Publicidade e Marketing": 200, "Manutenção do Veículo": 266.80},
    "servicos": [
        dict(nome="Instalação de chuveiro elétrico", preco=120, imposto_pct=6, cartao_pct=3, app_pct=0,
             comissao_pct=0, previsao=120,
             mod=[("Eletricista Titular", 1.0)], insumos=[("Deslocamento", 15)]),
    ],
}


# ======================================================================================================
# PROPOSTA TECNICA E COMERCIAL (modelo ACRS)
# Os textos aceitam: {empresa} {numero} {validade_dias} {total} {cliente} {titulo}  e  **negrito**.
# Linha em branco = novo paragrafo; quebra de linha simples = quebra dentro do paragrafo.
# ======================================================================================================
FECHO_PADRAO = "Permanecemos a disposição para esclarecimentos adicionais,"

MODELO_PROPOSTA = {
    "escopo_intro": "O escopo a ser executado pela {empresa} compreende as seguintes etapas:",
    "escopo_nota": ("Nota: Todas as instalações seguirão rigorosamente o quantitativo e o layout definidos no projeto "
                    "elétrico elaborado nesta proposta."),
    "secoes_pre": [
        dict(titulo="DOCUMENTOS E PROJETOS CONSIDERADOS", texto=""),
        dict(titulo="PREMISSAS TÉCNICAS",
             texto=("As instalações serão executadas em total conformidade com a ABNT NBR 5410 (Instalações Elétricas de "
                    "Baixa Tensão) e normativas vigentes da concessionária de energia.")),
        dict(titulo="FORA DO ESCOPO", texto=""),
        dict(titulo="RESPONSABILIDADE DA CONTRATANTE",
             texto="Liberação irrestrita das frentes de trabalho e disponibilização de ponto de energia e água."),
        dict(titulo="RESPONSABILIDADE DA {EMPRESA}",
             texto=("Executar os serviços com qualidade, empregando mão de obra qualificada e ferramentas adequadas.\n\n"
                    "Garantir a utilização de Equipamentos de Proteção Individual (EPIs) por toda a equipe.")),
        dict(titulo="PRAZO DE EXECUÇÃO", texto=""),
        dict(titulo="RESPONSABILIDADE TÉCNICA",
             texto=("A {empresa} emitirá as devidas Anotações de Responsabilidade Técnica (ART) referentes ao projeto "
                    "elétrico e à execução dos serviços, garantindo o respaldo de engenharia para a obra.")),
    ],
    "secoes_pos": [
        dict(titulo="VALIDADE DA PROPOSTA",
             texto="Esta proposta comercial é válida por {validade_dias} dias corridos a partir da data de sua emissão."),
        dict(titulo="GARANTIA",
             texto=("A {empresa} oferece garantia de 90 (noventa) dias sobre os serviços de mão de obra executados, e "
                    "garantia legal sobre os materiais por ela fornecidos.")),
        dict(titulo="OBSERVAÇÕES COMERCIAIS IMPORTANTES", texto=""),
    ],
}

# ("espaco" = pontos extras antes do titulo da secao, so para reproduzir o espacamento exato do PDF de referencia.)
# Reproduz, campo a campo, a proposta "Nº 787 - Obra Kitnets (20 unidades)" (PDF de referencia da ACRS).
EXEMPLO_PROPOSTA = {
    "numero": 787, "data": "2026-10-05", "validade_dias": 15,
    "titulo": "Projeto e Execução Elétrica - Obra Kitnets (20 unidades)",
    "aos_cuidados": "Nome do Cliente",
    "cliente_nome": "Nome do Cliente",
    "objeto": ("Prestação de serviços de engenharia elétrica contemplando a elaboração do projeto elétrico completo, "
               "execução das instalações elétricas internas (mão de obra) e o fornecimento completo (material, trâmite e "
               "execução) do padrão de entrada de energia para o complexo habitacional de 20 kitnets e áreas comuns."),
    "escopo_intro": "O escopo a ser executado pela {empresa} compreende as seguintes etapas:",
    "escopo": [
        dict(titulo="Projeto Elétrico",
             texto=("Elaboração do projeto elétrico completo e detalhado para a obra, dimensionando cargas, circuitos, "
                    "infraestrutura e proteções."), topicos=""),
        dict(titulo="Entrada de Energia (200A) - Fornecimento Completo",
             texto=("Fornecimento de todos os materiais e mão de obra (via empresa parceira Bom Pastor) para montagem do "
                    "padrão de entrada, contemplando: escavação do buraco e instalação do poste, caixa de medição, "
                    "cabeamento e infraestrutura com espera para saída subterrânea. Inclui a elaboração e apresentação "
                    "da DCA (Declaração de Carga) para aprovação junto à COPEL e solicitação de liberação de rede."),
             topicos=""),
        dict(titulo="Infraestrutura e Alimentação Principal",
             texto=("Execução de infraestrutura e passagem do cabeamento alimentador desde o padrão de entrada de energia "
                    "até o Quadro Geral de Baixa Tensão (QGBT), incluindo a escavação necessária para a passagem da "
                    "tubulação neste trecho."), topicos=""),
        dict(titulo="Montagem e Distribuição (QGBT)",
             texto=("Montagem do QGBT e execução da distribuição dos cabos alimentadores para os painéis individuais "
                    "(QDCs) de cada uma das 20 kitnets, além da alimentação do painel de serviços da área comum."),
             topicos=""),
        dict(titulo="Instalações Elétricas Internas (Mão de Obra e Intervenção Civil Parcial)",
             texto=("Execução integral da mão de obra para a parte interna das 20 kitnets e da área comum "
                    "(churrasqueira, lavanderia e circulação), contemplando:"),
             topicos=("Escavação da infraestrutura do QGBT até os quadros das kitnets;\n"
                      "Quebra de paredes para a passagem da infraestrutura interna;\n"
                      "Chumbamento (fixação com massa) das caixinhas de luz, passagem e tubulações;\n"
                      "Passagem de fiação;\n"
                      "Instalação e fechamento dos quadros de distribuição internos (QDCs);\n"
                      "Instalação de acabamentos (tomadas e interruptores).")),
    ],
    "escopo_nota": ("Nota: Todas as instalações seguirão rigorosamente o quantitativo e o layout definidos no projeto "
                    "elétrico elaborado nesta proposta."),
    "secoes_pre": [
        dict(titulo="DOCUMENTOS E PROJETOS CONSIDERADOS", espaco=19.0,
             texto=("Plantas arquitetônicas de layout das 20 unidades e áreas comuns fornecidas pelo cliente.\n\n"
                    "Levantamento de necessidades repassado em reunião técnica")),
        dict(titulo="PREMISSAS TÉCNICAS", espaco=2.0,
             texto=("O fornecimento de materiais elétricos por parte da {empresa} se limita exclusivamente à etapa da "
                    "Entrada de Energia 200A. A argamassa/cimento para o chumbamento das caixinhas e tubos deverá ser "
                    "fornecida pelo contratante.\n\n"
                    "As instalações serão executadas em total conformidade com a ABNT NBR 5410 (Instalações Elétricas de "
                    "Baixa Tensão) e normativas vigentes da COPEL")),
        dict(titulo="FORA DO ESCOPO",
             texto=("Fornecimento de materiais elétricos (cabos, quadros, disjuntores, eletrodutos, tomadas, etc.) para "
                    "as instalações internas, montagem do QGBT e infraestrutura a partir da medição.\n\n"
                    "Taxas, boletos ou cobranças de participação financeira emitidas pela COPEL para adequação/reforço "
                    "da rede externa.\n\n"
                    "Obras civis de recomposição e acabamento: O fechamento das valetas escavadas, o fechamento das "
                    "quebras de parede (reboco), concretagem, recomposição de pisos, forros, pintura e acabamentos "
                    "finais NÃO estão inclusos no escopo da {empresa}.\n\n"
                    "Fornecimento e instalação de luminárias decorativas, chuveiros, fitas de LED ou eletrodomésticos.")),
        dict(titulo="RESPONSABILIDADE DA CONTRATANTE",
             texto=("Execução do fechamento civil (recomposição de valetas, reboco, concretagem de pisos e pintura) de "
                    "todas as quebras e escavações realizadas pela equipe da {empresa}.\n\n"
                    "Fornecimento de cimento/argamassa/areia necessários apenas para o chumbamento inicial das caixinhas "
                    "e tubulações pela {empresa}.\n\n"
                    "Pagamento de eventuais taxas e boletos de participação financeira gerados pela COPEL relativos à "
                    "obra na rede da concessionária.\n\n"
                    "Fornecimento no canteiro de obras de todos os materiais elétricos especificados para a rede interna "
                    "e montagem de quadros, em tempo hábil para não paralisar a mão de obra.\n\n"
                    "Liberação irrestrita das frentes de trabalho e disponibilização de ponto de energia e água.")),
        dict(titulo="RESPONSABILIDADE DA {EMPRESA}",
             texto=("Executar os serviços com qualidade, empregando mão de obra qualificada e ferramentas adequadas.\n\n"
                    "Garantir a utilização de Equipamentos de Proteção Individual (EPIs) por toda a equipe.\n\n"
                    "Conduzir os trâmites burocráticos e técnicos (DCA) junto à COPEL para a viabilização da ligação.")),
        dict(titulo="PRAZO DE EXECUÇÃO",
             texto=("O prazo estimado para a execução dos serviços internos é de 30 dias, contados a partir do início da "
                    "obra e da disponibilização dos materiais pelo contratante.\n"
                    "O prazo da ligação de energia seguirá o cronograma normativo da COPEL.")),
        dict(titulo="RESPONSABILIDADE TÉCNICA",
             texto=("A {empresa} emitirá as devidas Anotações de Responsabilidade Técnica (ART) referentes ao projeto "
                    "elétrico e à execução dos serviços, garantindo o respaldo de engenharia para a obra.")),
    ],
    "itens": [
        ("Entrada de Energia 200A (Fornecimento completo de materiais, escavação/poste, aprovação Copel e execução via "
         "Bom Pastor)", 8140.00),
        ("Projeto Elétrico - Obra Kitnets", 1351.00),
        ("Execução - Montagem do QGBT (Exclusivo Mão de Obra, sem fornecimento da caixa, componentes e barramentos)",
         2700.00),
        ("Execução - Mão de Obra de Infraestrutura, Escavação e Cabeamento (Entrada até QGBT)", 1288.00),
        ("Execução - Mão de Obra Instalações Elétricas Internas, Escavação, Quebra e Chumbamento (20 Kitnets e Áreas "
         "Comuns)", 10356.00),
    ],
    "parcelas": [
        dict(rotulo="Entrada", valor=7000.00,
             detalhe="no aceite da proposta, referente aos custos iniciais e Entrada de Energia"),
        dict(rotulo="Parcela 2", valor=5611.67, detalhe="30 dias após o aceite"),
        dict(rotulo="Parcela 3", valor=5611.67, detalhe="60 dias após o aceite"),
        dict(rotulo="Parcela 4", valor=5611.66, detalhe="90 dias após o aceite"),
    ],
    "secoes_pos": [
        dict(titulo="VALIDADE DA PROPOSTA",
             texto="Esta proposta comercial é válida por {validade_dias} dias corridos a partir da data de sua emissão."),
        dict(titulo="GARANTIA",
             texto=("A {empresa} oferece garantia de 90 (noventa) dias sobre os serviços de mão de obra executados, e "
                    "garantia legal sobre os materiais fornecidos para o padrão de entrada. A garantia não cobre defeitos "
                    "de fabricação dos materiais da rede interna fornecidos pelo cliente.")),
        dict(titulo="OBSERVAÇÕES COMERCIAIS IMPORTANTES", nova_pagina=True,
             texto=("PONTO DE ATENÇÃO (CUSTOS COPEL): Ressaltamos que, durante a solicitação de liberação de rede, a "
                    "COPEL poderá identificar a necessidade de adequações ou obras na rede externa pública para atender a "
                    "nova demanda de 200A. Caso a concessionária gere cobrança de participação financeira parcial ou total "
                    "sobre esta obra de rede, o custo será de inteira responsabilidade da Contratante, não estando "
                    "contemplado nos valores desta proposta.\n\n"
                    "O quantitativo de pontos de tomada e iluminação das kitnets será o definido no projeto elétrico "
                    "(Item 2). Solicitações de acréscimo de pontos após o início das obras estarão sujeitas à revisão "
                    "comercial (aditivo).")),
    ],
    "fecho": FECHO_PADRAO,
    "assinatura1": "Nome do Cliente (Resp.)",
    "assinatura2": "Nome do Responsável (Administrativo)",
}
