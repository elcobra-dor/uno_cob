import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://olfbhboheiewqugmiqvy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sZmJoYm9oZWlld3F1Z21pcXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDM3MjQsImV4cCI6MjA5NTIxOTcyNH0.-7wMmoT1AnPtLiNiEnqbZifksXOOUZF8Eg-pZG8J_mE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});
