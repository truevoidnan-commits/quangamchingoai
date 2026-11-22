-- ==============================================================================
-- THIÊN CƠ LÂU — CƠ SỞ DỮ LIỆU PHÂN HỆ TRUYỆN VIDEO (MP4 + CLOUDFLARE R2)
-- Migration: 20261122_video_library_r2.sql
-- ==============================================================================
-- Phân hệ Truyện Video độc lập hoàn toàn với Truyện Chữ, Truyện Tranh và Tu Luyện (OCC).
-- Video MP4 dung lượng lớn và phụ đề VTT được lưu trữ tại Cloudflare R2 bucket: tcl-videos.
-- Trình duyệt không nắm giữ R2 credentials; upload/playback qua Presigned URL ký bởi Edge Function.
-- ==============================================================================

-- 1. BẢNG QUẢN TRỊ VIÊN VIDEO (video_admins)
CREATE TABLE IF NOT EXISTS public.video_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hàm kiểm tra người dùng hiện tại có quyền quản trị video hay không
CREATE OR REPLACE FUNCTION public.is_video_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.video_admins WHERE user_id = auth.uid()
  ) OR (
    (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'admin'
  );
$$;

-- 2. BẢNG BỘ PHIM / SERIES (video_series)
CREATE TABLE IF NOT EXISTS public.video_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  poster_key TEXT,
  genres TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  status TEXT NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing', 'completed', 'upcoming')),
  published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. BẢNG TẬP PHIM (video_episodes)
CREATE TABLE IF NOT EXISTS public.video_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.video_series(id) ON DELETE CASCADE,
  episode_number NUMERIC NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  r2_key TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  duration_seconds NUMERIC NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'video/mp4',
  upload_status TEXT NOT NULL DEFAULT 'pending' CHECK (upload_status IN ('pending', 'uploading', 'ready', 'failed')),
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_series_episode UNIQUE (series_id, episode_number)
);

-- 4. BẢNG PHỤ ĐỀ (video_subtitles)
CREATE TABLE IF NOT EXISTS public.video_subtitles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.video_series(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES public.video_episodes(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL DEFAULT 'vi',
  label TEXT NOT NULL DEFAULT 'Tiếng Việt',
  r2_key TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_episode_subtitle_lang UNIQUE (episode_id, language_code)
);

-- 5. BẢNG TIẾN ĐỘ XEM (video_watch_progress)
CREATE TABLE IF NOT EXISTS public.video_watch_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_id UUID NOT NULL REFERENCES public.video_series(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES public.video_episodes(id) ON DELETE CASCADE,
  position_seconds NUMERIC NOT NULL DEFAULT 0,
  duration_seconds NUMERIC NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_video_watch_progress PRIMARY KEY (user_id, episode_id)
);

-- 6. BẢNG PHIÊN UPLOAD MULTIPART (video_upload_sessions)
CREATE TABLE IF NOT EXISTS public.video_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.video_series(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES public.video_episodes(id) ON DELETE CASCADE,
  upload_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  part_size BIGINT NOT NULL DEFAULT 10485760, -- 10MB chunk
  total_parts INT NOT NULL DEFAULT 1,
  file_size BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'aborted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_video_series_published ON public.video_series (published, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_episodes_series ON public.video_episodes (series_id, episode_number ASC);
CREATE INDEX IF NOT EXISTS idx_video_episodes_published ON public.video_episodes (published, upload_status);
CREATE INDEX IF NOT EXISTS idx_video_subtitles_episode ON public.video_subtitles (episode_id);
CREATE INDEX IF NOT EXISTS idx_video_watch_progress_user ON public.video_watch_progress (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_watch_progress_series ON public.video_watch_progress (user_id, series_id);
CREATE INDEX IF NOT EXISTS idx_video_upload_sessions_episode ON public.video_upload_sessions (episode_id, status);

-- TRIGGERS
CREATE OR REPLACE FUNCTION public.handle_video_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_video_series_updated_at ON public.video_series;
CREATE TRIGGER trg_video_series_updated_at
  BEFORE UPDATE ON public.video_series
  FOR EACH ROW EXECUTE FUNCTION public.handle_video_updated_at();

DROP TRIGGER IF EXISTS trg_video_episodes_updated_at ON public.video_episodes;
CREATE TRIGGER trg_video_episodes_updated_at
  BEFORE UPDATE ON public.video_episodes
  FOR EACH ROW EXECUTE FUNCTION public.handle_video_updated_at();

DROP TRIGGER IF EXISTS trg_video_upload_sessions_updated_at ON public.video_upload_sessions;
CREATE TRIGGER trg_video_upload_sessions_updated_at
  BEFORE UPDATE ON public.video_upload_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_video_updated_at();

-- RLS
ALTER TABLE public.video_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_subtitles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_watch_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_upload_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view video admins" ON public.video_admins;
CREATE POLICY "Admins can view video admins"
  ON public.video_admins
  FOR SELECT
  TO authenticated
  USING (public.is_video_admin());

DROP POLICY IF EXISTS "Public can view published series" ON public.video_series;
CREATE POLICY "Public can view published series"
  ON public.video_series
  FOR SELECT
  TO anon, authenticated
  USING (published = true OR public.is_video_admin());

DROP POLICY IF EXISTS "Admins can manage series" ON public.video_series;
CREATE POLICY "Admins can manage series"
  ON public.video_series
  FOR ALL
  TO authenticated
  USING (public.is_video_admin())
  WITH CHECK (public.is_video_admin());

DROP POLICY IF EXISTS "Public can view published episodes" ON public.video_episodes;
CREATE POLICY "Public can view published episodes"
  ON public.video_episodes
  FOR SELECT
  TO anon, authenticated
  USING (
    (
      published = true
      AND upload_status = 'ready'
      AND EXISTS (
        SELECT 1 FROM public.video_series s
        WHERE s.id = video_episodes.series_id
          AND s.published = true
      )
    )
    OR public.is_video_admin()
  );

DROP POLICY IF EXISTS "Admins can manage episodes" ON public.video_episodes;
CREATE POLICY "Admins can manage episodes"
  ON public.video_episodes
  FOR ALL
  TO authenticated
  USING (public.is_video_admin())
  WITH CHECK (public.is_video_admin());

DROP POLICY IF EXISTS "Public can view subtitles of accessible episodes" ON public.video_subtitles;
CREATE POLICY "Public can view subtitles of accessible episodes"
  ON public.video_subtitles
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.video_episodes ep
      JOIN public.video_series s ON s.id = ep.series_id
      WHERE ep.id = video_subtitles.episode_id
        AND (
          (ep.published = true AND ep.upload_status = 'ready' AND s.published = true)
          OR public.is_video_admin()
        )
    )
  );

DROP POLICY IF EXISTS "Admins can manage subtitles" ON public.video_subtitles;
CREATE POLICY "Admins can manage subtitles"
  ON public.video_subtitles
  FOR ALL
  TO authenticated
  USING (public.is_video_admin())
  WITH CHECK (public.is_video_admin());

DROP POLICY IF EXISTS "Users can read own watch progress" ON public.video_watch_progress;
CREATE POLICY "Users can read own watch progress"
  ON public.video_watch_progress
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can upsert own watch progress" ON public.video_watch_progress;
CREATE POLICY "Users can upsert own watch progress"
  ON public.video_watch_progress
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage upload sessions" ON public.video_upload_sessions;
CREATE POLICY "Admins can manage upload sessions"
  ON public.video_upload_sessions
  FOR ALL
  TO authenticated
  USING (public.is_video_admin())
  WITH CHECK (public.is_video_admin());
