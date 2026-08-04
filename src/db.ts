import Dexie, { type Table } from "dexie";
import type { Audit, Auditor, Checklist, Question, Unit } from "./types";
class AuditDB extends Dexie {
  audits!: Table<Audit, number>;
  units!: Table<Unit, number>;
  auditors!: Table<Auditor, number>;
  questions!: Table<Question, number>;
  checklists!: Table<Checklist, number>;
  constructor() {
    super("AFPESP_Auditorias");
    this.version(1).stores({
      audits: "++id,status,unit,startDate,updatedAt",
      units: "++id,&name,active",
      auditors: "++id,&name,active",
      questions: "++id,requirement,active",
    });
    this.version(2)
      .stores({
        audits: "++id,status,locationType,unit,startDate,updatedAt",
        units: "++id,&name,type,active",
        auditors: "++id,&name,active",
        questions: null,
        checklists: "++id,name,createdAt",
      })
      .upgrade(async (tx) => {
        await tx
          .table("units")
          .toCollection()
          .modify((u) => {
            u.type =
              u.name === "Sede Social" ? "Sede Social" : "Unidade de Lazer";
          });
        await tx
          .table("audits")
          .toCollection()
          .modify((a) => {
            a.locationType =
              a.unit === "Sede Social" ? "Sede Social" : "Unidade de Lazer";
            a.checklistName = "Checklist anterior";
            if (a.status === "Concluída") a.status = "Finalizada";
          });
      });
  }
}
export const db = new AuditDB();
export async function seed() {
  if ((await db.units.count()) === 0)
    await db.units.bulkAdd([
      { name: "Campos do Jordão", type: "Unidade de Lazer", active: true },
      { name: "Guarujá", type: "Unidade de Lazer", active: true },
      { name: "Socorro", type: "Unidade de Lazer", active: true },
      { name: "Sede Social", type: "Sede Social", active: true },
    ]);
}
