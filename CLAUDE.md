# Precifica

## Grafo de conhecimento (graphify) e vault do Obsidian
- O grafo do projeto fica em `graphify-out/` (`GRAPH_REPORT.md`, `graph.json`, `graph.html`) e o vault em `ObsidianVault/`.
- Antes de explorar o codigo ou responder perguntas sobre arquitetura/relacoes entre arquivos, consulte o grafo primeiro: `graphify query "<pergunta>"`, `graphify path "A" "B"`, `graphify explain "X"`, ou leia `graphify-out/GRAPH_REPORT.md`.
- Depois de CADA mudanca no codigo, atualize os dois (antes do commit):
  ```
  graphify update .
  graphify export obsidian --dir ObsidianVault
  graphify export html
  ```
- `graphify-out/` e `ObsidianVault/` estao no `.gitignore` (nao vao para o GitHub).

## Publicacao
- Depois de alterar o projeto, fazer `git add`, `git commit` e `git push` no `main` (publica o site por GitHub Actions). Nunca usar force push.
