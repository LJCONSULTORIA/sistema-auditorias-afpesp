export type Classification =
  "Conforme" | "Não Conforme" | "Oportunidade de Melhoria" | "Risco";
export type LocationType = "Unidade de Lazer" | "Sede Social";
export type AuditStatus = "Programada" | "Em andamento" | "Finalizada e aguardando aprovação" | "Devolvido para ajustes" | "Finalizada";
export interface Unit {
  id?: number;
  remoteId?: string;
  name: string;
  type: LocationType;
  active: boolean;
}
export interface Auditor {
  id?: number;
  remoteId?: string;
  name: string;
  role: string;
  active: boolean;
}
export interface Question {
  id?: number;
  requirement: string;
  text: string;
  active: boolean;
}
export interface ChecklistItem {
  number: number;
  process: string;
  requirement: string;
  question: string;
  documentType: string;
  documentCode: string;
  documentTitle: string;
  documentVersion: string;
  documents: DocumentReference[];
}
export interface DocumentReference {
  type: string;
  code: string;
  title: string;
  version: string;
}
export interface RegisteredDocument extends DocumentReference {
  id?: number;
  remoteId?: string;
  active: boolean;
}
export interface Checklist {
  id?: number | string;
  name: string;
  fileName: string;
  locationType: LocationType;
  unit: string;
  items: ChecklistItem[];
  createdAt: string;
}
export interface Answer {
  id: string;
  questionId: number;
  process: string;
  requirement: string;
  question: string;
  documentType: string;
  documentCode: string;
  documentTitle: string;
  documentVersion: string;
  documents: DocumentReference[];
  classification: Classification | null;
  finding: string;
  recommendation: string;
  evidences?: string[];
  photos: string[];
  photoPaths?: string[];
  aiReviews?: Array<{
    requestedAt: string;
    acceptedAt?: string;
    originalFinding: string;
    originalEvidence: string;
    suggestedFinding: string;
    suggestedEvidence: string;
    accepted: boolean;
    model: string;
    promptVersion: string;
  }>;
}
export interface Audit {
  id?: number | string;
  locationType: LocationType;
  unit: string;
  checklistId?: number | string;
  checklistName: string;
  auditors: string[];
  startDate: string;
  endDate: string;
  scope: string;
  objective: string;
  status: AuditStatus;
  answers: Answer[];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  submittedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  returnedAt?: string;
  returnedBy?: string;
  returnReason?: string;
}
export type PlanStatus = "Planejada" | "Realizada no prazo" | "Realizada em atraso" | "Reprogramada" | "Não realizada";
export interface AnnualPlanItem {
  id: string;
  process: string;
  month: number;
  year: number;
  auditor: string;
  status: PlanStatus;
  auditId?: string;
  notes?: string;
}
