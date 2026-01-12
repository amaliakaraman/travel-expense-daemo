/**
 * Supabase Client
 * 
 * Air-Gapped Data: The LLM never sees these credentials.
 * Only tool functions in our service interact with Supabase.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

/**
 * Get the Supabase client singleton.
 * Credentials are loaded from environment variables (never exposed to LLM).
 */
export function getSupabase(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is not configured in environment');
  }

  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in environment');
  }

  supabaseInstance = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseInstance;
}

/**
 * Test the Supabase connection
 * @returns true if connection is working
 */
export async function testConnection(): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('users').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}