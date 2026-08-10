import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return respond({ error: "Configuração indisponível." }, 500);

    const payload = await request.json() as { email?: string };
    const email = payload.email?.trim().toLowerCase() ?? "";
    if (!email || email.length > 254 || !email.includes("@"))
      return respond({ error: "Informe um e-mail válido." }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: allowed } = await admin
      .from("audit_allowed_users")
      .select("auth_user_id, active")
      .eq("email", email)
      .eq("active", true)
      .maybeSingle();

    if (allowed?.auth_user_id) {
      const { data: pending } = await admin
        .from("audit_password_reset_requests")
        .select("id")
        .eq("user_id", allowed.auth_user_id)
        .eq("status", "Pendente")
        .maybeSingle();

      if (!pending) {
        const { error } = await admin
          .from("audit_password_reset_requests")
          .insert({ user_id: allowed.auth_user_id });
        if (error && error.code !== "23505") throw error;
      }
    }

    return respond({ success: true, message: "Se o e-mail estiver cadastrado e ativo, a solicitação será encaminhada ao administrador." });
  } catch (error) {
    console.error("password reset request failed", error);
    return respond({ error: "Não foi possível registrar a solicitação agora. Tente novamente mais tarde." }, 500);
  }
});

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
