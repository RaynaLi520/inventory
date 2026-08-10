-- JA garment inventory schema.
-- Run supabase-schema.sql first, then run this file in Supabase SQL Editor.
-- The model follows the same separation used by Medusa/InvenTree/ERPNext:
-- product -> sellable SKU variant -> inventory level by location -> immutable movement ledger.

create extension if not exists pgcrypto;

create table if not exists public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  location_type text not null check (location_type in ('warehouse', 'store', 'transit', 'returns')),
  address jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.garment_products (
  id uuid primary key default gen_random_uuid(),
  style_no text not null unique,
  name text not null,
  category text not null,
  season_code text not null,
  fabric_id text,
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.garment_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.garment_products(id) on delete cascade,
  sku text not null unique,
  barcode text unique,
  color_code text not null,
  color_name text not null,
  size_code text not null,
  safety_stock integer not null default 0 check (safety_stock >= 0),
  retail_price numeric(12, 2) check (retail_price is null or retail_price >= 0),
  cost_price numeric(12, 2) check (cost_price is null or cost_price >= 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, color_code, size_code)
);

create table if not exists public.inventory_levels (
  variant_id uuid not null references public.garment_variants(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  stocked_quantity integer not null default 0 check (stocked_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (variant_id, location_id),
  constraint reservation_not_above_stock check (reserved_quantity <= stocked_quantity)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  movement_no text not null unique,
  variant_id uuid not null references public.garment_variants(id),
  location_id uuid not null references public.stock_locations(id),
  movement_type text not null check (movement_type in ('inbound', 'outbound', 'adjustment', 'transfer_in', 'transfer_out', 'return')),
  quantity integer not null check (quantity <> 0),
  reference_type text,
  reference_no text,
  note text,
  performed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.sales_channels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  channel_type text not null check (channel_type in ('online', 'marketplace', 'store')),
  active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channel_inventory_rules (
  channel_id uuid not null references public.sales_channels(id) on delete cascade,
  variant_id uuid not null references public.garment_variants(id) on delete cascade,
  allocation_percent numeric(5, 2) not null default 100 check (allocation_percent between 0 and 100),
  buffer_quantity integer not null default 0 check (buffer_quantity >= 0),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (channel_id, variant_id)
);

create index if not exists garment_variants_product_idx on public.garment_variants(product_id);
create index if not exists garment_variants_sku_search_idx on public.garment_variants using gin (to_tsvector('simple', sku));
create index if not exists stock_movements_variant_created_idx on public.stock_movements(variant_id, created_at desc);
create index if not exists stock_movements_location_created_idx on public.stock_movements(location_id, created_at desc);

create or replace view public.variant_available_stock
with (security_invoker = true) as
select
  v.id as variant_id,
  v.sku,
  p.style_no,
  p.name as product_name,
  v.color_code,
  v.color_name,
  v.size_code,
  v.safety_stock,
  coalesce(sum(l.stocked_quantity), 0)::integer as stocked_quantity,
  coalesce(sum(l.reserved_quantity), 0)::integer as reserved_quantity,
  coalesce(sum(l.stocked_quantity - l.reserved_quantity), 0)::integer as available_quantity
from public.garment_variants v
join public.garment_products p on p.id = v.product_id
left join public.inventory_levels l on l.variant_id = v.id
where v.active = true and p.status = 'active'
group by v.id, v.sku, p.style_no, p.name, v.color_code, v.color_name, v.size_code, v.safety_stock;

create or replace function public.apply_stock_movement(
  target_variant_id uuid,
  target_location_id uuid,
  movement_kind text,
  movement_quantity integer,
  movement_reference_type text default null,
  movement_reference_no text default null,
  movement_note text default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  signed_quantity integer;
  current_level public.inventory_levels%rowtype;
  created_movement public.stock_movements%rowtype;
  generated_no text;
begin
  if not exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'ja'
  ) then
    raise exception 'Only an active JA user can move garment stock';
  end if;

  if movement_kind not in ('inbound', 'outbound', 'adjustment', 'transfer_in', 'transfer_out', 'return') then
    raise exception 'Unsupported stock movement type';
  end if;
  if movement_quantity = 0 then raise exception 'Movement quantity cannot be zero'; end if;

  signed_quantity := case
    when movement_kind in ('outbound', 'transfer_out') then -abs(movement_quantity)
    when movement_kind in ('inbound', 'transfer_in', 'return') then abs(movement_quantity)
    else movement_quantity
  end;

  insert into public.inventory_levels (variant_id, location_id)
  values (target_variant_id, target_location_id)
  on conflict (variant_id, location_id) do nothing;

  select * into current_level
  from public.inventory_levels
  where variant_id = target_variant_id and location_id = target_location_id
  for update;

  if current_level.stocked_quantity + signed_quantity < current_level.reserved_quantity then
    raise exception 'Insufficient unreserved stock at this location';
  end if;

  update public.inventory_levels
  set stocked_quantity = stocked_quantity + signed_quantity,
      updated_at = now()
  where variant_id = target_variant_id and location_id = target_location_id;

  generated_no := upper(left(movement_kind, 3)) || '-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS');
  insert into public.stock_movements (
    movement_no, variant_id, location_id, movement_type, quantity,
    reference_type, reference_no, note, performed_by
  ) values (
    generated_no, target_variant_id, target_location_id, movement_kind, signed_quantity,
    movement_reference_type, movement_reference_no, movement_note, auth.uid()
  ) returning * into created_movement;

  return created_movement;
end;
$$;

grant select on public.variant_available_stock to authenticated;
grant select, insert, update, delete on
  public.stock_locations,
  public.garment_products,
  public.garment_variants,
  public.sales_channels,
  public.channel_inventory_rules
to authenticated;
grant select on public.inventory_levels, public.stock_movements to authenticated;
revoke insert, update, delete on public.inventory_levels, public.stock_movements from authenticated;
revoke all on function public.apply_stock_movement(uuid, uuid, text, integer, text, text, text) from public;
grant execute on function public.apply_stock_movement(uuid, uuid, text, integer, text, text, text) to authenticated;

alter table public.stock_locations enable row level security;
alter table public.garment_products enable row level security;
alter table public.garment_variants enable row level security;
alter table public.inventory_levels enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sales_channels enable row level security;
alter table public.channel_inventory_rules enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'stock_locations', 'garment_products', 'garment_variants',
    'sales_channels', 'channel_inventory_rules'
  ] loop
    execute format('drop policy if exists "JA manages %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "JA manages %s" on public.%I for all to authenticated using (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.active = true and p.role = ''ja'')) with check (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.active = true and p.role = ''ja''))',
      table_name, table_name
    );
  end loop;
end;
$$;

drop policy if exists "JA manages inventory_levels" on public.inventory_levels;
drop policy if exists "JA manages stock_movements" on public.stock_movements;
drop policy if exists "JA reads inventory levels" on public.inventory_levels;
create policy "JA reads inventory levels"
on public.inventory_levels for select to authenticated
using (
  exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'ja'
  )
);

drop policy if exists "JA reads stock movements" on public.stock_movements;
create policy "JA reads stock movements"
on public.stock_movements for select to authenticated
using (
  exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'ja'
  )
);

drop trigger if exists set_stock_locations_updated_at on public.stock_locations;
create trigger set_stock_locations_updated_at before update on public.stock_locations
for each row execute function public.set_updated_at();
drop trigger if exists set_garment_products_updated_at on public.garment_products;
create trigger set_garment_products_updated_at before update on public.garment_products
for each row execute function public.set_updated_at();
drop trigger if exists set_garment_variants_updated_at on public.garment_variants;
create trigger set_garment_variants_updated_at before update on public.garment_variants
for each row execute function public.set_updated_at();
drop trigger if exists set_sales_channels_updated_at on public.sales_channels;
create trigger set_sales_channels_updated_at before update on public.sales_channels
for each row execute function public.set_updated_at();

-- Recommended SKU: BRAND-SEASON-CATEGORY-STYLE-COLOR-SIZE
-- Example: JA-FW26-TOP-JA2601-INK-M
insert into public.stock_locations (code, name, location_type)
values ('SHA-WH', '上海总仓', 'warehouse'), ('SHA-JA', '静安门店', 'store')
on conflict (code) do nothing;

insert into public.sales_channels (code, name, channel_type)
values ('WECHAT', '品牌小程序', 'online'), ('TMALL', '天猫旗舰店', 'marketplace'), ('SHA-JA', '静安门店', 'store')
on conflict (code) do nothing;

notify pgrst, 'reload schema';
