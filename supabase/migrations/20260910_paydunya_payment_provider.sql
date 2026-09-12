-- Izisono V15: move payment fulfillment to PayDunya.
-- Payment identifiers are provider-neutral; gateway identifies the provider.

-- Replace the legacy provider-specific identifier with a provider-neutral one.
drop function if exists public.record_payment_transaction(uuid,text,text,integer,text,integer,text,text,text,jsonb);
drop function if exists public.apply_moneroo_payment(uuid,text,text,integer,text,integer,text,text,text,jsonb);
alter table public.payment_transactions rename column moneroo_payment_id to payment_id;
drop index if exists public.payment_transactions_moneroo_payment_id_uidx;
create unique index if not exists payment_transactions_payment_id_uidx on public.payment_transactions(payment_id);

create or replace function public.record_paydunya_transaction(
  p_user_id uuid,
  p_payment_id text,
  p_plan_id text,
  p_amount integer,
  p_currency text,
  p_credits integer,
  p_status text,
  p_method text default null,
  p_gateway text default 'paydunya',
  p_raw_payload jsonb default '{}'::jsonb
) returns public.payment_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payment_transactions;
begin
  insert into public.payment_transactions(
    user_id, payment_id, plan_id, amount, currency, credits,
    status, method, gateway, raw_payload
  ) values (
    p_user_id, p_payment_id, p_plan_id, p_amount, p_currency, p_credits,
    p_status, p_method, p_gateway, coalesce(p_raw_payload,'{}'::jsonb)
  )
  on conflict(payment_id) do update set
    status = case when payment_transactions.status='success' then 'success' else excluded.status end,
    method = coalesce(excluded.method,payment_transactions.method),
    gateway = coalesce(excluded.gateway,payment_transactions.gateway),
    raw_payload = excluded.raw_payload,
    updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.apply_paydunya_payment(
  p_user_id uuid,
  p_payment_id text,
  p_plan_id text,
  p_amount integer,
  p_currency text,
  p_credits integer,
  p_status text,
  p_method text default null,
  p_gateway text default 'paydunya',
  p_raw_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.payment_transactions;
  v_new_credits integer;
begin
  if upper(p_currency) <> 'XOF' then raise exception 'payment_currency_invalid'; end if;
  if lower(p_status) <> 'completed' then
    return jsonb_build_object('credited',false,'creditsAdded',0,'status',p_status,'paymentId',p_payment_id);
  end if;
  if p_amount <= 0 or p_credits <= 0 then raise exception 'payment_amount_invalid'; end if;

  insert into public.payment_transactions(
    user_id, payment_id, plan_id, amount, currency, credits,
    status, method, gateway, raw_payload, processed_at, updated_at
  ) values (
    p_user_id, p_payment_id, p_plan_id, p_amount, p_currency, p_credits,
    'success', p_method, p_gateway, coalesce(p_raw_payload,'{}'::jsonb), now(), now()
  )
  on conflict(payment_id) do nothing
  returning * into v_tx;

  if v_tx.id is null then
    select credits into v_new_credits from public.profiles where id=p_user_id;
    return jsonb_build_object(
      'credited',false,'creditsAdded',0,'totalCredits',v_new_credits,
      'status','success','paymentId',p_payment_id,'alreadyProcessed',true
    );
  end if;

  update public.profiles
  set credits=credits+p_credits, updated_at=now()
  where id=p_user_id
  returning credits into v_new_credits;

  if not found then
    delete from public.payment_transactions where id=v_tx.id;
    raise exception 'profile_not_found_for_payment';
  end if;

  return jsonb_build_object(
    'credited',true,'creditsAdded',p_credits,'totalCredits',v_new_credits,
    'status','success','paymentId',p_payment_id,'alreadyProcessed',false
  );
end;
$$;

revoke all on function public.record_paydunya_transaction(uuid,text,text,integer,text,integer,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.apply_paydunya_payment(uuid,text,text,integer,text,integer,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_paydunya_transaction(uuid,text,text,integer,text,integer,text,text,text,jsonb) to service_role;
grant execute on function public.apply_paydunya_payment(uuid,text,text,integer,text,integer,text,text,text,jsonb) to service_role;
