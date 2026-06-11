-- ANC EMR Phase 2A key-vault setup
--
-- This step creates only the owner-only storage for wrapped encryption keys.
-- It does not create a key, migrate records, or change Phase 1 reads/writes.

begin;

create table if not exists public.clinic_key_vault (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  key_version integer not null default 1 check (key_version > 0),
  format_version integer not null default 1 check (format_version = 1),
  algorithm text not null default 'AES-256-GCM'
    check (algorithm = 'AES-256-GCM'),
  kdf jsonb not null,
  wrapped_by_passphrase jsonb not null,
  wrapped_by_recovery jsonb not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, key_version)
);

create unique index if not exists clinic_key_vault_one_active_per_owner
on public.clinic_key_vault (owner_id)
where status = 'active';

alter table public.clinic_key_vault enable row level security;

revoke all on table public.clinic_key_vault from anon;
grant select, insert, update on table public.clinic_key_vault to authenticated;

drop policy if exists "clinic owner key vault" on public.clinic_key_vault;
drop policy if exists "mfa required key vault" on public.clinic_key_vault;

create policy "clinic owner key vault"
on public.clinic_key_vault for all
to authenticated
using (
  (select auth.uid()) = owner_id
  and (select auth.uid()) = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
)
with check (
  (select auth.uid()) = owner_id
  and (select auth.uid()) = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
);

create policy "mfa required key vault"
on public.clinic_key_vault as restrictive for all
to authenticated
using ((select auth.jwt()->>'aal') = 'aal2')
with check ((select auth.jwt()->>'aal') = 'aal2');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_clinic_key_vault_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id
    or new.key_version <> old.key_version
    or new.format_version <> old.format_version then
    raise exception 'Vault owner, key version, and format version are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_clinic_key_vault_identity
on public.clinic_key_vault;
create trigger protect_clinic_key_vault_identity
before update on public.clinic_key_vault
for each row execute function public.protect_clinic_key_vault_identity();

drop trigger if exists set_clinic_key_vault_updated_at
on public.clinic_key_vault;
create trigger set_clinic_key_vault_updated_at
before update on public.clinic_key_vault
for each row execute function public.set_updated_at();

commit;
