-- Allow users to self-insert their chosen role at signup (admin or student)
DROP POLICY IF EXISTS "Roles insert self student" ON public.user_roles;

CREATE POLICY "Roles insert self any"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);