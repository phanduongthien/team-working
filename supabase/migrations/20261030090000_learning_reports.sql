-- =====================================================================
-- Học tập (lộ trình, bước, kết quả quiz) + báo cáo tiến độ gửi quản lý.
-- Học tập là dữ liệu CÁ NHÂN: chỉ chủ sở hữu; Manager/Owner của team chỉ XEM khi chủ bật "chia sẻ".
-- =====================================================================

create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  goal text not null default '' check (char_length(goal) <= 2000),
  level text not null default '' check (char_length(level) <= 200),
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learning_paths_owner_idx on public.learning_paths (owner_id);
create index learning_paths_team_idx on public.learning_paths (team_id) where shared;
create trigger learning_paths_touch before update on public.learning_paths
  for each row execute function public.touch_updated_at();

create table public.learning_steps (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  resources text[] not null default '{}' check (cardinality(resources) <= 20),
  estimated_hours numeric(6, 2) check (estimated_hours is null or estimated_hours between 0 and 1000),
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  notes text not null default '' check (char_length(notes) <= 10000),
  position double precision not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learning_steps_path_idx on public.learning_steps (path_id, position);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  path_id uuid references public.learning_paths (id) on delete set null,
  step_id uuid references public.learning_steps (id) on delete set null,
  topic text not null check (char_length(topic) between 1 and 300),
  questions jsonb not null,
  answers jsonb not null default '[]',
  score numeric(5, 2) not null default 0,
  total integer not null check (total between 1 and 50),
  weak_points text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint quiz_attempts_size check (pg_column_size(questions) + pg_column_size(answers) < 200000)
);
create index quiz_attempts_owner_idx on public.quiz_attempts (owner_id, created_at desc);

-- Manager/Owner xem được lộ trình CHIA SẺ của thành viên trong team mình.
create function public.can_view_learning_path(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.learning_paths p
    where p.id = p_id
      and (
        p.owner_id = (select auth.uid())
        or (p.shared and p.team_id is not null
            and public.has_team_role(p.team_id, array['owner', 'manager']::public.team_role[])
            and exists (select 1 from public.team_members m where m.team_id = p.team_id and m.user_id = p.owner_id))
      )
  )
$$;

create function public.learning_child_set_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select owner_id into new.owner_id from public.learning_paths where id = new.path_id;
  if new.owner_id is null then
    raise exception 'path_not_found';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.path_id := old.path_id;
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger learning_steps_set_owner before insert or update on public.learning_steps
  for each row execute function public.learning_child_set_owner();

-- ---------------------------------------------------------------------
-- progress_reports: báo cáo ngày/tuần gửi Manager/Owner của team
-- ---------------------------------------------------------------------
create table public.progress_reports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  period_type text not null check (period_type in ('day', 'week')),
  period_label text not null check (char_length(period_label) between 1 and 60),
  body text not null check (char_length(body) between 1 and 20000),
  created_at timestamptz not null default now()
);
create index progress_reports_team_idx on public.progress_reports (team_id, created_at desc);

create function public.notify_progress_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, team_id, type, payload)
  select m.user_id, new.team_id, 'progress_report', jsonb_build_object(
    'report_id', new.id, 'title', new.period_label, 'by', new.author_id, 'kind', new.period_type
  )
  from public.team_members m
  where m.team_id = new.team_id and m.role in ('owner', 'manager') and m.user_id <> new.author_id;
  return null;
end $$;

create trigger progress_reports_notify after insert on public.progress_reports
  for each row execute function public.notify_progress_report();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.learning_paths enable row level security;
alter table public.learning_steps enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.progress_reports enable row level security;

-- Kiểm tra chủ sở hữu trực tiếp trên dòng trước (INSERT ... RETURNING: hàm chưa thấy dòng mới).
create policy learning_paths_select on public.learning_paths for select to authenticated
  using (owner_id = (select auth.uid()) or public.can_view_learning_path(id));
create policy learning_paths_insert on public.learning_paths for insert to authenticated
  with check (owner_id = (select auth.uid()) and (team_id is null or public.is_team_member(team_id)));
create policy learning_paths_update on public.learning_paths for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (team_id is null or public.is_team_member(team_id)));
create policy learning_paths_delete on public.learning_paths for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy learning_steps_select on public.learning_steps for select to authenticated
  using (owner_id = (select auth.uid()) or public.can_view_learning_path(path_id));
create policy learning_steps_insert on public.learning_steps for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy learning_steps_update on public.learning_steps for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy learning_steps_delete on public.learning_steps for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy quiz_attempts_select on public.quiz_attempts for select to authenticated
  using (owner_id = (select auth.uid()) or (path_id is not null and public.can_view_learning_path(path_id)));
create policy quiz_attempts_insert on public.quiz_attempts for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (path_id is null or exists (select 1 from public.learning_paths p where p.id = path_id and p.owner_id = (select auth.uid())))
  );
create policy quiz_attempts_delete on public.quiz_attempts for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy progress_reports_select on public.progress_reports for select to authenticated
  using (author_id = (select auth.uid()) or public.has_team_role(team_id, array['owner', 'manager']::public.team_role[]));
create policy progress_reports_insert on public.progress_reports for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_team_member(team_id));
create policy progress_reports_delete on public.progress_reports for delete to authenticated
  using (author_id = (select auth.uid()));

revoke all on public.learning_paths, public.learning_steps, public.quiz_attempts, public.progress_reports from anon;
grant select, insert, update, delete on public.learning_paths, public.learning_steps to authenticated;
grant select, insert, delete on public.quiz_attempts, public.progress_reports to authenticated;
revoke execute on function public.can_view_learning_path(uuid), public.learning_child_set_owner(), public.notify_progress_report()
  from public, anon;
grant execute on function public.can_view_learning_path(uuid) to authenticated;
