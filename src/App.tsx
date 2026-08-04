import { useEffect, useState } from "react";
import {
  Routes,
  Route,
  NavLink,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArchiveRestore,
  BarChart3,
  Building2,
  ClipboardCheck,
  Database,
  Download,
  FileDown,
  Home,
  Menu,
  Plus,
  Save,
  Settings,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import * as XLSX from "xlsx";
import { db, seed } from "./db";
import type {
  Answer,
  Audit,
  Auditor,
  Checklist,
  ChecklistItem,
  Classification,
  LocationType,
  Unit,
} from "./types";
import { exportBackup, exportDocx, exportExcel, importBackup } from "./reports";
ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);
const classes: Classification[] = [
  "Conforme",
  "Não Conforme",
  "Oportunidade de Melhoria",
  "Risco",
];
const today = () => new Date().toISOString().slice(0, 10);
function Layout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const links = [
    [Home, "/", "Início"],
    [BarChart3, "/dashboard", "Dashboard"],
    [ClipboardCheck, "/auditorias", "Auditorias"],
    [Building2, "/cadastros", "Cadastros"],
    [Database, "/backup", "Backup"],
  ] as const;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-afpesp-700 text-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4">
          <button className="mr-3 md:hidden" onClick={() => setOpen(!open)}>
            <Menu />
          </button>
          <div>
            <div className="font-bold">AFPESP</div>
            <div className="text-xs text-afpesp-100">Auditorias Internas</div>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl">
        <aside
          className={`${open ? "block" : "hidden"} fixed inset-y-16 z-20 w-64 border-r bg-white p-4 md:static md:block md:min-h-[calc(100vh-4rem)]`}
        >
          {links.map(([Icon, to, label]) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-afpesp-50 text-afpesp-700" : "text-slate-600 hover:bg-slate-100"}`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function Stat({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card flex items-center gap-4">
      <div className="rounded-lg bg-afpesp-50 p-3 text-afpesp-600">{icon}</div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-slate-500">{title}</div>
      </div>
    </div>
  );
}
function HomePage() {
  const audits = useLiveQuery(() => db.audits.toArray(), []) ?? [];
  return (
    <>
      <PageTitle
        title="Sistema de Auditorias Internas"
        subtitle="Selecione Auditorias para consultar um local ou cadastrar uma nova auditoria."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Stat
          title="Programadas"
          value={String(audits.filter((a) => a.status === "Programada").length)}
          icon={<ClipboardCheck />}
        />
        <Stat
          title="Em andamento"
          value={String(
            audits.filter((a) => a.status === "Em andamento").length,
          )}
          icon={<Settings />}
        />
        <Stat
          title="Finalizadas"
          value={String(audits.filter((a) => a.status === "Finalizada").length)}
          icon={<ArchiveRestore />}
        />
      </div>
    </>
  );
}
function Dashboard() {
  const audits = useLiveQuery(() => db.audits.toArray(), []) ?? [];
  const answers = audits.flatMap((a) => a.answers);
  const counts = classes.map(
    (c) => answers.filter((a) => a.classification === c).length,
  );
  const reqs = [
    ...new Set(
      answers
        .filter((a) => a.classification === "Não Conforme")
        .map((a) => a.requirement),
    ),
  ].sort();
  return (
    <>
      <PageTitle
        title="Dashboard"
        subtitle="Resultados consolidados das auditorias."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 font-bold">Classificações</h2>
          <Doughnut
            data={{
              labels: classes,
              datasets: [
                {
                  data: counts,
                  backgroundColor: ["#22c55e", "#ef4444", "#f59e0b", "#7c3aed"],
                },
              ],
            }}
            options={{ plugins: { legend: { position: "bottom" } } }}
          />
        </div>
        <div className="card">
          <h2 className="mb-4 font-bold">
            Não conformidades por requisito ISO 9001
          </h2>
          <Bar
            data={{
              labels: reqs,
              datasets: [
                {
                  label: "Não conformidades",
                  data: reqs.map(
                    (r) =>
                      answers.filter(
                        (a) =>
                          a.requirement === r &&
                          a.classification === "Não Conforme",
                      ).length,
                  ),
                  backgroundColor: "#dc2626",
                },
              ],
            }}
            options={{
              scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
            }}
          />
        </div>
      </div>
    </>
  );
}
function AuditHub() {
  const nav = useNavigate();
  const [type, setType] = useState<LocationType | "">("");
  const [unit, setUnit] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState<Audit["status"] | "Todos">("Todos");
  const units =
    useLiveQuery<Unit[]>(
      () =>
        type
          ? db.units
              .where("type")
              .equals(type)
              .and((u) => u.active)
              .toArray()
          : Promise.resolve([] as Unit[]),
      [type],
    ) ?? [];
  const audits =
    useLiveQuery<Audit[]>(
      () =>
        unit
          ? db.audits.where("unit").equals(unit).toArray()
          : Promise.resolve([] as Audit[]),
      [unit],
    ) ?? [];
  useEffect(() => setUnit(""), [type]);
  const filtered = audits.filter(
    (a) =>
      (!dateFrom || a.startDate >= dateFrom) &&
      (!dateTo || a.startDate <= dateTo) &&
      (status === "Todos" || a.status === status),
  );
  return (
    <>
      <PageTitle
        title="Auditorias"
        subtitle="Selecione o tipo de local e, em seguida, o local que deseja consultar."
        action={
          audits.length ? (
            <button
              className="btn-secondary"
              onClick={() => exportExcel(audits)}
            >
              <FileDown size={16} />
              Excel
            </button>
          ) : undefined
        }
      />
      <div className="card grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Tipo de local">
          <select
            className="field"
            value={type}
            onChange={(e) => setType(e.target.value as LocationType | "")}
          >
            <option value="">Selecione</option>
            <option>Unidade de Lazer</option>
            <option>Sede Social</option>
          </select>
        </Field>
        {type && (
          <Field
            label={
              type === "Unidade de Lazer"
                ? "Unidade de Lazer"
                : "Local da Sede Social"
            }
          >
            <select
              className="field"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="">Selecione</option>
              {units.map((u) => (
                <option key={u.id}>{u.name}</option>
              ))}
            </select>
          </Field>
        )}
        {unit && (
          <>
            <Field label="Data inicial">
              <input
                type="date"
                className="field"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </Field>
            <Field label="Data final">
              <input
                type="date"
                className="field"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </Field>
            <Field label="Status">
              <select
                className="field"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as Audit["status"] | "Todos")
                }
              >
                <option>Todos</option>
                <option>Programada</option>
                <option>Em andamento</option>
                <option>Finalizada</option>
              </select>
            </Field>
          </>
        )}
      </div>
      {unit && (
        <>
          <div className="my-6 flex justify-end">
            <button
              className="btn-primary"
              onClick={() =>
                nav(
                  `/auditorias/nova?type=${encodeURIComponent(type)}&unit=${encodeURIComponent(unit)}`,
                )
              }
            >
              <Plus size={16} />
              Nova auditoria
            </button>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {(["Programada", "Em andamento", "Finalizada"] as const).map(
              (status) => (
                <AuditColumn
                  key={status}
                  status={status}
                  audits={filtered.filter((a) => a.status === status)}
                  onOpen={(id) => nav(`/auditorias/${id}`)}
                />
              ),
            )}
          </div>
        </>
      )}
    </>
  );
}
function AuditColumn({
  status,
  audits,
  onOpen,
}: {
  status: Audit["status"];
  audits: Audit[];
  onOpen: (id: number) => void;
}) {
  return (
    <div className="card">
      <h2 className="mb-3 font-bold">{status}s</h2>
      {audits.length ? (
        audits.map((a) => (
          <button
            key={a.id}
            onClick={() => onOpen(a.id!)}
            className="mb-2 w-full rounded-lg border p-3 text-left hover:bg-slate-50"
          >
            <div className="font-medium">{a.checklistName}</div>
            <div className="text-sm text-slate-500">
              {a.startDate}
              {a.auditors.length ? ` · ${a.auditors.join(", ")}` : ""}
            </div>
          </button>
        ))
      ) : (
        <p className="text-sm text-slate-500">Nenhuma auditoria.</p>
      )}
    </div>
  );
}
function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
async function readChecklist(file: File): Promise<ChecklistItem[]> {
  const wb = XLSX.read(await file.arrayBuffer());
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets[wb.SheetNames[0]],
    { defval: "" },
  );
  if (!rows.length) throw new Error("A planilha não possui dados.");
  const keys = Object.keys(rows[0]);
  const qKey = keys.find((k) =>
    ["questao", "pergunta", "item", "criterio", "checklist"].some((x) =>
      normalize(k).includes(x),
    ),
  );
  const rKey = keys.find((k) =>
    ["requisito", "iso", "clausula", "referencia"].some((x) =>
      normalize(k).includes(x),
    ),
  );
  if (!qKey)
    throw new Error(
      "Não foi localizada uma coluna de Questão/Pergunta/Item na planilha.",
    );
  return rows
    .map((r) => ({
      requirement: rKey ? String(r[rKey]).trim() : "",
      question: String(r[qKey]).trim(),
    }))
    .filter((x) => x.question);
}
function AuditForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const auditors =
    useLiveQuery(() => db.auditors.where("active").equals(1).toArray(), []) ??
    [];
  const checklists =
    useLiveQuery(
      () => db.checklists.orderBy("createdAt").reverse().toArray(),
      [],
    ) ?? [];
  const [mode, setMode] = useState<"anterior" | "novo">("anterior");
  const [error, setError] = useState("");
  const [audit, setAudit] = useState<Audit>({
    locationType: (params.get("type") as LocationType) || "Unidade de Lazer",
    unit: params.get("unit") || "",
    checklistName: "",
    auditors: [],
    startDate: today(),
    endDate: today(),
    scope: "",
    objective: "",
    status: "Programada",
    answers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  useEffect(() => {
    if (id) db.audits.get(Number(id)).then((a) => a && setAudit(a));
  }, [id]);
  const fromChecklist = (c: Checklist) =>
    setAudit((a) => ({
      ...a,
      checklistId: c.id,
      checklistName: c.name,
      answers: c.items.map((q, i) => ({
        id: crypto.randomUUID(),
        questionId: i,
        requirement: q.requirement,
        question: q.question,
        classification: "Conforme",
        finding: "",
        recommendation: "",
        photos: [],
      })),
    }));
  const upload = async (file?: File) => {
    if (!file) return;
    try {
      const items = await readChecklist(file);
      const name = file.name.replace(/\.xlsx?$/i, "");
      const checklist: Checklist = {
        name,
        fileName: file.name,
        items,
        createdAt: new Date().toISOString(),
      };
      const cid = await db.checklists.add(checklist);
      fromChecklist({ ...checklist, id: cid });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const save = async () => {
    if (!audit.unit || !audit.checklistName || !audit.startDate)
      return setError("Informe o local, a data e o checklist.");
    const data = { ...audit, updatedAt: new Date().toISOString() };
    const saved = id
      ? (await db.audits.put({ ...data, id: Number(id) }), Number(id))
      : await db.audits.add(data);
    nav(`/auditorias/${saved}`);
  };
  const update = (i: number, p: Partial<Answer>) =>
    setAudit((a) => ({
      ...a,
      answers: a.answers.map((x, j) => (j === i ? { ...x, ...p } : x)),
    }));
  const photos = async (i: number, files: FileList | null) => {
    if (!files) return;
    const urls = await Promise.all(
      [...files].map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(f);
          }),
      ),
    );
    update(i, { photos: [...audit.answers[i].photos, ...urls] });
  };
  return (
    <>
      <PageTitle
        title={id ? `${audit.locationType} — ${audit.unit}` : "Nova auditoria"}
        subtitle={
          id ? audit.checklistName : `${audit.locationType} — ${audit.unit}`
        }
        action={
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              onClick={() => nav("/auditorias")}
            >
              Voltar
            </button>
            {id && (
              <button
                className="btn-secondary"
                onClick={() => exportDocx(audit)}
              >
                <Download size={16} />
                Gerar relatório
              </button>
            )}
            <button className="btn-primary" onClick={save}>
              <Save size={16} />
              Salvar
            </button>
          </div>
        }
      />
      {!id && (
        <div className="card">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Data da auditoria">
              <input
                type="date"
                className="field"
                value={audit.startDate}
                onChange={(e) =>
                  setAudit({
                    ...audit,
                    startDate: e.target.value,
                    endDate: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Situação inicial">
              <select
                className="field"
                value={audit.status}
                onChange={(e) =>
                  setAudit({
                    ...audit,
                    status: e.target.value as Audit["status"],
                  })
                }
              >
                <option>Programada</option>
                <option>Em andamento</option>
              </select>
            </Field>
          </div>
          <div className="mt-5">
            <span className="label">Checklist</span>
            <div className="flex gap-4">
              <label>
                <input
                  type="radio"
                  checked={mode === "anterior"}
                  onChange={() => setMode("anterior")}
                />{" "}
                Usar checklist anterior
              </label>
              <label>
                <input
                  type="radio"
                  checked={mode === "novo"}
                  onChange={() => setMode("novo")}
                />{" "}
                Novo checklist
              </label>
            </div>
          </div>
          {mode === "anterior" ? (
            <select
              className="field mt-3"
              value={audit.checklistId ?? ""}
              onChange={(e) => {
                const c = checklists.find(
                  (x) => x.id === Number(e.target.value),
                );
                if (c) fromChecklist(c);
              }}
            >
              <option value="">Selecione um checklist</option>
              {checklists.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="mt-3">
              <input
                type="file"
                accept=".xlsx,.xls"
                className="field"
                onChange={(e) => upload(e.target.files?.[0])}
              />
              {audit.checklistName && (
                <p className="mt-2 text-sm font-medium text-afpesp-700">
                  Checklist importado: {audit.checklistName} (
                  {audit.answers.length} questões)
                </p>
              )}
            </div>
          )}
          {!checklists.length && mode === "anterior" && (
            <p className="mt-2 text-sm text-amber-700">
              Ainda não existe checklist anterior. Selecione “Novo checklist” e
              anexe a planilha Excel.
            </p>
          )}
        </div>
      )}
      {error && (
        <p className="my-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {(id || audit.answers.length > 0) && (
        <div className="mt-6 space-y-4">
          <div className="card grid gap-4 md:grid-cols-3">
            <Field label="Auditores">
              <select
                multiple
                className="field min-h-24"
                value={audit.auditors}
                onChange={(e) =>
                  setAudit({
                    ...audit,
                    auditors: [...e.target.selectedOptions].map((o) => o.value),
                  })
                }
              >
                {auditors.map((a) => (
                  <option key={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Situação">
              <select
                className="field"
                value={audit.status}
                onChange={(e) =>
                  setAudit({
                    ...audit,
                    status: e.target.value as Audit["status"],
                  })
                }
              >
                <option>Programada</option>
                <option>Em andamento</option>
                <option>Finalizada</option>
              </select>
            </Field>
            <Field label="Data final">
              <input
                type="date"
                className="field"
                value={audit.endDate}
                onChange={(e) =>
                  setAudit({ ...audit, endDate: e.target.value })
                }
              />
            </Field>
          </div>
          {audit.answers.map((ans, i) => (
            <div className="card" key={ans.id}>
              <div className="mb-4 flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-afpesp-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <div className="text-xs font-bold uppercase text-afpesp-600">
                    {ans.requirement || "Sem requisito informado"}
                  </div>
                  <div className="font-medium">{ans.question}</div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Classificação">
                  <select
                    className="field"
                    value={ans.classification}
                    onChange={(e) =>
                      update(i, {
                        classification: e.target.value as Classification,
                      })
                    }
                  >
                    {classes.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Evidência fotográfica">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="field"
                    onChange={(e) => photos(i, e.target.files)}
                  />
                </Field>
                <Field label="Evidência / constatação">
                  <textarea
                    className="field min-h-24"
                    value={ans.finding}
                    onChange={(e) => update(i, { finding: e.target.value })}
                  />
                </Field>
                <Field label="Recomendação">
                  <textarea
                    className="field min-h-24"
                    value={ans.recommendation}
                    onChange={(e) =>
                      update(i, { recommendation: e.target.value })
                    }
                  />
                </Field>
              </div>
              {ans.photos.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {ans.photos.map((p, j) => (
                    <div className="relative" key={j}>
                      <img
                        src={p}
                        className="h-28 w-40 rounded-lg object-cover"
                      />
                      <button
                        className="absolute right-1 top-1 rounded-full bg-white p-1 shadow"
                        onClick={() =>
                          update(i, {
                            photos: ans.photos.filter((_, k) => k !== j),
                          })
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
function Cadastros() {
  return (
    <>
      <PageTitle
        title="Cadastros"
        subtitle="Cadastre os locais e auditores disponíveis para seleção."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Locations />
        <CrudAuditors />
      </div>
    </>
  );
}
function Locations() {
  const items = useLiveQuery(() => db.units.toArray(), []) ?? [];
  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("Unidade de Lazer");
  const add = async () => {
    if (name.trim()) {
      await db.units.add({ name: name.trim(), type, active: true });
      setName("");
    }
  };
  return (
    <div className="card">
      <h2 className="mb-4 flex gap-2 font-bold">
        <Building2 />
        Locais
      </h2>
      <select
        className="field mb-2"
        value={type}
        onChange={(e) => setType(e.target.value as LocationType)}
      >
        <option>Unidade de Lazer</option>
        <option>Sede Social</option>
      </select>
      <div className="mb-3 flex gap-2">
        <input
          className="field"
          placeholder="Nome do local"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn-primary px-3" onClick={add}>
          <Plus size={16} />
        </button>
      </div>
      {items.map((x) => (
        <div key={x.id} className="flex justify-between border-t py-2 text-sm">
          <span>
            <b>{x.type}</b> — {x.name}
          </span>
          <button
            className="text-red-600"
            onClick={() => db.units.delete(x.id!)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
function CrudAuditors() {
  const items = useLiveQuery(() => db.auditors.toArray(), []) ?? [];
  const [name, setName] = useState("");
  const add = async () => {
    if (name.trim()) {
      await db.auditors.add({
        name: name.trim(),
        role: "Auditor",
        active: true,
      });
      setName("");
    }
  };
  return (
    <div className="card">
      <h2 className="mb-4 flex gap-2 font-bold">
        <Users />
        Auditores
      </h2>
      <div className="mb-3 flex gap-2">
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn-primary px-3" onClick={add}>
          <Plus size={16} />
        </button>
      </div>
      {items.map((x: Auditor) => (
        <div key={x.id} className="flex justify-between border-t py-2 text-sm">
          <span>{x.name}</span>
          <button
            className="text-red-600"
            onClick={() => db.auditors.delete(x.id!)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
function Backup() {
  const [msg, setMsg] = useState("");
  return (
    <>
      <PageTitle
        title="Backup e restauração"
        subtitle="Exporte cópias dos dados armazenados neste navegador."
      />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="card">
          <Download className="mb-3 text-afpesp-600" />
          <h2 className="font-bold">Exportar backup</h2>
          <p className="my-3 text-sm text-slate-500">
            Inclui locais, auditores, checklists, auditorias, respostas e fotos.
          </p>
          <button className="btn-primary" onClick={exportBackup}>
            Exportar
          </button>
        </div>
        <div className="card">
          <Upload className="mb-3 text-afpesp-600" />
          <h2 className="font-bold">Restaurar backup</h2>
          <p className="my-3 text-sm text-slate-500">
            Substitui os dados atuais pelos dados do arquivo.
          </p>
          <input
            type="file"
            accept="application/json"
            className="field"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f || !confirm("Substituir todos os dados atuais?")) return;
              try {
                await importBackup(f);
                setMsg("Backup restaurado.");
              } catch (err) {
                setMsg((err as Error).message);
              }
            }}
          />
          {msg && <p className="mt-3 text-sm">{msg}</p>}
        </div>
      </div>
    </>
  );
}
export default function App() {
  useEffect(() => {
    seed();
  }, []);
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/auditorias" element={<AuditHub />} />
        <Route path="/auditorias/nova" element={<AuditForm />} />
        <Route path="/auditorias/:id" element={<AuditForm />} />
        <Route path="/cadastros" element={<Cadastros />} />
        <Route path="/backup" element={<Backup />} />
      </Routes>
    </Layout>
  );
}
