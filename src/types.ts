export type Classification =
  "Conforme" | "Não Conforme" | "Oportunidade de Melhoria" | "Risco";
export type LocationType = "Unidade de Lazer" | "Sede Social";
export type AuditStatus = "Programada" | "Em andamento" | "Finalizada";
export interface Unit {
  id?: number;
  name: string;
  type: LocationType;
  active: boolean;
}
export interface Auditor {
  id?: number;
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
  requirement: string;
  question: string;
}
export interface Checklist {
  id?: number;
  name: string;
  fileName: string;
  items: ChecklistItem[];
  createdAt: string;
}
export interface Answer {
  id: string;
  questionId: number;
  requirement: string;
  question: string;
  classification: Classification;
  finding: string;
  recommendation: string;
  photos: string[];
}
export interface Audit {
  id?: number;
  locationType: LocationType;
  unit: string;
  checklistId?: number;
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
}
