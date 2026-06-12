-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Sessions table
create table if not exists sessions (
  id uuid primary key default uuid_generate_v4(),
  phone text not null,
  language text not null default 'hi',
  intent text,
  context jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on sessions (phone);
create index on sessions (updated_at desc);

-- Documents audit log
create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete set null,
  doc_type text not null,
  doc_name text not null,
  phone text not null,
  storage_path text,
  created_at timestamptz not null default now()
);

-- RLS policies
alter table sessions enable row level security;
alter table documents enable row level security;

-- Service role bypasses RLS — no additional policies needed for backend
-- Frontend access (if any) should use per-user policies
