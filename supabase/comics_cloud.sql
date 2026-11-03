-- ==============================================================================
-- THIÊN CƠ LÂU - CƠ SỞ DỮ LIỆU ĐỒNG BỘ TRUYỆN TRANH QUA CLOUD (PHASE 2)
-- ==============================================================================
-- Bảng lưu trữ siêu dữ liệu truyện tranh và tiến độ đọc của người dùng trên Supabase.
-- Dữ liệu ảnh WebP các trang truyện được lưu trữ tại Cloudflare R2 (Private Bucket).
-- Trình duyệt không bao giờ giữ khóa bí mật R2; chỉ giao tiếp qua presigned URL.
-- ==============================================================================

-- 1. BẢNG BỘ TRUYỆN TRANH (comic_series)
CREATE TABLE IF NOT EXISTS public.comic_series (
  id TEXT NOT NULL,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  title TEXT NOT NULL,
  cover_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_comic_series PRIMARY KEY (user_id, id)
);

-- 2. BẢNG TẬP TRUYỆN TRANH (comic_volumes)
CREATE TABLE IF NOT EXISTS public.comic_volumes (
  id TEXT NOT NULL,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  series_id TEXT NOT NULL,
  title TEXT NOT NULL,
  order_no NUMERIC NOT NULL DEFAULT 1,
  page_count INT NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  quality TEXT NOT NULL DEFAULT 'balanced',
  status TEXT NOT NULL CHECK (status IN ('uploading', 'ready')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pk_comic_volumes PRIMARY KEY (user_id, id)
);

-- 3. BẢNG TIẾN ĐỘ ĐỌC TRUYỆN TRANH (comic_progress)
CREATE TABLE IF NOT EXISTS public.comic_progress (
  user_id UUID NOT NULL DEFAULT auth.uid(),
  volume_id TEXT NOT NULL,
  page_index INT NOT NULL DEFAULT 0,
  scroll_percent INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_comic_progress PRIMARY KEY (user_id, volume_id)
);

-- 4. BẢNG RATE LIMIT THAO TÁC / GIỜ (comic_ops_hourly)
-- Dùng để giới hạn tối đa 12000 thao tác/giờ/người dùng trong Supabase Edge Function
CREATE TABLE IF NOT EXISTS public.comic_ops_hourly (
  user_id UUID NOT NULL,
  hour TIMESTAMPTZ NOT NULL,
  ops INT NOT NULL DEFAULT 0,
  CONSTRAINT pk_comic_ops_hourly PRIMARY KEY (user_id, hour)
);

-- ==============================================================================
-- CHỈ MỤC TỐI ƯU TRUY VẤN (INDEXES)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_comic_series_user_updated
  ON public.comic_series (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comic_volumes_series
  ON public.comic_volumes (user_id, series_id, order_no ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comic_volumes_status
  ON public.comic_volumes (user_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comic_progress_user
  ON public.comic_progress (user_id, updated_at DESC);

-- ==============================================================================
-- BẢO MẬT PHÂN QUYỀN HÀNG (ROW LEVEL SECURITY - RLS)
-- ==============================================================================

-- Bật RLS trên toàn bộ 4 bảng
ALTER TABLE public.comic_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comic_volumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comic_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comic_ops_hourly ENABLE ROW LEVEL SECURITY;

-- 1. Policies cho comic_series
DROP POLICY IF EXISTS "Users can manage their own comic series" ON public.comic_series;
CREATE POLICY "Users can manage their own comic series"
  ON public.comic_series
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 2. Policies cho comic_volumes
DROP POLICY IF EXISTS "Users can manage their own comic volumes" ON public.comic_volumes;
CREATE POLICY "Users can manage their own comic volumes"
  ON public.comic_volumes
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 3. Policies cho comic_progress
DROP POLICY IF EXISTS "Users can manage their own comic progress" ON public.comic_progress;
CREATE POLICY "Users can manage their own comic progress"
  ON public.comic_progress
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 4. Bảng comic_ops_hourly:
-- Không cấp quyền cho authenticated hoặc anon.
-- Chỉ Supabase Edge Function sử dụng SERVICE_ROLE_KEY mới có thể đọc/ghi bảng này.
