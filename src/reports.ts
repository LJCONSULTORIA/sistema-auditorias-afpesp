import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import type { Answer, Audit, DocumentReference } from "./types";
const clean = (v: string) => v || "Não informado";
const imageBytes = async (url: string) => {
  if (url.startsWith("data:"))
    return Uint8Array.from(atob(url.split(",")[1]), (c) => c.charCodeAt(0));
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
};
const documentsOf = (answer: Answer): DocumentReference[] =>
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
const formatDate = (value: string) =>
  value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "Não informado";
const reportFont = "Arial";
const editableField = "Clique aqui para preencher.";
const borders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "B7B7B7" },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "B7B7B7" },
};
const text = (value: string, options: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) =>
  new TextRun({
    text: value,
    font: reportFont,
    size: options.size ?? 22,
    bold: options.bold,
    color: options.color,
    italics: options.italics,
  });
const bodyParagraph = (children: TextRun[] | string, options: { after?: number; before?: number; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({
    children: typeof children === "string" ? [text(children)] : children,
    alignment: options.alignment ?? AlignmentType.JUSTIFIED,
    spacing: { before: options.before ?? 0, after: options.after ?? 140, line: 276 },
  });
const sectionTitle = (number: number, title: string) =>
  new Paragraph({
    children: [text(`${number} - ${title}`, { bold: true })],
    spacing: { before: 280, after: 140 },
    keepNext: true,
  });
const questionLabel = (label: string, value: string) =>
  bodyParagraph([text(`${label}: `, { bold: true }), text(value || "Não informado")]);
export async function buildAuditReport(a: Audit) {
  const documentRows = Array.from(
    new Map(
      a.answers
        .flatMap(documentsOf)
        .map((document) => [[document.type, document.code, document.title, document.version].join("|"), document]),
    ).values(),
  );
  const requirements = [...new Set(
    a.answers
      .flatMap((answer) => answer.requirement.split(/[;,|/\n]+/))
      .map((requirement) => requirement.trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, "pt-BR", { numeric: true }));
  const counts = {
    conforme: a.answers.filter((answer) => answer.classification === "Conforme").length,
    oportunidade: a.answers.filter((answer) => answer.classification === "Oportunidade de Melhoria").length,
    naoConforme: a.answers.filter((answer) => answer.classification === "Não Conforme").length,
    risco: a.answers.filter((answer) => answer.classification === "Risco").length,
  };
  const nonConformities = a.answers
    .map((answer, index) => ({ answer, index }))
    .filter(({ answer }) => answer.classification === "Não Conforme");
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [text("RELATÓRIO DE AUDITORIA INTERNA", { bold: true, size: 36 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "AFPESP", font: "Times New Roman", size: 32, bold: true, color: "4472C4" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 260 },
    }),
    new Table({
      width: { size: 9638, type: WidthType.DXA },
      columnWidths: [1900, 7738],
      borders,
      rows: [
        ["Local", `${a.locationType} — ${a.unit}`],
        ["Checklist", clean(a.checklistName)],
        ["Período", `${formatDate(a.startDate)} a ${formatDate(a.endDate)}`],
        ["Auditor(es)", a.auditors.join(", ")],
        ["Objetivo", clean(a.objective)],
        ["Escopo", clean(a.scope)],
      ].map(
        ([x, y]) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 1900, type: WidthType.DXA },
                shading: { type: ShadingType.CLEAR, fill: "E7E6E6" },
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({
                    children: [text(x, { bold: true })],
                    spacing: { before: 40, after: 40 },
                  }),
                ],
              }),
              new TableCell({
                width: { size: 7738, type: WidthType.DXA },
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ children: [text(y)], spacing: { before: 40, after: 40 } })],
              }),
            ],
          }),
      ),
    }),
    sectionTitle(1, "Objetivo"),
    bodyParagraph(clean(a.objective)),
    sectionTitle(2, "Responsável pelo setor"),
    bodyParagraph([text(editableField, { italics: true, color: "7F7F7F" })]),
    sectionTitle(3, "Auditados"),
    bodyParagraph([text(editableField, { italics: true, color: "7F7F7F" })]),
    sectionTitle(4, "Requisitos da Norma ISO 9001:2015 e verificação da eficácia de treinamentos"),
    bodyParagraph(requirements.length
      ? `Requisitos aplicáveis identificados no checklist: ${requirements.join("; ")}.`
      : "Não foram informados requisitos aplicáveis no checklist."),
  ];
  if (documentRows.length) {
    children.push(
      new Paragraph({
        children: [text("DOCUMENTOS DE REFERÊNCIA", { bold: true, size: 32, color: "4472C4" })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 300, after: 180 },
        keepNext: true,
      }),
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        columnWidths: [1900, 4988, 1200, 775, 775],
        borders,
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              ["Código", 1900], ["Título", 4988], ["Versão", 1200], ["Eficaz?", 1550],
            ].map(([value, width]) => new TableCell({
              width: { size: Number(width), type: WidthType.DXA },
              columnSpan: value === "Eficaz?" ? 2 : 1,
              rowSpan: value === "Eficaz?" ? 1 : 2,
              shading: { type: ShadingType.CLEAR, fill: "D9EAF7" },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({
                children: [text(String(value), { bold: true })],
                alignment: AlignmentType.CENTER,
                spacing: { before: 40, after: 40 },
              })],
            })),
          }),
          new TableRow({
            tableHeader: true,
            children: ["Sim", "Não"].map((value) => new TableCell({
              width: { size: 775, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, fill: "D9EAF7" },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({
                children: [text(value, { bold: true })],
                alignment: AlignmentType.CENTER,
                spacing: { before: 40, after: 40 },
              })],
            })),
          }),
          ...documentRows.map((document) => [
            document.code || "—",
            document.title || "—",
            document.version || "—",
            "☐",
            "☐",
          ]).map((row) =>
          new TableRow({
            children: row.map((value, columnIndex) =>
              new TableCell({
                width: { size: [1900, 4988, 1200, 775, 775][columnIndex], type: WidthType.DXA },
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({
                    children: [text(value)],
                    alignment: value === "☐" ? AlignmentType.CENTER : AlignmentType.LEFT,
                    spacing: { before: 40, after: 40 },
                  }),
                ],
              }),
            ),
          }),
        ),
        ],
      }),
    );
  }
  children.push(
    sectionTitle(5, `Análise de dados do local da avaliação em ${a.startDate?.slice(0, 4) || "____"}`),
    bodyParagraph([text(editableField, { italics: true, color: "7F7F7F" })]),
    sectionTitle(6, "Desenvolvimento da avaliação"),
    bodyParagraph(a.answers.some((answer) => answer.process.trim())
      ? `Processos auditados: ${[...new Set(a.answers.map((answer) => answer.process.trim()).filter(Boolean))].join("; ")}.`
      : "Processos auditados: não informados no checklist."),
    sectionTitle(7, "Resultado das avaliações anteriores"),
    bodyParagraph([text(editableField, { italics: true, color: "7F7F7F" })]),
    sectionTitle(8, "Sumário da avaliação"),
    bodyParagraph("Foram registrados os seguintes resultados durante a auditoria:"),
    new Paragraph({ text: `${counts.conforme} Conformidade(s);`, bullet: { level: 0 }, spacing: { after: 60 } }),
    new Paragraph({ text: `${counts.oportunidade} Oportunidade(s) de melhoria;`, bullet: { level: 0 }, spacing: { after: 60 } }),
    new Paragraph({ text: `${counts.naoConforme} Não conformidade(s);`, bullet: { level: 0 }, spacing: { after: 60 } }),
    new Paragraph({ text: `${counts.risco} Risco(s).`, bullet: { level: 0 }, spacing: { after: 140 } }),
  );
  if (nonConformities.length) {
    children.push(bodyParagraph([text("Localização das não conformidades:", { bold: true })]));
    nonConformities.forEach(({ answer, index }, ncIndex) => {
      children.push(bodyParagraph(
        `${ncIndex + 1}. Questão ${index + 1} — Requisito ${clean(answer.requirement)} — RAC: não informado.`,
      ));
    });
  } else {
    children.push(bodyParagraph("Não foram registradas não conformidades nesta auditoria."));
  }
  children.push(
    sectionTitle(9, "Parecer da equipe auditora (conclusão, pontos positivos e principais pontos de melhoria)"),
    bodyParagraph([text(editableField, { italics: true, color: "7F7F7F" })]),
    sectionTitle(10, "Processos verificados"),
    bodyParagraph("A seguir são apresentadas as constatações, evidências e classificações de todos os itens auditados."),
  );
  for (let i = 0; i < a.answers.length; i += 1) {
    const ans = a.answers[i];
    children.push(
      new Paragraph({
        children: [text(`${i + 1}. ${clean(ans.question)}`, { bold: true })],
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 300, after: 160, line: 276 },
        keepNext: true,
      }),
      questionLabel("Requisito", clean(ans.requirement)),
      ...(documentsOf(ans).length
        ? [
            bodyParagraph([text("Documentos aplicáveis:", { bold: true })]),
            ...documentsOf(ans).map((document, documentIndex) =>
              bodyParagraph(`${documentIndex + 1}. ${[
                  document.code,
                  document.title,
                  document.version && `Versão ${document.version}`,
                ].filter(Boolean).join(" — ")}`),
            ),
          ]
        : []),
      questionLabel("Classificação", ans.classification || "Não classificada"),
      questionLabel("Descrição", clean(ans.finding)),
      questionLabel("Evidência", clean(ans.recommendation)),
    );
    for (let j = 0; j < ans.photos.length; j += 1) {
      const p = ans.photos[j];
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: await imageBytes(p),
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
          children: [text(`Evidência fotográfica ${j + 1} — questão ${i + 1}`, { italics: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 180 },
        }),
      );
    }
  }
  return new Document({
      styles: {
        default: {
          document: { run: { font: reportFont, size: 22 } },
        },
      },
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        children,
      }],
    });
}
export async function exportDocx(a: Audit) {
  const blob = await Packer.toBlob(await buildAuditReport(a));
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
      "Tipo do documento": documentsOf(x).map((document) => document.type).join("\n"),
      "Código do documento": documentsOf(x).map((document) => document.code).join("\n"),
      "Título do documento": documentsOf(x).map((document) => document.title).join("\n"),
      Versão: documentsOf(x).map((document) => document.version).join("\n"),
      Descrição: x.finding,
      Evidência: x.recommendation,
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
