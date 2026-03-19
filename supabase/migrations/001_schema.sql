-- ============================================================
-- GroupFlip — Full Schema Migration
-- Run this once in your Supabase SQL Editor
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ── Tables ───────────────────────────────────────────────────

create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  roblox_id   bigint not null unique,
  username    text not null,
  avatar_url  text,
  discord_id  text unique,
  wins        integer not null default 0,
  losses      integer not null default 0,
  rank        text not null default 'user' check (rank in ('user','whale','god','staff','manager','owner')),
  is_banned   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.group_verifications (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.users(id) on delete cascade,
  roblox_group_id   bigint not null,
  group_name        text not null,
  member_count      integer not null default 0,
  owned_since       date,
  method            text not null check (method in ('auto_rolimons','manual_screenshot')),
  screenshot_url    text,
  status            text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by       uuid references public.users(id),
  reject_reason     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, roblox_group_id)
);

create table public.flips (
  id                    uuid primary key default uuid_generate_v4(),
  creator_id            uuid not null references public.users(id) on delete cascade,
  challenger_id         uuid references public.users(id) on delete set null,
  creator_group_id      uuid not null references public.group_verifications(id),
  challenger_group_id   uuid references public.group_verifications(id),
  creator_side          text not null check (creator_side in ('heads','tails')),
  status                text not null default 'open' check (status in ('open','active','complete','cancelled')),
  winner_id             uuid references public.users(id),
  result_side           text check (result_side in ('heads','tails')),
  flipped_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.roulette_rounds (
  id            uuid primary key default uuid_generate_v4(),
  round_number  integer not null default 1,
  status        text not null default 'betting' check (status in ('betting','spinning','complete')),
  spin_at       timestamptz not null default (now() + interval '30 seconds'),
  result        text check (result in ('red','black','green')),
  winner_ids    uuid[],
  created_at    timestamptz not null default now()
);

create table public.roulette_bets (
  id                      uuid primary key default uuid_generate_v4(),
  round_id                uuid not null references public.roulette_rounds(id) on delete cascade,
  user_id                 uuid not null references public.users(id) on delete cascade,
  group_verification_id   uuid not null references public.group_verifications(id),
  color                   text not null check (color in ('red','black','green')),
  won                     boolean,
  created_at              timestamptz not null default now(),
  unique (round_id, user_id)
);

create table public.chat_messages (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  message     text not null check (char_length(message) between 1 and 500),
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.group_transfers (
  id              uuid primary key default uuid_generate_v4(),
  flip_id         uuid references public.flips(id),
  round_id        uuid references public.roulette_rounds(id),
  from_user_id    uuid not null references public.users(id),
  to_user_id      uuid not null references public.users(id),
  roblox_group_id bigint not null,
  group_name      text not null,
  confirmed_at    timestamptz,
  disputed        boolean not null default false,
  dispute_note    text,
  created_at      timestamptz not null default now(),
  check (flip_id is not null or round_id is not null)
);

create table public.admin_logs (
  id          uuid primary key default uuid_generate_v4(),
  admin_id    uuid not null references public.users(id),
  action      text not null,
  target_id   uuid,
  target_type text,
  note        text,
  created_at  timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────
create index on public.flips (status) where status = 'open';
create index on public.flips (creator_id);
create index on public.roulette_rounds (status);
create index on public.roulette_bets (round_id);
create index on public.chat_messages (created_at desc);
create index on public.group_verifications (user_id, status);
create index on public.group_transfers (disputed) where disputed = true;

-- ── Triggers ─────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_users_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger trg_flips_updated_at before update on public.flips for each row execute function public.set_updated_at();
create trigger trg_verif_updated_at  before update on public.group_verifications for each row execute function public.set_updated_at();

-- Auto rank update based on wins
create or replace function public.auto_rank()
returns trigger language plpgsql security definer as $$
begin
  if new.rank in ('user','whale','god') then
    if    new.wins >= 100 then new.rank = 'god';
    elsif new.wins >= 25  then new.rank = 'whale';
    else                       new.rank = 'user';
    end if;
  end if;
  return new;
end; $$;

create trigger trg_auto_rank before update of wins on public.users
  for each row execute function public.auto_rank();

-- ── Atomic functions ─────────────────────────────────────────
create or replace function public.resolve_flip(
  p_flip_id     uuid,
  p_result_side text,
  p_winner_id   uuid,
  p_loser_id    uuid
) returns void language plpgsql security definer as $$
begin
  update public.flips set status='complete', result_side=p_result_side, winner_id=p_winner_id, flipped_at=now() where id=p_flip_id;
  update public.users set wins=wins+1   where id=p_winner_id;
  update public.users set losses=losses+1 where id=p_loser_id;
end; $$;

create or replace function public.resolve_roulette_round(
  p_round_id    uuid,
  p_result      text,
  p_winner_ids  uuid[]
) returns void language plpgsql security definer as $$
begin
  update public.roulette_rounds set status='complete', result=p_result, winner_ids=p_winner_ids where id=p_round_id;
  update public.roulette_bets   set won=(color=p_result) where round_id=p_round_id;
  update public.users u set wins=wins+1   from public.roulette_bets b where b.round_id=p_round_id and b.user_id=u.id and b.color=p_result;
  update public.users u set losses=losses+1 from public.roulette_bets b where b.round_id=p_round_id and b.user_id=u.id and b.color!=p_result;
  -- Open next round
  insert into public.roulette_rounds (round_number, spin_at)
  select coalesce((select max(round_number) from public.roulette_rounds),0)+1, now()+interval '30 seconds';
end; $$;

-- ── Row Level Security ────────────────────────────────────────
alter table public.users               enable row level security;
alter table public.group_verifications enable row level security;
alter table public.flips               enable row level security;
alter table public.roulette_rounds     enable row level security;
alter table public.roulette_bets       enable row level security;
alter table public.chat_messages       enable row level security;
alter table public.group_transfers     enable row level security;
alter table public.admin_logs          enable row level security;

-- users
create policy "users_read_all"   on public.users for select using (true);
create policy "users_insert_own" on public.users for insert with check (auth.uid()=id);
create policy "users_update_own" on public.users for update using (auth.uid()=id);

-- group_verifications
create policy "verif_read" on public.group_verifications for select using (
  user_id=auth.uid() or
  exists(select 1 from public.users where id=auth.uid() and rank in ('staff','manager','owner'))
);
create policy "verif_insert" on public.group_verifications for insert with check (user_id=auth.uid());

-- flips
create policy "flips_read_all"  on public.flips for select using (true);
create policy "flips_insert_ok" on public.flips for insert with check (
  auth.uid()=creator_id and
  not exists(select 1 from public.users where id=auth.uid() and is_banned=true)
);

-- roulette
create policy "rounds_read" on public.roulette_rounds for select using (true);
create policy "bets_read"   on public.roulette_bets   for select using (true);
create policy "bets_insert" on public.roulette_bets   for insert with check (
  auth.uid()=user_id and
  not exists(select 1 from public.users where id=auth.uid() and is_banned=true)
);

-- chat
create policy "chat_read"   on public.chat_messages for select using (is_deleted=false);
create policy "chat_insert" on public.chat_messages for insert with check (
  auth.uid()=user_id and
  not exists(select 1 from public.users where id=auth.uid() and is_banned=true)
);

-- transfers
create policy "transfers_read" on public.group_transfers for select using (
  from_user_id=auth.uid() or to_user_id=auth.uid() or
  exists(select 1 from public.users where id=auth.uid() and rank in ('staff','manager','owner'))
);

-- admin logs
create policy "admin_logs_read" on public.admin_logs for select using (
  exists(select 1 from public.users where id=auth.uid() and rank in ('staff','manager','owner'))
);

-- ── Realtime (run these separately in Supabase dashboard) ─────
-- alter publication supabase_realtime add table public.flips;
-- alter publication supabase_realtime add table public.roulette_rounds;
-- alter publication supabase_realtime add table public.roulette_bets;
-- alter publication supabase_realtime add table public.chat_messages;
-- alter publication supabase_realtime add table public.users;

-- ── Seed ─────────────────────────────────────────────────────
insert into public.roulette_rounds (round_number, spin_at)
values (1, now() + interval '30 seconds');

-- After your first login, make yourself owner:
-- update public.users set rank = 'owner' where roblox_id = YOUR_ROBLOX_ID;
