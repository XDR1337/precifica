# Precifica Desktop 2.0

Alternativa em Python à **Planilha de Precificação EG3 (R02)** e à planilha **propostas comerciais.xlsm**,
para quem não tem Microsoft Excel. Todos os documentos são gerados em **PDF**.

## Como usar
- **Rodar pelo Python:** dê dois cliques em `instalar_e_executar.bat` (cria a `.venv`, instala as bibliotecas e abre o app).
- **Gerar o .exe para o cliente:** dê dois cliques em `gerar_exe.bat`. O arquivo sai em `dist\PrecificaDesktop.exe`
  e roda sem Python e sem Excel.

Os dados ficam em `%LOCALAPPDATA%\PrecificaDesktop\precifica.db` (backups na subpasta `backups`).
Os PDFs são salvos por padrão em `Documentos\Precifica Desktop`.

## Versão web (celular)
A pasta `web\` tem a **versão web** do app: as mesmas telas, o mesmo motor de cálculo e os mesmos documentos (proposta no modelo
ACRS, relatório, tabela de preços, análise), em uma página que abre no navegador do celular e funciona offline.
Veja `web\LEIAME_WEB.md` — resumo: dê dois cliques em `web\Precifica.html`, ou rode `web\servir_na_rede.bat` para abrir no celular
pelo Wi-Fi, ou publique `web\pwa\` em uma hospedagem HTTPS para instalar como aplicativo. Para levar os dados do desktop:
`python web\exportar_dados_para_web.py`.

## Tutorial
Ao abrir o programa aparece um tutorial guiado que percorre cada tela. Dá para pular (“Pular tutorial”) ou marcar
“Não mostrar este tutorial novamente”. Para rever, abra **Configurações › Tutorial**.

## O que o app faz (equivalência com a planilha)
| Planilha (aba) | App (tela) |
|---|---|
| CadInsumos | Insumos e preços (já vem com os 96 preços de referência) |
| CadServicos + FichaTecnica | Serviços e fichas |
| CadFopag | Equipe (encargos em Configurações) |
| CF | Custos fixos |
| CapProd | Capacidade produtiva |
| CadRevenda | Revenda |
| TblPrecificacao / TblPrecificacaoRevenda | Tabela de preços |
| Analise / AnaliseRevenda | Análise de preço |
| Simulacao / SimulacaoRevenda | Simulação |
| Relatorios | Relatórios gerenciais |
| Concorrentes | Concorrentes |
| propostas comerciais.xlsm | Propostas + Clientes (PDF no modelo ACRS – ver abaixo) |

Também importa uma planilha `.xlsm` já preenchida (Configurações › Importar planilha Excel).

## Visual ACRS e proposta técnica e comercial (v2.1)
- **Interface** em laranja (#FF9900, o filete do modelo de proposta) e azul-grafite (#111A25, do logotipo), com o **logotipo da
  ACRS** na lateral, no ícone da janela e em todos os PDFs. Em *Configurações › Logotipo* dá para trocar a imagem ou voltar ao
  logo da ACRS (o padrão já vem embutido no programa).
- **PDF da proposta idêntico ao modelo da ACRS** (A4, fonte Calibri, logotipo, `Data:`, título em 16 pt, filete laranja duplo,
  seções em negrito sublinhado, tabela de investimento cinza com valores centralizados, linhas de assinatura). Os relatórios
  em PDF usam a mesma identidade visual (logo + filete laranja).
- **Editor de proposta com 5 abas** (*Propostas › + Nova proposta*):
  1. **Dados e cliente** – nº da proposta (editável), data, validade, título, A/C. e dados do cliente;
  2. **Objetivo e escopo** – objetivo, introdução, etapas do escopo (título + descrição + tópicos com seta ➢) e nota final;
  3. **Textos da proposta** – seções livres antes do Investimento (documentos considerados, premissas técnicas, fora do escopo,
     responsabilidades, prazo, responsabilidade técnica…) e depois do pagamento (validade, garantia, observações). Cada seção
     tem título, texto e a opção *começar em nova página*;
  4. **Investimento e pagamento** – itens do catálogo ou livres, desconto, **entrada + parcelas** (botão *Gerar entrada +
     parcelas…* divide o saldo; a soma é conferida com o total) e opção de iniciar o Investimento em nova página;
  5. **Fechamento** – frase de despedida e os dois nomes das assinaturas.
- **Modelos de texto…** (topo do editor): *Aplicar os textos padrão*, *Salvar estes textos como padrão* (as próximas propostas já
  nascem com eles) e *Carregar o exemplo (Nº 787 – Obra Kitnets)*, que preenche tudo com a proposta usada como referência.
- Nos textos: `{empresa}` `{validade_dias}` `{numero}` `{total}` `{cliente}` são preenchidos sozinhos, `**texto**` fica em
  negrito e uma linha em branco separa os parágrafos.
- **Configurações**: novos campos *Nome curto nos textos* (ex.: ACRS) e *Assinante da empresa nas propostas*.
- Propostas antigas continuam abrindo: as observações viram a seção “Observações comerciais” e o texto de pagamento é mantido.
- O botão **Pré-visualizar PDF** do editor gera o documento sem fechar a tela.
- O tutorial (Configurações › Tutorial) ganhou um passo para cada aba do editor.
- Para o exe/instalador sair com o ícone novo, rode `gerar_exe.bat` e `gerar_instalador.bat` de novo.

## Estrutura do código
```
app.py               ponto de entrada
precifica/core.py     utilitários e formatação pt-BR
precifica/seed.py     dados iniciais (preços, encargos, custos fixos, exemplo)
precifica/db.py       banco SQLite, backup e migração da versão 1 (CSV)
precifica/engine.py   motor de cálculo (fórmulas da planilha R02)
precifica/importer.py importação da planilha .xlsm
precifica/pdfs.py     relatório completo, análise e proposta técnica e comercial em PDF (reportlab)
precifica/widgets.py  componentes visuais
precifica/tutorial.py tutorial guiado (passo a passo de cada tela)
precifica/assets.py    logotipos embutidos (ACRS e EG3)
precifica/ui.py       telas
```

## Diferenças em relação à planilha R02 (correções do relatório final)
- O rateio de custos fixos na análise de serviços usa o faturamento de serviços **+ revenda** (como na Simulação).
- A unidade do item "Deslocamento" foi corrigida de km/h para quilômetro.
- A capacidade produtiva conta apenas os colaboradores do setor Produtivo.
