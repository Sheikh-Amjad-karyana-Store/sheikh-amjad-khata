-- Run these 3 steps ONE BY ONE in Supabase SQL Editor.
-- Select only the step you want to run, then press Run.

-- STEP 1: look for names that already exist twice. The result must be EMPTY before step 3.
select lower(regexp_replace(trim(name), '\s+', ' ', 'g')) as clean_name,
       count(*) as times, string_agg(id::text, ', ') as ids
from customers
group by 1
having count(*) > 1;

-- STEP 2: remove extra spaces from existing names (for example "Rana   fair deal").
update customers
set name = regexp_replace(trim(name), '\s+', ' ', 'g')
where name <> regexp_replace(trim(name), '\s+', ' ', 'g');

-- STEP 3: stop the database itself from saving the same name twice.
-- If step 1 showed duplicates, fix them first (see the merge example below).
create unique index customers_name_unique
on customers (lower(regexp_replace(trim(name), '\s+', ' ', 'g')));

-- MERGE EXAMPLE (only if step 1 found two accounts of one person):
-- Move all entries of the extra account (id 12) to the account you keep (id 5), then delete the extra one.
-- update transactions set customer_id = 5 where customer_id = 12;
-- delete from customers where id = 12;
