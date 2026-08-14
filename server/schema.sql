create table if not exists inventory_platform_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint inventory_platform_state_default_id check (id = 'default')
);

create table if not exists inventory_platform_state_history (
  revision_id bigserial primary key,
  state_id text not null,
  data jsonb not null,
  source text not null default 'web',
  created_at timestamptz not null default now()
);

create index if not exists inventory_state_history_created_idx
on inventory_platform_state_history (created_at desc);

create table if not exists inventory_sync_runs (
  id bigserial primary key,
  source text not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  sku_count integer,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
