-- Supabase SQL Editor에서 실행합니다.
create extension if not exists pgcrypto;

create table if not exists public.class_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (subject in ('국어', '수학', '영어', '과학', '사회', '기타')),
  title text not null check (char_length(title) between 1 and 100),
  description text not null check (char_length(description) between 1 and 1200),
  assessment_date date not null,
  supplies text not null default '',
  class_name text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assessments_date_idx on public.assessments (assessment_date);
alter table public.class_admins enable row level security;
alter table public.assessments enable row level security;

create or replace function public.is_class_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.class_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_class_admin() from public;
grant execute on function public.is_class_admin() to anon, authenticated;

drop policy if exists "Admins can read their own role" on public.class_admins;
create policy "Admins can read their own role" on public.class_admins
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Anyone can read class assessments" on public.assessments;
create policy "Anyone can read class assessments" on public.assessments
  for select to anon, authenticated using (true);
drop policy if exists "Class admins can add assessments" on public.assessments;
create policy "Class admins can add assessments" on public.assessments
  for insert to authenticated with check (public.is_class_admin() and (created_by = (select auth.uid()) or created_by is null));
drop policy if exists "Class admins can update assessments" on public.assessments;
create policy "Class admins can update assessments" on public.assessments
  for update to authenticated using (public.is_class_admin()) with check (public.is_class_admin());
drop policy if exists "Class admins can delete assessments" on public.assessments;
create policy "Class admins can delete assessments" on public.assessments
  for delete to authenticated using (public.is_class_admin());

grant select on public.assessments to anon, authenticated;
grant insert, update, delete on public.assessments to authenticated;
grant select on public.class_admins to authenticated;

-- Postgres Changes 구독을 켭니다. 이미 publication에 들어 있으면 그대로 둡니다.
do $$ begin
  alter publication supabase_realtime add table public.assessments;
exception when duplicate_object then null;
end $$;
