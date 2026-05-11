
-- Document shares (created first because versions policies reference it)
CREATE TABLE public.document_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  shared_with_user_id uuid NOT NULL,
  shared_by_user_id uuid NOT NULL,
  permission text NOT NULL DEFAULT 'read' CHECK (permission IN ('read','write')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, shared_with_user_id)
);

ALTER TABLE public.document_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shares select own or recipient" ON public.document_shares FOR SELECT TO authenticated
USING (shared_with_user_id = auth.uid() OR shared_by_user_id = auth.uid());

CREATE POLICY "Shares insert by doc owner" ON public.document_shares FOR INSERT TO authenticated
WITH CHECK (shared_by_user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()));

CREATE POLICY "Shares delete by doc owner" ON public.document_shares FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()));

CREATE POLICY "Shares update by doc owner" ON public.document_shares FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()));

-- Document versions
CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint,
  mime_type text,
  comment text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Versions select" ON public.document_versions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.documents d WHERE d.id = document_id
    AND (d.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.document_shares s WHERE s.document_id = d.id AND s.shared_with_user_id = auth.uid()))
));

CREATE POLICY "Versions insert" ON public.document_versions FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND EXISTS (
  SELECT 1 FROM public.documents d WHERE d.id = document_id
    AND (d.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.document_shares s WHERE s.document_id = d.id AND s.shared_with_user_id = auth.uid() AND s.permission = 'write'))
));

-- Update documents RLS
DROP POLICY IF EXISTS "Documents own" ON public.documents;

CREATE POLICY "Documents select own or shared" ON public.documents FOR SELECT TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.document_shares s WHERE s.document_id = id AND s.shared_with_user_id = auth.uid()));

CREATE POLICY "Documents insert own" ON public.documents FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Documents update own or write share" ON public.documents FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.document_shares s WHERE s.document_id = id AND s.shared_with_user_id = auth.uid() AND s.permission = 'write'));

CREATE POLICY "Documents delete own" ON public.documents FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Storage policies for documents bucket
CREATE POLICY "Storage docs read own or shared" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents' AND (
  auth.uid()::text = (storage.foldername(name))[1]
  OR EXISTS (
    SELECT 1 FROM public.documents d
    JOIN public.document_shares s ON s.document_id = d.id
    WHERE d.storage_path = name AND s.shared_with_user_id = auth.uid()
  )
));

CREATE POLICY "Storage docs insert own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Storage docs update own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Storage docs delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
