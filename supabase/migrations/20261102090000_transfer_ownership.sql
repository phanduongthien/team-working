-- =====================================================================
-- Nhường quyền Owner (nguyên tử): người nhận lên Owner, người nhường xuống Manager.
-- Thay cho việc tự đổi vai trò 2 bước (dễ quên bước hạ quyền hoặc kẹt last_owner).
-- =====================================================================

create function public.transfer_ownership(p_team uuid, p_new_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  perform 1 from public.team_members
  where team_id = p_team and user_id = v_uid and role = 'owner'
  for update;
  if not found then
    raise exception 'not_allowed';
  end if;
  if p_new_owner is null or p_new_owner = v_uid then
    raise exception 'new_owner_invalid';
  end if;

  -- Nâng người nhận trước để trigger guard_last_owner không chặn bước hạ quyền.
  update public.team_members set role = 'owner'
  where team_id = p_team and user_id = p_new_owner;
  if not found then
    raise exception 'new_owner_invalid';
  end if;

  update public.team_members set role = 'manager'
  where team_id = p_team and user_id = v_uid;
end $$;

revoke execute on function public.transfer_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
