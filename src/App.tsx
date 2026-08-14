import { Fragment, useEffect, useState } from "react";
import {
  Routes,
  Route,
  NavLink,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArchiveRestore,
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Download,
  FileDown,
  KeyRound,
  LogOut,
  Monitor,
  Plus,
  Save,
  Settings,
  Smartphone,
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
import type { Session } from "@supabase/supabase-js";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import type {
  Answer,
  AnnualPlanItem,
  Audit,
  AuditSummary,
  Auditor,
  Checklist,
  ChecklistItem,
  Classification,
  DocumentReference,
  LocationType,
  PlanStatus,
  RegisteredDocument,
  Unit,
} from "./types";
import { exportDocx } from "./reports";
import { supabase } from "./supabase";
import {
  createRemoteChecklist, deleteRemoteAudit, deleteRemoteChecklist, getRemoteAudit,
  listRemoteAudits, listRemoteAuditSummaries, listRemoteChecklists, saveRemoteAudit,
} from "./auditRepository";
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
        const isBar = meta.type === "bar";
        if (!value && !isBar) return;
        const position = element.tooltipPosition(true);
        if (position.x == null || position.y == null) return;
        ctx.fillStyle = isBar ? "#0b2447" : "#ffffff";
        const labelY = isBar
          ? value === 0
            ? chart.chartArea.bottom - 12
            : Math.max(position.y - 12, chart.chartArea.top + 12)
          : position.y;
        ctx.fillText(String(value), position.x, labelY);
      });
    });
    ctx.restore();
  },
};

const readableError = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const value = error as { message?: string; details?: string; hint?: string };
    return [value.message, value.details, value.hint].filter(Boolean).join(" — ") || fallback;
  }
  return fallback;
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
  "Manual",
  "Política",
  "Escopo",
  "Organograma",
  "Legislação",
  "Norma",
  "Outros documentos controlados",
] as const;
const today = () => new Date().toISOString().slice(0, 10);
type LayoutMode = "web" | "mobile";
const layoutModeKey = "AFPESP_LAYOUT_MODE";
type UserRole = "admin" | "auditor";
type UserProfile = {
  id: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  must_change_password: boolean;
};
const remoteDataChangedEvent = "afpesp-remote-data-changed";
const notifyRemoteDataChanged = () => window.dispatchEvent(new Event(remoteDataChangedEvent));
function useRemoteData<T>(table: string, mapRow: (row: Record<string, unknown>, index: number) => T) {
  const [items, setItems] = useState<T[]>([]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(remoteDataChangedEvent, refresh);
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener(remoteDataChangedEvent, refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    let active = true;
    supabase
      .from(table)
      .select("*")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error(`Falha ao consultar ${table}:`, error.message);
          setItems([]);
          return;
        }
        setItems((data ?? []).map((row, index) => mapRow(row as Record<string, unknown>, index)));
      });
    return () => { active = false; };
  }, [table, revision]);
  return items;
}
const useRemoteUnits = () => useRemoteData<Unit>("audit_units", (row, index) => ({
  id: index + 1,
  remoteId: String(row.id),
  name: String(row.name),
  type: row.location_type as LocationType,
  active: Boolean(row.active),
}));
const useRemoteAuditors = () => useRemoteData<Auditor>("audit_profiles", (row, index) => ({
  id: index + 1,
  remoteId: String(row.id),
  name: String(row.full_name),
  role: String(row.role),
  active: Boolean(row.active),
}));
const useRemoteDocuments = () => useRemoteData<RegisteredDocument>("audit_documents", (row, index) => ({
  id: index + 1,
  remoteId: String(row.id),
  type: String(row.document_type),
  code: String(row.code),
  title: String(row.title),
  version: String(row.version),
  active: Boolean(row.active),
}));
function useRemoteAuditsData() {
  const [items, setItems] = useState<Audit[]>([]);
  const [revision, setRevision] = useState(0);
  useEffect(() => { const refresh = () => setRevision((value) => value + 1); window.addEventListener(remoteDataChangedEvent, refresh); window.addEventListener("focus", refresh); const interval = window.setInterval(refresh, 60_000); return () => { window.removeEventListener(remoteDataChangedEvent, refresh); window.removeEventListener("focus", refresh); window.clearInterval(interval); }; }, []);
  useEffect(() => { let active = true; listRemoteAudits().then((data) => active && setItems(data)).catch(console.error); return () => { active = false; }; }, [revision]);
  return items;
}
function useRemoteAuditSummariesData() {
  const [items, setItems] = useState<AuditSummary[]>([]);
  const [revision, setRevision] = useState(0);
  useEffect(() => { const refresh = () => setRevision((value) => value + 1); window.addEventListener(remoteDataChangedEvent, refresh); window.addEventListener("focus", refresh); const interval = window.setInterval(refresh, 60_000); return () => { window.removeEventListener(remoteDataChangedEvent, refresh); window.removeEventListener("focus", refresh); window.clearInterval(interval); }; }, []);
  useEffect(() => { let active = true; listRemoteAuditSummaries().then((data) => active && setItems(data)).catch(console.error); return () => { active = false; }; }, [revision]);
  return items;
}
function useRemoteChecklistsData(locationType?: LocationType, unit?: string) {
  const [items, setItems] = useState<Checklist[]>([]);
  const [revision, setRevision] = useState(0);
  useEffect(() => { const refresh = () => setRevision((value) => value + 1); window.addEventListener(remoteDataChangedEvent, refresh); window.addEventListener("focus", refresh); const interval = window.setInterval(refresh, 60_000); return () => { window.removeEventListener(remoteDataChangedEvent, refresh); window.removeEventListener("focus", refresh); window.clearInterval(interval); }; }, []);
  useEffect(() => { let active = true; listRemoteChecklists(locationType, unit).then((data) => active && setItems(data)).catch(console.error); return () => { active = false; }; }, [locationType, unit, revision]);
  return items;
}
const formatDate = (value: string) =>
  value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const evidenceTexts = (answer: Answer) =>
  answer.evidences?.length ? answer.evidences : [answer.recommendation ?? ""];
function Layout({
  children,
  user,
  role,
  mode,
  onLogout,
}: {
  children: React.ReactNode;
  user: string;
  role: UserRole;
  mode: LayoutMode;
  onLogout: () => void;
}) {
  const [pendingPasswordResets, setPendingPasswordResets] = useState(0);
  const [auditNotification, setAuditNotification] = useState<{
    id: string; audit_record_id: string; title: string; message: string;
  } | null>(null);
  const nav = useNavigate();
  const loadNextAuditNotification = async () => {
    const { data, error } = await supabase
      .from("audit_notifications")
      .select("id, audit_record_id, title, message")
      .is("read_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!error) setAuditNotification(data);
  };
  const links = [
    [BarChart3, "/", "Dashboard"],
    [ClipboardCheck, "/auditorias", "Auditorias"],
    [CalendarDays, "/planejamento", "Planejamento"],
    [Building2, "/cadastros", "Cadastros"],
    ...(role === "admin" ? [[Users, "/usuarios", "Usuários"]] as const : []),
  ] as const;
  useEffect(() => {
    if (role !== "admin") return;
    let active = true;
    const refreshPendingRequests = async () => {
      const { data, error } = await supabase.functions.invoke("manage-audit-users", {
        body: { action: "list" },
      });
      if (active && !error) setPendingPasswordResets(data?.passwordResetRequests?.length ?? 0);
    };
    refreshPendingRequests();
    const interval = window.setInterval(refreshPendingRequests, 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [role]);
  useEffect(() => {
    let active = true;
    const refreshNotifications = async () => {
      if (active) await loadNextAuditNotification();
    };
    refreshNotifications();
    const interval = window.setInterval(refreshNotifications, 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  const acknowledgeAuditNotification = async (openAudit: boolean) => {
    if (!auditNotification) return;
    const current = auditNotification;
    await supabase.from("audit_notifications").update({ read_at: new Date().toISOString() }).eq("id", current.id);
    setAuditNotification(null);
    if (openAudit) nav(`/auditorias/${current.audit_record_id}`);
    else await loadNextAuditNotification();
  };
  return (
    <div className="min-h-screen">
      {auditNotification && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="audit-notification-title">
          <div className="card w-full max-w-lg p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-full bg-amber-100 p-2 text-amber-700"><ClipboardCheck size={22} /></div>
              <div>
                <h2 id="audit-notification-title" className="text-lg font-bold text-afpesp-800">{auditNotification.title}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{auditNotification.message}</p>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn-secondary" onClick={() => acknowledgeAuditNotification(false)}>Ciente</button>
              <button className="btn-primary" onClick={() => acknowledgeAuditNotification(true)}>Abrir auditoria</button>
            </div>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b bg-afpesp-700 text-white">
        <div className={`mx-auto flex h-14 items-center px-3 sm:h-16 sm:px-4 ${mode === "mobile" ? "max-w-2xl" : "max-w-7xl"}`}>
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}brasao-afpesp.png`} alt="Brasão AFPESP" className="h-11 w-11 object-contain" />
            <div><div className="font-bold">AFPESP</div>
            <div className="hidden text-xs text-afpesp-100 min-[380px]:block">Auditorias Internas</div></div>
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
      {role === "admin" && pendingPasswordResets > 0 && (
        <div className="border-b border-amber-300 bg-amber-50">
          <div className={`mx-auto flex flex-col gap-2 px-3 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between sm:px-4 ${mode === "mobile" ? "max-w-2xl" : "max-w-7xl"}`}>
            <div className="flex items-center gap-2 font-bold">
              <KeyRound size={18} />
              {pendingPasswordResets === 1
                ? "Há 1 solicitação de redefinição de senha pendente."
                : `Há ${pendingPasswordResets} solicitações de redefinição de senha pendentes.`}
            </div>
            <NavLink to="/usuarios" className="font-bold text-afpesp-700 underline underline-offset-2">Analisar solicitação</NavLink>
          </div>
        </div>
      )}
      <div className={`mx-auto flex ${mode === "mobile" ? "max-w-2xl" : "max-w-7xl"}`}>
        <aside className={`${mode === "mobile" ? "hidden" : "hidden md:block"} min-h-[calc(100vh-4rem)] w-64 shrink-0 border-r bg-white p-4`}>
          {links.map(([Icon, to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-afpesp-50 text-afpesp-700" : "text-slate-600 hover:bg-slate-100"}`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </aside>
        <main className="min-w-0 flex-1 px-3 pb-24 pt-4 sm:px-4 md:p-8">{children}</main>
      </div>
      <nav className={`fixed inset-x-0 bottom-0 z-40 grid-cols-3 border-t border-slate-200 bg-white/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_16px_rgba(15,23,42,.08)] backdrop-blur ${mode === "mobile" ? "grid" : "grid md:hidden"}`}>
        {links.map(([Icon, to, label]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold ${isActive ? "bg-afpesp-50 text-afpesp-700" : "text-slate-500"}`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (mode: LayoutMode) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [layoutMode, setLayoutMode] = useState<LayoutMode | "">("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const enter = async () => {
    if (!email.trim() || !password || !layoutMode) return;
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (error) {
      setMessage("E-mail ou senha inválidos, ou usuário sem acesso ativo.");
      return;
    }
    onLogin(layoutMode);
  };
  const recover = async () => {
    if (!email.trim()) {
      setMessage("Informe seu e-mail para solicitar a redefinição de senha ao administrador.");
      return;
    }
    setLoading(true);
    setMessage("");
    const { data, error } = await supabase.functions.invoke("request-password-reset", {
      body: { email: email.trim().toLowerCase() },
    });
    setLoading(false);
    if (error) {
      setMessage("Não foi possível encaminhar a solicitação agora. Tente novamente mais tarde.");
      return;
    }
    setMessage(data?.message ?? "Se o e-mail estiver cadastrado e ativo, a solicitação será encaminhada ao administrador.");
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="card w-full max-w-md p-5 sm:p-8">
        <div className="mb-6 text-center">
          <img src={`${import.meta.env.BASE_URL}brasao-afpesp.png`} alt="Brasão AFPESP" className="mx-auto mb-3 h-28 w-28 object-contain" />
          <h1 className="text-2xl font-bold text-afpesp-700 sm:text-3xl">
            Sistema de Auditorias
          </h1>
          <p className="mt-2 text-slate-500">Auditorias Internas AFPESP</p>
        </div>
        <Field label="Como deseja utilizar o sistema?">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-sm font-bold transition ${layoutMode === "web" ? "border-afpesp-500 bg-afpesp-50 text-afpesp-800 ring-2 ring-afpesp-100" : "border-slate-200 bg-white text-slate-600 hover:border-afpesp-300"}`}
              onClick={() => setLayoutMode("web")}
            >
              <Monitor size={26} /> Versão Web
            </button>
            <button
              type="button"
              className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-sm font-bold transition ${layoutMode === "mobile" ? "border-afpesp-500 bg-afpesp-50 text-afpesp-800 ring-2 ring-afpesp-100" : "border-slate-200 bg-white text-slate-600 hover:border-afpesp-300"}`}
              onClick={() => setLayoutMode("mobile")}
            >
              <Smartphone size={26} /> Versão Celular
            </button>
          </div>
        </Field>
        <div className="my-5 border-t border-slate-200" />
        <Field label="E-mail">
          <input
            type="email"
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@afpesp.org.br"
            autoComplete="email"
          />
        </Field>
        <div className="mt-4">
        <Field label="Senha">
          <input
            type="password"
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enter()}
            placeholder="Digite sua senha"
            autoComplete="current-password"
          />
        </Field>
        </div>
        {message && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{message}</p>}
        <button
          className="btn-primary mt-5 w-full"
          disabled={loading || !layoutMode || !email.trim() || !password}
          onClick={enter}
        >
          {loading ? "Aguarde..." : "Acessar sistema"}
        </button>
        <button type="button" className="mt-4 w-full text-center text-sm font-semibold text-afpesp-700" onClick={recover} disabled={loading}>
          Solicitar redefinição de senha
        </button>
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
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
      <div>
        <h1 className="break-words text-xl font-bold leading-tight text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="w-full sm:w-auto">{action}</div>}
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
      className={`card flex min-h-28 w-full flex-col items-center justify-center gap-2 p-3 text-center transition hover:-translate-y-0.5 hover:border-afpesp-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-afpesp-300 sm:min-h-36 sm:gap-3 sm:p-4 ${active ? "border-afpesp-500 bg-afpesp-50 ring-2 ring-afpesp-100" : ""}`}
    >
      {content}
    </button>
  ) : (
    <div className="card flex min-h-28 flex-col items-center justify-center gap-2 p-3 text-center sm:min-h-36 sm:gap-3 sm:p-4">{content}</div>
  );
}
function AuditStatusDoughnut({
  title,
  subtitle,
  counts,
}: {
  title: string;
  subtitle: string;
  counts: number[];
}) {
  const labels = ["Finalizadas", "Em andamento", "Programadas"];
  const colors = ["#22c55e", "#facc15", "#38bdf8"];
  return (
    <div className="card p-4 sm:p-5">
      <h2 className="text-xl font-bold text-afpesp-700">{title}</h2>
      <p className="mb-3 text-sm text-slate-500">{subtitle}</p>
      <div className="h-64 sm:h-72">
        <Doughnut
          data={{
            labels,
            datasets: [{ data: counts, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }],
          }}
          options={{
            maintainAspectRatio: false,
            cutout: "68%",
            plugins: { legend: { display: false } },
          }}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {labels.map((label, index) => (
          <div key={label} className="min-w-0 rounded-lg bg-slate-50 p-2 text-center">
            <div className="mx-auto mb-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index] }} />
            <div className="text-lg font-bold text-slate-800">{counts[index]}</div>
            <div className="break-words text-[10px] font-semibold leading-tight text-slate-500 sm:text-xs">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
function splitApplicableRequirements(value: string) {
  const separated = String(value ?? "")
    .replace(/\s+e\s+(?=\d)/gi, ";")
    .split(/[;,|/\n]+/)
    .map((requirement) => requirement.trim())
    .filter(Boolean);
  return [...new Set(separated)];
}
function HomePage() {
  const audits = useRemoteAuditsData();
  const [planItems, setPlanItems] = useState<AnnualPlanItem[]>([]);
  const units = useRemoteUnits().filter((item) => item.active);
  const nav = useNavigate();
  const [type, setType] = useState<LocationType | "Todos">("Todos");
  const [unit, setUnit] = useState("Todos");
  const [period, setPeriod] = useState("Todas as datas");
  const [selectedResult, setSelectedResult] = useState<Classification | null>(null);
  useEffect(() => {
    supabase.from("audit_annual_plan_items").select("id,process,planned_month,planned_year,auditor,status,audit_record_id,notes").eq("planned_year", new Date().getFullYear()).then(({ data }) =>
      setPlanItems((data ?? []).map((row) => ({ id: row.id, process: row.process, month: row.planned_month, year: row.planned_year, auditor: row.auditor, status: row.status as PlanStatus, auditId: row.audit_record_id ?? undefined, notes: row.notes }))),
    );
  }, []);
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
  const filteredPlan = planItems.filter((item) => {
    const isLeisure = /^(ul\s|unidade de lazer)/i.test(item.process.trim());
    if (type === "Unidade de Lazer" && !isLeisure) return false;
    if (type === "Sede Social" && isLeisure) return false;
    if (unit !== "Todos" && !normalize(item.process).includes(normalize(unit).replace(/^ul\s+/, ""))) return false;
    if (period === "Este mês" && item.month !== now.getMonth() + 1) return false;
    return true;
  });
  const planRealized = filteredPlan.filter((item) => item.status === "Realizada no prazo").length;
  const planRealizedLate = filteredPlan.filter((item) => item.status === "Realizada em atraso").length;
  const planReprogrammed = filteredPlan.filter((item) => item.status === "Reprogramada").length;
  const planNotPerformed = filteredPlan.filter((item) => item.status === "Não realizada").length;
  const planEfficacy = filteredPlan.length ? Math.round(planRealized / filteredPlan.length * 1000) / 10 : 0;
  const answers = answeredAudits.flatMap((a) => a.answers).filter((a) => a.classification);
  const counts = classes.map(
    (c) => answers.filter((a) => a.classification === c).length,
  );
  const nonConformityRequirements = answers
    .filter((a) => a.classification === "Não Conforme")
    .flatMap((a) => splitApplicableRequirements(a.requirement));
  const reqs = [...new Set(nonConformityRequirements)]
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const visibleUnits = units.filter((u) => type === "Todos" || u.type === type);
  const statusCounts = [
    filtered.filter((audit) => audit.status === "Programada").length,
    filtered.filter((audit) => audit.status === "Em andamento" || audit.status === "Devolvido para ajustes").length,
    filtered.filter((audit) => audit.status === "Finalizada").length,
  ];
  const statusCountsByType = (locationType: LocationType) => [
    filtered.filter((audit) => audit.locationType === locationType && audit.status === "Finalizada").length,
    filtered.filter((audit) => audit.locationType === locationType && (audit.status === "Em andamento" || audit.status === "Devolvido para ajustes")).length,
    filtered.filter((audit) => audit.locationType === locationType && audit.status === "Programada").length,
  ];
  const headOfficeStatusCounts = statusCountsByType("Sede Social");
  const leisureStatusCounts = statusCountsByType("Unidade de Lazer");
  const selectedAnswers = selectedResult
    ? filtered.flatMap((audit) =>
        audit.answers
          .filter((answer) => answer.classification === selectedResult)
          .map((answer) => ({ audit, answer })),
      )
    : [];
  const resultLocations = [...new Set(selectedAnswers.map(({ audit }) => audit.unit))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const resultRequirements = [...new Set(
    selectedAnswers.flatMap(({ answer }) => {
      const separated = splitApplicableRequirements(answer.requirement);
      return separated.length ? separated : ["Não informado"];
    }),
  )].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
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
      <h2 className="mb-1 text-lg font-bold text-slate-800">Visão geral do planejamento</h2>
      <p className="mb-3 text-sm text-slate-500">Os mesmos dados do Planejamento Anual, considerando os filtros selecionados.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <Stat
          title="Total planejado"
          value={String(filteredPlan.length)}
          icon={<ClipboardCheck />}
          detail="Itens do plano anual"
          onClick={() => nav("/planejamento?status=Todos")}
        />
        <Stat
          title="Realizadas no prazo"
          value={String(planRealized)}
          icon={<ArchiveRestore />}
          onClick={() => nav("/planejamento?status=Realizada%20no%20prazo")}
        />
        <Stat
          title="Planejadas pendentes"
          value={String(filteredPlan.filter((item) => item.status === "Planejada").length)}
          icon={<ClipboardCheck />}
          onClick={() => nav("/planejamento?status=Planejada")}
        />
        <Stat
          title="Realizadas em atraso"
          value={String(planRealizedLate)}
          icon={<CalendarDays />}
          onClick={() => nav("/planejamento?status=Realizada%20em%20atraso")}
        />
        <Stat
          title="Reprogramadas"
          value={String(planReprogrammed)}
          icon={<Settings />}
          onClick={() => nav("/planejamento?status=Reprogramada")}
        />
        <Stat
          title="Não realizadas"
          value={String(planNotPerformed)}
          icon={<CalendarDays />}
          onClick={() => nav("/planejamento?status=N%C3%A3o%20realizada")}
        />
        <Stat
          title="Eficácia do plano"
          value={`${planEfficacy}%`}
          icon={<BarChart3 />}
          detail="Realizadas no prazo ÷ planejadas"
          onClick={() => nav("/planejamento?status=Todos")}
        />
      </div>
      <h2 className="mb-1 mt-6 text-lg font-bold text-slate-800">Resultados das auditorias cadastradas</h2>
      <p className="mb-3 text-sm text-slate-500">Dados de execução, respostas e classificações efetivamente registradas no sistema.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                  backgroundColor: ["#22c55e", "#ef4444", "#38bdf8", "#facc15"],
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
            Auditorias por situação
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Programadas, em andamento e finalizadas no filtro selecionado.
          </p>
          <div className="h-72"><Bar
            data={{
              labels: ["Programadas", "Em andamento", "Finalizadas"],
              datasets: [{
                label: "Auditorias",
                data: statusCounts,
                backgroundColor: ["#38bdf8", "#facc15", "#22c55e"],
                borderRadius: 10,
                borderSkipped: false,
                categoryPercentage: 0.72,
                barPercentage: 0.68,
                maxBarThickness: 58,
              }],
            }}
            options={{
              maintainAspectRatio: false,
              layout: { padding: { top: 18, right: 4, left: 4 } },
              plugins: { legend: { display: false }, tooltip: { enabled: true } },
              scales: {
                x: {
                  offset: true,
                  grid: { display: false },
                  ticks: { autoSkip: false, maxRotation: 0, minRotation: 0, padding: 8, font: { size: 11 } },
                },
                y: {
                  beginAtZero: true,
                  suggestedMax: Math.max(1, ...statusCounts) + 1,
                  ticks: { precision: 0, stepSize: 1 },
                  grid: { color: "#e2e8f0" },
                },
              },
            }}
          /></div>
        </div>
        <AuditStatusDoughnut
          title="Auditorias — Unidades de Lazer"
          subtitle="Situação das auditorias das Unidades de Lazer."
          counts={leisureStatusCounts}
        />
        <AuditStatusDoughnut
          title="Auditorias — Sede Social"
          subtitle="Situação das auditorias dos setores da Sede Social."
          counts={headOfficeStatusCounts}
        />
        <div className="card p-4 sm:p-5 lg:col-span-2">
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
                    (r) => nonConformityRequirements.filter((requirement) => requirement === r).length,
                  ),
                  backgroundColor: "#ef4444",
                  borderRadius: 10,
                  borderSkipped: false,
                  categoryPercentage: 0.58,
                  barPercentage: 0.48,
                  maxBarThickness: 28,
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
    Conforme: "#22c55e",
    "Não Conforme": "#ef4444",
    "Oportunidade de Melhoria": "#38bdf8",
    Risco: "#facc15",
  }[classification];
  const requirementOccurrences = records.flatMap(({ answer }) => {
    const separated = splitApplicableRequirements(answer.requirement);
    return separated.length ? separated : ["Não informado"];
  });
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
            <p className="mb-3 text-sm text-slate-500">Cada requisito aplicável é apresentado separadamente.</p>
            <div className="overflow-x-auto pb-2">
              <div className="h-72" style={{ minWidth: `${Math.max(520, requirements.length * 54)}px` }}>
                <Bar
                  data={{
                    labels: requirements,
                    datasets: [{
                      label: classification,
                      data: requirements.map((requirement) =>
                        requirementOccurrences.filter((item) => item === requirement).length,
                      ),
                      backgroundColor: color,
                      borderRadius: 6,
                      borderSkipped: false,
                      categoryPercentage: 0.55,
                      barPercentage: 0.45,
                      maxBarThickness: 24,
                    }],
                  }}
                  options={{
                    maintainAspectRatio: false,
                    layout: { padding: { top: 18, left: 4, right: 4 } },
                    plugins: { legend: { display: false }, tooltip: { enabled: true } },
                    scales: {
                      x: {
                        offset: true,
                        grid: { display: false },
                        ticks: { autoSkip: false, maxRotation: 0, minRotation: 0, padding: 8, font: { size: 10 } },
                      },
                      y: {
                        beginAtZero: true,
                        suggestedMax: Math.max(
                          1,
                          ...requirements.map((requirement) =>
                            requirementOccurrences.filter((item) => item === requirement).length,
                          ),
                        ) + 1,
                        ticks: { precision: 0, stepSize: 1 },
                        grid: { color: "#e2e8f0" },
                      },
                    },
                  }}
                />
              </div>
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
  const audits = useRemoteAuditsData();
  const answers = audits
    .filter((a) => a.status !== "Programada")
    .flatMap((a) => a.answers)
    .filter((a) => a.classification);
  const counts = classes.map(
    (c) => answers.filter((a) => a.classification === c).length,
  );
  const nonConformityRequirements = answers
    .filter((a) => a.classification === "Não Conforme")
    .flatMap((a) => splitApplicableRequirements(a.requirement));
  const reqs = [...new Set(nonConformityRequirements)]
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
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
                    (r) => nonConformityRequirements.filter((requirement) => requirement === r).length,
                  ),
                  backgroundColor: "#dc2626",
                  borderRadius: 6,
                  borderSkipped: false,
                  categoryPercentage: 0.58,
                  barPercentage: 0.48,
                  maxBarThickness: 28,
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
    "Data inicial": formatDate(audit.startDate),
    "Data final": formatDate(audit.endDate),
    Auditor: audit.auditors.join(", ") || "Não identificado",
    Processo: answer.process,
    "Questão de auditoria": answer.question,
    "Requisito aplicável": answer.requirement,
    Classificação: answer.classification || "",
    Descrição: answer.finding,
    Evidências: evidenceTexts(answer).join("\n"),
    "Documentos aplicáveis": (answer.documents ?? []).map((document) =>
      [document.type, document.code, document.title, document.version && `versão ${document.version}`].filter(Boolean).join(" — "),
    ).join(" | "),
  }));
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 6 }, { wch: 22 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 24 },
    { wch: 30 }, { wch: 80 }, { wch: 22 }, { wch: 24 }, { wch: 55 },
    { wch: 55 }, { wch: 70 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, "Checklist da auditoria");
  const safeUnit = audit.unit.replace(/[^a-zA-Z0-9À-ÿ_-]+/g, "_");
  XLSX.writeFile(workbook, `checklist_${safeUnit}_${audit.startDate}.xlsx`);
}
function AuditHub({ isAdmin, currentUserName }: { isAdmin: boolean; currentUserName: string }) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [type, setType] = useState<LocationType | "Todos">("Todos");
  const [unit, setUnit] = useState("Todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [auditorFilter, setAuditorFilter] = useState("Todos");
  const initialStatus = params.get("status");
  const [status, setStatus] = useState<Audit["status"] | "Todos">(
    initialStatus === "Programada" || initialStatus === "Em andamento" || initialStatus === "Finalizada e aguardando aprovação" || initialStatus === "Devolvido para ajustes" || initialStatus === "Finalizada"
      ? initialStatus
      : "Todos",
  );
  const units = useRemoteUnits().filter((item) => item.active && (type === "Todos" || item.type === type));
  const audits = useRemoteAuditSummariesData();
  const auditors = useRemoteAuditors().filter((auditor) => auditor.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  useEffect(() => setUnit("Todos"), [type]);
  const filtered = audits.filter(
    (a) =>
      (type === "Todos" || a.locationType === type) &&
      (unit === "Todos" || normalize(a.unit).replace(/^ul\s+/, "") === normalize(unit)) &&
      (!dateFrom || a.startDate >= dateFrom) &&
      (!dateTo || a.startDate <= dateTo) &&
      (auditorFilter === "Todos" || a.auditors.includes(auditorFilter)) &&
      (status === "Todos" || a.status === status),
  );
  return (
    <>
      <PageTitle
        title="Auditorias"
        subtitle="Consulte, abra e gerencie as auditorias pelos filtros abaixo."
      />
      <div className="card grid gap-4 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-6">
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
            <option>Finalizada e aguardando aprovação</option>
            <option>Devolvido para ajustes</option>
            <option>Finalizada</option>
          </select>
        </Field>
        <Field label="Auditor responsável">
          <select className="field" value={auditorFilter} onChange={(e) => setAuditorFilter(e.target.value)}>
            <option>Todos</option>
            {auditors.map((auditor) => <option key={auditor.id}>{auditor.name}</option>)}
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
            Nova auditoria
          </button>
        </div>
        <AuditManagement
          audits={[...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))}
          onOpen={(id) => nav(`/auditorias/${id}`)}
          onStart={async (audit) => {
            if (!audit.id || audit.status !== "Programada") return;
            const fullAudit = await getRemoteAudit(String(audit.id));
            const updated: Audit = {
              ...fullAudit,
              status: "Em andamento",
              updatedAt: new Date().toISOString(),
            };
            await saveRemoteAudit(updated);
            notifyRemoteDataChanged();
            nav(`/auditorias/${audit.id}`);
          }}
          isAdmin={isAdmin}
          currentUserName={currentUserName}
        />
      </>
    </>
  );
}
function AuditManagement({
  audits,
  onOpen,
  onStart,
  isAdmin,
  currentUserName,
}: {
  audits: AuditSummary[];
  onOpen: (id: number | string) => void;
  onStart: (audit: AuditSummary) => Promise<void>;
  isAdmin: boolean;
  currentUserName: string;
}) {
  const [expandedId, setExpandedId] = useState<number | string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(audits.length / pageSize));
  const auditListKey = audits.map((audit) => audit.id).join("|");
  const pageAudits = audits.slice((page - 1) * pageSize, page * pageSize);
  const canManageAudit = (audit: AuditSummary) =>
    isAdmin || audit.auditors.some((auditor) => normalize(auditor) === normalize(currentUserName));
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [auditListKey]);
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-afpesp-800">Listagem de auditorias</h2>
          <p className="text-sm text-slate-500">Selecione uma auditoria para consultar as opções.</p>
        </div>
        <span className="rounded-full bg-afpesp-50 px-3 py-1 text-sm font-bold text-afpesp-700">{audits.length}</span>
      </div>
      {audits.length ? (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
        <div className="hidden bg-slate-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 sm:grid sm:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4">
          <span>Local</span>
          <span>Responsável</span>
          <span>Data</span>
          <span>Status</span>
        </div>
        {pageAudits.map((a) => (
          <article key={a.id} className="bg-white">
            <button
              type="button"
              className="grid w-full min-w-0 gap-2 p-3 text-left transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4 sm:p-4"
              onClick={() => setExpandedId(expandedId === a.id ? null : a.id!)}
              aria-expanded={expandedId === a.id}
            >
              <div className="min-w-0">
                <div className="break-words font-bold text-afpesp-800">{a.locationType} — {a.unit}</div>
                <div className="truncate text-sm text-slate-500">{a.checklistName || "Checklist não identificado"}</div>
              </div>
              <div className="text-sm text-slate-600"><span className="sm:hidden">Auditor: </span>{a.auditors.join(", ") || "Não identificado"}</div>
              <div className="text-sm font-semibold text-slate-700">
                {formatDate(a.startDate)}{a.endDate ? ` a ${formatDate(a.endDate)}` : ""}
              </div>
              <span className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${a.status === "Finalizada" ? "bg-green-50 text-green-700" : a.status === "Finalizada e aguardando aprovação" ? "bg-purple-50 text-purple-700" : a.status === "Devolvido para ajustes" ? "bg-red-50 text-red-700" : a.status === "Em andamento" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                {a.status}
              </span>
            </button>
            {expandedId === a.id && (
            <div className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4">
              <div className="mb-3 grid gap-2 text-sm sm:grid-cols-3">
                <div><span className="font-semibold text-slate-500">Local:</span> {a.unit}</div>
                <div><span className="font-semibold text-slate-500">Auditor:</span> {a.auditors.join(", ") || "Não identificado"}</div>
                <div><span className="font-semibold text-slate-500">Situação:</span> {a.status}</div>
              </div>
              <div className="grid gap-2 sm:flex sm:flex-wrap">
              {a.status === "Programada" && canManageAudit(a) && (
                <button
                  type="button"
                  className="btn bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (confirm("Iniciar esta auditoria agora?"))
                      onStart(a).catch((error) => alert(error.message));
                  }}
                >
                  <ClipboardCheck size={16} /> Iniciar auditoria
                </button>
              )}
              {canManageAudit(a) ? <button
                type="button"
                className="btn-primary w-full sm:w-auto"
                onClick={(event) => { event.stopPropagation(); onOpen(a.id!); }}
              >
                {a.status === "Finalizada e aguardando aprovação" && isAdmin
                  ? "Analisar auditoria"
                  : a.status === "Finalizada"
                    ? isAdmin ? "Consultar ou reabrir auditoria" : "Abrir auditoria"
                    : a.status === "Em andamento" || a.status === "Devolvido para ajustes"
                      ? "Continuar auditoria"
                      : "Editar programação"}
              </button> : <span className="rounded-lg bg-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-600">Somente responsáveis podem abrir</span>}
              {canManageAudit(a) && <button
                type="button"
                className="btn-secondary w-full sm:w-auto"
                onClick={async (event) => { event.stopPropagation(); downloadAuditChecklistExcel(await getRemoteAudit(String(a.id))); }}
              >
                <FileDown size={16} /> Baixar checklist Excel
              </button>}
              {a.status === "Finalizada" && canManageAudit(a) && (
                <button
                  type="button"
                  className="btn-secondary w-full sm:w-auto"
                  onClick={async (event) => { event.stopPropagation(); exportDocx(await getRemoteAudit(String(a.id))); }}
                >
                  <Download size={16} /> Baixar relatório Word
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  className="btn w-full bg-red-50 text-red-700 hover:bg-red-100 sm:w-auto"
                  onClick={(event) => {
                    event.stopPropagation();
                    const message = a.status === "Finalizada"
                      ? "Excluir definitivamente esta auditoria finalizada? Esta ação não pode ser desfeita."
                      : `Excluir esta auditoria ${a.status.toLowerCase()}? Esta ação não pode ser desfeita.`;
                    if (confirm(message) && typeof a.id === "string")
                      deleteRemoteAudit(a.id).then(notifyRemoteDataChanged).catch((error) => alert(error.message));
                  }}
                >
                  <Trash2 size={16} /> Excluir
                </button>
              )}
              </div>
            </div>
            )}
          </article>
        ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Nenhuma auditoria corresponde aos filtros selecionados.</p>
      )}
      {audits.length > pageSize && (
        <nav className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row" aria-label="Paginação da listagem de auditorias">
          <p className="text-sm text-slate-500">
            Exibindo {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, audits.length)} de {audits.length} auditorias
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary px-3 py-2 text-sm"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Anterior
            </button>
            <span className="min-w-24 text-center text-sm font-semibold text-slate-700">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              className="btn-secondary px-3 py-2 text-sm"
              disabled={page === totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Próxima
            </button>
          </div>
        </nav>
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
type MasterDocumentImportRow = {
  document_type: (typeof documentTypes)[number];
  code: string;
  normalized_code: string;
  title: string;
  version: string;
  source_status: "Ativo" | "Inativo" | "Em elaboração";
};
const normalizeDocumentCode = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "");
const formatMasterVersion = (value: unknown) => {
  const text = String(value ?? "").trim().replace(/\.0$/, "");
  return /^\d+$/.test(text) ? text.padStart(3, "0") : text;
};
const masterStatus = (value: unknown): MasterDocumentImportRow["source_status"] | null => {
  const status = normalize(String(value ?? ""));
  if (status === "ativo") return "Ativo";
  if (status === "inativo") return "Inativo";
  if (status === "em elaboracao") return "Em elaboração";
  return null;
};
const documentTypeFromCode = (code: string): MasterDocumentImportRow["document_type"] => {
  const normalized = normalizeDocumentCode(code);
  if (normalized.startsWith("PO")) return "Procedimento Operacional";
  if (normalized.startsWith("IT")) return "Instrução de Trabalho";
  if (normalized.startsWith("ESP")) return "Especificação";
  if (/^(MGP|MBP|MCR|MCTR|MMA|MQ|MI|MGPS)/.test(normalized)) return "Manual";
  if (normalized.startsWith("POLITICA")) return "Política";
  if (normalized.startsWith("ESCOPO")) return "Escopo";
  if (normalized.startsWith("ORG")) return "Organograma";
  return "Outros documentos controlados";
};
async function readMasterDocumentList(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const documentSheet = workbook.Sheets["Documentos"];
  const formSheet = workbook.Sheets["Formulários"];
  if (!documentSheet || !formSheet)
    throw new Error("A planilha precisa conter as abas Documentos e Formulários.");
  const collected: MasterDocumentImportRow[] = [];
  let sourceRows = 0;
  let skipped = 0;
  const documentRows = XLSX.utils.sheet_to_json<unknown[]>(documentSheet, { header: 1, defval: "", raw: true });
  for (const row of documentRows.slice(2)) {
    if (!row[0]) continue;
    sourceRows += 1;
    const status = masterStatus(row[4]);
    const code = String(row[0]).trim();
    const title = String(row[1] ?? "").trim();
    const version = formatMasterVersion(row[2]);
    if (!status || !code || !title || !version) { skipped += 1; continue; }
    collected.push({
      document_type: documentTypeFromCode(code),
      code,
      normalized_code: normalizeDocumentCode(code),
      title,
      version,
      source_status: status,
    });
  }
  const formRows = XLSX.utils.sheet_to_json<unknown[]>(formSheet, { header: 1, defval: "", raw: true });
  for (const row of formRows.slice(2)) {
    if (!row[0]) continue;
    sourceRows += 1;
    const status = masterStatus(row[6]);
    const number = String(row[2] ?? "").trim().replace(/\.0$/, "");
    const title = String(row[3] ?? "").trim();
    const version = formatMasterVersion(row[4]);
    const code = `MOD G ${number}`;
    if (!status || !number || !title || !version) { skipped += 1; continue; }
    collected.push({
      document_type: "MOD G",
      code,
      normalized_code: normalizeDocumentCode(code),
      title,
      version,
      source_status: status,
    });
  }
  const priority = { "Ativo": 3, "Em elaboração": 2, "Inativo": 1 } as const;
  const currentByCode = new Map<string, MasterDocumentImportRow>();
  for (const document of collected) {
    const current = currentByCode.get(document.normalized_code);
    const documentVersion = Number(document.version) || 0;
    const currentVersion = Number(current?.version) || 0;
    if (!current || priority[document.source_status] > priority[current.source_status] ||
      (priority[document.source_status] === priority[current.source_status] && documentVersion > currentVersion))
      currentByCode.set(document.normalized_code, document);
  }
  return { documents: [...currentByCode.values()], sourceRows, skipped };
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
  const [auditorAtual, setAuditorAtual] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setProfileLoaded(true);
        return;
      }
      const { data: userProfile } = await supabase
        .from("audit_profiles")
        .select("full_name,role")
        .eq("id", data.user.id)
        .single();
      if (userProfile?.full_name) setAuditorAtual(userProfile.full_name);
      setIsAdmin(userProfile?.role === "admin");
      setProfileLoaded(true);
    });
  }, []);
  const locationType =
    (params.get("type") as LocationType) || "Unidade de Lazer";
  const selectedUnit = params.get("unit") || "";
  const requestedChecklistId = params.get("checklistId") || "";
  const registeredDocuments = useRemoteDocuments().filter((document) => document.active);
  const availableAuditors = useRemoteAuditors().filter((auditor) => auditor.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const [mode, setMode] = useState<"anterior" | "novo">(
    params.get("mode") === "novo" ? "novo" : "anterior",
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [audit, setAudit] = useState<Audit>({
    locationType,
    unit: selectedUnit,
    checklistName: "",
    auditors: [],
    startDate: today(),
    endDate: "",
    scope: "",
    objective: "",
    status: "Programada",
    answers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const checklists = useRemoteChecklistsData(audit.locationType, audit.unit);
  const unselectedAuditors = availableAuditors.filter((auditor) => !audit.auditors.includes(auditor.name));
  const normalizeAuditorName = (name: string) => name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
  const isAssignedAuditor = audit.auditors.some(
    (name) => normalizeAuditorName(name) === normalizeAuditorName(auditorAtual),
  );
  const editableStatus = ["Programada", "Em andamento", "Devolvido para ajustes"].includes(audit.status);
  const canManageAudit = !id || (editableStatus && (isAdmin || isAssignedAuditor));
  const readOnly = !canManageAudit;
  useEffect(() => {
    if (id) getRemoteAudit(id).then(setAudit).catch((error) => setError(error.message));
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
        auditTip: "",
        documentType: q.documentType,
        documentCode: q.documentCode,
        documentTitle: q.documentTitle,
        documentVersion: q.documentVersion,
        documents: q.documents ?? [],
        classification: null,
        finding: "",
        recommendation: "",
        evidences: [""],
        photos: [],
      })),
    }));
  const replaceChecklist = (c: Checklist) => {
    if (String(audit.checklistId ?? "") === String(c.id ?? "")) return;
    if (
      audit.checklistName &&
      audit.answers.length &&
      !confirm("Trocar o checklist substituirá todas as questões atualmente vinculadas a esta auditoria. Deseja continuar?")
    ) return;
    fromChecklist(c);
  };
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
    if (
      audit.checklistName &&
      audit.answers.length &&
      !confirm("Importar um novo checklist substituirá todas as questões atualmente vinculadas a esta auditoria. Deseja continuar?")
    ) return;
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
      const cid = await createRemoteChecklist(checklist);
      fromChecklist({ ...checklist, id: cid });
      notifyRemoteDataChanged();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const deleteChecklist = async () => {
    if (!audit.checklistId) return;
    if (!confirm("Excluir este checklist cadastrado? Esta ação não pode ser desfeita.")) return;
    if (typeof audit.checklistId !== "string") return;
    await deleteRemoteChecklist(audit.checklistId);
    notifyRemoteDataChanged();
    setAudit((current) => ({
      ...current,
      checklistId: undefined,
      checklistName: "",
      answers: [],
    }));
  };
  const deleteEditableAudit = async () => {
    if (!id || audit.status === "Finalizada" || !isAdmin) return;
    if (!confirm(`Excluir esta auditoria ${audit.status.toLowerCase()}? Esta ação não pode ser desfeita.`)) return;
    await deleteRemoteAudit(id);
    notifyRemoteDataChanged();
    nav("/auditorias");
  };
  const save = async () => {
    setSuccess("");
    if (id && !canManageAudit)
      return setError("Somente os auditores responsáveis ou o administrador podem alterar esta auditoria.");
    const missingFields = [
      !audit.auditors.length && "ao menos um auditor responsável",
      !audit.unit && "o local",
      !audit.startDate && "a data de início",
      !audit.endDate && "a data de término",
      !audit.checklistName && "o checklist",
    ].filter(Boolean);
    if (missingFields.length)
      return setError(`Informe ${missingFields.join(", ")}.`);
    if (audit.endDate < audit.startDate)
      return setError("A data de término não pode ser anterior à data de início.");
    if (audit.status === "Em andamento" && audit.answers.some((answer) => !answer.question.trim()))
      return setError("Preencha o texto de todas as questões antes de salvar.");
    setError("");
    try {
      const needsReapproval = Boolean(id && audit.status === "Finalizada" && isAssignedAuditor && !isAdmin);
      const data: Audit = {
        ...audit,
        status: needsReapproval ? "Finalizada e aguardando aprovação" : audit.status,
        approvedAt: needsReapproval ? undefined : audit.approvedAt,
        approvedBy: needsReapproval ? undefined : audit.approvedBy,
        updatedAt: new Date().toISOString(),
      };
      const saved = await saveRemoteAudit({ ...data, id: id || data.id });
      setAudit(data);
      notifyRemoteDataChanged();
      setSuccess(needsReapproval ? "Alterações salvas. A auditoria voltou a aguardar aprovação do administrador." : id ? "Alterações salvas com sucesso." : "Auditoria salva com sucesso.");
      nav(`/auditorias/${saved}`);
    } catch (saveError) {
      setError(readableError(saveError, "Não foi possível salvar a auditoria."));
    }
  };
  const startAudit = async () => {
    if (!id || audit.status !== "Programada") return;
    if (!canManageAudit)
      return setError("Somente os auditores responsáveis ou o administrador podem iniciar esta auditoria.");
    if (!audit.auditors.length || !audit.checklistName || !audit.startDate || !audit.endDate)
      return setError("Complete os auditores, o período e o checklist antes de iniciar a auditoria.");
    if (audit.endDate < audit.startDate)
      return setError("A data de término não pode ser anterior à data de início.");
    const updated: Audit = {
      ...audit,
      status: "Em andamento",
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveRemoteAudit({ ...updated, id });
      const persisted = await getRemoteAudit(id);
      if (persisted.status !== "Em andamento") throw new Error("O banco de dados não confirmou o início da auditoria.");
      notifyRemoteDataChanged();
      setAudit(persisted);
      setError("");
    } catch (startError) {
      setError(readableError(startError, "Não foi possível iniciar a auditoria."));
    }
  };
  const finalizeAudit = async () => {
    if (!id || !["Em andamento", "Devolvido para ajustes"].includes(audit.status)) return;
    if (!canManageAudit)
      return setError("Somente os auditores responsáveis ou o administrador podem finalizar esta auditoria.");
    if (audit.answers.some((answer) => !answer.question.trim()))
      return setError("Preencha o texto de todas as questões antes de finalizar a auditoria.");
    const unanswered = audit.answers.filter((answer) => !answer.classification).length;
    const warning = unanswered
      ? `Existem ${unanswered} questão(ões) sem classificação. Deseja enviar para aprovação mesmo assim?`
      : "Enviar esta auditoria para análise e aprovação do administrador?";
    if (!confirm(warning)) return;
    const updated: Audit = {
      ...audit,
      status: "Finalizada e aguardando aprovação",
      submittedAt: new Date().toISOString(),
      submittedBy: auditorAtual,
      approvedAt: undefined,
      approvedBy: undefined,
      returnedAt: undefined,
      returnedBy: undefined,
      returnReason: undefined,
      updatedAt: new Date().toISOString(),
    };
    await saveRemoteAudit({ ...updated, id });
    notifyRemoteDataChanged();
    setAudit(updated);
  };
  const approveAudit = async () => {
    if (!id || !isAdmin || audit.status !== "Finalizada e aguardando aprovação") return;
    if (!confirm("Aprovar e finalizar definitivamente esta auditoria?")) return;
    const updated: Audit = { ...audit, status: "Finalizada", approvedAt: new Date().toISOString(), approvedBy: auditorAtual, updatedAt: new Date().toISOString() };
    await saveRemoteAudit({ ...updated, id });
    notifyRemoteDataChanged();
    setAudit(updated);
    setSuccess("Auditoria aprovada e finalizada.");
  };
  const openReturnDialog = () => {
    if (!id || !isAdmin || !["Finalizada e aguardando aprovação", "Finalizada"].includes(audit.status)) return;
    setError("");
    setReturnReason("");
    setReturnDialogOpen(true);
  };
  const confirmReturnForAdjustments = async () => {
    if (!id || !isAdmin || !returnReason.trim()) {
      return setError("Informe o motivo da devolução para orientar os auditores responsáveis.");
    }
    setError("");
    setSuccess("");
    try {
      const updated: Audit = { ...audit, status: "Devolvido para ajustes", approvedAt: undefined, approvedBy: undefined, returnedAt: new Date().toISOString(), returnedBy: auditorAtual, returnReason: returnReason.trim(), updatedAt: new Date().toISOString() };
      await saveRemoteAudit({ ...updated, id });
      const persisted = await getRemoteAudit(id);
      if (persisted.status !== "Devolvido para ajustes" || !persisted.returnedAt) {
        throw new Error("A devolução não foi confirmada pelo banco de dados. Nenhuma mensagem de sucesso foi exibida.");
      }
      notifyRemoteDataChanged();
      setAudit(persisted);
      setReturnDialogOpen(false);
      setReturnReason("");
      setSuccess("Auditoria devolvida para ajustes. Os auditores responsáveis serão avisados no sistema.");
    } catch (returnError) {
      setError(readableError(returnError, "Não foi possível devolver a auditoria para ajustes."));
    }
  };
  const update = (i: number, p: Partial<Answer>) =>
    setAudit((a) => ({
      ...a,
      answers: a.answers.map((x, j) => (j === i ? { ...x, ...p } : x)),
    }));
  const addQuestion = (afterIndex: number) => {
    const newQuestion: Answer = {
      id: crypto.randomUUID(),
      questionId: afterIndex + 1,
      process: "",
      requirement: "",
      question: "",
      auditTip: "",
      documentType: "",
      documentCode: "",
      documentTitle: "",
      documentVersion: "",
      documents: [],
      classification: null,
      finding: "",
      recommendation: "",
      evidences: [""],
      photos: [],
    };
    setAudit((current) => ({
      ...current,
      answers: [
        ...current.answers.slice(0, afterIndex + 1),
        newQuestion,
        ...current.answers.slice(afterIndex + 1),
      ].map((answer, answerIndex) => ({ ...answer, questionId: answerIndex })),
    }));
    setEditingQuestionId(newQuestion.id);
    setError("");
  };
  const deleteQuestion = (index: number) => {
    if (!confirm(`Excluir a questão ${index + 1} desta auditoria? Esta ação será efetivada ao salvar.`)) return;
    setAudit((current) => ({
      ...current,
      answers: current.answers
        .filter((_, answerIndex) => answerIndex !== index)
        .map((answer, answerIndex) => ({ ...answer, questionId: answerIndex })),
    }));
    setEditingQuestionId(null);
    setError("");
  };
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
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
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
            {id && audit.status === "Finalizada" && isAdmin && (
              <button className="btn-secondary" onClick={openReturnDialog}>Reabrir para ajustes</button>
            )}
            {id && audit.status !== "Finalizada" && isAdmin && (
              <button className="btn border border-red-300 bg-red-50 text-red-700 hover:bg-red-100" onClick={deleteEditableAudit}>
                <Trash2 size={16} />
                Excluir auditoria
              </button>
            )}
            {id && audit.status === "Programada" && profileLoaded && canManageAudit && (
              <button className="btn-primary" onClick={startAudit}>
                <ClipboardCheck size={16} />
                Iniciar auditoria
              </button>
            )}
            {id && ["Em andamento", "Devolvido para ajustes"].includes(audit.status) && profileLoaded && canManageAudit && (
              <button className="btn bg-blue-600 text-white hover:bg-blue-700" onClick={finalizeAudit}>
                <ClipboardCheck size={16} />
                Enviar para aprovação
              </button>
            )}
            {id && audit.status === "Finalizada e aguardando aprovação" && isAdmin && <>
              <button className="btn-secondary" onClick={openReturnDialog}>Devolver para ajustes</button>
              <button className="btn bg-green-700 text-white hover:bg-green-800" onClick={approveAudit}>Aprovar e finalizar</button>
            </>}
            {canManageAudit && (
            <button className="btn-primary" onClick={save}>
              <Save size={16} />
              Salvar
            </button>
            )}
          </div>
        }
      />
      {(!id || audit.status === "Programada") && (
        <div className="card">
          <div className="grid gap-4">
            <Field label="Auditores responsáveis">
              <select
                className="field"
                disabled={!canManageAudit}
                value=""
                onChange={(event) => {
                  const name = event.target.value;
                  if (name) setAudit((current) => ({ ...current, auditors: [...current.auditors, name] }));
                }}
              >
                <option value="">
                  {unselectedAuditors.length ? "Selecione um auditor para adicionar" : "Todos os auditores disponíveis foram selecionados"}
                </option>
                {unselectedAuditors.map((auditor) => (
                  <option key={auditor.remoteId ?? auditor.id ?? auditor.name} value={auditor.name}>
                    {auditor.name}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex min-h-9 flex-wrap gap-2">
                {audit.auditors.map((name) => (
                  <span key={name} className="inline-flex max-w-full items-center gap-1 rounded-full bg-afpesp-50 px-3 py-1.5 text-sm font-semibold text-afpesp-800">
                    <span className="truncate">{name}</span>
                    <button
                      type="button"
                      disabled={!canManageAudit}
                      className="rounded-full p-0.5 hover:bg-afpesp-100"
                      title={`Remover ${name}`}
                      aria-label={`Remover ${name}`}
                      onClick={() => setAudit((current) => ({
                        ...current,
                        auditors: current.auditors.filter((auditor) => auditor !== name),
                      }))}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
                {!audit.auditors.length && (
                  <span className="text-xs text-slate-500">Nenhum auditor selecionado.</span>
                )}
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Data de início">
                <input
                  type="date"
                  className="field"
                  disabled={!canManageAudit}
                  value={audit.startDate}
                  onChange={(e) => setAudit({ ...audit, startDate: e.target.value })}
                />
              </Field>
              <Field label="Data de término">
                <input
                  type="date"
                  className="field"
                  disabled={!canManageAudit}
                  min={audit.startDate || undefined}
                  value={audit.endDate}
                  onChange={(e) => setAudit({ ...audit, endDate: e.target.value })}
                />
              </Field>
            </div>
          </div>
          <div className="mt-5">
            <span className="label">Checklist</span>
            <div className="grid gap-2 text-sm sm:flex sm:gap-4">
              <label>
                <input
                  type="radio"
                  disabled={!canManageAudit}
                  checked={mode === "anterior"}
                  onChange={() => setMode("anterior")}
                />{" "}
                Usar checklist anterior
              </label>
              <label>
                <input
                  type="radio"
                  disabled={!canManageAudit}
                  checked={mode === "novo"}
                  onChange={() => setMode("novo")}
                />{" "}
                Novo checklist
              </label>
            </div>
          </div>
          {mode === "anterior" ? (
            <div className="mt-3 flex min-w-0 gap-2">
              <select
                className="field"
                disabled={!canManageAudit}
                value={audit.checklistId ?? ""}
                onChange={(e) => {
                  const c = checklists.find((x) => String(x.id) === e.target.value);
                  if (c) replaceChecklist(c);
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
                disabled={!audit.checklistId || !canManageAudit}
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
                disabled={!canManageAudit}
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
      {success && (
        <p className="my-4 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-700">
          {success}
        </p>
      )}
      {id && profileLoaded && audit.status === "Finalizada e aguardando aprovação" && isAdmin && (
        <p className="my-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
          Analise o conteúdo da auditoria e escolha <b>Aprovar e finalizar</b> ou <b>Devolver para ajustes</b>. Para preservar a integridade da análise, os campos permanecem somente para consulta até uma devolução ser confirmada.
        </p>
      )}
      {id && profileLoaded && audit.status === "Finalizada" && isAdmin && (
        <p className="my-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
          Esta auditoria está encerrada. Para alterar seu conteúdo, clique em <b>Reabrir para ajustes</b>, informe o motivo e confirme a reabertura.
        </p>
      )}
      {id && profileLoaded && !canManageAudit && !isAdmin && audit.status !== "Finalizada" && (
        <p className="my-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Esta auditoria está disponível somente para consulta. Apenas os auditores responsáveis ou o administrador podem reprogramar, iniciar ou alterar seu conteúdo.
        </p>
      )}
      {id && (
        <div className="mt-6 space-y-6">
          <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="label">Auditores responsáveis</span><div className="font-semibold">{audit.auditors.join(", ") || auditorAtual}</div></div>
            <div><span className="label">Status</span><div className="font-semibold text-afpesp-700">{audit.status}</div></div>
            <div><span className="label">Data de início</span><div className="font-semibold">{formatDate(audit.startDate)}</div></div>
            <div><span className="label">Data de término</span><div className="font-semibold">{formatDate(audit.endDate)}</div></div>
          </div>
          {audit.status === "Programada" && (
            <div className="card text-center">
              <p className="text-slate-600">A auditoria está programada. Clique em <b>Iniciar auditoria</b> para abrir o checklist e começar o preenchimento.</p>
            </div>
          )}
          {audit.status === "Devolvido para ajustes" && (
            <div className="card border-red-200 bg-red-50">
              <h3 className="font-bold text-red-800">Ajustes solicitados pelo administrador</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-red-700">{audit.returnReason || "Consulte o administrador para verificar os ajustes solicitados."}</p>
              <p className="mt-2 text-xs text-red-600">Após corrigir e salvar, clique em <b>Enviar para aprovação</b>.</p>
            </div>
          )}
          {audit.status !== "Programada" && (
          <>
          {audit.answers.map((ans, i) => (
            <Fragment key={ans.id}>
            <div className="card overflow-hidden">
              <div className="mb-5 flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-afpesp-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-medium leading-relaxed">{ans.question || "Nova questão — preencha o texto"}</div>
                      <div className="mt-2 text-sm font-semibold text-afpesp-700">
                        Requisito: {ans.requirement || "Não informado"}
                      </div>
                    </div>
                    {audit.status !== "Programada" && canManageAudit && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="btn-secondary px-3 text-xs"
                          onClick={() => setEditingQuestionId(editingQuestionId === ans.id ? null : ans.id)}
                        >
                          {editingQuestionId === ans.id ? "Fechar edição" : "Editar questão"}
                        </button>
                        <button
                          type="button"
                          className="btn bg-red-50 px-3 text-xs text-red-700 hover:bg-red-100"
                          onClick={() => deleteQuestion(i)}
                        >
                          <Trash2 size={14} /> Excluir
                        </button>
                      </div>
                    )}
                  </div>
                  {editingQuestionId === ans.id && audit.status !== "Programada" && canManageAudit && (
                    <div className="mt-4 grid gap-3 rounded-xl border border-afpesp-100 bg-afpesp-50/50 p-3 sm:grid-cols-2">
                      <Field label="Processo">
                        <input className="field" value={ans.process} onChange={(event) => update(i, { process: event.target.value })} />
                      </Field>
                      <Field label="Requisito">
                        <input className="field" value={ans.requirement} onChange={(event) => update(i, { requirement: event.target.value })} />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Questão de auditoria">
                          <textarea className="field min-h-24" value={ans.question} onChange={(event) => update(i, { question: event.target.value })} />
                        </Field>
                      </div>
                    </div>
                  )}
                  {answerDocuments(ans).length > 0 && (
                    <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                      <div className="mb-1 font-semibold">Documentos aplicáveis:</div>
                      <ul className="space-y-1">
                        {answerDocuments(ans).map((document, documentIndex) => (
                          <li key={`${document.code}-${document.version}-${documentIndex}`} className="flex min-w-0 items-start justify-between gap-3">
                            <span className="min-w-0 break-words">{documentIndex + 1}. {[document.type, document.code, document.title, document.version && `versão ${document.version}`].filter(Boolean).join(" — ")}</span>
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
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor={`audit-tip-${ans.id}`}>
                      Dicas para a auditoria
                    </label>
                    <textarea
                      id={`audit-tip-${ans.id}`}
                      className="field min-h-16 border-slate-200 bg-white text-sm text-slate-600"
                      readOnly={readOnly}
                      value={ans.auditTip ?? ""}
                      onChange={(event) => update(i, { auditTip: event.target.value })}
                    />
                  </div>
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
                <Field label="Descrição">
                  <textarea
                    className="field min-h-24"
                    readOnly={readOnly}
                    value={ans.finding}
                    onChange={(e) => update(i, { finding: e.target.value })}
                  />
                </Field>
                </div>
                <div className="md:col-span-2 space-y-3">
                  {evidenceTexts(ans).map((evidence, evidenceIndex) => (
                    <div key={`${ans.id}-evidence-${evidenceIndex}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="label mb-0">Evidência {evidenceIndex + 1}</span>
                        {!readOnly && evidenceTexts(ans).length > 1 && <button type="button" className="text-sm font-semibold text-red-600" onClick={() => {
                          const next = evidenceTexts(ans).filter((_, index) => index !== evidenceIndex);
                          update(i, { evidences: next, recommendation: next[0] ?? "" });
                        }}>Excluir evidência</button>}
                      </div>
                      <textarea className="field min-h-24" readOnly={readOnly} value={evidence} onChange={(event) => {
                        const next = evidenceTexts(ans).map((value, index) => index === evidenceIndex ? event.target.value : value);
                        update(i, { evidences: next, recommendation: next[0] ?? "" });
                      }} />
                    </div>
                  ))}
                  {!readOnly && <button type="button" className="btn-secondary" onClick={() => update(i, { evidences: [...evidenceTexts(ans), ""] })}><Plus size={16} /> Adicionar evidência</button>}
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
                <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                  {ans.photos.map((p, j) => (
                    <div className="relative min-w-0" key={j}>
                      <img
                        src={p}
                        className="h-28 w-full rounded-lg object-cover sm:w-40"
                      />
                      {!readOnly && <button
                        className="absolute right-1 top-1 rounded-full bg-white p-1 shadow"
                        onClick={() =>
                          update(i, {
                            photos: ans.photos.filter((_, k) => k !== j),
                            photoPaths: ans.photoPaths?.filter((_, k) => k !== j),
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
            {audit.status !== "Programada" && canManageAudit && (
              <div className="flex items-center gap-3" aria-label={`Inserção após a questão ${i + 1}`}>
                <div className="h-px flex-1 bg-slate-200" />
                <button
                  type="button"
                  className="btn-secondary shrink-0 px-3 py-2 text-xs"
                  onClick={() => addQuestion(i)}
                >
                  <Plus size={14} /> Inserir questão após a questão {i + 1}
                </button>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
            )}
            </Fragment>
          ))}
          {canManageAudit && audit.answers.length === 0 && (
            <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => addQuestion(-1)}>
              <Plus size={16} /> Incluir primeira questão
            </button>
          )}
          </>
          )}
        </div>
      )}
      {returnDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-labelledby="return-dialog-title">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="return-dialog-title" className="text-xl font-bold text-afpesp-800">Devolver auditoria para ajustes</h2>
                <p className="mt-1 text-sm text-slate-600">Descreva claramente o que deve ser corrigido. Esta mensagem aparecerá em pop-up para os auditores responsáveis.</p>
              </div>
              <button type="button" className="rounded-full p-2 hover:bg-slate-100" aria-label="Fechar" onClick={() => setReturnDialogOpen(false)}><X size={20} /></button>
            </div>
            <Field label="Motivo e orientações para ajuste">
              <textarea className="field min-h-32" autoFocus value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="Informe os ajustes necessários..." />
            </Field>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => setReturnDialogOpen(false)}>Cancelar</button>
              <button type="button" className="btn-primary" disabled={!returnReason.trim()} onClick={confirmReturnForAdjustments}>Confirmar devolução</button>
            </div>
          </div>
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
  const items = useRemoteUnits();
  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("Unidade de Lazer");
  const [search, setSearch] = useState("");
  const filteredItems = items.filter((item) =>
    item.type === type &&
    (!search.trim() || normalize(item.name).includes(normalize(search))),
  );
  const add = async () => {
    if (name.trim()) {
      const { error } = await supabase.from("audit_units").insert({ name: name.trim(), location_type: type, active: true });
      if (error) return alert(`Não foi possível cadastrar o local: ${error.message}`);
      setName("");
      notifyRemoteDataChanged();
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
              <button className="text-red-600" onClick={async () => {
                if (!x.remoteId || !confirm(`Excluir o local ${x.name}?`)) return;
                const { error } = await supabase.from("audit_units").delete().eq("id", x.remoteId);
                if (error) return alert(`Não foi possível excluir o local: ${error.message}`);
                notifyRemoteDataChanged();
              }}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
function CrudAuditors() {
  const items = useRemoteAuditors();
  return (
    <div className="card">
      <h2 className="mb-4 flex gap-2 font-bold">
        <Users />
        Auditores
      </h2>
      <p className="mb-3 text-sm text-slate-500">Os auditores são vinculados automaticamente aos usuários ativos do Supabase.</p>
      <details className="mt-4 rounded-lg border border-slate-200">
        <summary className="cursor-pointer select-none p-3 text-sm font-semibold text-afpesp-700">
          Consultar auditores cadastrados ({items.length})
        </summary>
        <div className="max-h-80 overflow-y-auto px-3 pb-3">
          {items.map((x: Auditor) => (
            <div key={x.id} className="flex justify-between border-t py-2 text-sm">
              <span>{x.name}</span>
              <span className="text-xs font-semibold text-slate-400">{x.active ? "Ativo" : "Inativo"}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
function DocumentsRegistry() {
  const items = useRemoteDocuments();
  const [type, setType] = useState<(typeof documentTypes)[number]>("Procedimento Operacional");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<Record<string, number> | null>(null);
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
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return setMessage("Usuário não identificado.");
    const { error } = await supabase.from("audit_documents").insert({
      document_type: record.type,
      code: record.code,
      normalized_code: normalizeDocumentCode(record.code),
      title: record.title,
      version: record.version,
      active: true,
      source_status: "Ativo",
      created_by: userData.user.id,
    });
    if (error) return setMessage(`Não foi possível cadastrar o documento: ${error.message}`);
    setCode(""); setTitle(""); setVersion(""); setMessage("");
    notifyRemoteDataChanged();
  };
  const importMasterList = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    setMessage("");
    setImportSummary(null);
    try {
      const parsed = await readMasterDocumentList(file);
      const { data, error } = await supabase.rpc("import_audit_master", {
        p_documents: parsed.documents,
        p_source_file: file.name,
      });
      if (error) throw error;
      setImportSummary({
        ...(data as Record<string, number>),
        linhas_origem: parsed.sourceRows,
        linhas_ignoradas: parsed.skipped,
      });
      notifyRemoteDataChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível processar a Lista Mestra.");
    } finally {
      setImporting(false);
    }
  };
  return (
    <div className="card">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 font-bold"><ClipboardCheck /> Documentos</h2>
        <label className={`btn-primary cursor-pointer ${importing ? "pointer-events-none opacity-60" : ""}`}>
          <FileDown size={16} /> {importing ? "Atualizando..." : "Atualizar pela Lista Mestra"}
          <input type="file" accept=".xls,.xlsx" className="hidden" disabled={importing} onChange={(event) => {
            const file = event.target.files?.[0];
            void importMasterList(file);
            event.target.value = "";
          }} />
        </label>
      </div>
      <p className="mb-4 text-sm text-slate-500">Importe a Lista Mestra para cadastrar documentos novos, atualizar versões e inativar itens conforme as abas Documentos e Formulários.</p>
      {importSummary && (
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-center sm:grid-cols-4 lg:grid-cols-7">
          {[
            ["Novos", importSummary.inseridos], ["Atualizados", importSummary.atualizados],
            ["Inativados", importSummary.inativados], ["Sem alteração", importSummary.mantidos],
            ["Em elaboração", importSummary.em_elaboracao], ["Linhas lidas", importSummary.linhas_origem],
            ["Ignoradas", importSummary.linhas_ignoradas],
          ].map(([label, value]) => <div key={String(label)}><div className="text-lg font-bold text-afpesp-800">{Number(value ?? 0)}</div><div className="text-xs font-semibold text-slate-500">{label}</div></div>)}
        </div>
      )}
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
                  <td className="p-3 text-right"><button className="text-red-600" title="Excluir documento" onClick={async () => {
                    if (!document.remoteId || !confirm("Excluir este documento cadastrado?")) return;
                    const { error } = await supabase.from("audit_documents").delete().eq("id", document.remoteId);
                    if (error) return setMessage(`Não foi possível excluir o documento: ${error.message}`);
                    notifyRemoteDataChanged();
                  }}><Trash2 size={16} /></button></td>
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
function PasswordChange({
  required,
  onComplete,
}: {
  required: boolean;
  onComplete: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const save = async () => {
    if (password.length < 8) {
      setMessage("A nova senha deve possuir pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setMessage("A confirmação da senha não coincide.");
      return;
    }
    if (password === "AFPESP@1234") {
      setMessage("Escolha uma senha diferente da senha temporária.");
      return;
    }
    setLoading(true);
    setMessage("");
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      setLoading(false);
      setMessage(passwordError.message);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    const { error: profileError } = userId
      ? await supabase.from("audit_profiles").update({ must_change_password: false }).eq("id", userId)
      : { error: new Error("Usuário não identificado.") };
    setLoading(false);
    if (profileError) {
      setMessage(profileError.message);
      return;
    }
    onComplete();
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="card w-full max-w-md p-5 sm:p-8">
        <h1 className="text-2xl font-bold text-afpesp-700">
          {required ? "Crie sua nova senha" : "Redefinir senha"}
        </h1>
        <p className="mb-6 mt-2 text-sm text-slate-500">
          {required
            ? "Por segurança, substitua a senha temporária antes de acessar o sistema."
            : "Informe uma nova senha para concluir a recuperação do acesso."}
        </p>
        <Field label="Nova senha">
          <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <div className="mt-4">
          <Field label="Confirmar nova senha">
            <input className="field" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <p className="mt-3 text-xs text-slate-500">Utilize pelo menos 8 caracteres e não reutilize a senha temporária.</p>
        {message && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        <button className="btn-primary mt-5 w-full" disabled={loading || !password || !confirmation} onClick={save}>
          {loading ? "Salvando..." : "Salvar nova senha"}
        </button>
      </div>
    </div>
  );
}

type ManagedUser = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  auth_user_id: string | null;
  created_at: string;
};
type PasswordResetRequest = {
  id: string;
  user_id: string;
  status: "Pendente" | "Concluída" | "Cancelada";
  requested_at: string;
  audit_profiles: { full_name: string } | null;
};

const planStatuses: PlanStatus[] = ["Planejada", "Realizada no prazo", "Realizada em atraso", "Reprogramada", "Não realizada"];
const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const splitPlanAuditors = (value: string) => value.split(/[,/]/).map((name) => name.trim()).filter(Boolean);
function AuditorPlanSelect({ value, options, onChange }: { value: string; options: Auditor[]; onChange: (value: string) => void }) {
  const selected = splitPlanAuditors(value);
  return <div className="space-y-2">
    <select className="field" value="" onChange={(event) => {
      const name = event.target.value;
      if (name && !selected.includes(name)) onChange([...selected, name].join(", "));
    }}>
      <option value="">Selecione um auditor para adicionar</option>
      {options.filter((auditor) => !selected.includes(auditor.name)).map((auditor) => <option key={auditor.remoteId ?? auditor.id} value={auditor.name}>{auditor.name}</option>)}
    </select>
    {selected.length > 0 && <div className="flex flex-wrap gap-1.5">{selected.map((name) => <span key={name} className="inline-flex items-center gap-1 rounded-full bg-afpesp-50 px-2.5 py-1 text-xs font-semibold text-afpesp-700">{name}<button type="button" aria-label={`Remover ${name}`} onClick={() => onChange(selected.filter((item) => item !== name).join(", "))}><X size={13} /></button></span>)}</div>}
  </div>;
}
function AnnualPlanning({ isAdmin }: { isAdmin: boolean }) {
  const [params] = useSearchParams();
  const requestedStatus = params.get("status");
  const initialStatus: PlanStatus | "Todos" = requestedStatus && planStatuses.includes(requestedStatus as PlanStatus)
    ? requestedStatus as PlanStatus
    : "Todos";
  const [items, setItems] = useState<AnnualPlanItem[]>([]);
  const [year, setYear] = useState(2026);
  const [monthFilter, setMonthFilter] = useState<number | "Todos">("Todos");
  const [statusFilter, setStatusFilter] = useState<PlanStatus | "Todos">(initialStatus);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState({ process: "", month: new Date().getMonth() + 1, auditor: "" });
  const planningUnits = useRemoteUnits().filter((unit) => unit.active).sort((a, b) => `${a.type} ${a.name}`.localeCompare(`${b.type} ${b.name}`, "pt-BR"));
  const planningAuditors = useRemoteAuditors().filter((auditor) => auditor.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const load = async () => {
    const { data, error } = await supabase.from("audit_annual_plan_items").select("id,process,planned_month,planned_year,auditor,status,audit_record_id,notes").eq("planned_year", year).order("planned_month").order("process");
    if (error) return setMessage(error.message);
    setItems((data ?? []).map((row) => ({ id: row.id, process: row.process, month: row.planned_month, year: row.planned_year, auditor: row.auditor, status: row.status as PlanStatus, auditId: row.audit_record_id ?? undefined, notes: row.notes })));
  };
  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener(remoteDataChangedEvent, refresh);
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener(remoteDataChangedEvent, refresh); window.removeEventListener("focus", refresh); window.clearInterval(interval); };
  }, [year]);
  const updateItem = async (item: AnnualPlanItem, changes: Partial<AnnualPlanItem>) => {
    const next = { ...item, ...changes };
    const { error } = await supabase.from("audit_annual_plan_items").update({ process: next.process, planned_month: next.month, auditor: next.auditor, status: next.status, notes: next.notes ?? "" }).eq("id", item.id);
    if (error) return setMessage(error.message);
    setItems((current) => current.map((row) => row.id === item.id ? next : row));
    notifyRemoteDataChanged();
    setMessage("Planejamento atualizado.");
  };
  const add = async () => {
    if (!draft.process.trim()) return setMessage("Informe o processo ou local da auditoria planejada.");
    if (!draft.auditor.trim()) return setMessage("Selecione ao menos um auditor responsável.");
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("audit_annual_plan_items").insert({ process: draft.process.trim(), planned_month: draft.month, planned_year: year, auditor: draft.auditor.trim(), status: "Planejada", created_by: auth.user?.id });
    if (error) return setMessage(error.message);
    setDraft({ process: "", month: draft.month, auditor: "" }); setMessage("Item incluído no plano anual."); notifyRemoteDataChanged(); load();
  };
  const remove = async (item: AnnualPlanItem) => {
    if (!confirm(`Excluir ${item.process} do planejamento?`)) return;
    const { error } = await supabase.from("audit_annual_plan_items").delete().eq("id", item.id);
    if (error) return setMessage(error.message);
    setItems((current) => current.filter((row) => row.id !== item.id));
    notifyRemoteDataChanged();
  };
  const monthItems = monthFilter === "Todos" ? items : items.filter((item) => item.month === monthFilter);
  const filteredItems = statusFilter === "Todos" ? monthItems : monthItems.filter((item) => item.status === statusFilter);
  const realized = monthItems.filter((item) => item.status === "Realizada no prazo").length;
  const realizedLate = monthItems.filter((item) => item.status === "Realizada em atraso").length;
  const pending = monthItems.filter((item) => item.status === "Planejada").length;
  const reprogrammed = monthItems.filter((item) => item.status === "Reprogramada").length;
  const notPerformed = monthItems.filter((item) => item.status === "Não realizada").length;
  const efficacy = monthItems.length ? Math.round(realized / monthItems.length * 1000) / 10 : 0;
  const monthlyPending = monthNames.map((_, index) => items.filter((item) => item.month === index + 1 && item.status === "Planejada").length);
  const monthlyRealized = monthNames.map((_, index) => items.filter((item) => item.month === index + 1 && item.status === "Realizada no prazo").length);
  const monthlyRealizedLate = monthNames.map((_, index) => items.filter((item) => item.month === index + 1 && item.status === "Realizada em atraso").length);
  const monthlyReprogrammed = monthNames.map((_, index) => items.filter((item) => item.month === index + 1 && item.status === "Reprogramada").length);
  const monthlyNotPerformed = monthNames.map((_, index) => items.filter((item) => item.month === index + 1 && item.status === "Não realizada").length);
  const visibleMonthIndexes = monthFilter === "Todos" ? monthNames.map((_, index) => index) : [monthFilter - 1];
  const chartDatasets = [
    { status: "Planejada" as PlanStatus, label: "Planejadas pendentes", data: visibleMonthIndexes.map((index) => monthlyPending[index]), backgroundColor: "#93c5fd" },
    { status: "Realizada no prazo" as PlanStatus, label: "Realizadas no prazo", data: visibleMonthIndexes.map((index) => monthlyRealized[index]), backgroundColor: "#15803d" },
    { status: "Realizada em atraso" as PlanStatus, label: "Realizadas em atraso", data: visibleMonthIndexes.map((index) => monthlyRealizedLate[index]), backgroundColor: "#dc2626" },
    { status: "Reprogramada" as PlanStatus, label: "Reprogramadas", data: visibleMonthIndexes.map((index) => monthlyReprogrammed[index]), backgroundColor: "#d97706" },
    { status: "Não realizada" as PlanStatus, label: "Não realizadas", data: visibleMonthIndexes.map((index) => monthlyNotPerformed[index]), backgroundColor: "#64748b" },
  ].filter((dataset) => statusFilter === "Todos" || dataset.status === statusFilter)
    .map((dataset) => ({ ...dataset, borderRadius: 5, borderSkipped: false as const, maxBarThickness: 24, categoryPercentage: 0.48, barPercentage: 0.68 }));
  return <>
    <PageTitle title="Planejamento anual de auditorias" subtitle="Plano distinto da programação operacional de cada auditoria." />
    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"><Stat title="Total planejado" value={String(monthItems.length)} icon={<CalendarDays size={22} />} onClick={() => setStatusFilter("Todos")} active={statusFilter === "Todos"} /><Stat title="Planejadas pendentes" value={String(pending)} icon={<ClipboardCheck size={22} />} onClick={() => setStatusFilter("Planejada")} active={statusFilter === "Planejada"} /><Stat title="Realizadas no prazo" value={String(realized)} icon={<ClipboardCheck size={22} />} onClick={() => setStatusFilter("Realizada no prazo")} active={statusFilter === "Realizada no prazo"} /><Stat title="Realizadas em atraso" value={String(realizedLate)} icon={<CalendarDays size={22} />} onClick={() => setStatusFilter("Realizada em atraso")} active={statusFilter === "Realizada em atraso"} /><Stat title="Reprogramadas" value={String(reprogrammed)} icon={<Settings size={22} />} onClick={() => setStatusFilter("Reprogramada")} active={statusFilter === "Reprogramada"} /><Stat title="Não realizadas" value={String(notPerformed)} icon={<CalendarDays size={22} />} onClick={() => setStatusFilter("Não realizada")} active={statusFilter === "Não realizada"} /><Stat title="Eficácia do plano" value={`${efficacy}%`} icon={<BarChart3 size={22} />} onClick={() => setStatusFilter("Todos")} /></div>
    <div className="card mb-6">
      <h2 className="mb-1 text-lg font-bold text-afpesp-700">Planejado x realizado por mês</h2>
      <p className="mb-4 text-sm text-slate-500">Passe o mouse ou toque em uma barra para consultar os locais/processos daquele mês.</p>
      <div className="h-72">
        <Bar
          data={{
            labels: visibleMonthIndexes.map((index) => monthNames[index]),
            datasets: chartDatasets,
          }}
          options={{ responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { afterBody: (contexts) => { const context = contexts[0]; if (!context) return []; const monthIndex = visibleMonthIndexes[context.dataIndex]; const status = chartDatasets[context.datasetIndex]?.status; const rows = items.filter((item) => item.month === monthIndex + 1 && item.status === status); return rows.length ? ["", "Locais/processos:", ...rows.map((item) => `• ${item.process}`)] : ["", "Nenhum local/processo."]; } } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }}
        />
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
        <select aria-label="Filtrar por ano" className="field sm:w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}><option>2026</option><option>2027</option><option>2028</option></select>
        <select aria-label="Filtrar por mês" className="field sm:w-40" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value === "Todos" ? "Todos" : Number(e.target.value))}><option value="Todos">Todos os meses</option>{monthNames.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select>
        <select aria-label="Filtrar por status" className="field sm:w-56" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PlanStatus | "Todos")}><option value="Todos">Todos os status</option>{planStatuses.map((status) => <option key={status} value={status}>{status === "Planejada" ? "Planejada pendente" : status}</option>)}</select>
      </div>
    </div>
    {isAdmin && <div className="card mb-6"><h2 className="mb-4 text-lg font-bold text-afpesp-700">Incluir item no planejamento</h2><div className="grid gap-3 md:grid-cols-[2fr_.7fr_1.2fr_auto]"><Field label="Processo / local"><select className="field" value={draft.process} onChange={(e) => setDraft({ ...draft, process: e.target.value })}><option value="">Selecione o local ou processo</option>{planningUnits.map((unit) => <option key={unit.remoteId ?? unit.id} value={unit.name}>{unit.type} — {unit.name}</option>)}</select></Field><Field label="Mês"><select className="field" value={draft.month} onChange={(e) => setDraft({ ...draft, month: Number(e.target.value) })}>{monthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></Field><Field label="Auditor(es)"><AuditorPlanSelect value={draft.auditor} options={planningAuditors} onChange={(auditor) => setDraft({ ...draft, auditor })} /></Field><button className="btn-primary self-end" onClick={add}><Plus size={16} /> Incluir</button></div></div>}
    {message && <p className="mb-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{message}</p>}
    <div className="card overflow-hidden p-0"><div className="grid grid-cols-[1fr_70px] gap-3 border-b bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500 sm:grid-cols-[1.5fr_80px_1fr_1fr_48px]"><span>Processo / local</span><span>Mês</span><span className="hidden sm:block">Auditor(es)</span><span className="hidden sm:block">Status</span><span /></div><div className="divide-y">{filteredItems.map((item) => <div key={item.id} className="grid grid-cols-[1fr_70px] gap-3 p-3 sm:grid-cols-[1.5fr_80px_1fr_1fr_48px] sm:items-center"><input className="field" readOnly={!isAdmin} value={item.process} onBlur={(e) => isAdmin && e.target.value !== item.process && updateItem(item, { process: e.target.value })} onChange={(e) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, process: e.target.value } : row))} /><select className="field" disabled={!isAdmin} value={item.month} onChange={(e) => updateItem(item, { month: Number(e.target.value) })}>{monthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select><input className="field sm:block" readOnly={!isAdmin} value={item.auditor} onBlur={(e) => isAdmin && updateItem(item, { auditor: e.target.value })} onChange={(e) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, auditor: e.target.value } : row))} /><select className="field" disabled={!isAdmin} value={item.status} onChange={(e) => updateItem(item, { status: e.target.value as PlanStatus })}>{planStatuses.map((status) => <option key={status}>{status}</option>)}</select>{isAdmin && <button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => remove(item)} aria-label={`Excluir ${item.process}`}><Trash2 size={17} /></button>}</div>)}</div></div>
  </>;
}

function UsersAdmin() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [passwordResetRequests, setPasswordResetRequests] = useState<PasswordResetRequest[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState<{ name: string; password: string } | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("auditor");
  const [loading, setLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [message, setMessage] = useState("");
  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-audit-users", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };
  const refresh = async () => {
    setLoading(true);
    try {
      const data = await invoke({ action: "list" });
      setUsers(data.users ?? []);
      setPasswordResetRequests(data.passwordResetRequests ?? []);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível consultar os usuários.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);
  const create = async () => {
    if (!fullName.trim() || !email.trim()) return;
    setLoading(true);
    try {
      const data = await invoke({ action: "create", fullName: fullName.trim(), email: email.trim().toLowerCase(), role });
      if (data.temporaryPassword) setTemporaryPassword({ name: fullName.trim(), password: data.temporaryPassword });
      setFullName(""); setEmail(""); setRole("auditor");
      setMessage("Usuário criado. Copie e comunique a senha temporária exibida abaixo.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar o usuário.");
      setLoading(false);
    }
  };
  const action = async (body: Record<string, unknown>, success: string, targetName?: string) => {
    setLoading(true);
    try {
      const data = await invoke(body);
      if (data.temporaryPassword) setTemporaryPassword({ name: targetName ?? "Usuário", password: data.temporaryPassword });
      setMessage(success);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
      setLoading(false);
    }
  };
  const backupFileStamp = () => new Date().toISOString().replace(/[:.]/g, "-");
  const downloadDataBackup = async () => {
    setBackupLoading(true);
    setMessage("");
    try {
      const backup = await invoke({ action: "backup" });
      saveAs(
        new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" }),
        `backup-dados-auditorias-${backupFileStamp()}.json`,
      );
      setMessage("Backup dos dados gerado. Guarde o arquivo fora do Supabase.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar o backup dos dados.");
    } finally {
      setBackupLoading(false);
    }
  };
  const downloadEvidenceBackup = async () => {
    setBackupLoading(true);
    setMessage("");
    try {
      const { data, error } = await supabase.from("audit_records").select("id,data");
      if (error) throw error;
      const records = (data ?? []) as Array<{
        id: string;
        data: { answers?: Array<{ photos?: string[] }> };
      }>;
      const paths = [...new Set(records.flatMap((record) =>
        (record.data.answers ?? []).flatMap((answer) =>
          (answer.photos ?? [])
            .filter((photo) => photo.startsWith("storage:"))
            .map((photo) => photo.replace(/^storage:/, "")),
        ),
      ))];
      const zip = new JSZip();
      const manifest: Array<{ path: string; backedUp: boolean; error?: string }> = [];
      for (const path of paths) {
        const { data: file, error: fileError } = await supabase.storage.from("audit-evidence").download(path);
        if (fileError) {
          manifest.push({ path, backedUp: false, error: fileError.message });
        } else {
          zip.file(path, file);
          manifest.push({ path, backedUp: true });
        }
      }
      zip.file("manifesto-evidencias.json", JSON.stringify({ generatedAt: new Date().toISOString(), files: manifest }, null, 2));
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      saveAs(blob, `backup-evidencias-auditorias-${backupFileStamp()}.zip`);
      const failures = manifest.filter((item) => !item.backedUp).length;
      setMessage(failures
        ? `Backup de evidências gerado com ${failures} arquivo(s) não baixado(s); consulte o manifesto dentro do ZIP.`
        : `Backup de evidências gerado com ${manifest.length} arquivo(s). Guarde o ZIP fora do Supabase.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar o backup das evidências.");
    } finally {
      setBackupLoading(false);
    }
  };
  return (
    <>
      <PageTitle title="Gerenciar usuários" subtitle="Área exclusiva do administrador do Sistema de Auditorias AFPESP." />
      {passwordResetRequests.length > 0 && (
        <div className="card mb-6 border-amber-200 bg-amber-50 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2 text-amber-900"><KeyRound size={20} /><h2 className="text-lg font-bold">Solicitações de redefinição ({passwordResetRequests.length})</h2></div>
          <div className="space-y-3">
            {passwordResetRequests.map((request) => {
              const user = users.find((item) => item.auth_user_id === request.user_id);
              const name = request.audit_profiles?.full_name ?? user?.full_name ?? "Usuário";
              return (
                <div key={request.id} className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><div className="font-bold text-slate-800">{name}</div><div className="text-sm text-slate-500">Solicitado em {new Date(request.requested_at).toLocaleString("pt-BR")}</div></div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-primary px-3 text-xs" disabled={loading} onClick={() => action({ action: "reset_temporary_password", userId: request.user_id, requestId: request.id }, `Senha temporária gerada para ${name}.`, name)}>Gerar senha temporária</button>
                    <button className="btn-secondary px-3 text-xs" disabled={loading} onClick={() => action({ action: "cancel_password_reset", requestId: request.id }, `Solicitação de ${name} cancelada.`)}>Cancelar solicitação</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {temporaryPassword && (
        <div className="card mb-6 border-green-300 bg-green-50 p-4 sm:p-5" role="alert">
          <h2 className="font-bold text-green-900">Senha temporária de {temporaryPassword.name}</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="rounded-lg border border-green-200 bg-white px-4 py-3 text-lg font-bold text-slate-900">{temporaryPassword.password}</code>
            <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(temporaryPassword.password)}>Copiar senha</button>
            <button className="text-sm font-bold text-slate-600" onClick={() => setTemporaryPassword(null)}>Fechar</button>
          </div>
          <p className="mt-3 text-xs text-green-800">Esta senha é exibida somente agora. Comunique-a ao usuário por canal interno; ele deverá alterá-la no primeiro acesso.</p>
        </div>
      )}
      <div className="card mb-6 p-4 sm:p-5">
        <h2 className="mb-4 text-lg font-bold text-afpesp-700">Cadastrar novo usuário</h2>
        <div className="grid gap-3 md:grid-cols-[1.5fr_1.2fr_.7fr_auto]">
          <Field label="Nome completo"><input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
          <Field label="E-mail"><input type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Perfil"><select className="field" value={role} onChange={(e) => setRole(e.target.value as UserRole)}><option value="auditor">Auditor</option><option value="admin">Administrador</option></select></Field>
          <button className="btn-primary self-end" disabled={loading || !fullName.trim() || !email.trim()} onClick={create}><Plus size={16} /> Criar usuário</button>
        </div>
        <p className="mt-3 text-xs text-slate-500">O sistema gera uma senha temporária individual, exibida uma única vez, que deverá ser substituída no primeiro acesso.</p>
      </div>
      <div className="card mb-6 p-4 sm:p-5">
        <h2 className="text-lg font-bold text-afpesp-700">Backup manual</h2>
        <p className="mt-1 text-sm text-slate-500">Gere os dois arquivos e armazene-os fora do Supabase. Durante os testes, execute esta rotina diariamente e antes de alterações relevantes.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button className="btn-primary" disabled={backupLoading} onClick={downloadDataBackup}>
            <FileDown size={16} /> Exportar dados completos (JSON)
          </button>
          <button className="btn-secondary" disabled={backupLoading} onClick={downloadEvidenceBackup}>
            <ArchiveRestore size={16} /> Exportar imagens e evidências (ZIP)
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">A exportação é exclusiva do administrador. O arquivo JSON contém auditorias, usuários autorizados, perfis, locais, checklists, documentos, planejamento, notificações e solicitações internas relacionadas.</p>
      </div>
      {message && <p className="mb-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{message}</p>}
      <div className="card overflow-hidden p-0">
        <div className="border-b p-4 sm:p-5"><h2 className="text-lg font-bold text-afpesp-700">Usuários autorizados ({users.length})</h2></div>
        <div className="divide-y">
          {users.map((user) => (
            <div key={user.id} className="grid gap-3 p-4 lg:grid-cols-[1.5fr_1fr_.9fr_.5fr_auto] lg:items-center">
              <div><div className="font-bold text-slate-800">{user.full_name}</div><div className="text-sm text-slate-500">{user.email}</div></div>
              <div className="text-sm"><span className="font-semibold">Conta:</span> {user.auth_user_id ? "Criada" : "Pendente"}</div>
              <select
                className="field py-2 text-sm font-semibold"
                value={user.role}
                disabled={loading || !user.auth_user_id}
                aria-label={`Perfil de ${user.full_name}`}
                onChange={(event) => {
                  if (!user.auth_user_id) return;
                  const nextRole = event.target.value as UserRole;
                  action({ action: "update", userId: user.auth_user_id, fullName: user.full_name, role: nextRole }, `Perfil de ${user.full_name} alterado para ${nextRole === "admin" ? "Administrador" : "Auditor"}.`);
                }}
              ><option value="auditor">Auditor</option><option value="admin">Administrador</option></select>
              <div className={`text-sm font-bold ${user.active ? "text-green-600" : "text-red-600"}`}>{user.active ? "Ativo" : "Inativo"}</div>
              <div className="flex flex-wrap gap-2">
                {user.auth_user_id && <>
                  <button className="btn-secondary px-3 text-xs" disabled={loading} onClick={() => action({ action: "reset_temporary_password", userId: user.auth_user_id }, `Senha temporária redefinida para ${user.full_name}.`, user.full_name)}>Redefinir senha</button>
                  <button className="btn-secondary px-3 text-xs" disabled={loading} onClick={() => action({ action: "set_active", userId: user.auth_user_id, active: !user.active }, user.active ? "Usuário desativado." : "Usuário reativado.")}>{user.active ? "Desativar" : "Reativar"}</button>
                  <button className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700" disabled={loading} onClick={() => confirm(`Excluir o usuário ${user.full_name}?`) && action({ action: "delete", userId: user.auth_user_id }, "Usuário excluído.")}><Trash2 size={14} className="inline" /> Excluir</button>
                </>}
                {!user.auth_user_id && (
                  <button className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700" disabled={loading} onClick={() => confirm(`Excluir a autorização pendente de ${user.full_name}?`) && action({ action: "delete_pending", allowedUserId: user.id }, "Autorização pendente excluída.")}><Trash2 size={14} className="inline" /> Excluir</button>
                )}
              </div>
            </div>
          ))}
          {!users.length && <p className="p-5 text-sm text-slate-500">{loading ? "Carregando usuários..." : "Nenhum usuário encontrado."}</p>}
        </div>
      </div>
    </>
  );
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode | "">(
    () => (localStorage.getItem(layoutModeKey) as LayoutMode | null) ?? "",
  );
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, currentSession) => {
      setSession(currentSession);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      if (!currentSession) {
        setProfile(null);
        setAuthLoading(false);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session?.user.id) return;
    setAuthLoading(true);
    supabase
      .from("audit_profiles")
      .select("id, full_name, role, active, must_change_password")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data?.active) {
          setProfile(null);
          supabase.auth.signOut();
        } else {
          setProfile(data as UserProfile);
        }
        setAuthLoading(false);
      });
  }, [session?.user.id]);
  const login = (mode: LayoutMode) => {
    localStorage.setItem(layoutModeKey, mode);
    setLayoutMode(mode);
  };
  const logout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(layoutModeKey);
    setLayoutMode("");
    setProfile(null);
  };
  const passwordCompleted = () => {
    setRecoveryMode(false);
    setProfile((current) => current ? { ...current, must_change_password: false } : current);
  };
  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm font-semibold text-afpesp-700">Carregando acesso...</div>;
  if (!session) return <Login onLogin={login} />;
  if (!profile) return <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-center text-sm text-red-700">Seu usuário não possui um perfil ativo no Sistema de Auditorias AFPESP.</div>;
  if (profile.must_change_password || recoveryMode)
    return <PasswordChange required={profile.must_change_password} onComplete={passwordCompleted} />;
  if (!layoutMode) return <Login onLogin={login} />;
  return (
    <Layout user={profile.full_name} role={profile.role} mode={layoutMode} onLogout={logout}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auditorias" element={<AuditHub isAdmin={profile.role === "admin"} currentUserName={profile.full_name} />} />
        <Route path="/auditorias/nova" element={<AuditForm />} />
        <Route path="/auditorias/:id" element={<AuditForm />} />
        <Route path="/planejamento" element={<AnnualPlanning isAdmin={profile.role === "admin"} />} />
        <Route path="/cadastros" element={<Cadastros />} />
        {profile.role === "admin" && <Route path="/usuarios" element={<UsersAdmin />} />}
      </Routes>
    </Layout>
  );
}
