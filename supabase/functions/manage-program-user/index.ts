import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Authentication is required");
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
    const { data: current, error: authError } = await userClient.auth.getUser();
    if (authError || !current.user) throw new Error("Authentication is required");
    const { action, programId, userId, fullName, role } = await request.json();
    if (!action || !programId || !userId || (action === "update" && (!fullName || !["program_admin", "viewer"].includes(role)))) throw new Error("Invalid account update request");
    const adminClient = createClient(url, serviceKey);
    const { data: creator } = await adminClient.from("profiles").select("system_role").eq("id", current.user.id).single();
    const { data: membership } = await adminClient.from("program_members").select("role").eq("program_id", programId).eq("user_id", current.user.id).single();
    if (creator?.system_role !== "superadmin" && membership?.role !== "program_admin") throw new Error("You cannot manage users for this program");
    if (action === "delete") {
      const { error } = await adminClient.from("program_members").delete().eq("program_id", programId).eq("user_id", userId);
      if (error) throw error;
      return new Response(JSON.stringify({ message: "Program access revoked" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (creator?.system_role !== "superadmin" && role !== "viewer") throw new Error("Program admins can only assign viewer access");
    const { error: memberError } = await adminClient.from("program_members").update({ role }).eq("program_id", programId).eq("user_id", userId);
    if (memberError) throw memberError;
    const { error: profileError } = await adminClient.from("profiles").update({ full_name: fullName, updated_at: new Date().toISOString() }).eq("id", userId);
    if (profileError) throw profileError;
    return new Response(JSON.stringify({ message: "Account updated" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});