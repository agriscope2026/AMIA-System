import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Authentication is required");

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error("Authentication is required");

    const { programId, email, fullName, role } = await request.json();
    if (!programId || !email || !fullName || !["editor", "viewer"].includes(role)) throw new Error("programId, email, fullName, and role are required");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: membership } = await adminClient.from("program_members").select("role").eq("program_id", programId).eq("user_id", userData.user.id).single();
    if (membership?.role !== "admin") throw new Error("Only program admins can invite users");

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName } });
    if (inviteError) throw inviteError;
    if (!invited.user) throw new Error("The invitation could not be created");

    const { error: profileError } = await adminClient.from("profiles").upsert({ id: invited.user.id, email, full_name: fullName });
    if (profileError) throw profileError;
    const { error: memberError } = await adminClient.from("program_members").upsert({ program_id: programId, user_id: invited.user.id, role }, { onConflict: "program_id,user_id" });
    if (memberError) throw memberError;

    return new Response(JSON.stringify({ message: `Invitation sent to ${email}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
