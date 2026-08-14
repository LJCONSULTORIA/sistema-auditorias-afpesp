import { readFile, access } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const declared = { ...packageJson.dependencies, ...packageJson.devDependencies };
const floating = Object.entries(declared).filter(([, version]) => version === "latest" || version === "*");
if (floating.length) throw new Error(`Dependências sem versão fixa: ${floating.map(([name]) => name).join(", ")}`);

for (const relativePath of [
  "supabase/functions/manage-audit-users/index.ts",
  "supabase/functions/request-password-reset/index.ts",
  "supabase/migrations/202608140001_guard_checklist_deletion.sql",
  "docs/ARCHITECTURE.md",
]) await access(new URL(relativePath, root));

const reports = await readFile(new URL("src/reports.ts", root), "utf8");
if (reports.includes('import("./db")') || reports.includes('from "./db"'))
  throw new Error("O módulo de relatórios ainda referencia o banco local legado.");

console.log("Verificação arquitetural concluída: versões fixas, funções versionadas e código legado desconectado.");
