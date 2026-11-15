-- QuiltStudio projects, one row per quilt per user.
--
-- This Supabase project is shared with No Ceremony and AI Food Pal, so every
-- object here is prefixed quiltstudio_ and touches nothing else.

create table public.quiltstudio_projects (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  id text not null check (char_length(id) between 1 and 64),
  name text not null default 'My quilt',
  doc jsonb not null check (jsonb_typeof(doc) = 'object'),
  thumb text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.quiltstudio_projects is
  'QuiltStudio quilt designs. One row per project per user. Not used by No Ceremony or AI Food Pal.';

alter table public.quiltstudio_projects enable row level security;
alter table public.quiltstudio_projects force row level security;

create policy "QuiltStudio users can read their own projects"
on public.quiltstudio_projects for select to authenticated
using ((select auth.uid()) = user_id);

create policy "QuiltStudio users can add their own projects"
on public.quiltstudio_projects for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "QuiltStudio users can change their own projects"
on public.quiltstudio_projects for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "QuiltStudio users can delete their own projects"
on public.quiltstudio_projects for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.quiltstudio_projects from anon, authenticated;
grant select, insert, update, delete on table public.quiltstudio_projects to authenticated;
