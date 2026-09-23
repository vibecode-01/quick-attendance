// Replace these with your Supabase credentials
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

// Initialize Supabase JS Client via CDN
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EDGE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
