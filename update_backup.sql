-- Run this ONCE in Supabase (SQL Editor > New query > paste > Run).
-- Needed only if you already ran setup.sql before the backup feature was added.

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
