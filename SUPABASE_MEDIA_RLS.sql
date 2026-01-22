-- Enable RLS on the table
ALTER TABLE media_uploads ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows everything (for now) or restrict based on user.
-- Since your backend uses the Service Key (admin rights), it bypasses RLS.
-- However, to stop the warning and for future safety if you use the JS Client directly:

-- Policy: Allow all operations for authenticated users (or just service role)
-- This is a "permissive" policy to clear the warning while keeping the backend working.
CREATE POLICY "Enable access for backend service" ON media_uploads
AS PERMISSIVE FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- If you want to allow direct public access (not recommended for writes, but maybe reads):
-- CREATE POLICY "Allow public read" ON media_uploads FOR SELECT USING (true);
