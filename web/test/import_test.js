// Teste do importador: o importador JS (web/src/importer.js) tem que deixar o banco igual ao do importador Python.
// Uso: node web/test/import_test.js <pasta com node_modules/xlsx>   (depois de python web/test/import_gen.py e parity_gen.py)
const fs = require("fs");
const path = require("path");
const out = path.join(__dirname, "out");
const xlsxDir = process.argv[2] || process.cwd();
const XLSX = require(path.join(xlsxDir, "node_modules", "xlsx"));

global.addEventListener = () => {};
global.document = { addEventListener() {} };
global.localStorage = { getItem: () => null, setItem() {} };
const P = {};
global.P = P;
new Function("P", fs.readFileSync(path.join(out, "seed_for_test.js"), "utf8"))(P);
new Function("P", fs.readFileSync(path.join(__dirname, "..", "src", "core.js"), "utf8"))(P);
new Function("P", fs.readFileSync(path.join(__dirname, "..", "src", "importer.js"), "utf8"))(P);

const exp = JSON.parse(fs.readFileSync(path.join(out, "import_expected.json"), "utf8"));
const db = new P.Database();
const wb = XLSX.read(fs.readFileSync(path.join(out, "planilha_teste.xlsx")), { type: "buffer", cellFormula: false });
const rep = P.importXlsx(db, wb, XLSX);

let fails = 0, checks = 0;
const eq = (a, b) => (typeof b === "number" ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)) : a === b);
function cmp(where, got, want) {
  checks++;
  if (!eq(got, want)) { fails++; console.log("DIFF", where, "js=", JSON.stringify(got), "py=", JSON.stringify(want)); }
}
for (const k of Object.keys(exp.rep)) cmp("rep." + k, rep[k], exp.rep[k]);
for (const [table, rows] of Object.entries(exp.state)) {
  if (table === "config") {
    for (const [k, v] of Object.entries(rows)) { if (["concorrentes_json"].includes(k)) continue; cmp("config." + k, db.cfg(k), String(v)); }
    const a = JSON.parse(db.cfg("concorrentes_json") || "{}"), b = JSON.parse(rows.concorrentes_json || "{}");
    cmp("concorrentes", JSON.stringify(a), JSON.stringify(b));
    continue;
  }
  const got = db.all(table);
  cmp(table + ".n", got.length, rows.length);
  rows.forEach((w, i) => { for (const k of Object.keys(w)) cmp(`${table}[${i}].${k}`, got[i] ? got[i][k] : undefined, w[k]); });
}
console.log(`${checks} verificacoes, ${fails} diferencas`, JSON.stringify(rep));
process.exit(fails ? 1 : 0);
