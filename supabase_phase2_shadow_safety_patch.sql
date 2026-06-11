-- ANC EMR Phase 2A shadow rollback safety patch
--
-- Required before staging. It allows automatic cleanup of a failed draft
-- batch, while blocking deletion after staging or verification.

begin;

grant delete on table public.phase2_migration_batches to authenticated;

create or replace function public.guard_phase2_batch_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status not in ('draft', 'failed', 'rolled_back') then
    raise exception 'This migration batch must be rolled back before deletion';
  end if;
  return old;
end;
$$;

drop trigger if exists guard_phase2_batch_delete
on public.phase2_migration_batches;
create trigger guard_phase2_batch_delete
before delete on public.phase2_migration_batches
for each row execute function public.guard_phase2_batch_delete();

commit;
