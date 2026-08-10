import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const model = "gpt-5-mini";
const promptVersion = "audit-text-v2-multiple-evidences";

type ReviewPayload = {
  auditId: string;
  answerId: string;
  question: string;
  requirement: string;
  classification: string | null;
  finding: string;
  evidences: string[];
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Sessão não informada." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!supabaseUrl || !serviceRoleKey || !openAiKey)
      return json({ error: "A revisão com IA ainda não está configurada no servidor." }, 503);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const token = authorization.slice("Bearer ".length);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sessão inválida ou expirada." }, 401);

    const payload = (await request.json()) as ReviewPayload;
    if (!payload.auditId || !payload.answerId) return json({ error: "Auditoria ou questão não informada." }, 400);
    if ((payload.finding?.length ?? 0) > 10000 || !Array.isArray(payload.evidences) || payload.evidences.length > 20 || payload.evidences.some((value) => typeof value !== "string" || value.length > 10000))
      return json({ error: "O texto informado excede o limite permitido." }, 400);

    const [{ data: profile }, { data: record }] = await Promise.all([
      admin.from("audit_profiles").select("full_name, role, active").eq("id", authData.user.id).single(),
      admin.from("audit_records").select("status, data").eq("id", payload.auditId).single(),
    ]);
    if (!profile?.active) return json({ error: "Usuário sem acesso ativo." }, 403);
    if (!record || record.status === "Programada")
      return json({ error: "Inicie a auditoria antes de solicitar a revisão com IA." }, 400);

    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
    const auditors = Array.isArray(record.data?.auditors) ? record.data.auditors.filter((value: unknown) => typeof value === "string") : [];
    const authorized = profile.role === "admin" || auditors.some((name: string) => normalize(name) === normalize(profile.full_name));
    if (!authorized) return json({ error: "Somente auditores responsáveis ou o administrador podem usar a revisão com IA." }, 403);

    const answers = Array.isArray(record.data?.answers) ? record.data.answers : [];
    if (!answers.some((answer: { id?: string }) => answer.id === payload.answerId))
      return json({ error: "A questão não pertence a esta auditoria." }, 400);

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        instructions: `Você é um revisor técnico de relatórios de auditoria da AFPESP. Melhore clareza, objetividade, gramática e linguagem técnica sem criar fatos, evidências, requisitos ou conclusões. Preserve nomes, datas, números e o sentido original. O campo descrição registra a constatação. Cada item do campo evidências registra somente fatos, documentos, registros ou observações que sustentam a constatação. Preserve a quantidade e a separação das evidências recebidas. Se faltar conteúdo, mantenha o campo como está; nunca preencha lacunas por suposição.`,
        input: JSON.stringify({
          questao: payload.question,
          requisito: payload.requirement,
          classificacao: payload.classification,
          descricao_original: payload.finding,
          evidencias_originais: payload.evidences,
        }),
        text: {
          format: {
            type: "json_schema",
            name: "audit_text_review",
            strict: true,
            schema: {
              type: "object",
              properties: { finding: { type: "string" }, evidences: { type: "array", items: { type: "string" } } },
              required: ["finding", "evidences"],
              additionalProperties: false,
            },
          },
        },
      }),
    });
    const responseBody = await openAiResponse.json();
    if (!openAiResponse.ok) {
      const providerCode = responseBody?.error?.code ?? responseBody?.error?.type ?? "provider_error";
      console.error("review-audit-text provider", providerCode, responseBody?.error?.message ?? "unknown");
      const message = providerCode === "insufficient_quota"
        ? "A conta da API de IA está sem créditos ou atingiu o limite de gastos. O administrador deve regularizar o faturamento da API."
        : providerCode === "invalid_api_key"
          ? "A chave da API de IA é inválida. O administrador deve atualizar a configuração."
          : providerCode === "model_not_found"
            ? "O projeto da API não possui acesso ao modelo configurado."
            : "O serviço de IA não conseguiu revisar o texto neste momento.";
      return json({ error: message, code: providerCode }, 502);
    }
    const outputText = responseBody.output?.flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content ?? [])
      .find((content: { type?: string }) => content.type === "output_text")?.text;
    if (!outputText) return json({ error: "A IA não retornou uma sugestão válida." }, 502);
    const suggestion = JSON.parse(outputText);
    return json({ suggestion, model, promptVersion });
  } catch (error) {
    console.error("review-audit-text", error instanceof Error ? error.message : "unexpected_error");
    return json({ error: "Não foi possível concluir a revisão com IA." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
