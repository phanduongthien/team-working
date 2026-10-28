-- =====================================================================
-- Feedback hai chiều + cài đặt cá nhân đồng bộ theo tài khoản.
--
-- Chế độ hiển thị:
--   public    : mọi thành viên team thấy nội dung và người gửi
--   anonymous : (chỉ góp ý dự án/quy trình) thành viên thấy nội dung, CHỈ Manager/Owner thấy người gửi
--   private   : chỉ người gửi, người nhận (nếu có) và Manager/Owner
-- Bảng gốc KHÔNG cho SELECT trực tiếp: đọc qua view feedback_visible / feedback_replies_visible
-- để che author_id theo từng người xem.
-- =====================================================================

create type public.feedback_kind as enum ('project', 'person', 'review');
create type public.feedback_visibility as enum ('public', 'anonymous', 'private');
create type public.feedback_category as enum ('praise', 'improve', 'suggestion');
create type public.feedback_status as enum ('open', 'acknowledged', 'resolved');

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  kind public.feedback_kind not null,
  visibility public.feedback_visibility not null,
  category public.feedback_category not null,
  project_id uuid references public.projects (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  recipient_id uuid references public.profiles (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200),
  body text not null check (char_length(body) between 1 and 5000),
  period text check (period is null or char_length(period) <= 40),
  status public.feedback_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Góp ý dự án không nhắm vào ai; feedback cho người / đánh giá phải có người nhận.
  constraint feedback_recipient_by_kind check ((kind = 'project') = (recipient_id is null)),
  -- Đánh giá định kỳ luôn riêng tư.
  constraint feedback_review_private check (kind <> 'review' or visibility = 'private'),
  -- Ẩn danh chỉ dành cho góp ý dự án/quy trình (không ẩn danh nhắm vào một người).
  constraint feedback_anonymous_project_only check (visibility <> 'anonymous' or kind = 'project'),
  -- Công khai về một người chỉ để khen; góp ý cải thiện cho người phải riêng tư.
  constraint feedback_public_person_praise check (kind <> 'person' or visibility <> 'public' or category = 'praise')
);
create index feedback_team_idx on public.feedback (team_id, created_at desc);
create index feedback_recipient_idx on public.feedback (recipient_id);
create index feedback_author_idx on public.feedback (author_id);

create table public.feedback_replies (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index feedback_replies_feedback_idx on public.feedback_replies (feedback_id, created_at);

-- Ai được xem một feedback (dùng cho view, policy, RPC).
create function public.can_see_feedback(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.feedback f
    where f.id = p_id
      and public.is_team_member(f.team_id)
      and (
        f.visibility in ('public', 'anonymous')
        or f.author_id = (select auth.uid())
        or f.recipient_id = (select auth.uid())
        or public.has_team_role(f.team_id, array['owner', 'manager']::public.team_role[])
      )
  )
$$;

-- Kiểm tra toàn vẹn khi gửi feedback.
create function public.feedback_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.author_id := (select auth.uid());
  new.status := 'open';
  new.created_at := now();
  new.updated_at := now();
  if new.task_id is not null then
    select project_id into new.project_id from public.tasks where id = new.task_id and team_id = new.team_id;
    if new.project_id is null then
      raise exception 'task_not_in_team';
    end if;
  end if;
  if new.project_id is not null and not exists (
    select 1 from public.projects where id = new.project_id and team_id = new.team_id
  ) then
    raise exception 'project_not_in_team';
  end if;
  if new.recipient_id is not null then
    if new.recipient_id = new.author_id then
      raise exception 'cannot_feedback_self';
    end if;
    if not exists (select 1 from public.team_members where team_id = new.team_id and user_id = new.recipient_id) then
      raise exception 'recipient_not_in_team';
    end if;
  end if;
  if new.kind = 'review' and not public.has_team_role(new.team_id, array['owner', 'manager']::public.team_role[]) then
    raise exception 'review_managers_only';
  end if;
  return new;
end $$;

create trigger feedback_before_insert before insert on public.feedback
  for each row execute function public.feedback_before_insert();

create function public.feedback_reply_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.author_id := (select auth.uid());
  new.created_at := now();
  select team_id into new.team_id from public.feedback where id = new.feedback_id;
  if new.team_id is null then
    raise exception 'feedback_not_found';
  end if;
  return new;
end $$;

create trigger feedback_reply_before_insert before insert on public.feedback_replies
  for each row execute function public.feedback_reply_before_insert();

-- Người nhận hoặc Manager/Owner đánh dấu đã đọc / đã xử lý.
create function public.set_feedback_status(p_id uuid, p_status public.feedback_status) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_fb public.feedback;
begin
  select * into v_fb from public.feedback where id = p_id;
  if not found or not public.can_see_feedback(p_id) then
    raise exception 'feedback_not_found';
  end if;
  if v_fb.recipient_id is distinct from (select auth.uid())
     and not public.has_team_role(v_fb.team_id, array['owner', 'manager']::public.team_role[]) then
    raise exception 'not_allowed';
  end if;
  update public.feedback set status = p_status, updated_at = now() where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- View đọc: che người gửi feedback ẩn danh với người không phải Manager/Owner.
-- (Chạy với quyền chủ view; quyền xem lọc rõ ràng bằng can_see_feedback.)
-- ---------------------------------------------------------------------
create view public.feedback_visible with (security_barrier) as
select
  f.id, f.team_id, f.kind, f.visibility, f.category, f.project_id, f.task_id, f.recipient_id,
  case
    when f.visibility = 'anonymous'
      and f.author_id <> (select auth.uid())
      and not public.has_team_role(f.team_id, array['owner', 'manager']::public.team_role[])
    then null
    else f.author_id
  end as author_id,
  (f.author_id = (select auth.uid())) as is_mine,
  f.title, f.body, f.period, f.status, f.created_at, f.updated_at,
  (select count(*) from public.feedback_replies r where r.feedback_id = f.id)::int as reply_count
from public.feedback f
where public.can_see_feedback(f.id);

create view public.feedback_replies_visible with (security_barrier) as
select
  r.id, r.feedback_id, r.team_id,
  case
    when f.visibility = 'anonymous'
      and r.author_id = f.author_id
      and r.author_id <> (select auth.uid())
      and not public.has_team_role(f.team_id, array['owner', 'manager']::public.team_role[])
    then null
    else r.author_id
  end as author_id,
  (r.author_id = f.author_id) as by_feedback_author,
  (r.author_id = (select auth.uid())) as is_mine,
  r.body, r.created_at
from public.feedback_replies r
join public.feedback f on f.id = r.feedback_id
where public.can_see_feedback(r.feedback_id);

-- ---------------------------------------------------------------------
-- Thông báo (không bao giờ lộ người gửi ẩn danh trong payload)
-- ---------------------------------------------------------------------
create function public.notify_feedback() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_by uuid := case when new.visibility = 'anonymous' then null else new.author_id end;
  v_payload jsonb := jsonb_build_object(
    'feedback_id', new.id, 'kind', new.kind, 'category', new.category, 'visibility', new.visibility,
    'project_id', new.project_id, 'title', coalesce(nullif(new.title, ''), left(new.body, 80)), 'by', v_by
  );
begin
  if new.recipient_id is not null then
    insert into public.notifications (user_id, team_id, type, payload)
    values (new.recipient_id, new.team_id, 'feedback_received', v_payload);
  else
    insert into public.notifications (user_id, team_id, type, payload)
    select m.user_id, new.team_id, 'feedback_project', v_payload
    from public.team_members m
    where m.team_id = new.team_id and m.role in ('owner', 'manager') and m.user_id <> new.author_id;
  end if;
  return null;
end $$;

create trigger feedback_notify after insert on public.feedback
  for each row execute function public.notify_feedback();

create function public.notify_feedback_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_fb public.feedback;
  v_by uuid;
begin
  select * into v_fb from public.feedback where id = new.feedback_id;
  v_by := case when v_fb.visibility = 'anonymous' and new.author_id = v_fb.author_id then null else new.author_id end;
  insert into public.notifications (user_id, team_id, type, payload)
  select distinct u, v_fb.team_id, 'feedback_reply', jsonb_build_object(
    'feedback_id', v_fb.id, 'title', coalesce(nullif(v_fb.title, ''), left(v_fb.body, 80)),
    'excerpt', left(new.body, 140), 'by', v_by
  )
  from (
    select v_fb.author_id as u
    union all select v_fb.recipient_id
    -- Góp ý dự án (không có người nhận): Manager/Owner theo dõi thread.
    union all select m.user_id from public.team_members m
      where v_fb.recipient_id is null and m.team_id = v_fb.team_id and m.role in ('owner', 'manager')
  ) targets
  where u is not null and u <> new.author_id;
  return null;
end $$;

create trigger feedback_reply_notify after insert on public.feedback_replies
  for each row execute function public.notify_feedback_reply();

-- ---------------------------------------------------------------------
-- user_settings: cài đặt cá nhân đi theo tài khoản (tên/avatar/tính cách trợ lý).
-- Chỉ chính chủ đọc/ghi — kể cả Manager/Owner cũng không thấy.
-- ---------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  assistant jsonb not null,
  updated_at timestamptz not null default now(),
  constraint user_settings_size check (pg_column_size(assistant) < 400000)
);

-- =====================================================================
-- RLS + quyền
-- =====================================================================
alter table public.feedback enable row level security;
alter table public.feedback_replies enable row level security;
alter table public.user_settings enable row level security;

create policy feedback_insert on public.feedback for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_team_member(team_id));

create policy feedback_replies_insert on public.feedback_replies for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_see_feedback(feedback_id));

-- Xóa qua RPC: DELETE ... WHERE trực tiếp sẽ cần quyền đọc cột author_id trên bảng gốc
-- (lộ người gửi ẩn danh), nên bảng gốc không cấp SELECT cột nào.
create function public.delete_feedback(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.feedback f
  where f.id = p_id
    and (f.author_id = (select auth.uid()) or public.has_team_role(f.team_id, array['owner', 'manager']::public.team_role[]));
  if not found then
    raise exception 'not_allowed';
  end if;
end $$;

create function public.delete_feedback_reply(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.feedback_replies r
  where r.id = p_id
    and (r.author_id = (select auth.uid()) or public.has_team_role(r.team_id, array['owner', 'manager']::public.team_role[]));
  if not found then
    raise exception 'not_allowed';
  end if;
end $$;

create policy user_settings_all on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Bảng feedback gốc: chỉ INSERT (không RETURNING); đọc qua view, xóa/đổi trạng thái qua RPC.
revoke all on public.feedback, public.feedback_replies from anon, authenticated;
grant insert on public.feedback, public.feedback_replies to authenticated;
revoke all on public.feedback_visible, public.feedback_replies_visible from anon;
grant select on public.feedback_visible, public.feedback_replies_visible to authenticated;
revoke all on public.user_settings from anon;
grant select, insert, update, delete on public.user_settings to authenticated;

revoke execute on function public.can_see_feedback(uuid), public.set_feedback_status(uuid, public.feedback_status),
  public.delete_feedback(uuid), public.delete_feedback_reply(uuid),
  public.feedback_before_insert(), public.feedback_reply_before_insert(), public.notify_feedback(), public.notify_feedback_reply()
  from public, anon;
-- can_see_feedback dùng trong policy INSERT của replies (policy chạy với quyền người gọi).
grant execute on function public.can_see_feedback(uuid), public.set_feedback_status(uuid, public.feedback_status),
  public.delete_feedback(uuid), public.delete_feedback_reply(uuid) to authenticated;
