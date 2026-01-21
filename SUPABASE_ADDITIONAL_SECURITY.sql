-- Enable Row Level Security on internal tables
-- This satisfies the security advisor warning.
-- Since no policies are added, these tables will be inaccessible to the public (anon role),
-- but fully accessible to your backend server (service_role).

ALTER TABLE public.target_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_assignments ENABLE ROW LEVEL SECURITY;
