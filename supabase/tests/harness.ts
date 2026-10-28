import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'

/**
 * Giả lập phần của Supabase mà migration cần (role, schema auth/storage, publication realtime)
 * để chạy migration THẬT và kiểm tra RLS trong Postgres chạy bằng WASM — không cần Docker.
 * Lưu ý: chỉ mô phỏng; vẫn cần kiểm tra lại trên project Supabase dev sau khi push.
 */
const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;

create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner_id text default (auth.uid())::text
);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

create publication supabase_realtime;
grant usage on schema public to anon, authenticated;
`

export type TestUser = { id: string; email: string; name: string }

export type Db = {
  pg: PGlite
  /** Tạo user như khi đăng nhập GitHub lần đầu (trigger tạo profile). */
  createUser(name: string, email?: string): Promise<TestUser>
  /** Chạy fn trong transaction với vai trò authenticated + JWT của user (null = anon). */
  as<T>(user: TestUser | null, fn: (tx: Transaction) => Promise<T>): Promise<T>
}

let counter = 0
const uuid = (): string => {
  counter++
  return `00000000-0000-4000-8000-${counter.toString().padStart(12, '0')}`
}

export async function createDb(): Promise<Db> {
  const pg = new PGlite()
  await pg.exec(SUPABASE_STUB)
  const dir = join(__dirname, '..', 'migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await pg.exec(readFileSync(join(dir, file), 'utf8'))
  }

  return {
    pg,
    async createUser(name, email = `${name.toLowerCase()}@example.com`) {
      const id = uuid()
      await pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
        id,
        email,
        JSON.stringify({ user_name: name.toLowerCase(), full_name: name, avatar_url: `https://avatars/${name}` })
      ])
      return { id, email, name }
    },
    as(user, fn) {
      return pg.transaction(async (tx) => {
        const claims = user ? { sub: user.id, email: user.email, role: 'authenticated' } : { role: 'anon' }
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
        await tx.exec(`set local role ${user ? 'authenticated' : 'anon'}`)
        return fn(tx)
      })
    }
  }
}

/** Chạy câu lệnh và trả về thông báo lỗi Postgres (hoặc null nếu thành công). */
export async function errorOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (err) {
    return (err as Error).message
  }
}
