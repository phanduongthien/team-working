-- Hồ sơ cá nhân (tên, vai trò, mục tiêu, kỹ năng, sở thích, cách muốn được trả lời) đi theo
-- tài khoản GitHub — chỉ chính chủ đọc/ghi (RLS user_settings_all đã có).
-- assistant thành nullable để có thể chỉ lưu hồ sơ mà chưa lưu cài đặt trợ lý.
alter table public.user_settings alter column assistant drop not null;
alter table public.user_settings add column profile jsonb;
alter table public.user_settings add column profile_updated_at timestamptz;
alter table public.user_settings add constraint user_settings_profile_size
  check (profile is null or pg_column_size(profile) < 50000);
