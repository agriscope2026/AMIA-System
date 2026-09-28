import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("The account-management function is missing its Supabase server configuration");
    }
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error("Authentication is required");

    const { programId, email, fullName, role } = await request.json();
    if (typeof programId !== "string" || !programId || typeof email !== "string" || !email.trim()
      || typeof fullName !== "string" || !fullName.trim() || !["editor", "viewer"].includes(role)) {
      throw new Error("programId, email, fullName, and a valid role are required");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: membership, error: membershipError } = await adminClient.from("program_members").select("role").eq("program_id", programId).eq("user_id", userData.user.id).maybeSingle();
    if (membershipError) throw membershipError;
    if (membership?.role !== "program_admin") throw new Error("Only program admins can invite users");

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName } });
    if (inviteError) throw inviteError;
    if (!invited.user) throw new Error("The invitation could not be created");

    const { error: profileError } = await adminClient.from("profiles").upsert({ id: invited.user.id, email, full_name: fullName });
    if (profileError) throw profileError;
    const { error: memberError } = await adminClient.from("program_members").upsert({ program_id: programId, user_id: invited.user.id, role }, { onConflict: "program_id,user_id" });
    if (memberError) throw memberError;

    return jsonResponse({ message: `Invitation sent to ${email}` });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error" }, 400);
  }
});
