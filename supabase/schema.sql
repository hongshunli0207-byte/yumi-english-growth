create table if not exists public.books (
  id text primary key,
  title text not null,
  level text,
  status text not null default 'indexed',
  source_dir text,
  updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.book_files (
  id text primary key,
  book_id text not null references public.books(id) on delete cascade,
  kind text not null check (kind in ('pdf', 'audio')),
  file_name text not null,
  local_path text,
  storage_path text,
  size_bytes bigint,
  modified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.library_scan_runs (
  id text primary key,
  library_dir text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  total_files integer not null default 0,
  paired_books integer not null default 0,
  orphan_files integer not null default 0,
  created_at timestamptz not null default now()
);
