import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type UserAction =
  | { action: "list" }
  | { action: "create"; email: string; fullName: string; role?: "admin" | "auditor" }
  | { action: "update"; userId: string; fullName: string; role: "admin" | "auditor" }
  | { action: "set_active"; userId: string; active: boolean }
  | { action: "reset_temporary_password"; userId: string }
  | { action: "delete"; userId: string };

const temporaryPassword = "AFPESP@1234";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    if (request.method !== "POST")
      return response({ error: "Método não permitido." }, 405);

    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer "))
      return response({ error: "Sessão não informada." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey)
      return response({ error: "Configuração do servidor indisponível." }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const token = authorization.slice("Bearer ".length);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user)
      return response({ error: "Sessão inválida ou expirada." }, 401);

    const { data: requester, error: profileError } = await admin
      .from("audit_profiles")
      .select("role, active")
      .eq("id", authData.user.id)
      .single();
    if (profileError || !requester?.active || requester.role !== "admin")
      return response({ error: "Apenas o administrador pode gerenciar usuários." }, 403);

    const payload = (await request.json()) as UserAction;

    if (payload.action === "list") {
      const { data, error } = await admin
        .from("audit_allowed_users")
        .select("id, email, full_name, role, active, auth_user_id, created_at")
        .order("full_name");
      if (error) throw error;
      return response({ users: data });
    }

    if (payload.action === "create") {
      const email = payload.email.trim().toLowerCase();
      const fullName = payload.fullName.trim();
      const role = payload.role ?? "auditor";
      if (!email || !fullName) return response({ error: "Informe nome e e-mail." }, 400);

      const { error: allowError } = await admin
        .from("audit_allowed_users")
        .upsert({ email, full_name: fullName, role, active: true }, { onConflict: "email" });
      if (allowError) throw allowError;

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error) throw error;
      return response({ userId: data.user.id, temporaryPasswordRequired: true }, 201);
    }

    if (payload.action === "update") {
      const fullName = payload.fullName.trim();
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(payload.userId, {
        user_metadata: { full_name: fullName },
      });
      if (authUpdateError) throw authUpdateError;
      const { error: allowedError } = await admin
        .from("audit_allowed_users")
        .update({ full_name: fullName, role: payload.role })
        .eq("auth_user_id", payload.userId);
      if (allowedError) throw allowedError;
      const { error: profileUpdateError } = await admin
        .from("audit_profiles")
        .update({ full_name: fullName, role: payload.role })
        .eq("id", payload.userId);
      if (profileUpdateError) throw profileUpdateError;
      return response({ success: true });
    }

    if (payload.action === "set_active") {
      if (payload.userId === authData.user.id && !payload.active)
        return response({ error: "O administrador não pode desativar o próprio acesso." }, 400);
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(payload.userId, {
        ban_duration: payload.active ? "none" : "876000h",
      });
      if (authUpdateError) throw authUpdateError;
      const { error: allowedError } = await admin
        .from("audit_allowed_users")
        .update({ active: payload.active })
        .eq("auth_user_id", payload.userId);
      if (allowedError) throw allowedError;
      const { error: profileUpdateError } = await admin
        .from("audit_profiles")
        .update({ active: payload.active })
        .eq("id", payload.userId);
      if (profileUpdateError) throw profileUpdateError;
      return response({ success: true });
    }

    if (payload.action === "reset_temporary_password") {
      const { error } = await admin.auth.admin.updateUserById(payload.userId, {
        password: temporaryPassword,
      });
      if (error) throw error;
      const { error: profileUpdateError } = await admin
        .from("audit_profiles")
        .update({ must_change_password: true })
        .eq("id", payload.userId);
      if (profileUpdateError) throw profileUpdateError;
      return response({ success: true, temporaryPasswordRequired: true });
    }

    if (payload.action === "delete") {
      if (payload.userId === authData.user.id)
        return response({ error: "O administrador não pode excluir a própria conta." }, 400);
      const { error: deleteError } = await admin.auth.admin.deleteUser(payload.userId);
      if (deleteError) throw deleteError;
      const { error: allowDeleteError } = await admin
        .from("audit_allowed_users")
        .delete()
        .eq("auth_user_id", payload.userId);
      if (allowDeleteError) throw allowDeleteError;
      return response({ success: true });
    }

    return response({ error: "Ação não reconhecida." }, 400);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Erro inesperado." }, 400);
  }
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
