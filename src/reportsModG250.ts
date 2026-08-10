import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeightRule, ImageRun, PageBreak,
  PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun,
  VerticalAlign, WidthType,
} from "docx";
import type { Answer, Audit, DocumentReference } from "./types";

const FONT = "Arial";
const BLUE = "0000FF";
const LIGHT_BLUE = "B8CCE4";
const EDITABLE = "[Campo editável — preencher no Word]";
const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder };

const run = (value: string, options: { bold?: boolean; size?: number; color?: string; italics?: boolean; underline?: object } = {}) =>
  new TextRun({ text: value, font: FONT, size: options.size ?? 22, bold: options.bold, color: options.color, italics: options.italics, underline: options.underline });
const paragraph = (children: TextRun[] | string, options: { alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; keepNext?: boolean; indent?: number } = {}) =>
  new Paragraph({
    children: typeof children === "string" ? [run(children)] : children,
    alignment: options.alignment ?? AlignmentType.JUSTIFIED,
    spacing: { before: options.before ?? 0, after: options.after ?? 100, line: 276 },
    keepNext: options.keepNext,
    indent: options.indent ? { left: options.indent } : undefined,
  });
const editable = () => paragraph([run(EDITABLE, { italics: true, color: "7F7F7F" })], { after: 180 });
const sectionTitle = (number: number, title: string) => paragraph([run(`${number} - ${title}`, { bold: true })], { before: 220, after: 120, keepNext: true });
const formatDate = (value?: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "Não informado";
const clean = (value?: string) => value?.trim() || "Não informado";
const docsOf = (answer: Answer): DocumentReference[] => answer.documents?.length
  ? answer.documents
  : answer.documentType || answer.documentCode || answer.documentTitle || answer.documentVersion
    ? [{ type: answer.documentType || "", code: answer.documentCode || "", title: answer.documentTitle || "", version: answer.documentVersion || "" }]
    : [];
const splitRequirements = (value: string) => value.split(/[;,|/\n]+/).map((item) => item.trim()).filter(Boolean);
const imageBytes = async (url: string) => {
  if (url.startsWith("data:")) return Uint8Array.from(atob(url.split(",")[1]), (char) => char.charCodeAt(0));
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
};

const headerTable = (logo: Uint8Array, unit?: string) => new Table({
  width: { size: 9498, type: WidthType.DXA }, columnWidths: [1560, 7938], borders,
  rows: [new TableRow({ height: { value: 820, rule: HeightRule.EXACT }, children: [
    new TableCell({ width: { size: 1560, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: logo, transformation: { width: 46, height: 54 }, type: "png", altText: { title: "Brasão AFPESP", description: "Brasão institucional da AFPESP", name: "brasao-afpesp" } })] })] }),
    new TableCell({ width: { size: 7938, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run("AVALIAÇÃO DO SISTEMA DA QUALIDADE", { bold: true, size: 22 })] }),
      ...(unit ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(unit.toUpperCase(), { bold: true, size: 16, color: BLUE })] })] : []),
    ] }),
  ] })],
});

const footerTable = () => new Table({
  width: { size: 9498, type: WidthType.DXA }, columnWidths: [3166, 3166, 3166], borders: noBorders,
  rows: [new TableRow({ children: [
    new TableCell({ width: { size: 3166, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph({ children: [] })] }),
    new TableCell({ width: { size: 3166, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16 }), run("/", { size: 16 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16 })] })] }),
    new TableCell({ width: { size: 3166, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run("Mod. G 250 versão 009", { size: 16 })] })] }),
  ] })],
});

const defaultFooter = () => new Footer({ children: [
  new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 40 }, children: [run("Obs.: Todas as não conformidades apontadas neste relatório são tratadas formalmente, via sistema eletrônico “Módulo da Qualidade”, que tem como função analisar as causas dos problemas e estabelecer as ações juntamente com os respectivos responsáveis e prazos.", { size: 14, italics: true })] }),
  footerTable(),
] });
const firstFooter = () => new Footer({ children: [footerTable()] });

const documentTable = (rows: { requirement: string; document: DocumentReference }[]) => new Table({
  width: { size: 9498, type: WidthType.DXA }, columnWidths: [1843, 5670, 851, 567, 567], borders,
  rows: [
    new TableRow({ tableHeader: true, children: [
      new TableCell({ width: { size: 1843, type: WidthType.DXA }, rowSpan: 2, shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run("Requisito NBR ISO 9001:2015", { bold: true, size: 18 })] })] }),
      new TableCell({ width: { size: 5670, type: WidthType.DXA }, rowSpan: 2, shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run("Documento(s)", { bold: true, size: 18 })] })] }),
      new TableCell({ width: { size: 851, type: WidthType.DXA }, rowSpan: 2, shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run("Versão", { bold: true, size: 18 })] })] }),
      new TableCell({ width: { size: 1134, type: WidthType.DXA }, columnSpan: 2, shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run("Eficaz?", { bold: true, size: 18 })] })] }),
    ] }),
    new TableRow({ tableHeader: true, children: ["Sim", "Não"].map((value) => new TableCell({ width: { size: 567, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(value, { bold: true, size: 18 })] })] })) }),
    ...rows.map(({ requirement, document }) => new TableRow({ children: [
      [requirement || "—", 1843, AlignmentType.CENTER],
      [[document.code, document.title].filter(Boolean).join(" — ") || "—", 5670, AlignmentType.LEFT],
      [document.version || "—", 851, AlignmentType.CENTER],
      ["☐", 567, AlignmentType.CENTER], ["☐", 567, AlignmentType.CENTER],
    ].map(([value, width, alignment]) => new TableCell({ width: { size: Number(width), type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: alignment as (typeof AlignmentType)[keyof typeof AlignmentType], spacing: { before: 30, after: 30 }, children: [run(String(value), { size: 18 })] })] })) })),
  ],
});

export async function buildModG250Report(a: Audit) {
  const baseUrl = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  const logo = await imageBytes(`${baseUrl}brasao-afpesp.png`);
  const unitTitle = `${a.locationType} — ${a.unit}`;
  const docRows = Array.from(new Map(a.answers.flatMap((answer) => docsOf(answer).map((document) => ({ requirement: splitRequirements(answer.requirement).join("; "), document }))).map((item) => [`${item.requirement}|${item.document.type}|${item.document.code}|${item.document.title}|${item.document.version}`, item])).values());
  const counts = {
    conforme: a.answers.filter((item) => item.classification === "Conforme").length,
    oportunidade: a.answers.filter((item) => item.classification === "Oportunidade de Melhoria").length,
    naoConforme: a.answers.filter((item) => item.classification === "Não Conforme").length,
    risco: a.answers.filter((item) => item.classification === "Risco").length,
  };
  const processes = [...new Set(a.answers.map((answer) => answer.process.trim()).filter(Boolean))];
  const children: (Paragraph | Table)[] = [
    ...Array.from({ length: 5 }, () => new Paragraph({ children: [] })),
    paragraph([run(unitTitle, { bold: true, size: 56 })], { alignment: AlignmentType.CENTER, after: 620 }),
    paragraph([run(`Data: ${formatDate(a.startDate)}${a.endDate && a.endDate !== a.startDate ? ` a ${formatDate(a.endDate)}` : ""}`, { bold: true })], { alignment: AlignmentType.CENTER, after: 700 }),
    paragraph([run("Escopo: "), run(clean(a.scope))], { alignment: AlignmentType.JUSTIFIED, after: 820, indent: 540 }),
    paragraph([run(`Equipe Auditora: ${a.auditors.join(", ") || "Não informado"}`)], { alignment: AlignmentType.RIGHT, after: 80 }),
    paragraph([run(`Aprovado por: ${a.approvedBy || EDITABLE}`)], { alignment: AlignmentType.RIGHT, after: 0 }),
    new Paragraph({ children: [new PageBreak()] }),
    sectionTitle(1, "Objetivo"), paragraph(clean(a.objective)),
    sectionTitle(2, "Responsável pelo setor"), editable(),
    sectionTitle(3, "Auditados"), editable(),
    sectionTitle(4, "Requisitos da NBR ISO 9001:2015 e verificação da eficácia de treinamentos"),
    ...(docRows.length ? [documentTable(docRows)] : [editable()]),
    sectionTitle(5, `Análise de dados ${unitTitle} em ${a.startDate?.slice(0, 4) || "____"}`), editable(),
    sectionTitle(6, "Desenvolvimento da Avaliação"),
    paragraph(processes.length ? `Foram avaliados os seguintes processos/assuntos: ${processes.join("; ")}.` : EDITABLE),
    sectionTitle(7, "Resultado das Avaliações anteriores"), editable(),
    sectionTitle(8, "Sumário da auditoria"),
    paragraph("Quantidade de apontamentos registrados na auditoria:"),
    new Paragraph({ text: `${counts.conforme} Conformidade(s);`, bullet: { level: 0 }, spacing: { after: 50 } }),
    new Paragraph({ text: `${counts.oportunidade} Oportunidade(s) de melhoria;`, bullet: { level: 0 }, spacing: { after: 50 } }),
    new Paragraph({ text: `${counts.naoConforme} Não conformidade(s);`, bullet: { level: 0 }, spacing: { after: 50 } }),
    new Paragraph({ text: `${counts.risco} Risco(s).`, bullet: { level: 0 }, spacing: { after: 120 } }),
    ...(counts.naoConforme ? a.answers.map((answer, index) => ({ answer, index })).filter(({ answer }) => answer.classification === "Não Conforme").map(({ answer, index }, ncIndex) => paragraph(`${ncIndex + 1}. Item 10.${index + 1} — requisito ${clean(answer.requirement)} — RAC: ${EDITABLE}`)) : [paragraph("Não foram registradas não conformidades nesta auditoria.")]),
    sectionTitle(9, "Parecer da equipe auditora (conclusão, pontos positivos e principais pontos de melhorias)"), editable(),
    sectionTitle(10, "Processos verificados"),
    paragraph("São apresentadas a seguir as constatações, evidências e classificações dos itens auditados."),
  ];

  for (let index = 0; index < a.answers.length; index += 1) {
    const answer = a.answers[index];
    const requirements = splitRequirements(answer.requirement).join("; ") || "Não informado";
    const references = docsOf(answer);
    const evidences = answer.evidences?.length ? answer.evidences : [answer.recommendation || ""];
    children.push(
      paragraph([run(`10.${index + 1} - ${clean(answer.question)}`, { underline: {} })], { before: 240, after: 100, keepNext: true }),
      paragraph([run("Requisito(s): ", { bold: true }), run(requirements)], { after: 80, keepNext: true }),
      paragraph([
        run("Documentos aplicáveis: ", { bold: true }),
        run(references.length
          ? references.map((document) => [document.code, document.title, document.version && `v.${document.version}`].filter(Boolean).join(" — ")).join("; ")
          : "Nenhum documento aplicável informado"),
      ], { after: 80, keepNext: true }),
      paragraph([run("Status: ", { bold: true }), run(answer.classification || "Não classificada")], { after: 80, keepNext: true }),
      paragraph([run("Descrição: ", { bold: true }), run(clean(answer.finding))], { after: 80, keepNext: true }),
      ...evidences.map((evidence, evidenceIndex) => paragraph([run(`Evidência ${evidenceIndex + 1}: `, { bold: true }), run(clean(evidence))], { after: 80, keepNext: evidenceIndex < evidences.length - 1 })),
    );
    for (let photoIndex = 0; photoIndex < answer.photos.length; photoIndex += 1) {
      const photo = answer.photos[photoIndex];
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 40 }, children: [new ImageRun({ data: await imageBytes(photo), transformation: { width: 470, height: 310 }, type: photo.includes("png") ? "png" : "jpg", altText: { title: `Evidência fotográfica ${photoIndex + 1}`, description: `Fotografia da questão 10.${index + 1}`, name: `questao-${index + 1}-foto-${photoIndex + 1}` } })] }), paragraph([run(`Evidência fotográfica ${photoIndex + 1} — item 10.${index + 1}`, { italics: true, size: 18 })], { alignment: AlignmentType.CENTER, after: 120 }));
    }
  }

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { line: 276 } } } } },
    sections: [{
      properties: { titlePage: true, page: { size: { width: 11906, height: 16838 }, margin: { top: 1117, right: 1287, bottom: 1438, left: 902, header: 740, footer: 318 } } },
      headers: { first: new Header({ children: [headerTable(logo)] }), default: new Header({ children: [headerTable(logo, unitTitle)] }) },
      footers: { first: firstFooter(), default: defaultFooter() },
      children,
    }],
  });
}
