import { supabase } from "./supabase";
import type { Answer, Audit, AuditSummary, Checklist, LocationType } from "./types";

const bucket = "audit-evidence";
const userId = async () => {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Usuário não identificado.");
  return data.user.id;
};
const signedPhoto = async (path: string, optimized = false) => {
  const options = optimized
    ? { transform: { width: 1000, quality: 55, resize: "contain" as const, format: "origin" as const } }
    : undefined;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600, options);
  if (error) throw error;
  return data.signedUrl;
};
const hydrateAudit = async (row: { id: string; data: Record<string, unknown> }, optimizePhotos = false) => {
  const audit = { ...row.data, id: row.id } as unknown as Audit;
  audit.answers = await Promise.all((audit.answers ?? []).map(async (answer) => {
    const paths = (answer.photos ?? []).map((photo) => photo.replace(/^storage:/, ""));
    const photos = await Promise.all(paths.map((path) => signedPhoto(path, optimizePhotos)));
    const evidences = answer.evidences?.length ? answer.evidences : [answer.recommendation ?? ""];
    return { ...answer, auditTip: answer.auditTip ?? "", evidences, recommendation: evidences[0] ?? "", photos, photoPaths: paths };
  }));
  return audit;
};
export async function listRemoteAudits() {
  const { data, error } = await supabase.from("audit_records").select("id,data").order("updated_at", { ascending: false });
  if (error) throw error;
  return Promise.all((data ?? []).map((row) => hydrateAudit(row as { id: string; data: Record<string, unknown> })));
}
export async function listRemoteAuditSummaries(): Promise<AuditSummary[]> {
  const { data, error } = await supabase.from("audit_record_summaries").select("id,location_type,unit,checklist_name,auditors,start_date,end_date,status,updated_at").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    locationType: row.location_type as LocationType,
    unit: String(row.unit ?? ""),
    checklistName: String(row.checklist_name ?? ""),
    auditors: Array.isArray(row.auditors) ? row.auditors.map(String) : [],
    startDate: String(row.start_date ?? ""),
    endDate: String(row.end_date ?? ""),
    status: row.status as Audit["status"],
    updatedAt: String(row.updated_at ?? ""),
  }));
}
export async function getRemoteAudit(id: string) {
  const { data, error } = await supabase.from("audit_records").select("id,data").eq("id", id).single();
  if (error) throw error;
  return hydrateAudit(data as { id: string; data: Record<string, unknown> });
}
export async function getRemoteAuditForReport(id: string) {
  const { data, error } = await supabase.from("audit_records").select("id,data").eq("id", id).single();
  if (error) throw error;
  return hydrateAudit(data as { id: string; data: Record<string, unknown> }, true);
}
const dataUrlBlob = async (url: string) => (await fetch(url)).blob();
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};
export async function saveRemoteAudit(audit: Audit, expectedUpdatedAt = audit.updatedAt) {
  const uid = await userId();
  const id = typeof audit.id === "string" ? audit.id : crypto.randomUUID();
  const previousPaths = new Set<string>();
  const previousPathsByAnswer = new Map<string, string[]>();
  if (typeof audit.id === "string") {
    const { data, error } = await supabase.from("audit_records").select("data,updated_at").eq("id", id).single();
    if (error) throw error;
    const previousAnswers = (data?.data as { answers?: Array<{ id?: string; photos?: string[] }> } | null)?.answers ?? [];
    previousAnswers.forEach((answer) => {
      const answerPaths = (answer.photos ?? [])
        .filter((photo) => photo.startsWith("storage:"))
        .map((photo) => photo.replace(/^storage:/, ""));
      answerPaths.forEach((path) => previousPaths.add(path));
      if (answer.id) previousPathsByAnswer.set(answer.id, answerPaths);
    });
    if (expectedUpdatedAt && new Date(data.updated_at).getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new Error("Esta auditoria foi atualizada em outra tela ou dispositivo. Reabra a auditoria antes de salvar para não sobrescrever informações mais recentes.");
    }
  }
  const answers: Answer[] = [];
  const newlyUploadedPaths: string[] = [];
  const explicitlyRemovedPaths = new Set<string>();
  for (const answer of audit.answers) {
    const removedPaths = new Set(answer.removedPhotoPaths ?? []);
    removedPaths.forEach((path) => explicitlyRemovedPaths.add(path));
    const paths: string[] = (previousPathsByAnswer.get(answer.id) ?? []).filter((path) => !removedPaths.has(path));
    for (let index = 0; index < answer.photos.length; index += 1) {
      const photo = answer.photos[index];
      const existingPath = answer.photoPaths?.[index];
      if (!photo.startsWith("data:") && existingPath) {
        if (!removedPaths.has(existingPath) && !paths.includes(existingPath)) paths.push(existingPath);
        continue;
      }
      if (photo.startsWith("storage:")) {
        const storedPath = photo.replace(/^storage:/, "");
        if (!removedPaths.has(storedPath) && !paths.includes(storedPath)) paths.push(storedPath);
        continue;
      }
      const blob = await dataUrlBlob(photo);
      const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
      const path = `${id}/${answer.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw error;
      paths.push(path);
      newlyUploadedPaths.push(path);
    }
    const evidences = answer.evidences?.length ? answer.evidences : [answer.recommendation ?? ""];
    const { removedPhotoPaths: _removedPhotoPaths, ...answerWithoutRemovalControl } = answer;
    answers.push({ ...answerWithoutRemovalControl, evidences, recommendation: evidences[0] ?? "", photos: paths.map((path) => `storage:${path}`), photoPaths: undefined });
  }
  const now = new Date().toISOString();
  const stored = { ...audit, id: undefined, answers, updatedAt: now };
  const persistence = typeof audit.id === "string"
    ? await supabase.from("audit_records").update({ status: audit.status, data: stored, updated_at: now }).eq("id", id).eq("updated_at", expectedUpdatedAt).select("id,data,updated_at").maybeSingle()
    : await supabase.from("audit_records").insert({ id, status: audit.status, data: stored, created_by: uid, updated_at: now }).select("id").single();
  if (persistence.error || !persistence.data) {
    if (newlyUploadedPaths.length) await supabase.storage.from(bucket).remove(newlyUploadedPaths);
    if (persistence.error) throw persistence.error;
    throw new Error("Esta auditoria foi atualizada em outra tela ou dispositivo. Reabra a auditoria antes de salvar para não sobrescrever informações mais recentes.");
  }
  const persistedData = (persistence.data as { data?: Record<string, unknown> }).data;
  if (!persistedData || stableJson(persistedData) !== stableJson(stored)) {
    throw new Error("O banco respondeu, mas o conteúdo gravado não corresponde ao conteúdo enviado. O salvamento não foi confirmado.");
  }
  const removedPaths = [...explicitlyRemovedPaths].filter((path) => previousPaths.has(path));
  if (removedPaths.length) {
    const { error: storageError } = await supabase.storage.from(bucket).remove(removedPaths);
    if (storageError) console.error("Não foi possível remover evidências sem referência:", storageError.message);
  }
  return id;
}
export async function deleteRemoteAudit(id: string) {
  const audit = await getRemoteAudit(id);
  const paths = audit.answers.flatMap((answer) => answer.photoPaths ?? []);
  const { error } = await supabase.from("audit_records").delete().eq("id", id);
  if (error) throw error;
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(bucket).remove(paths);
    if (storageError) console.error("Auditoria excluída, mas não foi possível remover todas as evidências:", storageError.message);
  }
}
export async function listRemoteChecklists(locationType?: LocationType, unit?: string) {
  let query = supabase.from("audit_checklists").select("id,name,file_name,location_type,items,created_at,audit_units(name)").order("created_at");
  if (locationType) query = query.eq("location_type", locationType);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id, name: row.name, fileName: row.file_name, locationType: row.location_type,
    unit: row.audit_units?.name ?? "", items: row.items ?? [], createdAt: row.created_at,
  } as Checklist)).filter((item) => !unit || item.unit.toLowerCase() === unit.toLowerCase());
}
export async function createRemoteChecklist(checklist: Checklist) {
  const uid = await userId();
  const { data: unit, error: unitError } = await supabase.from("audit_units").select("id").eq("location_type", checklist.locationType).ilike("name", checklist.unit).single();
  if (unitError) throw unitError;
  const { data, error } = await supabase.from("audit_checklists").insert({
    name: checklist.name, file_name: checklist.fileName, location_type: checklist.locationType,
    unit_id: unit.id, items: checklist.items, created_by: uid,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}
export async function deleteRemoteChecklist(id: string) {
  const { error } = await supabase.from("audit_checklists").delete().eq("id", id);
  if (error) throw error;
}
