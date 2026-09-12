import { createClient } from '@supabase/supabase-js';

// Supabase configuration provided by the user
export const SUPABASE_URL = 'https://zzdchsxfjzedgciejuxd.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_hVnY9GCh8CgWbPFhOES-Tg_SXPuixaf';

export const SUPABASE_CONFIG = {
  projectId: 'zzdchsxfjzedgciejuxd',
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  restApi: 'https://zzdchsxfjzedgciejuxd.supabase.co/rest/v1/',
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Helper to check connection health or Supabase readiness
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('students').select('id').limit(1);
    // If the table exists or returns empty data without network crash, we're connected
    if (error && error.code !== 'PGRST116') {
      console.warn('Supabase ping notice:', error.message);
    }
    return true;
  } catch (err) {
    console.warn('Supabase offline or fallback active:', err);
    return false;
  }
}
