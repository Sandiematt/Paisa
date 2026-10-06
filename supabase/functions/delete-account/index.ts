// Permanently deletes the calling user's auth account.
//
// public.profiles, public.categories and public.transactions all reference
// auth.users with ON DELETE CASCADE, so removing the auth user removes every
// row they own. Deleting an auth user needs the service role, which is why
// this lives server-side: the caller is identified from their own JWT and can
// only ever delete themselves.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
  });
}

/** Reads either the modern (JSON map) or legacy (plain string) key secret. */
function resolveKey(legacyName: string, mapName: string): string | null {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;

  const keys = Deno.env.get(mapName);
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      return parsed.default ?? Object.values(parsed)[0] ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {headers: CORS_HEADERS});
  }

  if (req.method !== 'POST') {
    return jsonResponse({error: 'Method not allowed. Use POST.'}, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = resolveKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS');
  const serviceKey = resolveKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('delete-account: missing SUPABASE_URL, anon key, or service key secret');
    return jsonResponse({error: 'Server misconfigured.'}, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({error: 'Missing Authorization header.'}, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {headers: {Authorization: authHeader}},
    auth: {persistSession: false, autoRefreshToken: false},
  });

  const {
    data: {user},
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({error: 'Invalid or expired session.'}, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {persistSession: false, autoRefreshToken: false},
  });

  const {error: deleteError} = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('delete-account: failed to delete user', user.id, deleteError);
    return jsonResponse({error: 'Could not delete this account. Try again.'}, 500);
  }

  return jsonResponse({deleted: true}, 200);
});
