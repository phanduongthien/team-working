-- =====================================================================
-- Storage: file đính kèm task. Đường dẫn: <team_id>/<task_id>/<uuid>-<tên file>
-- Bucket riêng tư; quyền theo thư mục team ở cấp đầu tiên.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-files', 'task-files', false, 10485760)
on conflict (id) do nothing;

create function public.storage_team_id(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception when others then
  return null;
end $$;
grant execute on function public.storage_team_id(text) to authenticated;

create policy task_files_select on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and public.is_team_member(public.storage_team_id(name)));

create policy task_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and public.is_team_member(public.storage_team_id(name)));

create policy task_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'task-files'
    and (
      owner_id = (select auth.uid())::text
      or public.has_team_role(public.storage_team_id(name), array['owner', 'manager']::public.team_role[])
    )
  );

-- =====================================================================
-- Realtime: app nghe thay đổi task, bình luận, thông báo (Realtime vẫn áp RLS).
-- =====================================================================
alter publication supabase_realtime add table public.tasks, public.task_comments, public.notifications, public.projects;
