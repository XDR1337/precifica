# Precifica Web

A versÃ£o web do **Precifica Desktop**: mesmo motor de cÃ¡lculo, mesmas telas e mesmos documentos, mas em uma pÃ¡gina que
abre no navegador do celular (ou do computador), **sem servidor, sem conta e sem Excel**. Depois do primeiro acesso funciona
offline e pode ser instalada na tela inicial como se fosse um app.

## Como usar

| Queroâ€¦ | FaÃ§a |
|---|---|
| Testar agora no computador | DÃª dois cliques em `Precifica.html` (arquivo Ãºnico, autocontido). |
| Usar no celular, na mesma rede Wi-Fi | Rode `servir_na_rede.bat` e abra no celular um dos endereÃ§os mostrados (ex.: `http://192.168.0.10:8000`). |
| **Instalar no celular (recomendado)** | Publique a pasta `pwa/` em qualquer hospedagem estÃ¡tica com HTTPS (GitHub Pages, Netlify, Cloudflare Pagesâ€¦). Abra o endereÃ§o no celular e escolha *Instalar app* / *Adicionar Ã  tela inicial*. Abre em tela cheia e funciona offline. |

> O service worker (modo offline/instalÃ¡vel) sÃ³ liga em **HTTPS** ou `localhost`. Pelo IP da rede local o app funciona
> normalmente, mas sem instalaÃ§Ã£o offline.

## Onde ficam os dados

No **navegador de cada aparelho** (localStorage). Nada Ã© enviado para a internet. Por isso:

- faÃ§a **ConfiguraÃ§Ãµes â€º Fazer backup** de vez em quando (baixa um arquivo `.json`) e **Restaurar backup** para trocar de aparelho;
- limpar os dados do site no navegador apaga os dados â€” o backup protege disso;
- o `Precifica.html` aberto como arquivo e o endereÃ§o publicado sÃ£o "sites" diferentes, cada um com seus dados.

### Levar os dados do programa de computador para a web
DÃª dois cliques em **`ExportarDadosParaWeb.exe`** (ou rode `.venv\Scripts\python.exe web\exportar_dados_para_web.py`). Para gerar o .exe de novo, rode `gerar_exportador_exe.bat`.
Gera `precifica_para_web_AAAAMMDD.json` em *Documentos*. Na web: **ConfiguraÃ§Ãµes â€º Restaurar backup** e escolha o arquivo
(o logotipo personalizado vai junto).

## Sincronizar celulares, computadores e pessoas (Dropbox)

Em **ConfiguraÃ§Ãµes â€º SincronizaÃ§Ã£o entre aparelhos e pessoas (Dropbox)** o app guarda os dados em um arquivo
(`precifica-dados.json`) numa **pasta compartilhada do Dropbox**. Cada pessoa usa a prÃ³pria conta Dropbox e todas enxergam o mesmo
arquivo. O app continua offline primeiro: salva no aparelho e, quando hÃ¡ internet, junta com o arquivo da nuvem e envia o
resultado (ao abrir, ~4 s depois de cada alteraÃ§Ã£o, ao voltar a ter internet e pelo botÃ£o *Sincronizar agora*).

**Para usar (quem recebeu o convite):**
1. Aceite o convite da pasta compartilhada que chegou no seu e-mail (Dropbox â€º *Compartilhado*).
2. Abra o app â€º ConfiguraÃ§Ãµes â€º **Conectar ao Dropbox** â€º entre com a sua conta â€º **Permitir**.
3. Pronto: o que vocÃª alterar aparece para as outras pessoas e vice-versa.

**Como as alteraÃ§Ãµes se juntam:** cada registro tem um identificador Ãºnico e a data da Ãºltima alteraÃ§Ã£o; vale a versÃ£o mais recente
de cada registro, entÃ£o o que duas pessoas editaram offline se soma. ExclusÃµes tambÃ©m sÃ£o sincronizadas. Se duas pessoas gravarem
no mesmo instante, o app percebe (o arquivo muda de versÃ£o), lÃª de novo, junta e grava outra vez, sem perder nada. Os itens de uma
proposta acompanham a versÃ£o mais recente da proposta. Restaurar um backup ou "Apagar todos os dados" substitui a cÃ³pia da nuvem.
Duas propostas criadas ao mesmo tempo com o mesmo nÃºmero nÃ£o sÃ£o renumeradas automaticamente: confira o nÃºmero ao sincronizar.

SÃ³ funciona em **HTTPS** (ou `localhost`), nÃ£o abrindo o `Precifica.html` como arquivo.
## O que mudou em relaÃ§Ã£o ao desktop

| Desktop | Web |
|---|---|
| PDF gerado pelo reportlab | Documento em tela â†’ **Imprimir / Salvar PDF** (no celular: Imprimir â€º Salvar como PDF, ou Compartilhar). Mesmo layout: proposta no modelo ACRS, relatÃ³rio completo, tabela de preÃ§os e anÃ¡lise. |
| Tabelas com duplo clique | Toque na linha (abre a ediÃ§Ã£o; *Duplicar*/*Excluir* ficam dentro da janela). No celular as tabelas viram cartÃµes. |
| Menu lateral | Menu lateral no computador; no celular, barra inferior + menu â˜°. |
| Backup `.db` | Backup `.json` |
| Importar planilha `.xlsm` | Igual (leitor SheetJS carregado sÃ³ nessa hora â†’ precisa de internet **uma vez**; depois fica no cache). |
| "Abrir pasta de dados" | NÃ£o se aplica (os dados ficam no navegador). |

Todo o resto â€” Painel, ServiÃ§os e fichas, Insumos, Equipe, Custos fixos, Imobilizado, Capacidade, Revenda, Tabela de preÃ§os,
AnÃ¡lise, SimulaÃ§Ã£o, RelatÃ³rios, Concorrentes, Clientes, Propostas (editor com 5 abas, modelos de texto, exemplo nÂº 787,
entrada + parcelas), Exportar PDF, ConfiguraÃ§Ãµes (logotipo, encargos, backup, exemplo), tutorial guiado e boas-vindas â€” estÃ¡
presente.

## Para quem vai mexer no cÃ³digo

```
web/src/core.js       nÃºmeros pt-BR, banco (localStorage) e motor de cÃ¡lculo  (porta de precifica/engine.py + db.py)
web/src/ui-base.js    elementos, janelas, formulÃ¡rios, tabelas responsivas, grÃ¡ficos SVG
web/src/docs.js       documentos para imprimir (porta de precifica/pdfs.py)
web/src/pages-a.js    Painel, ServiÃ§os, Insumos, Equipe, Custos fixos, Capacidade, Revenda
web/src/pages-b.js    Tabela, AnÃ¡lise, SimulaÃ§Ã£o, RelatÃ³rios, Concorrentes, Clientes, Exportar, ConfiguraÃ§Ãµes
web/src/proposal.js   Propostas e editor de proposta
web/src/tutorial.js   tutorial e boas-vindas        web/src/importer.js  importaÃ§Ã£o da planilha EG3   web/src/sync.js  sincronizaÃ§Ã£o com o Google Drive
web/src/app.js        menu, rotas e inicializaÃ§Ã£o   web/src/style.css     visual (celular primeiro)
web/build_web.py      gera Precifica.html e pwa/ (os dados iniciais e o logotipo saem de precifica/seed.py e assets.py)
```
Depois de editar qualquer arquivo de `src/`, rode `build_web.bat`.

### Testes (opcionais)
```
.venv\Scripts\python.exe web\test\parity_gen.py     # valores de referÃªncia calculados pelo motor Python
node web\test\parity.js                              # o motor JS tem que bater (970 verificaÃ§Ãµes)
.venv\Scripts\python.exe web\test\import_gen.py      # planilha sintÃ©tica + importador Python
node web\test\import_test.js <pasta-com-node_modules\xlsx>
node web\test\sync_test.js                           # junÃ§Ã£o entre dois aparelhos (sincronizaÃ§Ã£o)
.venv\Scripts\python.exe web\test\print_test.py      # gera PDFs de teste pelo Edge/Chrome
```

## Login por empresa (so Dropbox)
- Cada empresa tem a pasta `Precifica-<nome>` no Dropbox, com `precifica-dados.json` (dados) e `precifica-acesso.json` (e-mails com acesso e papel: dono ou funcionario).
- Nao ha usuario e senha: a pessoa entra com a conta do Dropbox e o e-mail define a(s) empresa(s). Uma empresa: entra direto. Varias: escolhe, e troca pelo botao "Trocar" no canto inferior esquerdo.
- Dono: em Configuracoes > Pessoas com acesso informa so o e-mail (e o papel); o app convida a pessoa para a pasta. Funcionario nao adiciona pessoas, nem ve configuracoes ou backup.
- Administrador: sem senha; a conta Dropbox cujo ID esta em ADMIN_DROPBOX_IDS entra direto no painel. Toda empresa nova e compartilhada automaticamente com o e-mail do suporte (definido no painel), e o administrador abre qualquer uma e edita em tempo real (a tela confere a nuvem a cada ~25 s). Variaveis `ADMIN_DROPBOX_IDS` e `SUPPORT_EMAIL` (opcional).
- Limite: sem servidor proprio, a protecao real dos dados e a permissao da pasta no Dropbox.
## Administração e regras
- O administrador tem um item próprio no menu ("Administração", abaixo de Configurações): empresas (criar, gerenciar, abrir, excluir), e-mails que podem criar empresas (com limite de empresas e de pessoas convidadas), e-mail do suporte, e o e-mail e o ID da própria conta (com botão Copiar).
- Não existe modo sem conta: para usar o sistema é preciso entrar com o Dropbox e ter acesso a uma empresa.
- As regras ficam em `Precifica_Admin/politica.json` (privado) e `publico.json` (só hashes dos e-mails), no Dropbox do administrador. O site lê o `publico.json` pelo link da variável `POLICY_URL` (gerado no painel).
- O app pede a permissão `account_info.read` do Dropbox para ler o e-mail da conta (marque em Permissions no console do app e reconecte).
- Limite: sem servidor não há proteção contra quem edita o código; a proteção real é a permissão da pasta no Dropbox.
