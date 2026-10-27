import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://iizveigisatnewcoeuwa.supabase.co').trim();
const rawKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpenZlaWdpc2F0bmV3Y29ldXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwOTI1MDYsImV4cCI6MjEwODY2ODUwNn0.sCfUNVUXr4Ms16Dwr9wwFyv1vNaWVkotXd97TrtK9dY'
).trim();

// Strip any trailing accidental placeholder text like '.your-anon-key-here'
export const supabaseUrl = rawUrl;
export const supabaseAnonKey = rawKey.replace(/\.your-anon-key-here.*$/i, '').trim();

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes('placeholder-project') &&
  !supabaseUrl.includes('your-project-id');

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);
