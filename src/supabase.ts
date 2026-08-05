import { createClient } from "@supabase/supabase-js";

const projectUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://akexwgzlreorfmhgvrnz.supabase.co";

const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_HVr3XHe3NXdVNrpkMeXxXw_b1yjyPjD";

export const supabase = createClient(projectUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function verifySupabaseConnection() {
  const { error } = await supabase.auth.getSession();
  if (error) throw error;
  return true;
}
