import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import type { Audit } from "./types";
const clean = (v: string) => v || "Não informado";
const dataUrlBytes = (url: string) =>
  Uint8Array.from(atob(url.split(",")[1]), (c) => c.charCodeAt(0));
export async function exportDocx(a: Audit) {
  const documentRows = Array.from(
    new Map(
      a.answers
        .filter((answer) => answer.documentType || answer.documentCode || answer.documentTitle || answer.documentVersion)
        .map((answer) => [
          [answer.documentType, answer.documentCode, answer.documentTitle, answer.documentVersion].join("|"),
          answer,
        ]),
    ).values(),
  );
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: "RELATÓRIO DE AUDITORIA INTERNA",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: "AFPESP",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        ["Local", `${a.locationType} — ${a.unit}`],
        ["Checklist", a.checklistName],
        ["Período", `${a.startDate} a ${a.endDate}`],
        ["Auditor(es)", a.auditors.join(", ")],
        ["Objetivo", clean(a.objective)],
        ["Escopo", clean(a.scope)],
      ].map(
        ([x, y]) =>
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: x, bold: true })],
                  }),
                ],
              }),
              new TableCell({ children: [new Paragraph(y)] }),
            ],
          }),
      ),
    }),
  ];
  if (documentRows.length) {
    children.push(
      new Paragraph({
        text: "DOCUMENTOS DE REFERÊNCIA",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 180 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          ["Tipo", "Código", "Título", "Versão"],
          ...documentRows.map((answer) => [
            answer.documentType || "—",
            answer.documentCode || "—",
            answer.documentTitle || "—",
            answer.documentVersion || "—",
          ]),
        ].map((row, rowIndex) =>
          new TableRow({
            children: row.map((value) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: value, bold: rowIndex === 0 })],
                  }),
                ],
              }),
            ),
          }),
        ),
      }),
    );
  }
  a.answers.forEach((ans, i) => {
    children.push(
      new Paragraph({
        text: `${i + 1}. ${ans.question}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 420, after: 160 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Requisito: ", bold: true }),
          new TextRun(clean(ans.requirement)),
        ],
      }),
      ...(ans.documentType || ans.documentCode || ans.documentTitle || ans.documentVersion
        ? [
            new Paragraph({
              children: [
                new TextRun({ text: "Documento de referência: ", bold: true }),
                new TextRun(
                  [
                    ans.documentType,
                    ans.documentCode,
                    ans.documentTitle,
                    ans.documentVersion && `Versão ${ans.documentVersion}`,
                  ]
                    .filter(Boolean)
                    .join(" — "),
                ),
              ],
            }),
          ]
        : []),
      new Paragraph({
        children: [
          new TextRun({ text: "Classificação: ", bold: true }),
          new TextRun(ans.classification || "Não classificada"),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Evidência/constatação: ", bold: true }),
          new TextRun(clean(ans.finding)),
        ],
      }),
    );
    if (ans.recommendation)
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Recomendação: ", bold: true }),
            new TextRun(ans.recommendation),
          ],
        }),
      );
    ans.photos.forEach((p, j) =>
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: dataUrlBytes(p),
              transformation: { width: 500, height: 330 },
              type: p.includes("png") ? "png" : "jpg",
              altText: {
                title: `Evidência ${j + 1}`,
                description: `Fotografia vinculada à questão ${i + 1}`,
                name: `evidencia-${i + 1}-${j + 1}`,
              },
            }),
          ],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          text: `Evidência fotográfica ${j + 1} — questão ${i + 1}`,
          alignment: AlignmentType.CENTER,
        }),
      ),
    );
  });
  const blob = await Packer.toBlob(
    new Document({ sections: [{ properties: {}, children }] }),
  );
  saveAs(blob, `Relatorio_Auditoria_${a.id ?? "nova"}.docx`);
}
export function exportExcel(audits: Audit[]) {
  const rows = audits.flatMap((a) =>
    a.answers.map((x) => ({
      Tipo: a.locationType,
      Local: a.unit,
      Checklist: a.checklistName,
      "Data inicial": a.startDate,
      "Data final": a.endDate,
      Auditores: a.auditors.join(", "),
      Requisito: x.requirement,
      Questão: x.question,
      Classificação: x.classification,
      Processo: x.process,
      "Tipo do documento": x.documentType,
      "Código do documento": x.documentCode,
      "Título do documento": x.documentTitle,
      Versão: x.documentVersion,
      Constatação: x.finding,
      Recomendação: x.recommendation,
    })),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(rows),
    "Auditorias",
  );
  XLSX.writeFile(wb, "Auditorias_AFPESP.xlsx");
}
export async function exportBackup() {
  const database = (await import("./db")).db;
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    audits: await database.audits.toArray(),
    units: await database.units.toArray(),
    auditors: await database.auditors.toArray(),
    checklists: await database.checklists.toArray(),
  };
  saveAs(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `Backup_Auditorias_AFPESP_${new Date().toISOString().slice(0, 10)}.json`,
  );
}
export async function importBackup(file: File) {
  const data = JSON.parse(await file.text());
  if (!data.audits || !data.units || !data.auditors || !data.checklists)
    throw new Error("Arquivo de backup inválido.");
  const { db } = await import("./db");
  await db.transaction(
    "rw",
    db.audits,
    db.units,
    db.auditors,
    db.checklists,
    async () => {
      await Promise.all([
        db.audits.clear(),
        db.units.clear(),
        db.auditors.clear(),
        db.checklists.clear(),
      ]);
      await db.audits.bulkAdd(data.audits);
      await db.units.bulkAdd(data.units);
      await db.auditors.bulkAdd(data.auditors);
      await db.checklists.bulkAdd(data.checklists);
    },
  );
}
