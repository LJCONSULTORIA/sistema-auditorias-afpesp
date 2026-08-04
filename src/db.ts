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
    this.version(3)
      .stores({
        audits: "++id,status,locationType,unit,startDate,updatedAt",
        units: "++id,&name,type,active",
        auditors: "++id,&name,active",
        questions: null,
        checklists: "++id,name,createdAt",
      })
      .upgrade(async (tx) => {
        await tx.table("audits").toCollection().modify((audit) => {
          if (audit.status === "Programada") {
            audit.answers = (audit.answers ?? []).map((answer: Record<string, unknown>) => ({
              ...answer,
              classification: null,
            }));
          }
        });
      });
  }
}
export const db = new AuditDB();
export async function seed() {
  const sede = [
    "Administrativo",
    "Almoxarifado",
    "Assistência à Saúde",
    "Áudio Visual",
    "Central de Relacionamento",
    "Controladoria",
    "Educação e Cultura",
    "Departamento Pessoal",
    "Esportes",
    "Eventos",
    "Gestão de Pessoas",
    "Marketing",
    "Meio Ambiente",
    "Obras",
    "Ouvidoria",
    "Qualidade",
    "Restaurante",
    "Serviços Gerais",
    "Social",
    "Tecnologia da Informação",
    "Transportes",
    "Turismo",
    "Patrimônio",
    "Suprimentos e Logística",
  ];
  const lazer = [
    "Boraceia",
    "Caraguatatuba",
    "Guarujá",
    "Itanhaém",
    "Maresias",
    "Peruíbe I",
    "Peruíbe II",
    "Ubatuba",
    "Areado",
    "Avaré",
    "Amparo",
    "Lindóia",
    "São Lourenço",
    "Serra Negra",
    "Socorro",
    "Appenzell Campos do Jordão",
    "Campos do Jordão",
    "Monte Verde",
    "Poços de Caldas I",
    "Poços de Caldas II",
    "Saha Campos do Jordão",
    "São Pedro",
    "Termas de Ibirá",
    "Fazenda de Ibirá",
    "Dois Córregos",
    "Unidade Capital",
  ];
  const existing = new Set(
    (await db.units.toArray()).map((u) => `${u.type}|${u.name}`),
  );
  const missing: Unit[] = [
    ...sede.map((name) => ({
      name,
      type: "Sede Social" as const,
      active: true,
    })),
    ...lazer.map((name) => ({
      name,
      type: "Unidade de Lazer" as const,
      active: true,
    })),
  ].filter((u) => !existing.has(`${u.type}|${u.name}`));
  if (missing.length) await db.units.bulkAdd(missing);
  await db.units
    .filter((u) =>
      [
        "Sede Social",
        "UL Campos do Jordão",
        "UL Guarujá",
        "UL Socorro",
      ].includes(u.name),
    )
    .delete();
}
