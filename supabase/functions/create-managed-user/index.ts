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

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error("Authentication is required");

    const { programId, email, fullName, password, role } = await request.json();
    if (!email || !fullName || !password || !["superadmin", "program_admin", "viewer"].includes(role)) throw new Error("Full name, email, password, and role are required");
    if (password.length < 8) throw new Error("Password must contain at least 8 characters");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: creatorProfile } = await adminClient.from("profiles").select("system_role").eq("id", userData.user.id).single();
    const isSuperadmin = creatorProfile?.system_role === "superadmin";
    const { data: creatorMembership } = programId ? await adminClient.from("program_members").select("role").eq("program_id", programId).eq("user_id", userData.user.id).single() : { data: null };
    const isProgramAdmin = creatorMembership?.role === "program_admin";

    if (role === "superadmin" || role === "program_admin") {
      if (!isSuperadmin) throw new Error("Only a superadmin can create this account type");
      if (role === "program_admin" && !programId) throw new Error("A program is required for a program admin");
    } else if (!isSuperadmin && !isProgramAdmin) {
      throw new Error("Only a superadmin or program admin can create viewer accounts");
    }
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (createError) throw createError;
    if (!created.user) throw new Error("Account creation failed");

    const { error: profileError } = await adminClient.from("profiles").upsert({ id: created.user.id, full_name: fullName, email, system_role: role === "superadmin" ? "superadmin" : "user" });
    if (profileError) throw profileError;
    if (role !== "superadmin") {
      const { error: membershipError } = await adminClient.from("program_members").insert({ program_id: programId, user_id: created.user.id, role });
      if (membershipError) throw membershipError;
    }

    return new Response(JSON.stringify({ message: `${role} account created for ${email}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
