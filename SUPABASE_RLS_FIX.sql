-- Enable Row Level Security on the table
ALTER TABLE public.comments_deployed ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for the public dashboard)
-- This allows anyone (anon role) to SELECT rows.
CREATE POLICY "Allow public read access" 
ON public.comments_deployed 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Allow the service_role (backend) to do everything (it bypasses RLS by default, but good to be explicit if needed, 
-- usually service_role bypasses policies, so this might not be strictly necessary but ensuring public access is the key fix).

-- If you have other tables needing RLS, follow the same pattern:
-- ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "policy_name" ON public.table_name ...
