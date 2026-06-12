-- APPLIED 2026-06-12: NULL-SAFE PHASE 3 COMMAND GATES
--
-- PostgreSQL boolean expressions containing NULL do not evaluate to true.
-- IS DISTINCT FROM makes an unset command flag fail closed.

begin;

create or replace function public.phase3_enforce_grant_command()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('anc.phase3_owner_command', true)
    is distinct from 'authorized' then
    raise exception 'Phase 3 grants may only be changed through owner commands';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.phase3_enforce_audit_command()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('anc.phase3_owner_command', true)
    is distinct from 'authorized' then
    raise exception 'Phase 3 audit events may only be appended by reviewed commands';
  end if;
  return new;
end;
$$;

commit;
