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
  Download,
  FileDown,
  LogOut,
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
  DocumentReference,
  LocationType,
  RegisteredDocument,
  Unit,
} from "./types";
import { exportDocx, exportExcel } from "./reports";
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
const documentTypes = [
  "Procedimento Operacional",
  "Instrução de Trabalho",
  "Especificação",
  "MOD G",
  "Legislação",
  "Norma",
] as const;
const today = () => new Date().toISOString().slice(0, 10);
const sessionKey = "AFPESP_AUDITOR_ATUAL";
const loggedAuditor = () => localStorage.getItem(sessionKey) || "";
const formatDate = (value: string) =>
  value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—";
function Layout({
  children,
  user,
  onLogout,
}: {
  children: React.ReactNode;
  user: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const links = [
    [BarChart3, "/", "Dashboard"],
    [ClipboardCheck, "/auditorias", "Auditorias"],
    [Building2, "/cadastros", "Cadastros"],
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
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="font-semibold">{user}</span>
            <button
              className="btn border border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={onLogout}
            >
              <LogOut size={16} /> Encerrar sessão
            </button>
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
function Login({ onLogin }: { onLogin: (name: string) => void }) {
  const auditors =
    useLiveQuery(() => db.auditors.filter((auditor) => auditor.active).toArray(), []) ??
    [];
  const [selected, setSelected] = useState("");
  const [newName, setNewName] = useState("");
  const enter = async () => {
    let name = selected;
    if (!name && newName.trim()) {
      name = newName.trim();
      if (!(await db.auditors.where("name").equals(name).count()))
        await db.auditors.add({ name, role: "Auditor", active: true });
    }
    if (name) onLogin(name);
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-afpesp-700">
            Sistema de Auditorias
          </h1>
          <p className="mt-2 text-slate-500">Auditorias Internas AFPESP</p>
        </div>
        {auditors.length > 0 && (
          <Field label="Auditor cadastrado">
            <select
              className="field"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Selecione seu nome</option>
              {auditors.map((a) => (
                <option key={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
        )}
        <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          <span>
            {auditors.length
              ? "ou cadastre um novo auditor"
              : "primeiro acesso"}
          </span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <Field label="Nome do auditor">
          <input
            className="field"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enter()}
            placeholder="Nome completo"
          />
        </Field>
        <button
          className="btn-primary mt-5 w-full"
          disabled={!selected && !newName.trim()}
          onClick={enter}
        >
          Acessar sistema
        </button>
        <p className="mt-4 text-center text-xs text-slate-400">
          A identificação é armazenada localmente neste navegador.
        </p>
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
  const units =
    useLiveQuery(() => db.units.filter((item) => item.active).toArray(), []) ?? [];
  const nav = useNavigate();
  const [type, setType] = useState<LocationType | "Todos">("Todos");
  const [unit, setUnit] = useState("Todos");
  const [period, setPeriod] = useState("Todas as datas");
  useEffect(() => setUnit("Todos"), [type]);
  const now = new Date();
  const filtered = audits.filter((a) => {
    if (type !== "Todos" && a.locationType !== type) return false;
    if (unit !== "Todos" && a.unit !== unit) return false;
    if (
      period === "Este ano" &&
      !a.startDate.startsWith(String(now.getFullYear()))
    )
      return false;
    if (
      period === "Este mês" &&
      !a.startDate.startsWith(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      )
    )
      return false;
    return true;
  });
  const answeredAudits = filtered.filter((a) => a.status !== "Programada");
  const answers = answeredAudits.flatMap((a) => a.answers).filter((a) => a.classification);
  const counts = classes.map(
    (c) => answers.filter((a) => a.classification === c).length,
  );
  const reqs = [
    ...new Set(
      answers
        .filter((a) => a.classification === "Não Conforme")
        .map((a) => a.requirement),
    ),
  ]
    .filter(Boolean)
    .sort();
  const visibleUnits = units.filter((u) => type === "Todos" || u.type === type);
  return (
    <>
      <PageTitle
        title="Sistema de Auditorias"
        subtitle="Dashboard de Auditorias AFPESP"
      />
      <div className="card mb-5 grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]">
        <Field label="Tipo de local">
          <select
            className="field"
            value={type}
            onChange={(e) => setType(e.target.value as LocationType | "Todos")}
          >
            <option>Todos</option>
            <option>Unidade de Lazer</option>
            <option>Sede Social</option>
          </select>
        </Field>
        <Field label="Local / Setor">
          <select
            className="field"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option>Todos</option>
            {visibleUnits.map((u) => (
              <option key={u.id}>{u.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Período">
          <select
            className="field"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option>Todas as datas</option>
            <option>Este mês</option>
            <option>Este ano</option>
          </select>
        </Field>
        <button className="btn-primary self-end">Atualizar</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <Stat
          title="Auditorias"
          value={String(filtered.length)}
          icon={<ClipboardCheck />}
        />
        <Stat
          title="Finalizadas"
          value={String(
            filtered.filter((a) => a.status === "Finalizada").length,
          )}
          icon={<ArchiveRestore />}
        />
        <Stat
          title="Em andamento"
          value={String(
            filtered.filter((a) => a.status === "Em andamento").length,
          )}
          icon={<Settings />}
        />
        <Stat
          title="Conformidades"
          value={String(counts[0])}
          icon={<ClipboardCheck />}
        />
        <Stat
          title="Não conformidades"
          value={String(counts[1])}
          icon={<ClipboardCheck />}
        />
        <Stat
          title="Oportunidades"
          value={String(counts[2])}
          icon={<ClipboardCheck />}
        />
        <Stat
          title="Riscos"
          value={String(counts[3])}
          icon={<ClipboardCheck />}
        />
        <Stat
          title="Locais auditados"
          value={String(
            new Set(
              filtered
                .filter((a) => a.status === "Finalizada")
                .map((a) => `${a.locationType}|${a.unit}`),
            ).size,
          )}
          icon={<Building2 />}
        />
      </div>
      <div className="my-5 flex flex-wrap gap-3">
        <button className="btn-primary" onClick={() => nav("/auditorias")}>
          <Plus size={16} />
          Nova auditoria
        </button>
        <button className="btn-primary" onClick={() => nav("/auditorias")}>
          <Upload size={16} />
          Importar novo checklist
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-xl font-bold text-afpesp-700">
            Resultado das auditorias
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Distribuição dos resultados no período/filtro selecionado.
          </p>
          <Doughnut
            data={{
              labels: classes,
              datasets: [
                {
                  data: counts,
                  backgroundColor: ["#2e7d32", "#d32f2f", "#ed6c02", "#8e24aa"],
                },
              ],
            }}
            options={{ plugins: { legend: { position: "bottom" } } }}
          />
        </div>
        <div className="card">
          <h2 className="text-xl font-bold text-afpesp-700">
            Não conformidades por requisito
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Quantidade de NC por requisito aplicável.
          </p>
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
                  backgroundColor: "#0867a7",
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
function Dashboard() {
  const audits = useLiveQuery(() => db.audits.toArray(), []) ?? [];
  const answers = audits
    .filter((a) => a.status !== "Programada")
    .flatMap((a) => a.answers)
    .filter((a) => a.classification);
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
  const [type, setType] = useState<LocationType | "Todos">("Todos");
  const [unit, setUnit] = useState("Todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState<Audit["status"] | "Todos">("Todos");
  const units =
    useLiveQuery<Unit[]>(
      () =>
        type !== "Todos"
          ? db.units
              .where("type")
              .equals(type)
              .and((u) => u.active)
              .toArray()
          : db.units.filter((item) => item.active).toArray(),
      [type],
    ) ?? [];
  const audits =
    useLiveQuery<Audit[]>(() => db.audits.toArray(), []) ?? [];
  useEffect(() => setUnit("Todos"), [type]);
  const filtered = audits.filter(
    (a) =>
      (type === "Todos" || a.locationType === type) &&
      (unit === "Todos" || normalize(a.unit).replace(/^ul\s+/, "") === normalize(unit)) &&
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
            onChange={(e) => setType(e.target.value as LocationType | "Todos")}
          >
            <option>Todos</option>
            <option>Unidade de Lazer</option>
            <option>Sede Social</option>
          </select>
        </Field>
        <Field label="Local / Setor">
          <select
            className="field"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option>Todos</option>
            {units.map((u) => (
              <option key={u.id}>{u.name}</option>
            ))}
          </select>
        </Field>
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
      </div>
      <>
        <div className="my-6 flex justify-end">
          <button
            className="btn-primary"
            disabled={type === "Todos" || unit === "Todos"}
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
      <h2 className="mb-3 font-bold">
        {
          {
            Programada: "Programadas",
            "Em andamento": "Em andamento",
            Finalizada: "Finalizadas",
          }[status]
        }
      </h2>
      {audits.length ? (
        audits.map((a) => (
          <button
            key={a.id}
            onClick={() => onOpen(a.id!)}
            className="mb-2 w-full rounded-lg border p-3 text-left hover:bg-slate-50"
          >
            <div className="font-semibold text-afpesp-700">
              {formatDate(a.startDate)}
            </div>
            <div className="text-sm text-slate-500">
              Auditor: {a.auditors.join(", ") || "Não identificado"}
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
  const findKey = (...aliases: string[]) =>
    keys.find((k) => aliases.some((x) => normalize(k).includes(x)));
  const qKey = findKey("questao de auditoria", "questao", "pergunta", "item");
  const rKey = findKey("requisito aplicavel", "requisito", "iso", "clausula");
  const numberKey = findKey("nº", "numero", "n.");
  const processKey = findKey("processo", "assunto");
  if (!qKey)
    throw new Error(
      "Não foi localizada uma coluna de Questão/Pergunta/Item na planilha.",
    );
  return rows
    .map((r, index) => ({
      number: numberKey ? Number(r[numberKey]) || index + 1 : index + 1,
      process: processKey ? String(r[processKey]).trim() : "",
      requirement: rKey ? String(r[rKey]).trim() : "",
      question: String(r[qKey]).trim(),
      documentType: "",
      documentCode: "",
      documentTitle: "",
      documentVersion: "",
      documents: [],
    }))
    .filter((x) => x.question);
}
const answerDocuments = (answer: Answer): DocumentReference[] =>
  answer.documents?.length
    ? answer.documents
    : answer.documentType || answer.documentCode || answer.documentTitle || answer.documentVersion
      ? [{
          type: answer.documentType || "",
          code: answer.documentCode || "",
          title: answer.documentTitle || "",
          version: answer.documentVersion || "",
        }]
      : [];
function AuditForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const auditorAtual = loggedAuditor();
  const locationType =
    (params.get("type") as LocationType) || "Unidade de Lazer";
  const selectedUnit = params.get("unit") || "";
  const checklists =
    useLiveQuery(
      () =>
        db.checklists
          .filter(
            (c) => c.unit === selectedUnit && c.locationType === locationType,
          )
          .sortBy("createdAt"),
      [selectedUnit, locationType],
    ) ?? [];
  const registeredDocuments =
    useLiveQuery(() => db.documents.filter((document) => document.active).toArray(), []) ?? [];
  const [mode, setMode] = useState<"anterior" | "novo">("anterior");
  const [error, setError] = useState("");
  const [audit, setAudit] = useState<Audit>({
    locationType,
    unit: selectedUnit,
    checklistName: "",
    auditors: auditorAtual ? [auditorAtual] : [],
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
        process: q.process,
        requirement: q.requirement,
        question: q.question,
        documentType: q.documentType,
        documentCode: q.documentCode,
        documentTitle: q.documentTitle,
        documentVersion: q.documentVersion,
        documents: q.documents ?? [],
        classification: null,
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
        locationType: audit.locationType,
        unit: audit.unit,
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
  const deleteChecklist = async () => {
    if (!audit.checklistId) return;
    if (!confirm("Excluir este checklist cadastrado? Esta ação não pode ser desfeita.")) return;
    await db.checklists.delete(audit.checklistId);
    setAudit((current) => ({
      ...current,
      checklistId: undefined,
      checklistName: "",
      answers: [],
    }));
  };
  const deleteScheduledAudit = async () => {
    if (!id || audit.status !== "Programada") return;
    if (!confirm("Excluir esta auditoria programada? Esta ação não pode ser desfeita.")) return;
    await db.audits.delete(Number(id));
    nav("/auditorias");
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
            {id && audit.status === "Programada" && (
              <button className="btn border border-red-300 bg-red-50 text-red-700 hover:bg-red-100" onClick={deleteScheduledAudit}>
                <Trash2 size={16} />
                Excluir auditoria
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
            <div className="mt-3 flex gap-2">
              <select
                className="field"
                value={audit.checklistId ?? ""}
                onChange={(e) => {
                  const c = checklists.find((x) => x.id === Number(e.target.value));
                  if (c) fromChecklist(c);
                }}
              >
                <option value="">Selecione um checklist</option>
                {checklists.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn border border-red-300 bg-red-50 px-3 text-red-700 hover:bg-red-100"
                disabled={!audit.checklistId}
                onClick={deleteChecklist}
                title="Excluir checklist selecionado"
              >
                <Trash2 size={17} />
              </button>
            </div>
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
        <div className="mt-6 space-y-6">
          <div className="card grid gap-4 md:grid-cols-3">
            <Field label="Auditor responsável">
              <input
                className="field bg-slate-100"
                readOnly
                value={audit.auditors.join(", ") || auditorAtual}
              />
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
              <div className="mb-5 flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-afpesp-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <div className="font-medium">{ans.question}</div>
                  <div className="mt-2 text-sm font-semibold text-afpesp-700">
                    Requisito: {ans.requirement || "Não informado"}
                  </div>
                  {answerDocuments(ans).length > 0 && (
                    <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                      <div className="mb-1 font-semibold">Documentos aplicáveis:</div>
                      <ul className="space-y-1">
                        {answerDocuments(ans).map((document, documentIndex) => (
                          <li key={`${document.code}-${document.version}-${documentIndex}`} className="flex items-start justify-between gap-3">
                            <span>{documentIndex + 1}. {[document.type, document.code, document.title, document.version && `versão ${document.version}`].filter(Boolean).join(" — ")}</span>
                            <button
                              type="button"
                              className="shrink-0 text-red-600"
                              title="Remover documento desta questão"
                              onClick={() => update(i, { documents: answerDocuments(ans).filter((_, index) => index !== documentIndex) })}
                            >
                              <X size={16} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <DocumentPicker
                    documents={registeredDocuments}
                    onAdd={(document) => {
                      const current = answerDocuments(ans);
                      const exists = current.some((item) =>
                        item.type === document.type &&
                        item.code === document.code &&
                        item.title === document.title &&
                        item.version === document.version,
                      );
                      if (!exists) update(i, { documents: [...current, document] });
                    }}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <span className="label">Classificação</span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {classes.map((classification) => (
                      <button
                        type="button"
                        key={classification}
                        className={`classification-button ${
                          {
                            Conforme: "classification-conforme",
                            "Não Conforme": "classification-nao-conforme",
                            "Oportunidade de Melhoria": "classification-oportunidade",
                            Risco: "classification-risco",
                          }[classification]
                        } ${ans.classification === classification ? "selected" : ""}`}
                        onClick={() => update(i, { classification })}
                      >
                        {classification}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                <Field label="Evidência / constatação">
                  <textarea
                    className="field min-h-24"
                    value={ans.finding}
                    onChange={(e) => update(i, { finding: e.target.value })}
                  />
                </Field>
                </div>
                <div className="md:col-span-2">
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
                <div className="md:col-span-2">
                  <Field label="Fotos / evidências fotográficas">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="field"
                      onChange={(e) => photos(i, e.target.files)}
                    />
                  </Field>
                </div>
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
function DocumentPicker({
  documents,
  onAdd,
}: {
  documents: RegisteredDocument[];
  onAdd: (document: DocumentReference) => void;
}) {
  const [type, setType] = useState("");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const unique = (values: string[]) => [...new Set(values)].filter(Boolean).sort();
  const codes = unique(documents.filter((document) => document.type === type).map((document) => document.code));
  const titles = unique(documents.filter((document) => document.type === type && document.code === code).map((document) => document.title));
  const versions = unique(documents.filter((document) => document.type === type && document.code === code && document.title === title).map((document) => document.version));
  const selected = documents.find((document) =>
    document.type === type &&
    document.code === code &&
    document.title === title &&
    document.version === version,
  );
  return (
    <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3">
      <div className="mb-2 text-sm font-semibold text-slate-700">Adicionar documento aplicável</div>
      {documents.length ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.5fr_.8fr_auto]">
          <select className="field" value={type} onChange={(e) => { setType(e.target.value); setCode(""); setTitle(""); setVersion(""); }}>
            <option value="">Tipo de documento</option>
            {documentTypes.filter((item) => documents.some((document) => document.type === item)).map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="field" value={code} disabled={!type} onChange={(e) => { setCode(e.target.value); setTitle(""); setVersion(""); }}>
            <option value="">Código</option>
            {codes.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="field" value={title} disabled={!code} onChange={(e) => { setTitle(e.target.value); setVersion(""); }}>
            <option value="">Nome do documento</option>
            {titles.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="field" value={version} disabled={!title} onChange={(e) => setVersion(e.target.value)}>
            <option value="">Versão</option>
            {versions.map((item) => <option key={item}>{item}</option>)}
          </select>
          <button
            type="button"
            className="btn-primary px-3"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              onAdd({ type: selected.type, code: selected.code, title: selected.title, version: selected.version });
              setType(""); setCode(""); setTitle(""); setVersion("");
            }}
          >
            <Plus size={16} /> Adicionar
          </button>
        </div>
      ) : (
        <p className="text-sm text-amber-700">Cadastre os documentos na tela Cadastros antes de vinculá-los às questões.</p>
      )}
    </div>
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
        subtitle="Cadastre os locais, auditores e documentos disponíveis para seleção."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Locations />
        <CrudAuditors />
        <div className="lg:col-span-2">
          <DocumentsRegistry />
        </div>
      </div>
    </>
  );
}
function Locations() {
  const items = useLiveQuery(() => db.units.toArray(), []) ?? [];
  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("Unidade de Lazer");
  const [search, setSearch] = useState("");
  const filteredItems = items.filter((item) =>
    item.type === type &&
    (!search.trim() || normalize(item.name).includes(normalize(search))),
  );
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
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <select className="field" value={type} onChange={(e) => setType(e.target.value as LocationType)}>
          <option>Unidade de Lazer</option>
          <option>Sede Social</option>
        </select>
        <input className="field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar local / setor" />
      </div>
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
      {filteredItems.map((x) => (
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
function DocumentsRegistry() {
  const items = useLiveQuery(() => db.documents.toArray(), []) ?? [];
  const [type, setType] = useState<(typeof documentTypes)[number]>("Procedimento Operacional");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const filtered = items
    .filter((document) => document.type === type)
    .filter((document) => !search.trim() || normalize(`${document.code} ${document.title} ${document.version}`).includes(normalize(search)))
    .sort((a, b) => `${a.code} ${a.title} ${a.version}`.localeCompare(`${b.code} ${b.title} ${b.version}`, "pt-BR"));
  const add = async () => {
    if (!code.trim() || !title.trim() || !version.trim()) {
      setMessage("Preencha código, nome do documento e versão.");
      return;
    }
    const record: RegisteredDocument = {
      type,
      code: code.trim(),
      title: title.trim(),
      version: version.trim(),
      active: true,
    };
    const duplicate = items.some((document) =>
      normalize(document.type) === normalize(record.type) &&
      normalize(document.code) === normalize(record.code) &&
      normalize(document.title) === normalize(record.title) &&
      normalize(document.version) === normalize(record.version),
    );
    if (duplicate) {
      setMessage("Este documento e versão já estão cadastrados.");
      return;
    }
    await db.documents.add(record);
    setCode(""); setTitle(""); setVersion(""); setMessage("");
  };
  return (
    <div className="card">
      <h2 className="mb-4 flex items-center gap-2 font-bold">
        <ClipboardCheck /> Documentos
      </h2>
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <Field label="Filtrar por tipo de documento">
          <select className="field" value={type} onChange={(e) => setType(e.target.value as (typeof documentTypes)[number])}>
            {documentTypes.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Localizar documento cadastrado">
          <input className="field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Código, nome ou versão" />
        </Field>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_2fr_.7fr_auto]">
        <Field label="Código do documento">
          <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: SUP 001" />
        </Field>
        <Field label="Nome do documento">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Compras de Serviços e Produtos" />
        </Field>
        <Field label="Versão">
          <input className="field" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Ex.: 012" />
        </Field>
        <button className="btn-primary self-end" onClick={add}><Plus size={16} /> Cadastrar</button>
      </div>
      {message && <p className="mt-3 text-sm text-red-700">{message}</p>}
      <div className="mt-5 overflow-x-auto">
        {filtered.length ? (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr><th className="p-3">Tipo</th><th className="p-3">Código</th><th className="p-3">Nome do documento</th><th className="p-3">Versão</th><th className="w-16 p-3"></th></tr>
            </thead>
            <tbody>
              {filtered.map((document) => (
                <tr key={document.id} className="border-t">
                  <td className="p-3">{document.type}</td><td className="p-3 font-semibold">{document.code}</td><td className="p-3">{document.title}</td><td className="p-3">{document.version}</td>
                  <td className="p-3 text-right"><button className="text-red-600" title="Excluir documento" onClick={() => confirm("Excluir este documento cadastrado?") && db.documents.delete(document.id!)}><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-slate-500">Nenhum documento cadastrado neste tipo.</p>}
      </div>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState(loggedAuditor());
  useEffect(() => {
    seed();
  }, []);
  const login = (name: string) => {
    localStorage.setItem(sessionKey, name);
    setUser(name);
  };
  const logout = () => {
    localStorage.removeItem(sessionKey);
    setUser("");
  };
  if (!user) return <Login onLogin={login} />;
  return (
    <Layout user={user} onLogout={logout}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auditorias" element={<AuditHub />} />
        <Route path="/auditorias/nova" element={<AuditForm />} />
        <Route path="/auditorias/:id" element={<AuditForm />} />
        <Route path="/cadastros" element={<Cadastros />} />
      </Routes>
    </Layout>
  );
}
