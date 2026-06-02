-- 1. Fix documents shared-select/update broken join (s.document_id = s.id -> documents.id)
DROP POLICY IF EXISTS "Documents select own or shared" ON public.documents;
CREATE POLICY "Documents select own or shared"
ON public.documents
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.document_shares s
    WHERE s.document_id = documents.id
      AND s.shared_with_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Documents update own or write share" ON public.documents;
CREATE POLICY "Documents update own or write share"
ON public.documents
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.document_shares s
    WHERE s.document_id = documents.id
      AND s.shared_with_user_id = auth.uid()
      AND s.permission = 'write'
  )
);

-- 2. Add UPDATE / DELETE policies on document_versions (ownership via parent document; write-shares may update)
CREATE POLICY "Versions update by owner or write share"
ON public.document_versions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_versions.document_id
      AND (
        d.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.document_shares s
          WHERE s.document_id = d.id
            AND s.shared_with_user_id = auth.uid()
            AND s.permission = 'write'
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_versions.document_id
      AND (
        d.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.document_shares s
          WHERE s.document_id = d.id
            AND s.shared_with_user_id = auth.uid()
            AND s.permission = 'write'
        )
      )
  )
);

CREATE POLICY "Versions delete by owner"
ON public.document_versions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_versions.document_id
      AND d.user_id = auth.uid()
  )
);

-- 3. Restrict exchange_rates UPDATE to admins; add admin DELETE policy
DROP POLICY IF EXISTS "Auth update rates" ON public.exchange_rates;
CREATE POLICY "Admin update rates"
ON public.exchange_rates
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin delete rates"
ON public.exchange_rates
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Add UPDATE policy on monthly_reports (owner-only)
CREATE POLICY "Reports own update"
ON public.monthly_reports
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. Fix storage shared-read broken join (d.storage_path = d.name -> d.storage_path = name)
DROP POLICY IF EXISTS "Storage docs read own or shared" ON storage.objects;
CREATE POLICY "Storage docs read own or shared"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1
      FROM public.documents d
      JOIN public.document_shares s ON s.document_id = d.id
      WHERE d.storage_path = name
        AND s.shared_with_user_id = auth.uid()
    )
  )
);