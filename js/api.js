// Supabase Configuration
// Note: These credentials are public anon keys - safe for frontend use
const SUPABASE_URL = 'https://nzrdoobuhylliinvnlal.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56cmRvb2J1aHlsbGlpbnZubGFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNzAzODcsImV4cCI6MjEwNTc0NjM4N30.1lUbAuXF-vt-TfBZ8n7lXPbiYaI9KJCVFfvOiofCBtk';

// Initialize Supabase JS Client
if (!window.supabase) {
    window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Edge Functions URL
const EDGE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
