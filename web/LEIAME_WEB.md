# Precifica Web

A versão web do **Precifica Desktop**: mesmo motor de cálculo, mesmas telas e mesmos documentos, mas em uma página que
abre no navegador do celular (ou do computador), **sem servidor, sem conta e sem Excel**. Depois do primeiro acesso funciona
offline e pode ser instalada na tela inicial como se fosse um app.

## Como usar

| Quero… | Faça |
|---|---|
| Testar agora no computador | Dê dois cliques em `Precifica.html` (arquivo único, autocontido). |
| Usar no celular, na mesma rede Wi-Fi | Rode `servir_na_rede.bat` e abra no celular um dos endereços mostrados (ex.: `http://192.168.0.10:8000`). |
| **Instalar no celular (recomendado)** | Publique a pasta `pwa/` em qualquer hospedagem estática com HTTPS (GitHub Pages, Netlify, Cloudflare Pages…). Abra o endereço no celular e escolha *Instalar app* / *Adicionar à tela inicial*. Abre em tela cheia e funciona offline. |

> O service worker (modo offline/instalável) só liga em **HTTPS** ou `localhost`. Pelo IP da rede local o app funciona
> normalmente, mas sem instalação offline.

## Onde ficam os dados

No **navegador de cada aparelho** (localStorage). Nada é enviado para a internet. Por isso:

- faça **Configurações › Fazer backup** de vez em quando (baixa um arquivo `.json`) e **Restaurar backup** para trocar de aparelho;
- limpar os dados do site no navegador apaga os dados — o backup protege disso;
- o `Precifica.html` aberto como arquivo e o endereço publicado são "sites" diferentes, cada um com seus dados.

### Levar os dados do programa de computador para a web
Dê dois cliques em **`ExportarDadosParaWeb.exe`** (ou rode `.venv\Scripts\python.exe web\exportar_dados_para_web.py`). Para gerar o .exe de novo, rode `gerar_exportador_exe.bat`.
Gera `precifica_para_web_AAAAMMDD.json` em *Documentos*. Na web: **Configurações › Restaurar backup** e escolha o arquivo
(o logotipo personalizado vai junto).

## Sincronizar celulares, computadores e pessoas (Dropbox)

Em **Configurações › Sincronização entre aparelhos e pessoas (Dropbox)** o app guarda os dados em um arquivo
(`precifica-dados.json`) numa **pasta compartilhada do Dropbox**. Cada pessoa usa a própria conta Dropbox e todas enxergam o mesmo
arquivo. O app continua offline primeiro: salva no aparelho e, quando há internet, junta com o arquivo da nuvem e envia o
resultado (ao abrir, ~4 s depois de cada alteração, ao voltar a ter internet e pelo botão *Sincronizar agora*).

**Para usar (quem recebeu o convite):**
1. Aceite o convite da pasta compartilhada que chegou no seu e-mail (Dropbox › *Compartilhado*).
2. Abra o app › Configurações › **Conectar ao Dropbox** › entre com a sua conta › **Permitir**.
3. Pronto: o que você alterar aparece para as outras pessoas e vice-versa.

**Como as alterações se juntam:** cada registro tem um identificador único e a data da última alteração; vale a versão mais recente
de cada registro, então o que duas pessoas editaram offline se soma. Exclusões também são sincronizadas. Se duas pessoas gravarem
no mesmo instante, o app percebe (o arquivo muda de versão), lê de novo, junta e grava outra vez, sem perder nada. Os itens de uma
proposta acompanham a versão mais recente da proposta. Restaurar um backup ou "Apagar todos os dados" substitui a cópia da nuvem.
Duas propostas criadas ao mesmo tempo com o mesmo número não são renumeradas automaticamente: confira o número ao sincronizar.

Só funciona em **HTTPS** (ou `localhost`), não abrindo o `Precifica.html` como arquivo.
## O que mudou em relação ao desktop

| Desktop | Web |
|---|---|
| PDF gerado pelo reportlab | Documento em tela → **Imprimir / Salvar PDF** (no celular: Imprimir › Salvar como PDF, ou Compartilhar). Mesmo layout: proposta no modelo ACRS, relatório completo, tabela de preços e análise. |
| Tabelas com duplo clique | Toque na linha (abre a edição; *Duplicar*/*Excluir* ficam dentro da janela). No celular as tabelas viram cartões. |
| Menu lateral | Menu lateral no computador; no celular, barra inferior + menu ☰. |
| Backup `.db` | Backup `.json` |
| Importar planilha `.xlsm` | Igual (leitor SheetJS carregado só nessa hora → precisa de internet **uma vez**; depois fica no cache). |
| "Abrir pasta de dados" | Não se aplica (os dados ficam no navegador). |

Todo o resto — Painel, Serviços e fichas, Insumos, Equipe, Custos fixos, Imobilizado, Capacidade, Revenda, Tabela de preços,
Análise, Simulação, Relatórios, Concorrentes, Clientes, Propostas (editor com 5 abas, modelos de texto, exemplo nº 787,
entrada + parcelas), Exportar PDF, Configurações (logotipo, encargos, backup, exemplo), tutorial guiado e boas-vindas — está
presente.

## Para quem vai mexer no código

```
web/src/core.js       números pt-BR, banco (localStorage) e motor de cálculo  (porta de precifica/engine.py + db.py)
web/src/ui-base.js    elementos, janelas, formulários, tabelas responsivas, gráficos SVG
web/src/docs.js       documentos para imprimir (porta de precifica/pdfs.py)
web/src/pages-a.js    Painel, Serviços, Insumos, Equipe, Custos fixos, Capacidade, Revenda
web/src/pages-b.js    Tabela, Análise, Simulação, Relatórios, Concorrentes, Clientes, Exportar, Configurações
web/src/proposal.js   Propostas e editor de proposta
web/src/tutorial.js   tutorial e boas-vindas        web/src/importer.js  importação da planilha EG3   web/src/sync.js  sincronização com o Google Drive
web/src/app.js        menu, rotas e inicialização   web/src/style.css     visual (celular primeiro)
web/build_web.py      gera Precifica.html e pwa/ (os dados iniciais e o logotipo saem de precifica/seed.py e assets.py)
```
Depois de editar qualquer arquivo de `src/`, rode `build_web.bat`.

### Testes (opcionais)
```
.venv\Scripts\python.exe web\test\parity_gen.py     # valores de referência calculados pelo motor Python
node web\test\parity.js                              # o motor JS tem que bater (970 verificações)
.venv\Scripts\python.exe web\test\import_gen.py      # planilha sintética + importador Python
node web\test\import_test.js <pasta-com-node_modules\xlsx>
node web\test\sync_test.js                           # junção entre dois aparelhos (sincronização)
.venv\Scripts\python.exe web\test\print_test.py      # gera PDFs de teste pelo Edge/Chrome
```

## Login por empresa (Dropbox)
- Cada empresa tem a pasta `Precifica-<nome>` no Dropbox, com `precifica-dados.json` (dados) e `precifica-acesso.json` (usuarios; senhas guardadas como hash).
- Tela inicial: conectar o Dropbox, depois **Entrar** (empresa, usuario, senha, "lembrar") ou **Criar empresa** (a pessoa vira o dono).
- Dono: em Configuracoes > Usuarios da empresa cria/remove funcionarios, troca senhas e convida pelo Dropbox. Funcionario nao ve configuracoes, backup nem usuarios.
- Administrador: conta Dropbox cujo ID esta na variavel `ADMIN_DROPBOX_IDS` (GitHub > Settings > Variables; ou `web/admin_ids.txt`). Ve as empresas que compartilharam a pasta com ele e abre qualquer uma com um clique. `SUPPORT_EMAIL` (opcional) mostra aos donos o botao "Compartilhar com o suporte".
- Limite: sem servidor proprio, a senha do app e uma trava de uso; a protecao real dos dados e a permissao da pasta no Dropbox.
