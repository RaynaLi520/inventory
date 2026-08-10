-- JA fabric platform: authenticated, role-scoped cloud storage.
-- Run this script in Supabase Dashboard > SQL Editor.
-- Existing public_costing_state data is retained and becomes the JA dataset.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('ja', 'supplier')),
  supplier_name text,
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint supplier_name_required check (role = 'ja' or nullif(trim(supplier_name), '') is not null)
);

create table if not exists public.public_costing_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  scope text not null default 'ja',
  supplier_name text
);

create table if not exists public.access_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  requested_role text not null check (requested_role in ('ja', 'supplier')),
  supplier_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  constraint access_request_supplier_required check (
    requested_role = 'ja' or nullif(trim(supplier_name), '') is not null
  )
);

alter table public.public_costing_state add column if not exists scope text not null default 'ja';
alter table public.public_costing_state add column if not exists supplier_name text;
alter table public.public_costing_state drop constraint if exists public_costing_state_singleton;
alter table public.public_costing_state drop constraint if exists public_costing_state_scope_check;
alter table public.public_costing_state add constraint public_costing_state_scope_check
  check (scope in ('ja', 'supplier'));

update public.public_costing_state
set scope = 'ja', supplier_name = null
where id = 'default' or scope is null;

grant usage on schema public to authenticated;
grant select on public.user_profiles to authenticated;
grant select, insert, update, delete on public.public_costing_state to authenticated;
grant select, insert, update on public.access_requests to authenticated;
revoke all on public.public_costing_state from anon;
revoke all on public.access_requests from anon;

alter table public.user_profiles enable row level security;
alter table public.public_costing_state enable row level security;
alter table public.access_requests enable row level security;

drop policy if exists "Anyone can read shared costing state" on public.public_costing_state;
drop policy if exists "Anyone can insert shared costing state" on public.public_costing_state;
drop policy if exists "Anyone can update shared costing state" on public.public_costing_state;

drop policy if exists "Users can read their own profile" on public.user_profiles;
create policy "Users can read their own profile"
on public.user_profiles for select to authenticated
using (id = auth.uid());

drop policy if exists "Users can read their own access request" on public.access_requests;
create policy "Users can read their own access request"
on public.access_requests for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'ja'
  )
);

drop policy if exists "Users can create their own access request" on public.access_requests;
create policy "Users can create their own access request"
on public.access_requests for insert to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
  and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists "Users can resubmit a rejected access request" on public.access_requests;
create policy "Users can resubmit a rejected access request"
on public.access_requests for update to authenticated
using (user_id = auth.uid() and status = 'rejected')
with check (
  user_id = auth.uid()
  and status = 'pending'
  and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists "JA can read all datasets" on public.public_costing_state;
create policy "JA can read all datasets"
on public.public_costing_state for select to authenticated
using (
  exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'ja'
  )
);

drop policy if exists "Supplier can read its own dataset" on public.public_costing_state;
create policy "Supplier can read its own dataset"
on public.public_costing_state for select to authenticated
using (
  scope = 'supplier'
  and exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role = 'supplier'
      and p.supplier_name = public_costing_state.supplier_name
  )
);

drop policy if exists "JA can manage all datasets" on public.public_costing_state;
create policy "JA can manage all datasets"
on public.public_costing_state for all to authenticated
using (
  exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'ja'
  )
)
with check (
  exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'ja'
  )
);

drop policy if exists "Supplier can manage its own dataset" on public.public_costing_state;
create policy "Supplier can manage its own dataset"
on public.public_costing_state for all to authenticated
using (
  scope = 'supplier'
  and exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role = 'supplier'
      and p.supplier_name = public_costing_state.supplier_name
  )
)
with check (
  scope = 'supplier'
  and exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role = 'supplier'
      and p.supplier_name = public_costing_state.supplier_name
  )
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_public_costing_state_updated_at on public.public_costing_state;
create trigger set_public_costing_state_updated_at
before update on public.public_costing_state
for each row execute function public.set_updated_at();

create or replace function public.review_access_request(
  request_user_id uuid,
  decision text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_row public.access_requests%rowtype;
begin
  if not exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'ja'
  ) then
    raise exception 'Only an active JA administrator can review access requests';
  end if;

  if decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into request_row
  from public.access_requests
  where user_id = request_user_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending access request not found';
  end if;

  if decision = 'approved' then
    insert into public.user_profiles (id, role, supplier_name, display_name, active)
    values (
      request_row.user_id,
      request_row.requested_role,
      case when request_row.requested_role = 'supplier' then trim(request_row.supplier_name) else null end,
      case when request_row.requested_role = 'supplier' then trim(request_row.supplier_name) else request_row.email end,
      true
    )
    on conflict (id) do update set
      role = excluded.role,
      supplier_name = excluded.supplier_name,
      display_name = excluded.display_name,
      active = true;
  end if;

  update public.access_requests
  set status = decision,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where user_id = request_user_id;
end;
$$;

revoke all on function public.review_access_request(uuid, text) from public;
grant execute on function public.review_access_request(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Seed the first JA administrator once. Later identities are approved in the website:
-- insert into public.user_profiles (id, role, supplier_name, display_name)
-- values ('AUTH-USER-UUID', 'ja', null, 'JA Administrator');
