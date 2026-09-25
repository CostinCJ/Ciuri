-- Ciuri: rooms, players, game state, hands, chat. All writes go through the service role.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  start_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table public.room_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(name) between 2 and 20),
  seat smallint check (seat between 0 and 3),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);

-- Full engine state: never readable by clients.
-- users: user ids indexed by seat, fixed when the match starts (the game never reads live seats).
create table public.game_secret (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  version integer not null,
  state jsonb not null,
  log jsonb not null default '[]'::jsonb,
  deadline timestamptz,
  users jsonb not null
);

-- What every player in the room may see.
create table public.game_public (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  version integer not null,
  view jsonb not null,
  log jsonb not null default '[]'::jsonb,
  deadline timestamptz
);

-- One row per seat: that player's cards and legal moves; readable only by its owner.
create table public.game_hands (
  room_id uuid not null references public.rooms (id) on delete cascade,
  seat smallint not null check (seat between 0 and 3),
  user_id uuid not null,
  cards jsonb not null,
  moves jsonb not null,
  primary key (room_id, seat)
);

create table public.messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null,
  name text not null,
  text text not null check (char_length(text) between 1 and 300),
  created_at timestamptz not null default now()
);
create index messages_room_created_idx on public.messages (room_id, created_at);
create index messages_room_user_idx on public.messages (room_id, user_id, created_at desc);

create function public.is_room_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_players where room_id = p_room and user_id = auth.uid()
  );
$$;

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_secret enable row level security;
alter table public.game_public enable row level security;
alter table public.game_hands enable row level security;
alter table public.messages enable row level security;

create policy "members read room" on public.rooms
  for select to authenticated using (public.is_room_member(id));
create policy "members read players" on public.room_players
  for select to authenticated using (public.is_room_member(room_id));
create policy "members read public game" on public.game_public
  for select to authenticated using (public.is_room_member(room_id));
create policy "owner reads hand" on public.game_hands
  for select to authenticated using (user_id = auth.uid());
create policy "members read messages" on public.messages
  for select to authenticated using (public.is_room_member(room_id));
-- game_secret: no policies → no client access. No insert/update/delete policies anywhere.

-- Seats a player (p_seat null = stand up). Store.setSeat contract: false when the seat is taken,
-- the player is not in the room, or the room left the lobby. FOR SHARE on the room serialises
-- this with commit_game's FOR UPDATE, so no seat can change while a match is being started.
create function public.set_seat(p_room uuid, p_user uuid, p_seat smallint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.rooms where id = p_room and status = 'lobby' for share;
  if not found then
    return false;
  end if;
  update public.room_players set seat = p_seat where room_id = p_room and user_id = p_user;
  return found;
exception
  -- Two players racing for the same seat (unique (room_id, seat)) or a lock cycle with another
  -- seat change: the loser simply did not get the seat.
  when unique_violation or deadlock_detected then
    return false;
end;
$$;

-- Atomically commits a game transition with optimistic versioning (Store.commitGame contract).
-- p_expected = 0 starts the first match of the room: the room must be in the lobby and its
-- seated players must be exactly p_users (user ids indexed by seat, all 4 seats).
-- Otherwise the stored version must equal p_expected. Returns false (writing nothing) on refusal.
create function public.commit_game(
  p_room uuid,
  p_expected integer,
  p_state jsonb,
  p_view jsonb,
  p_log jsonb,
  p_deadline timestamptz,
  p_users jsonb,
  p_hands jsonb,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new integer;
  v_status text;
begin
  if p_expected = 0 then
    select status into v_status from public.rooms where id = p_room for update;
    if not found or v_status <> 'lobby' then
      return false;
    end if;
    if jsonb_typeof(p_users) <> 'array' or jsonb_array_length(p_users) <> 4
       or (select count(*) from public.room_players where room_id = p_room and seat is not null) <> 4
       or exists (
         select 1 from public.room_players rp
          where rp.room_id = p_room and rp.seat is not null
            and rp.user_id::text is distinct from (p_users ->> rp.seat::int)
       ) then
      return false;
    end if;
    insert into public.game_secret (room_id, version, state, log, deadline, users)
    values (p_room, 1, p_state, p_log, p_deadline, p_users)
    on conflict (room_id) do nothing;
    if not found then
      return false;
    end if;
    v_new := 1;
  else
    update public.game_secret
       set version = version + 1, state = p_state, log = p_log, deadline = p_deadline, users = p_users
     where room_id = p_room and version = p_expected;
    if not found then
      return false;
    end if;
    v_new := p_expected + 1;
  end if;

  insert into public.game_public (room_id, version, view, log, deadline)
  values (p_room, v_new, p_view, p_log, p_deadline)
  on conflict (room_id) do update
    set version = excluded.version, view = excluded.view, log = excluded.log, deadline = excluded.deadline;

  insert into public.game_hands (room_id, seat, user_id, cards, moves)
  select p_room, (h ->> 'seat')::smallint, (h ->> 'user_id')::uuid, h -> 'cards', h -> 'moves'
    from jsonb_array_elements(p_hands) as h
  on conflict (room_id, seat) do update
    set user_id = excluded.user_id, cards = excluded.cards, moves = excluded.moves;

  update public.rooms set status = p_status, start_at = null where id = p_room;
  return true;
end;
$$;

-- Store.insertMessage contract: inserts only if this user posted nothing in the room during the
-- last second (database clock). The per-user advisory lock makes check + insert atomic.
create function public.send_message(p_room uuid, p_user uuid, p_name text, p_text text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_room::text || p_user::text));
  if exists (
    select 1 from public.messages
     where room_id = p_room and user_id = p_user and created_at > now() - interval '1 second'
  ) then
    return false;
  end if;
  insert into public.messages (room_id, user_id, name, text) values (p_room, p_user, p_name, p_text);
  return true;
end;
$$;

revoke execute on function public.set_seat(uuid, uuid, smallint) from public, anon, authenticated;
revoke execute on function public.commit_game(uuid, integer, jsonb, jsonb, jsonb, timestamptz, jsonb, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.send_message(uuid, uuid, text, text) from public, anon, authenticated;

alter publication supabase_realtime
  add table public.rooms, public.room_players, public.game_public, public.game_hands, public.messages;
