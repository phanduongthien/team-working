-- =====================================================================
-- Team Working — dữ liệu team: hồ sơ, team, vai trò, lời mời, dự án, task,
-- bình luận, lịch sử trạng thái, thông báo, sao lưu trí nhớ.
-- MỌI BẢNG BẬT RLS. Không có policy = không ai truy cập được.
-- =====================================================================

create type public.team_role as enum ('owner', 'manager', 'member');
create type public.project_status as enum ('planning', 'active', 'on_hold', 'done', 'archived');
create type public.task_status as enum ('todo', 'in_progress', 'review', 'done', 'blocked');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');

-- ---------------------------------------------------------------------
-- Hàm tiện ích chung
-- ---------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- profiles: tạo tự động khi user đăng nhập lần đầu (GitHub)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  avatar_url text,
  github_username text,
  email text,
  skills text[] not null default '{}' check (cardinality(skills) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url, github_username, email)
  values (
    new.id,
    left(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'user_name',
      split_part(new.email, '@', 1),
      ''
    ), 80),
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'user_name',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- teams & team_members
-- ---------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.team_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

-- Helper quyền (security definer để policy không tự gọi đệ quy vào RLS của team_members).
create function public.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = (select auth.uid())
  )
$$;

create function public.has_team_role(p_team uuid, p_roles public.team_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = (select auth.uid()) and role = any (p_roles)
  )
$$;

create function public.shares_team(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.team_members a
    join public.team_members b on a.team_id = b.team_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  )
$$;

-- Tạo team: người tạo thành Owner (qua RPC để đảm bảo nguyên tử).
create function public.create_team(p_name text) returns public.teams
language plpgsql security definer set search_path = '' as $$
declare
  v_team public.teams;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;
  insert into public.teams (name, created_by) values (trim(p_name), (select auth.uid()))
  returning * into v_team;
  insert into public.team_members (team_id, user_id, role) values (v_team.id, (select auth.uid()), 'owner');
  return v_team;
end $$;

-- Không để team mất Owner cuối cùng (đổi vai trò hoặc rời team).
create function public.guard_last_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1 from public.team_members
       where team_id = old.team_id and role = 'owner' and user_id <> old.user_id
     )
     -- Cho phép khi chính team đang bị xóa (cascade).
     and exists (select 1 from public.teams where id = old.team_id)
  then
    raise exception 'last_owner';
  end if;
  return coalesce(new, old);
end $$;

create trigger team_members_guard_last_owner
  before update of role or delete on public.team_members
  for each row execute function public.guard_last_owner();

-- ---------------------------------------------------------------------
-- team_invites: mời bằng email (dùng 1 lần) hoặc mã chia sẻ (dùng nhiều lần tới hạn)
-- ---------------------------------------------------------------------
create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  role public.team_role not null default 'member' check (role <> 'owner'),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references public.profiles (id),
  accepted_at timestamptz
);
create index team_invites_team_idx on public.team_invites (team_id);
create index team_invites_email_idx on public.team_invites (lower(email));

create function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.team_invites;
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_invite from public.team_invites
  where code = upper(trim(p_code)) and accepted_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'invite_invalid';
  end if;
  if v_invite.email is not null and lower(v_invite.email) <> v_email then
    raise exception 'invite_email_mismatch';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (v_invite.team_id, (select auth.uid()), v_invite.role)
  on conflict (team_id, user_id) do nothing;

  if v_invite.email is not null then
    update public.team_invites set accepted_by = (select auth.uid()), accepted_at = now()
    where id = v_invite.id;
  end if;
  return v_invite.team_id;
end $$;

-- Lời mời theo email đang chờ của chính mình (kèm tên team để hiển thị).
create function public.my_invites()
returns table (code text, team_id uuid, team_name text, role public.team_role, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.code, i.team_id, t.name, i.role, i.expires_at
  from public.team_invites i
  join public.teams t on t.id = i.team_id
  where i.email is not null
    and lower(i.email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    and i.accepted_at is null
    and i.expires_at > now()
    and not exists (
      select 1 from public.team_members m where m.team_id = i.team_id and m.user_id = (select auth.uid())
    )
$$;

-- ---------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 5000),
  goal text not null default '' check (char_length(goal) <= 2000),
  status public.project_status not null default 'active',
  start_date date,
  due_date date,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_team_idx on public.projects (team_id);
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- tasks (+ subtask qua parent_id)
-- ---------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_id uuid references public.tasks (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 10000),
  assignee_id uuid references public.profiles (id) on delete set null,
  assigner_id uuid not null default auth.uid() references public.profiles (id),
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'todo',
  due_date date,
  estimate_hours numeric(6, 2) check (estimate_hours is null or estimate_hours between 0 and 1000),
  position double precision not null default 0,
  ai_generated boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_team_idx on public.tasks (team_id);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_parent_idx on public.tasks (parent_id);

-- Toàn vẹn + giới hạn quyền sửa theo vai trò (chạy TRƯỚC khi RLS kiểm tra WITH CHECK).
create function public.tasks_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_manager boolean;
begin
  -- team_id luôn lấy theo dự án
  select team_id into new.team_id from public.projects where id = new.project_id;
  if new.team_id is null then
    raise exception 'project_not_found';
  end if;
  if new.parent_id is not null and not exists (
    select 1 from public.tasks where id = new.parent_id and project_id = new.project_id
  ) then
    raise exception 'parent_task_invalid';
  end if;
  if new.assignee_id is not null and not exists (
    select 1 from public.team_members where team_id = new.team_id and user_id = new.assignee_id
  ) then
    raise exception 'assignee_not_in_team';
  end if;

  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.assigner_id := old.assigner_id; -- người giao không đổi
    new.created_at := old.created_at;
    v_is_manager := public.has_team_role(old.team_id, array['owner', 'manager']::public.team_role[]);
    if v_uid is not null and not v_is_manager then
      if new.team_id <> old.team_id or new.project_id <> old.project_id then
        raise exception 'not_allowed';
      end if;
      if old.assigner_id = v_uid then
        -- Member sửa task tự tạo: được sửa hết nhưng chỉ giao cho chính mình.
        if new.assignee_id is not null and new.assignee_id <> v_uid then
          raise exception 'not_allowed';
        end if;
      elsif (new.title, new.description, new.assignee_id, new.priority, new.due_date, new.parent_id, new.ai_generated)
            is distinct from
            (old.title, old.description, old.assignee_id, old.priority, old.due_date, old.parent_id, old.ai_generated)
      then
        -- Người được giao chỉ đổi trạng thái, vị trí, giờ ước lượng.
        raise exception 'assignee_can_only_update_status';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- ---------------------------------------------------------------------
-- task_status_events: lịch sử trạng thái (cho burndown), chỉ ghi qua trigger
-- ---------------------------------------------------------------------
create table public.task_status_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  from_status public.task_status,
  to_status public.task_status not null,
  changed_by uuid references public.profiles (id) on delete set null,
  at timestamptz not null default now()
);
create index task_status_events_project_idx on public.task_status_events (project_id, at);

create function public.tasks_log_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.task_status_events (task_id, team_id, project_id, from_status, to_status, changed_by)
    values (new.id, new.team_id, new.project_id, case when tg_op = 'UPDATE' then old.status end, new.status, (select auth.uid()));
  end if;
  return null;
end $$;

create trigger tasks_log_status after insert or update of status on public.tasks
  for each row execute function public.tasks_log_status();

-- ---------------------------------------------------------------------
-- task_comments
-- ---------------------------------------------------------------------
create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

create function public.task_child_set_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select team_id into new.team_id from public.tasks where id = new.task_id;
  if new.team_id is null then
    raise exception 'task_not_found';
  end if;
  return new;
end $$;

create trigger task_comments_set_team before insert on public.task_comments
  for each row execute function public.task_child_set_team();
create trigger task_comments_touch before update on public.task_comments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- task_attachments: metadata; file nằm trong Storage bucket "task-files"
-- ---------------------------------------------------------------------
create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  storage_path text not null unique,
  name text not null check (char_length(name) between 1 and 255),
  size bigint not null check (size between 0 and 10485760),
  mime_type text not null,
  uploaded_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index task_attachments_task_idx on public.task_attachments (task_id);
create trigger task_attachments_set_team before insert on public.task_attachments
  for each row execute function public.task_child_set_team();

-- ---------------------------------------------------------------------
-- notifications: chỉ tạo qua trigger; mỗi người chỉ thấy của mình
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create function public.notify_task_assigned() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is not null
     and new.assignee_id is distinct from (select auth.uid())
     and (tg_op = 'INSERT' or old.assignee_id is distinct from new.assignee_id)
  then
    insert into public.notifications (user_id, team_id, type, payload)
    values (new.assignee_id, new.team_id, 'task_assigned', jsonb_build_object(
      'task_id', new.id, 'project_id', new.project_id, 'title', new.title,
      'due_date', new.due_date, 'by', (select auth.uid())
    ));
  end if;
  -- Người giao được báo khi task chuyển sang Review/Done/Blocked.
  if tg_op = 'UPDATE' and old.status is distinct from new.status
     and new.status in ('review', 'done', 'blocked')
     and new.assigner_id is distinct from (select auth.uid())
  then
    insert into public.notifications (user_id, team_id, type, payload)
    values (new.assigner_id, new.team_id, 'task_status', jsonb_build_object(
      'task_id', new.id, 'project_id', new.project_id, 'title', new.title,
      'status', new.status, 'by', (select auth.uid())
    ));
  end if;
  return null;
end $$;

create trigger tasks_notify after insert or update of assignee_id, status on public.tasks
  for each row execute function public.notify_task_assigned();

create function public.notify_task_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = new.task_id;
  insert into public.notifications (user_id, team_id, type, payload)
  select distinct u, new.team_id, 'task_comment', jsonb_build_object(
    'task_id', v_task.id, 'project_id', v_task.project_id, 'title', v_task.title,
    'comment_id', new.id, 'excerpt', left(new.body, 140), 'by', new.author_id
  )
  from unnest(array[v_task.assignee_id, v_task.assigner_id]) as u
  where u is not null and u <> new.author_id;
  return null;
end $$;

create trigger task_comments_notify after insert on public.task_comments
  for each row execute function public.notify_task_comment();

-- ---------------------------------------------------------------------
-- user_memories: sao lưu trí nhớ cá nhân (tùy chọn, mặc định tắt) — chỉ chính chủ
-- ---------------------------------------------------------------------
create table public.user_memories (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  id uuid not null,
  content text not null check (char_length(content) between 1 and 500),
  category text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_status_events enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_attachments enable row level security;
alter table public.notifications enable row level security;
alter table public.user_memories enable row level security;

-- profiles: thấy mình và người cùng team; chỉ sửa của mình.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_team(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- teams: thành viên xem; Owner sửa/xóa; tạo qua create_team().
create policy teams_select on public.teams for select to authenticated
  using (public.is_team_member(id));
create policy teams_update on public.teams for update to authenticated
  using (public.has_team_role(id, array['owner']::public.team_role[]))
  with check (public.has_team_role(id, array['owner']::public.team_role[]));
create policy teams_delete on public.teams for delete to authenticated
  using (public.has_team_role(id, array['owner']::public.team_role[]));

-- team_members: thành viên xem; Owner đổi vai trò; Owner xóa người khác, ai cũng tự rời được.
create policy team_members_select on public.team_members for select to authenticated
  using (public.is_team_member(team_id));
create policy team_members_update on public.team_members for update to authenticated
  using (public.has_team_role(team_id, array['owner']::public.team_role[]))
  with check (public.has_team_role(team_id, array['owner']::public.team_role[]));
create policy team_members_delete on public.team_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.has_team_role(team_id, array['owner']::public.team_role[]));

-- team_invites: Owner/Manager quản lý; Manager chỉ mời Member.
create policy team_invites_select on public.team_invites for select to authenticated
  using (public.has_team_role(team_id, array['owner', 'manager']::public.team_role[]));
create policy team_invites_insert on public.team_invites for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      public.has_team_role(team_id, array['owner']::public.team_role[])
      or (role = 'member' and public.has_team_role(team_id, array['manager']::public.team_role[]))
    )
  );
create policy team_invites_delete on public.team_invites for delete to authenticated
  using (public.has_team_role(team_id, array['owner', 'manager']::public.team_role[]));

-- projects: thành viên xem; Owner/Manager tạo/sửa/xóa.
create policy projects_select on public.projects for select to authenticated
  using (public.is_team_member(team_id));
create policy projects_insert on public.projects for insert to authenticated
  with check (created_by = (select auth.uid()) and public.has_team_role(team_id, array['owner', 'manager']::public.team_role[]));
create policy projects_update on public.projects for update to authenticated
  using (public.has_team_role(team_id, array['owner', 'manager']::public.team_role[]))
  with check (public.has_team_role(team_id, array['owner', 'manager']::public.team_role[]));
create policy projects_delete on public.projects for delete to authenticated
  using (public.has_team_role(team_id, array['owner', 'manager']::public.team_role[]));

-- tasks: thành viên xem; Manager toàn quyền; Member tạo task cho chính mình;
-- người được giao/người tạo được sửa (trigger giới hạn cột).
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_team_member(team_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    assigner_id = (select auth.uid())
    and public.is_team_member(team_id)
    and (
      public.has_team_role(team_id, array['owner', 'manager']::public.team_role[])
      or assignee_id is null
      or assignee_id = (select auth.uid())
    )
  );
create policy tasks_update on public.tasks for update to authenticated
  using (
    public.has_team_role(team_id, array['owner', 'manager']::public.team_role[])
    or assignee_id = (select auth.uid())
    or assigner_id = (select auth.uid())
  )
  with check (public.is_team_member(team_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (
    public.has_team_role(team_id, array['owner', 'manager']::public.team_role[])
    or assigner_id = (select auth.uid())
  );

create policy task_status_events_select on public.task_status_events for select to authenticated
  using (public.is_team_member(team_id));

-- comments: thành viên xem/viết; tác giả sửa; tác giả hoặc Manager xóa.
create policy task_comments_select on public.task_comments for select to authenticated
  using (public.is_team_member(team_id));
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_team_member(team_id));
create policy task_comments_update on public.task_comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy task_comments_delete on public.task_comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.has_team_role(team_id, array['owner', 'manager']::public.team_role[]));

create policy task_attachments_select on public.task_attachments for select to authenticated
  using (public.is_team_member(team_id));
create policy task_attachments_insert on public.task_attachments for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and public.is_team_member(team_id));
create policy task_attachments_delete on public.task_attachments for delete to authenticated
  using (uploaded_by = (select auth.uid()) or public.has_team_role(team_id, array['owner', 'manager']::public.team_role[]));

-- notifications: chỉ chính chủ xem, đánh dấu đã đọc, xóa.
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

create policy user_memories_all on public.user_memories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- =====================================================================
-- Quyền: anon không chạm bảng nào; authenticated đi qua RLS.
-- =====================================================================
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_team(text),
  public.accept_invite(text),
  public.my_invites(),
  public.is_team_member(uuid),
  public.has_team_role(uuid, public.team_role[]),
  public.shares_team(uuid)
to authenticated;
