import { supabase } from "./supabase";
import type { Answer, Audit, AuditSummary, Checklist, LocationType } from "./types";

const bucket = "audit-evidence";
const userId = async () => {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Usuário não identificado.");
  return data.user.id;
};
const signedPhoto = async (path: string) => {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
};
const hydrateAudit = async (row: { id: string; data: Record<string, unknown> }) => {
  const audit = { ...row.data, id: row.id } as unknown as Audit;
  audit.answers = await Promise.all((audit.answers ?? []).map(async (answer) => {
    const paths = (answer.photos ?? []).map((photo) => photo.replace(/^storage:/, ""));
    const photos = await Promise.all(paths.map(signedPhoto));
    const evidences = answer.evidences?.length ? answer.evidences : [answer.recommendation ?? ""];
    return { ...answer, evidences, recommendation: evidences[0] ?? "", photos, photoPaths: paths };
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
const dataUrlBlob = async (url: string) => (await fetch(url)).blob();
export async function saveRemoteAudit(audit: Audit) {
  const uid = await userId();
  const id = typeof audit.id === "string" ? audit.id : crypto.randomUUID();
  const previousPaths = new Set<string>();
  if (typeof audit.id === "string") {
    const { data, error } = await supabase.from("audit_records").select("data").eq("id", id).single();
    if (error) throw error;
    const previousAnswers = (data?.data as { answers?: Array<{ photos?: string[] }> } | null)?.answers ?? [];
    previousAnswers.forEach((answer) =>
      (answer.photos ?? [])
        .filter((photo) => photo.startsWith("storage:"))
        .forEach((photo) => previousPaths.add(photo.replace(/^storage:/, ""))),
    );
  }
  const answers: Answer[] = [];
  const newlyUploadedPaths: string[] = [];
  for (const answer of audit.answers) {
    const paths: string[] = [];
    for (let index = 0; index < answer.photos.length; index += 1) {
      const photo = answer.photos[index];
      const existingPath = answer.photoPaths?.[index];
      if (!photo.startsWith("data:") && existingPath) { paths.push(existingPath); continue; }
      const blob = await dataUrlBlob(photo);
      const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
      const path = `${id}/${answer.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw error;
      paths.push(path);
      newlyUploadedPaths.push(path);
    }
    const evidences = answer.evidences?.length ? answer.evidences : [answer.recommendation ?? ""];
    answers.push({ ...answer, evidences, recommendation: evidences[0] ?? "", photos: paths.map((path) => `storage:${path}`), photoPaths: undefined });
  }
  const now = new Date().toISOString();
  const stored = { ...audit, id: undefined, answers, updatedAt: now };
  const { error } = typeof audit.id === "string"
    ? await supabase.from("audit_records").update({ status: audit.status, data: stored, updated_at: now }).eq("id", id)
    : await supabase.from("audit_records").insert({ id, status: audit.status, data: stored, created_by: uid, updated_at: now });
  if (error) {
    if (newlyUploadedPaths.length) await supabase.storage.from(bucket).remove(newlyUploadedPaths);
    throw error;
  }
  const retainedPaths = new Set(
    answers.flatMap((answer) => answer.photos.map((photo) => photo.replace(/^storage:/, ""))),
  );
  const removedPaths = [...previousPaths].filter((path) => !retainedPaths.has(path));
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
