import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const authorization = request.headers.get("Authorization");
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) throw new Error("The account-management function is missing its Supabase server configuration");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required");
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: current, error: authError } = await userClient.auth.getUser();
    if (authError || !current.user) throw new Error("Authentication is required");
    const { action, programId, userId, fullName, role } = await request.json();
    if (!action || !programId || !userId || (action === "update" && (!fullName || !["program_admin", "viewer"].includes(role)))) throw new Error("Invalid account update request");
    const adminClient = createClient(url, serviceKey);
    const { data: creator, error: creatorError } = await adminClient.from("profiles").select("system_role").eq("id", current.user.id).single();
    if (creatorError) throw creatorError;
    const { data: membership, error: membershipError } = await adminClient.from("program_members").select("role").eq("program_id", programId).eq("user_id", current.user.id).maybeSingle();
    if (membershipError) throw membershipError;
    if (creator?.system_role !== "superadmin" && membership?.role !== "program_admin") throw new Error("You cannot manage users for this program");
    if (action === "delete") {
      const { error } = await adminClient.from("program_members").delete().eq("program_id", programId).eq("user_id", userId);
      if (error) throw error;
      return jsonResponse({ message: "Program access revoked" });
    }
    if (creator?.system_role !== "superadmin" && role !== "viewer") throw new Error("Program admins can only assign viewer access");
    const { error: memberError } = await adminClient.from("program_members").update({ role }).eq("program_id", programId).eq("user_id", userId);
    if (memberError) throw memberError;
    const { error: profileError } = await adminClient.from("profiles").update({ full_name: fullName, updated_at: new Date().toISOString() }).eq("id", userId);
    if (profileError) throw profileError;
    return jsonResponse({ message: "Account updated" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error" }, 400);
  }
});