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

create table if not exists plm_styles (
  plm_style_id text primary key,
  spu text not null,
  ja_style_no text,
  product_name text not null,
  sizes jsonb not null default '[]'::jsonb,
  modified_at_source bigint,
  last_seen_at timestamptz not null default now()
);

create index if not exists plm_styles_spu_idx on plm_styles (spu);

create table if not exists plm_colorways (
  plm_colorway_id text primary key,
  plm_style_id text not null references plm_styles(plm_style_id) on delete cascade,
  color_name text not null,
  source_color_code text,
  inventory_product_id text,
  sync_status text not null default 'not_materialized',
  modified_at_source bigint,
  last_seen_at timestamptz not null default now()
);

create index if not exists plm_colorways_style_idx on plm_colorways (plm_style_id);
create index if not exists plm_colorways_inventory_product_idx on plm_colorways (inventory_product_id);

create table if not exists inventory_sync_runs (
  id bigserial primary key,
  source text not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  sku_count integer,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists app_users (
  id bigserial primary key,
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9._-]{3,32}$'),
  email text not null unique check (email = lower(email)),
  display_name text not null,
  password_hash text not null,
  role text not null default 'viewer' check (role in ('admin', 'inventory_manager', 'product_editor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  must_change_password boolean not null default false,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  approved_by bigint references app_users(id),
  approved_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_sessions (
  token_hash char(64) primary key,
  user_id bigint not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists app_sessions_user_idx on app_sessions (user_id);
create index if not exists app_sessions_expiry_idx on app_sessions (expires_at);

create table if not exists password_reset_requests (
  id bigserial primary key,
  user_id bigint not null references app_users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed', 'dismissed')),
  requested_at timestamptz not null default now(),
  resolved_by bigint references app_users(id),
  resolved_at timestamptz
);

create index if not exists password_reset_pending_idx on password_reset_requests (user_id, status);

create table if not exists auth_audit_log (
  id bigserial primary key,
  actor_user_id bigint references app_users(id),
  target_user_id bigint references app_users(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists auth_audit_created_idx on auth_audit_log (created_at desc);
