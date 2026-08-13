-- Run this file once in the Supabase SQL Editor for the inventory project.
-- The browser stores one versioned JSON document and keeps localStorage as an offline cache.

create table if not exists public.inventory_platform_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inventory_platform_state_id_check check (id = 'default')
);

alter table public.inventory_platform_state enable row level security;

grant select, insert, update on public.inventory_platform_state to anon, authenticated;

drop policy if exists "inventory state can be read" on public.inventory_platform_state;
create policy "inventory state can be read"
on public.inventory_platform_state
for select
to anon, authenticated
using (id = 'default');

drop policy if exists "inventory state can be created" on public.inventory_platform_state;
create policy "inventory state can be created"
on public.inventory_platform_state
for insert
to anon, authenticated
with check (id = 'default');

drop policy if exists "inventory state can be updated" on public.inventory_platform_state;
create policy "inventory state can be updated"
on public.inventory_platform_state
for update
to anon, authenticated
using (id = 'default')
with check (id = 'default');

comment on table public.inventory_platform_state is
  'Cloud state for the JA garment inventory dashboard. Public access is temporary until app authentication is enabled.';

-- Product media. The browser and CoZ bridge save files as SKC_YYYYMMDDHHMMSS.ext.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product images can be read" on storage.objects;
create policy "product images can be read"
on storage.objects for select to public
using (bucket_id = 'product-images');

drop policy if exists "product images can be uploaded" on storage.objects;
create policy "product images can be uploaded"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'product-images' and name ~ '^[A-Z0-9+_-]+_[0-9]{14}\.(jpg|jpeg|png|webp)$');

drop policy if exists "product images can be updated" on storage.objects;
create policy "product images can be updated"
on storage.objects for update to anon, authenticated
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images' and name ~ '^[A-Z0-9+_-]+_[0-9]{14}\.(jpg|jpeg|png|webp)$');

drop policy if exists "product images can be deleted" on storage.objects;
create policy "product images can be deleted"
on storage.objects for delete to anon, authenticated
using (bucket_id = 'product-images');

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory_platform_state'
  ) then
    alter publication supabase_realtime add table public.inventory_platform_state;
  end if;
end
$$;
