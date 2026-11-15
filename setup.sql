-- Run this once in Supabase: SQL Editor > New query > paste > Run

create table customers (
  id          bigint generated always as identity primary key,
  name        text not null,
  phone       text not null default '',
  address     text not null default '',
  created_by  text not null,
  created_at  timestamptz not null default now(),
  edited_by   text,
  edited_at   timestamptz
);

create table transactions (
  id           bigint generated always as identity primary key,
  customer_id  bigint not null references customers(id) on delete cascade,
  kind         text not null check (kind in ('sale','payment')),
  items        text not null default '',
  note         text not null default '',
  total        numeric(12,2) not null default 0 check (total >= 0),
  paid         numeric(12,2) not null default 0 check (paid >= 0),
  date         date not null default current_date,
  by_user      text not null,
  created_at   timestamptz not null default now(),
  edited_by    text,
  edited_at    timestamptz,
  deleted      boolean not null default false,
  deleted_by   text,
  deleted_at   timestamptz
);
create index on transactions (customer_id);

-- Only logged-in users can read or write.
alter table customers    enable row level security;
alter table transactions enable row level security;
create policy "staff only" on customers    for all to authenticated using (true) with check (true);
create policy "staff only" on transactions for all to authenticated using (true) with check (true);

-- Live updates between the two users.
alter publication supabase_realtime add table customers, transactions;

-- Backup reminder log (see update_backup.sql)

create table backup_log (
  id          bigint generated always as identity primary key,
  by_user     text not null,
  customers   int not null default 0,
  entries     int not null default 0,
  created_at  timestamptz not null default now()
);
alter table backup_log enable row level security;
create policy "staff read" on backup_log for select to authenticated using (true);
create policy "staff add"  on backup_log for insert to authenticated with check (true);
