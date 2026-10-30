-- =====================================================================
-- Rời team linh hoạt:
-- - Người cuối cùng trong team được rời: chọn xóa team, hoặc giữ team (nhận mã khôi phục).
-- - Owner cuối cùng (team còn người) rời được nếu chỉ định người kế nhiệm.
-- - Team không còn ai: người đầu tiên vào lại bằng mã mời sẽ thành Owner.
-- =====================================================================

-- Chỉ chặn mất Owner cuối cùng khi team VẪN còn người khác (team trống thì không cần Owner).
create or replace function public.guard_last_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1 from public.team_members
       where team_id = old.team_id and role = 'owner' and user_id <> old.user_id
     )
     and exists (
       select 1 from public.team_members
       where team_id = old.team_id and user_id <> old.user_id
     )
     -- Cho phép khi chính team đang bị xóa (cascade).
     and exists (select 1 from public.teams where id = old.team_id)
  then
    raise exception 'last_owner';
  end if;
  return coalesce(new, old);
end $$;

-- Nhận lời mời: team đang trống (mọi người đã rời nhưng giữ team) → người vào thành Owner.
create or replace function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.team_invites;
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  v_role public.team_role;
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

  v_role := case
    when exists (select 1 from public.team_members where team_id = v_invite.team_id) then v_invite.role
    else 'owner'
  end;
  insert into public.team_members (team_id, user_id, role)
  values (v_invite.team_id, (select auth.uid()), v_role)
  on conflict (team_id, user_id) do nothing;

  if v_invite.email is not null then
    update public.team_invites set accepted_by = (select auth.uid()), accepted_at = now()
    where id = v_invite.id;
  end if;
  return v_invite.team_id;
end $$;

-- Rời team (nguyên tử). Trả về mã khôi phục khi người cuối cùng rời mà giữ team, ngược lại null.
--   p_delete_team: người cuối cùng chọn xóa team (cùng toàn bộ dữ liệu) thay vì giữ lại.
--   p_successor:   Owner cuối cùng (team còn người) chỉ định người nhận quyền Owner.
create function public.leave_team(p_team uuid, p_delete_team boolean default false, p_successor uuid default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.team_role;
  v_code text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select role into v_role from public.team_members where team_id = p_team and user_id = v_uid for update;
  if not found then
    raise exception 'not_member';
  end if;

  -- Người cuối cùng trong team.
  if not exists (select 1 from public.team_members where team_id = p_team and user_id <> v_uid) then
    if p_delete_team then
      delete from public.teams where id = p_team;
      return null;
    end if;
    insert into public.team_invites (team_id, role, created_by, expires_at)
    values (p_team, 'member', v_uid, now() + interval '30 days')
    returning code into v_code;
    delete from public.team_members where team_id = p_team and user_id = v_uid;
    return v_code;
  end if;

  if p_delete_team then
    raise exception 'team_not_empty';
  end if;

  if v_role = 'owner' and not exists (
    select 1 from public.team_members where team_id = p_team and role = 'owner' and user_id <> v_uid
  ) then
    if p_successor is null then
      raise exception 'last_owner';
    end if;
    update public.team_members set role = 'owner'
    where team_id = p_team and user_id = p_successor and user_id <> v_uid;
    if not found then
      raise exception 'successor_invalid';
    end if;
  end if;

  delete from public.team_members where team_id = p_team and user_id = v_uid;
  return null;
end $$;

revoke execute on function public.leave_team(uuid, boolean, uuid) from public, anon;
grant execute on function public.leave_team(uuid, boolean, uuid) to authenticated;
