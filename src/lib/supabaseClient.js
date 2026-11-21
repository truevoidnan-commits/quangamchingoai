import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (typeof window !== 'undefined' && window.__SUPABASE_URL__) || import.meta.env?.VITE_SUPABASE_URL || 'https://vmzgjlooapqskcmkerdz.supabase.co';
const SUPABASE_ANON_KEY = (typeof window !== 'undefined' && window.__SUPABASE_ANON_KEY__) || import.meta.env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable__kwruXvVnJL2NY4iYFE63w_8xGPMsac';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
