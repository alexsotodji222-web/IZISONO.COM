-- IZISONO production hardening: credits, anti-abuse, profile settings, audit indexes.
create extension if not exists pgcrypto;

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- The browser must never be allowed to change credits or create profile rows directly.
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- Server-only, atomic credit operations.
create or replace function public.consume_generation_credits(p_user_id uuid, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_credits integer;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 100 then
    raise exception 'invalid_credit_amount';
  end if;
  select credits into v_credits from public.profiles where id = p_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;
  if v_credits < p_amount then
    return jsonb_build_object('success',false,'credits',v_credits);
  end if;
  update public.profiles set credits = credits - p_amount, updated_at = now() where id = p_user_id returning credits into v_credits;
  return jsonb_build_object('success',true,'credits',v_credits);
end;
$$;

create or replace function public.refund_generation_credits(p_user_id uuid, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_credits integer;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 100 then raise exception 'invalid_credit_amount'; end if;
  update public.profiles set credits = credits + p_amount, updated_at = now() where id = p_user_id returning credits into v_credits;
  if not found then raise exception 'profile_not_found'; end if;
  return jsonb_build_object('success',true,'credits',v_credits);
end;
$$;
revoke all on function public.consume_generation_credits(uuid,integer) from public, anon, authenticated;
revoke all on function public.refund_generation_credits(uuid,integer) from public, anon, authenticated;
grant execute on function public.consume_generation_credits(uuid,integer) to service_role;
grant execute on function public.refund_generation_credits(uuid,integer) to service_role;

-- Generation tables are server-managed; users can only read their own jobs.
revoke insert, update, delete on public.generation_jobs from anon, authenticated;
grant select on public.generation_jobs to authenticated;

-- The server manages tracks; users retain only the safe self-service actions.
revoke insert on public.tracks from anon, authenticated;
grant select, update, delete on public.tracks to authenticated;

create index if not exists generation_jobs_track_id_idx on public.generation_jobs(track_id);

-- Admin audit log used by the admin dashboard.
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from anon, authenticated;
grant all on public.admin_audit_logs to service_role;
create index if not exists admin_audit_logs_admin_user_id_idx on public.admin_audit_logs(admin_user_id);
create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs(created_at desc);

-- Keep payment RPCs server-only and make their security-definer search_path safe.
revoke all on function public.record_payment_transaction(uuid,text,text,integer,text,integer,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.apply_moneroo_payment(uuid,text,text,integer,text,integer,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_payment_transaction(uuid,text,text,integer,text,integer,text,text,text,jsonb) to service_role;
grant execute on function public.apply_moneroo_payment(uuid,text,text,integer,text,integer,text,text,text,jsonb) to service_role;

-- Payment records are never writable from the browser.
revoke insert, update, delete on public.payment_transactions from anon, authenticated;
grant select on public.payment_transactions to authenticated;

-- Harden the auth trigger against search_path manipulation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id,email) values(new.id,new.email)
  on conflict(id) do update set email=excluded.email, updated_at=now();
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
