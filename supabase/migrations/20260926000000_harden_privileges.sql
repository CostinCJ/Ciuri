-- Hardening: explicit table/function privileges, empty search_path on security definer functions,
-- and initplan-friendly auth.uid() calls in RLS. Function bodies are otherwise unchanged from init.

-- Tables: clients only ever read (and only through RLS); every write goes through the service role.
revoke all on table public.rooms, public.room_players, public.game_secret, public.game_public,
  public.game_hands, public.messages from anon, authenticated;

grant select on table public.rooms, public.room_players, public.game_public, public.game_hands,
  public.messages to authenticated;

grant all on table public.rooms, public.room_players, public.game_secret, public.game_public,
  public.game_hands, public.messages to service_role;

grant usage, select on sequence public.messages_id_seq to service_role;

-- Functions: recreated with an empty search_path; every reference is schema-qualified.
create or replace function public.is_room_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_players where room_id = p_room and user_id = (select auth.uid())
  );
$$;

create or replace function public.set_seat(p_room uuid, p_user uuid, p_seat smallint)
returns boolean
language plpgsql
security definer
set search_path = ''
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

create or replace function public.commit_game(
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
set search_path = ''
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
    -- Type check first, on its own: jsonb_array_length raises on non-arrays and SQL does not
    -- guarantee OR short-circuit evaluation.
    if jsonb_typeof(p_users) is distinct from 'array' then
      return false;
    end if;
    if jsonb_array_length(p_users) <> 4
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

create or replace function public.send_message(p_room uuid, p_user uuid, p_name text, p_text text)
returns boolean
language plpgsql
security definer
set search_path = ''
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

-- Server-only RPCs: service role only.
revoke execute on function public.set_seat(uuid, uuid, smallint) from public, anon, authenticated;
revoke execute on function public.commit_game(uuid, integer, jsonb, jsonb, jsonb, timestamptz, jsonb, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.send_message(uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function public.set_seat(uuid, uuid, smallint) to service_role;
grant execute on function public.commit_game(uuid, integer, jsonb, jsonb, jsonb, timestamptz, jsonb, jsonb, text)
  to service_role;
grant execute on function public.send_message(uuid, uuid, text, text) to service_role;

-- RLS helper: the policies call it as the authenticated role.
revoke execute on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated, service_role;

-- Policy: wrap auth.uid() so it is evaluated once per statement.
drop policy "owner reads hand" on public.game_hands;
create policy "owner reads hand" on public.game_hands
  for select to authenticated using ((select auth.uid()) = user_id);
