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
import type { Plugin } from "chart.js";
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
import { exportDocx } from "./reports";
const valueLabelsPlugin: Plugin = {
  id: "valueLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      meta.data.forEach((element, index) => {
        const value = Number(dataset.data[index] ?? 0);
        if (!value) return;
        const position = element.tooltipPosition(true);
        if (position.x == null || position.y == null) return;
        const isBar = meta.type === "bar";
        ctx.fillStyle = isBar ? "#0b2447" : "#ffffff";
        ctx.fillText(String(value), position.x, isBar ? position.y - 10 : position.y);
      });
    });
    ctx.restore();
  },
};
ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  valueLabelsPlugin,
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
          <div className="ml-auto flex min-w-0 items-center gap-2 text-sm sm:gap-4">
            <span className="max-w-28 truncate font-semibold sm:max-w-none">{user}</span>
            <button
              className="btn border border-white/30 bg-white/10 px-3 text-white hover:bg-white/20"
              onClick={onLogout}
            >
              <LogOut size={16} /> <span className="hidden sm:inline">Encerrar sessão</span>
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
  detail,
  onClick,
  active,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  detail?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const content = (
    <>
      <div className="rounded-xl bg-afpesp-50 p-3 text-afpesp-600">{icon}</div>
      <div className="min-w-0 text-center">
        <div className="text-2xl font-bold">{value}</div>
        <div className="break-words text-sm font-semibold leading-snug text-slate-600">{title}</div>
        {detail && <div className="mt-1 text-xs text-slate-400">{detail}</div>}
      </div>
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`card flex min-h-36 w-full flex-col items-center justify-center gap-3 p-4 text-center transition hover:-translate-y-0.5 hover:border-afpesp-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-afpesp-300 ${active ? "border-afpesp-500 bg-afpesp-50 ring-2 ring-afpesp-100" : ""}`}
    >
      {content}
    </button>
  ) : (
    <div className="card flex min-h-36 flex-col items-center justify-center gap-3 p-4 text-center">{content}</div>
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
  const [selectedResult, setSelectedResult] = useState<Classification | null>(null);
  useEffect(() => setUnit("Todos"), [type]);
  const now = new Date();
  const filtered = audits.filter((a) => {
    if (type !== "Todos" && a.locationType !== type) return false;
    if (
      unit !== "Todos" &&
      normalize(a.unit).replace(/^ul\s+/, "") !== normalize(unit).replace(/^ul\s+/, "")
    ) return false;
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
  const statusCounts = [
    filtered.filter((audit) => audit.status === "Programada").length,
    filtered.filter((audit) => audit.status === "Em andamento").length,
    filtered.filter((audit) => audit.status === "Finalizada").length,
  ];
  const locationCounts = [
    filtered.filter((audit) => audit.locationType === "Sede Social").length,
    filtered.filter((audit) => audit.locationType === "Unidade de Lazer").length,
  ];
  const selectedAnswers = selectedResult
    ? filtered.flatMap((audit) =>
        audit.answers
          .filter((answer) => answer.classification === selectedResult)
          .map((answer) => ({ audit, answer })),
      )
    : [];
  const resultLocations = [...new Set(selectedAnswers.map(({ audit }) => audit.unit))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const resultRequirements = [...new Set(selectedAnswers.map(({ answer }) => answer.requirement || "Não informado"))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return (
    <>
      <PageTitle
        title="Sistema de Auditorias"
        subtitle="Dashboard de Auditorias AFPESP"
      />
      <div className="card mb-5 grid gap-4 p-4 sm:p-5 md:grid-cols-3">
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
      </div>
      <h2 className="mb-3 text-lg font-bold text-slate-800">Visão geral</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Stat
          title="Total de auditorias"
          value={String(filtered.length)}
          icon={<ClipboardCheck />}
          detail="Registros no filtro atual"
          onClick={() => nav("/auditorias")}
        />
        <Stat
          title="Auditoria Finalizada"
          value={String(statusCounts[2])}
          icon={<ArchiveRestore />}
          onClick={() => nav("/auditorias?status=Finalizada")}
        />
        <Stat
          title="Auditoria Programada"
          value={String(statusCounts[0])}
          icon={<ClipboardCheck />}
          onClick={() => nav("/auditorias?status=Programada")}
        />
        <Stat
          title="Auditoria em Andamento"
          value={String(statusCounts[1])}
          icon={<Settings />}
          onClick={() => nav("/auditorias?status=Em%20andamento")}
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
          detail="Somente finalizadas"
          onClick={() => nav("/auditorias?status=Finalizada")}
        />
      </div>
      <h2 className="mb-3 mt-6 text-lg font-bold text-slate-800">Resultados registrados</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          title="Conformidades"
          value={String(counts[0])}
          icon={<ClipboardCheck />}
          onClick={() => setSelectedResult("Conforme")}
          active={selectedResult === "Conforme"}
        />
        <Stat
          title="Não conformidades"
          value={String(counts[1])}
          icon={<ClipboardCheck />}
          onClick={() => setSelectedResult("Não Conforme")}
          active={selectedResult === "Não Conforme"}
        />
        <Stat
          title="Oportunidades"
          value={String(counts[2])}
          icon={<ClipboardCheck />}
          onClick={() => setSelectedResult("Oportunidade de Melhoria")}
          active={selectedResult === "Oportunidade de Melhoria"}
        />
        <Stat
          title="Riscos"
          value={String(counts[3])}
          icon={<ClipboardCheck />}
          onClick={() => setSelectedResult("Risco")}
          active={selectedResult === "Risco"}
        />
      </div>
      {selectedResult && (
        <ResultAnalysis
          classification={selectedResult}
          records={selectedAnswers}
          locations={resultLocations}
          requirements={resultRequirements}
          onClose={() => setSelectedResult(null)}
        />
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-4 sm:p-5">
          <h2 className="text-xl font-bold text-afpesp-700">
            Resultado das auditorias
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Distribuição dos resultados no período/filtro selecionado.
          </p>
          <div className="h-72"><Doughnut
            data={{
              labels: classes,
              datasets: [
                {
                  data: counts,
                  backgroundColor: ["#2563eb", "#e11d48", "#38bdf8", "#f59e0b"],
                  borderWidth: 0,
                  hoverOffset: 8,
                },
              ],
            }}
            options={{ maintainAspectRatio: false, cutout: "68%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true, padding: 18 } } } }}
          /></div>
        </div>
        <div className="card p-4 sm:p-5">
          <h2 className="text-xl font-bold text-afpesp-700">
            Auditorias por tipo de local
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Quantidade de auditorias da Sede Social e das Unidades de Lazer.
          </p>
          <div className="h-72"><Doughnut
            data={{
              labels: ["Sede Social", "Unidade de Lazer"],
              datasets: [{ data: locationCounts, backgroundColor: ["#0b2447", "#38bdf8"], borderWidth: 0, hoverOffset: 8 }],
            }}
            options={{ maintainAspectRatio: false, cutout: "68%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true, padding: 18 } } } }}
          /></div>
        </div>
        <div className="card p-4 sm:p-5">
          <h2 className="text-xl font-bold text-afpesp-700">
            Auditorias por situação
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Programadas, em andamento e finalizadas no filtro selecionado.
          </p>
          <div className="h-72"><Bar
            data={{
              labels: ["Programadas", "Em andamento", "Finalizadas"],
              datasets: [{ label: "Auditorias", data: statusCounts, backgroundColor: ["#3b82f6", "#f59e0b", "#0b2447"], borderRadius: 10, borderSkipped: false, maxBarThickness: 70 }],
            }}
            options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#e2e8f0" } } } }}
          /></div>
        </div>
        <div className="card p-4 sm:p-5">
          <h2 className="text-xl font-bold text-afpesp-700">
            Não conformidades por requisito
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Quantidade de NC por requisito aplicável.
          </p>
          <div className="h-72"><Bar
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
                  backgroundColor: "#245a9b",
                  borderRadius: 10,
                  borderSkipped: false,
                  maxBarThickness: 64,
                },
              ],
            }}
            options={{
              maintainAspectRatio: false,
              scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#e2e8f0" } } },
            }}
          /></div>
        </div>
      </div>
    </>
  );
}
function ResultAnalysis({
  classification,
  records,
  locations,
  requirements,
  onClose,
}: {
  classification: Classification;
  records: { audit: Audit; answer: Answer }[];
  locations: string[];
  requirements: string[];
  onClose: () => void;
}) {
  const color = {
    Conforme: "#2563eb",
    "Não Conforme": "#e11d48",
    "Oportunidade de Melhoria": "#38bdf8",
    Risco: "#f59e0b",
  }[classification];
  return (
    <section className="card my-6 border-afpesp-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-afpesp-800">Análise — {classification}</h2>
          <p className="mt-1 text-sm text-slate-500">{records.length} registro(s) conforme os filtros do dashboard.</p>
        </div>
        <button className="btn-secondary" onClick={onClose}><X size={16} /> Fechar análise</button>
      </div>
      {records.length ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-bold text-slate-800">Distribuição por local</h3>
            <p className="mb-3 text-sm text-slate-500">Quantidade de registros em cada local ou setor.</p>
            <div className="h-72"><Bar
              data={{
                labels: locations,
                datasets: [{
                  label: classification,
                  data: locations.map((location) => records.filter(({ audit }) => audit.unit === location).length),
                  backgroundColor: color,
                  borderRadius: 10,
                  borderSkipped: false,
                  maxBarThickness: 58,
                }],
              }}
              options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#e2e8f0" } } } }}
            /></div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-bold text-slate-800">Consolidação por requisito</h3>
            <p className="mb-3 text-sm text-slate-500">Quantidade agrupada pelo requisito aplicável.</p>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {requirements.map((requirement) => {
                const total = records.filter(({ answer }) => (answer.requirement || "Não informado") === requirement).length;
                return (
                  <div key={requirement} className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
                    <span className="min-w-0 break-words text-sm font-medium text-slate-700">{requirement}</span>
                    <span className="shrink-0 rounded-full bg-afpesp-100 px-2.5 py-1 text-xs font-bold text-afpesp-800">{total}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 lg:col-span-2">
            <h3 className="font-bold text-slate-800">Todos os registros</h3>
            <p className="mb-3 text-sm text-slate-500">Questões classificadas como {classification}.</p>
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {records.map(({ audit, answer }, index) => (
                <article key={`${audit.id}-${answer.id}-${index}`} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-bold text-afpesp-800">{audit.locationType} — {audit.unit}</span>
                    <span className="text-sm text-slate-500">{formatDate(audit.startDate)}</span>
                  </div>
                  <p className="mt-2 break-words text-sm text-slate-700">{answer.question}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-500">Requisito: {answer.requirement || "Não informado"}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Nenhum registro desta classificação no filtro selecionado.</p>
      )}
    </section>
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
function downloadAuditChecklistExcel(audit: Audit) {
  const rows = audit.answers.map((answer, index) => ({
    "Nº": index + 1,
    "Tipo de local": audit.locationType,
    "Local / Setor": audit.unit,
    "Data da auditoria": formatDate(audit.startDate),
    Auditor: audit.auditors.join(", ") || "Não identificado",
    Processo: answer.process,
    "Questão de auditoria": answer.question,
    "Requisito aplicável": answer.requirement,
    Classificação: answer.classification || "",
    "Evidência / constatação": answer.finding,
    Recomendação: answer.recommendation,
    "Documentos aplicáveis": (answer.documents ?? []).map((document) =>
      [document.type, document.code, document.title, document.version && `versão ${document.version}`].filter(Boolean).join(" — "),
    ).join(" | "),
  }));
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 6 }, { wch: 22 }, { wch: 24 }, { wch: 18 }, { wch: 24 },
    { wch: 30 }, { wch: 80 }, { wch: 22 }, { wch: 24 }, { wch: 55 },
    { wch: 55 }, { wch: 70 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, "Checklist da auditoria");
  const safeUnit = audit.unit.replace(/[^a-zA-Z0-9À-ÿ_-]+/g, "_");
  XLSX.writeFile(workbook, `checklist_${safeUnit}_${audit.startDate}.xlsx`);
}
function AuditHub() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [type, setType] = useState<LocationType | "Todos">("Todos");
  const [unit, setUnit] = useState("Todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const initialStatus = params.get("status");
  const [status, setStatus] = useState<Audit["status"] | "Todos">(
    initialStatus === "Programada" || initialStatus === "Em andamento" || initialStatus === "Finalizada"
      ? initialStatus
      : "Todos",
  );
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
        subtitle="Consulte, abra e gerencie as auditorias pelos filtros abaixo."
      />
      <div className="card grid gap-4 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-5">
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
        <div className="my-5 flex justify-stretch sm:my-6 sm:justify-end">
          <button
            className="btn-primary w-full sm:w-auto"
            disabled={type === "Todos" || unit === "Todos"}
            onClick={() =>
              nav(
                `/auditorias/nova?type=${encodeURIComponent(type)}&unit=${encodeURIComponent(unit)}&mode=novo`,
              )
            }
          >
            <Plus size={16} />
            Importar novo checklist
          </button>
        </div>
        <AuditManagement
          audits={[...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))}
          status={status}
          onOpen={(id) => nav(`/auditorias/${id}`)}
        />
      </>
    </>
  );
}
function AuditManagement({
  audits,
  status,
  onOpen,
}: {
  audits: Audit[];
  status: Audit["status"] | "Todos";
  onOpen: (id: number) => void;
}) {
  const title = status === "Todos"
    ? "Todas as auditorias"
    : status === "Em andamento"
      ? "Auditorias em andamento"
      : status === "Finalizada"
        ? "Auditorias finalizadas"
        : "Auditorias programadas";
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-afpesp-800">{title}</h2>
          <p className="text-sm text-slate-500">Clique no card ou utilize o botão para abrir.</p>
        </div>
        <span className="rounded-full bg-afpesp-50 px-3 py-1 text-sm font-bold text-afpesp-700">{audits.length}</span>
      </div>
      {audits.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {audits.map((a) => (
          <article
            key={a.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(a.id!)}
            onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && onOpen(a.id!)}
            className="min-w-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-afpesp-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-afpesp-300"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="break-words font-bold text-afpesp-800">{a.locationType} — {a.unit}</div>
                <div className="mt-1 break-words text-sm text-slate-500">{a.checklistName || "Checklist não identificado"}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${a.status === "Finalizada" ? "bg-afpesp-50 text-afpesp-700" : a.status === "Em andamento" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                {a.status}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
              <div><dt className="text-xs font-semibold uppercase text-slate-400">Data</dt><dd className="mt-1 font-semibold text-slate-700">{formatDate(a.startDate)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-slate-400">Auditor</dt><dd className="mt-1 break-words text-slate-700">{a.auditors.join(", ") || "Não identificado"}</dd></div>
            </dl>
            <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                className="btn-primary w-full sm:w-auto"
                onClick={(event) => { event.stopPropagation(); onOpen(a.id!); }}
              >
                {a.status === "Finalizada" ? "Abrir auditoria" : a.status === "Em andamento" ? "Continuar auditoria" : "Iniciar auditoria"}
              </button>
              <button
                type="button"
                className="btn-secondary w-full sm:w-auto"
                onClick={(event) => { event.stopPropagation(); downloadAuditChecklistExcel(a); }}
              >
                <FileDown size={16} /> Baixar checklist Excel
              </button>
              {a.status === "Finalizada" && (
                <button
                  type="button"
                  className="btn-secondary w-full sm:w-auto"
                  onClick={(event) => { event.stopPropagation(); exportDocx(a); }}
                >
                  <Download size={16} /> Baixar relatório Word
                </button>
              )}
              {a.status === "Programada" && (
                <button
                  type="button"
                  className="btn w-full bg-red-50 text-red-700 hover:bg-red-100 sm:w-auto"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (confirm("Excluir esta auditoria programada?")) db.audits.delete(a.id!);
                  }}
                >
                  <Trash2 size={16} /> Excluir
                </button>
              )}
            </div>
          </article>
        ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Nenhuma auditoria corresponde aos filtros selecionados.</p>
      )}
    </section>
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
  const requestedChecklistId = Number(params.get("checklistId") || 0);
  const checklists =
    useLiveQuery(
      () =>
        db.checklists
          .filter(
            (c) =>
              normalize(c.unit).replace(/^ul\s+/, "") ===
                normalize(selectedUnit).replace(/^ul\s+/, "") &&
              c.locationType === locationType,
          )
          .sortBy("createdAt"),
      [selectedUnit, locationType],
    ) ?? [];
  const registeredDocuments =
    useLiveQuery(() => db.documents.filter((document) => document.active).toArray(), []) ?? [];
  const [mode, setMode] = useState<"anterior" | "novo">(
    params.get("mode") === "novo" ? "novo" : "anterior",
  );
  const [error, setError] = useState("");
  const [audit, setAudit] = useState<Audit>({
    locationType,
    unit: selectedUnit,
    checklistName: "",
    auditors: auditorAtual ? [auditorAtual] : [],
    startDate: today(),
    endDate: "",
    scope: "",
    objective: "",
    status: "Programada",
    answers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const readOnly = audit.status === "Finalizada";
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
  useEffect(() => {
    if (id || !requestedChecklistId || audit.checklistId || !checklists.length)
      return;
    const selected = checklists.find((item) => item.id === requestedChecklistId);
    if (selected) {
      fromChecklist(selected);
      setMode("anterior");
    }
  }, [id, requestedChecklistId, audit.checklistId, checklists]);
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
  const startAudit = async () => {
    if (!id || audit.status !== "Programada") return;
    const updated: Audit = {
      ...audit,
      status: "Em andamento",
      updatedAt: new Date().toISOString(),
    };
    await db.audits.put({ ...updated, id: Number(id) });
    setAudit(updated);
  };
  const finalizeAudit = async () => {
    if (!id || audit.status !== "Em andamento") return;
    const unanswered = audit.answers.filter((answer) => !answer.classification).length;
    const warning = unanswered
      ? `Existem ${unanswered} questão(ões) sem classificação. Deseja finalizar mesmo assim?`
      : "Finalizar esta auditoria? Após a finalização, o conteúdo ficará protegido contra alterações.";
    if (!confirm(warning)) return;
    const updated: Audit = {
      ...audit,
      status: "Finalizada",
      endDate: today(),
      updatedAt: new Date().toISOString(),
    };
    await db.audits.put({ ...updated, id: Number(id) });
    setAudit(updated);
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
            {id && audit.status === "Finalizada" && (
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
            {id && audit.status === "Programada" && (
              <button className="btn-primary" onClick={startAudit}>
                <ClipboardCheck size={16} />
                Iniciar auditoria
              </button>
            )}
            {id && audit.status === "Em andamento" && (
              <button className="btn bg-blue-600 text-white hover:bg-blue-700" onClick={finalizeAudit}>
                <ClipboardCheck size={16} />
                Finalizar auditoria
              </button>
            )}
            {(!id || audit.status === "Em andamento") && (
            <button className="btn-primary" onClick={save}>
              <Save size={16} />
              Salvar
            </button>
            )}
          </div>
        }
      />
      {!id && (
        <div className="card">
          <div className="grid gap-4">
            <Field label="Data da auditoria">
              <input
                type="date"
                className="field"
                value={audit.startDate}
                onChange={(e) =>
                  setAudit({
                    ...audit,
                    startDate: e.target.value,
                  })
                }
              />
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
      {id && (
        <div className="mt-6 space-y-6">
          <div className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="label">Auditor responsável</span><div className="font-semibold">{audit.auditors.join(", ") || auditorAtual}</div></div>
            <div><span className="label">Status</span><div className="font-semibold text-afpesp-700">{audit.status}</div></div>
            <div><span className="label">Data programada</span><div className="font-semibold">{formatDate(audit.startDate)}</div></div>
            <div><span className="label">Data de finalização</span><div className="font-semibold">{audit.status === "Finalizada" ? formatDate(audit.endDate) : "—"}</div></div>
          </div>
          {audit.status === "Programada" && (
            <div className="card text-center">
              <p className="text-slate-600">A auditoria está programada. Clique em <b>Iniciar auditoria</b> para abrir o checklist e começar o preenchimento.</p>
            </div>
          )}
          {audit.status !== "Programada" && (
          <>
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
                            {!readOnly && <button
                              type="button"
                              className="shrink-0 text-red-600"
                              title="Remover documento desta questão"
                              onClick={() => update(i, { documents: answerDocuments(ans).filter((_, index) => index !== documentIndex) })}
                            >
                              <X size={16} />
                            </button>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!readOnly && <DocumentPicker
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
                  />}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <span className="label">Classificação</span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {classes.map((classification) => (
                      <button
                        type="button"
                        disabled={readOnly}
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
                    readOnly={readOnly}
                    value={ans.finding}
                    onChange={(e) => update(i, { finding: e.target.value })}
                  />
                </Field>
                </div>
                <div className="md:col-span-2">
                <Field label="Recomendação">
                  <textarea
                    className="field min-h-24"
                    readOnly={readOnly}
                    value={ans.recommendation}
                    onChange={(e) =>
                      update(i, { recommendation: e.target.value })
                    }
                  />
                </Field>
                </div>
                {!readOnly && <div className="md:col-span-2">
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
                </div>}
              </div>
              {ans.photos.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {ans.photos.map((p, j) => (
                    <div className="relative" key={j}>
                      <img
                        src={p}
                        className="h-28 w-40 rounded-lg object-cover"
                      />
                      {!readOnly && <button
                        className="absolute right-1 top-1 rounded-full bg-white p-1 shadow"
                        onClick={() =>
                          update(i, {
                            photos: ans.photos.filter((_, k) => k !== j),
                          })
                        }
                      >
                        <X size={14} />
                      </button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          </>
          )}
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
  const [documentId, setDocumentId] = useState("");
  const available = documents
    .filter((document) => document.type === type)
    .sort((a, b) => `${a.code} ${a.title} ${a.version}`.localeCompare(`${b.code} ${b.title} ${b.version}`, "pt-BR"));
  const selected = documents.find((document) => document.id === Number(documentId));
  return (
    <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3">
      <div className="mb-2 text-sm font-semibold text-slate-700">Adicionar documento aplicável</div>
      {documents.length ? (
        <div className="grid gap-2 md:grid-cols-[1fr_2.5fr_auto]">
          <select className="field" value={type} onChange={(e) => { setType(e.target.value); setDocumentId(""); }}>
            <option value="">Tipo de documento</option>
            {documentTypes.filter((item) => documents.some((document) => document.type === item)).map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="field" value={documentId} disabled={!type} onChange={(e) => setDocumentId(e.target.value)}>
            <option value="">Selecione o documento cadastrado</option>
            {available.map((document) => (
              <option key={document.id} value={document.id}>
                {document.code} — {document.title} — versão {document.version}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary px-3"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              onAdd({ type: selected.type, code: selected.code, title: selected.title, version: selected.version });
              setDocumentId("");
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
      <details className="mt-4 rounded-lg border border-slate-200">
        <summary className="cursor-pointer select-none p-3 text-sm font-semibold text-afpesp-700">
          Consultar locais cadastrados ({filteredItems.length})
        </summary>
        <div className="max-h-80 overflow-y-auto px-3 pb-3">
          {filteredItems.map((x) => (
            <div key={x.id} className="flex justify-between border-t py-2 text-sm">
              <span><b>{x.type}</b> — {x.name}</span>
              <button className="text-red-600" onClick={() => db.units.delete(x.id!)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </details>
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
      <details className="mt-4 rounded-lg border border-slate-200">
        <summary className="cursor-pointer select-none p-3 text-sm font-semibold text-afpesp-700">
          Consultar auditores cadastrados ({items.length})
        </summary>
        <div className="max-h-80 overflow-y-auto px-3 pb-3">
          {items.map((x: Auditor) => (
            <div key={x.id} className="flex justify-between border-t py-2 text-sm">
              <span>{x.name}</span>
              <button className="text-red-600" onClick={() => db.auditors.delete(x.id!)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </details>
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
      <details className="mt-5 rounded-lg border border-slate-200">
        <summary className="cursor-pointer select-none p-3 text-sm font-semibold text-afpesp-700">
          Consultar documentos cadastrados — {type} ({filtered.length})
        </summary>
        <div className="max-h-96 overflow-auto px-3 pb-3">
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
          ) : <p className="py-3 text-sm text-slate-500">Nenhum documento cadastrado neste tipo.</p>}
        </div>
      </details>
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
