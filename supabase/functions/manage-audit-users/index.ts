import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type UserAction =
  | { action: "list" }
  | { action: "backup" }
  | { action: "create"; email: string; fullName: string; role?: "admin" | "auditor" }
  | { action: "update"; userId: string; fullName: string; role: "admin" | "auditor" }
  | { action: "set_active"; userId: string; active: boolean }
  | { action: "reset_temporary_password"; userId: string; requestId?: string }
  | { action: "cancel_password_reset"; requestId: string }
  | { action: "delete"; userId: string }
  | { action: "delete_pending"; allowedUserId: string };

const createTemporaryPassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `Af!${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
};

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
      const { data: users, error } = await admin
        .from("audit_allowed_users")
        .select("id, email, full_name, role, active, auth_user_id, created_at")
        .order("full_name");
      if (error) throw error;
      const { data: requests, error: requestError } = await admin
        .from("audit_password_reset_requests")
        .select("id, user_id, status, requested_at, audit_profiles!audit_password_reset_requests_user_id_fkey(full_name)")
        .eq("status", "Pendente")
        .order("requested_at", { ascending: false });
      if (requestError) throw requestError;
      return response({ users, passwordResetRequests: requests });
    }

    if (payload.action === "backup") {
      const tables = [
        "audit_allowed_users", "audit_profiles", "audit_units", "audit_documents",
        "audit_checklists", "audit_document_imports", "audit_records",
        "audit_record_summaries", "audit_notifications", "audit_password_reset_requests",
        "audit_annual_plan_items", "audits", "audit_answers", "audit_photos",
      ] as const;
      const results = await Promise.all(tables.map(async (table) => {
        const { data, error } = await admin.from(table).select("*");
        if (error) throw new Error(`${table}: ${error.message}`);
        return [table, data ?? []] as const;
      }));
      return response({
        formatVersion: 2,
        generatedAt: new Date().toISOString(),
        project: "auditflow-platform",
        projectId: "akexwgzlreorfmhgvrnz",
        tables: Object.fromEntries(results),
        note: "Backup lógico completo dos dados da aplicação. A estrutura é versionada pelas migrações do repositório.",
      });
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

      const temporaryPassword = createTemporaryPassword();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error) throw error;
      return response({ userId: data.user.id, temporaryPasswordRequired: true, temporaryPassword }, 201);
    }

    if (payload.action === "update") {
      const fullName = payload.fullName.trim();
      if (payload.userId === authData.user.id && payload.role !== "admin")
        return response({ error: "O administrador não pode remover o próprio perfil administrativo." }, 400);
      const { data: targetProfile } = await admin.from("audit_profiles").select("role, active").eq("id", payload.userId).single();
      if (targetProfile?.role === "admin" && targetProfile.active && payload.role !== "admin") {
        const { count } = await admin.from("audit_profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("active", true);
        if ((count ?? 0) <= 1) return response({ error: "Mantenha ao menos um administrador ativo no sistema." }, 400);
      }
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
      const temporaryPassword = createTemporaryPassword();
      const { error } = await admin.auth.admin.updateUserById(payload.userId, {
        password: temporaryPassword,
      });
      if (error) throw error;
      const { error: profileUpdateError } = await admin
        .from("audit_profiles")
        .update({ must_change_password: true })
        .eq("id", payload.userId);
      if (profileUpdateError) throw profileUpdateError;
      if (payload.requestId) {
        const { error: requestError } = await admin
          .from("audit_password_reset_requests")
          .update({ status: "Concluída", resolved_at: new Date().toISOString(), resolved_by: authData.user.id })
          .eq("id", payload.requestId)
          .eq("user_id", payload.userId)
          .eq("status", "Pendente");
        if (requestError) throw requestError;
      }
      return response({ success: true, temporaryPasswordRequired: true, temporaryPassword });
    }

    if (payload.action === "cancel_password_reset") {
      const { error } = await admin
        .from("audit_password_reset_requests")
        .update({ status: "Cancelada", resolved_at: new Date().toISOString(), resolved_by: authData.user.id })
        .eq("id", payload.requestId)
        .eq("status", "Pendente");
      if (error) throw error;
      return response({ success: true });
    }

    if (payload.action === "delete") {
      if (payload.userId === authData.user.id)
        return response({ error: "O administrador não pode excluir a própria conta." }, 400);
      const { data: allowedUser } = await admin
        .from("audit_allowed_users")
        .select("id")
        .eq("auth_user_id", payload.userId)
        .maybeSingle();
      const { error: deleteError } = await admin.auth.admin.deleteUser(payload.userId);
      if (deleteError) throw deleteError;
      if (allowedUser?.id) {
        const { error: allowDeleteError } = await admin
          .from("audit_allowed_users")
          .delete()
          .eq("id", allowedUser.id);
        if (allowDeleteError) throw allowDeleteError;
      }
      return response({ success: true });
    }

    if (payload.action === "delete_pending") {
      const { data: pendingUser, error: pendingError } = await admin
        .from("audit_allowed_users")
        .select("id, auth_user_id")
        .eq("id", payload.allowedUserId)
        .single();
      if (pendingError) throw pendingError;
      if (pendingUser.auth_user_id)
        return response({ error: "Este usuário já possui uma conta criada." }, 400);
      const { error } = await admin
        .from("audit_allowed_users")
        .delete()
        .eq("id", pendingUser.id);
      if (error) throw error;
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
