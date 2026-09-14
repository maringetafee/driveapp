-- Roadly — segunda tanda social: notificaciones, perfiles privados con
-- solicitud de seguimiento, grupos privados (crews), tags de trayecto y
-- nuevas insignias. No toca nada de la lógica de tracking (trips/trip_metrics
-- se insertan igual que siempre desde la app).

-- ── Notificaciones ──────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade, -- destinatario
  actor_id uuid references public.profiles (id) on delete cascade,
  type text not null check (type in ('like', 'comment', 'follow', 'follow_request', 'follow_accept', 'badge')),
  trip_id uuid references public.trips (id) on delete cascade,
  badge_id uuid references public.badges (id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Cada usuario ve solo sus notificaciones"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Cada usuario marca como leídas solo las suyas"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Cada usuario borra solo sus notificaciones"
  on public.notifications for delete
  to authenticated
  using (auth.uid() = user_id);

-- Las notificaciones se insertan desde triggers security definer de abajo;
-- no hace falta política de insert para el rol authenticated.

create or replace function public.notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.trips where id = new.trip_id;
  if v_owner is not null and v_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, trip_id)
    values (v_owner, new.user_id, 'like', new.trip_id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_trip_like_notify on public.trip_likes;
create trigger on_trip_like_notify
  after insert on public.trip_likes
  for each row execute procedure public.notify_on_like();

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.trips where id = new.trip_id;
  if v_owner is not null and v_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, trip_id)
    values (v_owner, new.user_id, 'comment', new.trip_id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_trip_comment_notify on public.trip_comments;
create trigger on_trip_comment_notify
  after insert on public.trip_comments
  for each row execute procedure public.notify_on_comment();

create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, actor_id, type)
  values (new.followed_id, new.follower_id, case when new.status = 'pending' then 'follow_request' else 'follow' end);
  return new;
end;
$$;

drop trigger if exists on_follow_notify on public.follows;
create trigger on_follow_notify
  after insert on public.follows
  for each row execute procedure public.notify_on_follow();

create or replace function public.notify_on_follow_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    insert into public.notifications (user_id, actor_id, type)
    values (new.follower_id, new.followed_id, 'follow_accept');
  end if;
  return new;
end;
$$;

drop trigger if exists on_follow_accept_notify on public.follows;
create trigger on_follow_accept_notify
  after update on public.follows
  for each row execute procedure public.notify_on_follow_accept();

create or replace function public.notify_on_badge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, badge_id)
  values (new.user_id, 'badge', new.badge_id);
  return new;
end;
$$;

drop trigger if exists on_badge_notify on public.user_badges;
create trigger on_badge_notify
  after insert on public.user_badges
  for each row execute procedure public.notify_on_badge();

-- ── Perfiles privados + solicitudes de seguimiento ─────────────────────
alter table public.profiles add column is_private boolean not null default false;

-- Antes, cualquier trayecto/coche público era visible por todos; ahora, si
-- el dueño tiene el perfil en privado, solo lo ven sus seguidores aceptados
-- (o él mismo). No afecta a cuentas públicas (el caso por defecto).
drop policy if exists "Los trayectos públicos son visibles por todos los autenticados" on public.trips;
create policy "Trayectos visibles según privacidad del perfil"
  on public.trips for select
  to authenticated
  using (
    auth.uid() = user_id
    or (
      is_public = true
      and (
        not exists (select 1 from public.profiles p where p.id = trips.user_id and p.is_private = true)
        or exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid() and f.followed_id = trips.user_id and f.status = 'accepted'
        )
      )
    )
  );

drop policy if exists "Los vehículos son visibles por todos los autenticados" on public.vehicles;
create policy "Vehículos visibles según privacidad del perfil"
  on public.vehicles for select
  to authenticated
  using (
    auth.uid() = user_id
    or (
      not exists (select 1 from public.profiles p where p.id = vehicles.user_id and p.is_private = true)
      or exists (
        select 1 from public.follows f
        where f.follower_id = auth.uid() and f.followed_id = vehicles.user_id and f.status = 'accepted'
      )
    )
  );

alter table public.follows add column status text not null default 'accepted' check (status in ('pending', 'accepted'));

drop policy if exists "Follows visibles por todos los autenticados" on public.follows;
create policy "Follows aceptados son públicos; las solicitudes solo las ven sus dos partes"
  on public.follows for select
  to authenticated
  using (status = 'accepted' or follower_id = auth.uid() or followed_id = auth.uid());

create policy "El destinatario acepta o gestiona la solicitud"
  on public.follows for update
  to authenticated
  using (auth.uid() = followed_id)
  with check (auth.uid() = followed_id);

create policy "El destinatario puede rechazar/eliminar una solicitud"
  on public.follows for delete
  to authenticated
  using (auth.uid() = followed_id);

-- ── Tags de trayecto (se editan después, no durante el tracking) ───────
alter table public.trips add column tag text check (tag in ('commute', 'road_trip', 'night', 'other'));

-- ── Grupos privados (crews) ─────────────────────────────────────────────
create table public.groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null check (char_length(name) between 1 and 60),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy "Solo los miembros ven el grupo"
  on public.groups for select
  to authenticated
  using (exists (select 1 from public.group_members gm where gm.group_id = id and gm.user_id = auth.uid()));

create policy "Cualquiera crea un grupo del que es dueño"
  on public.groups for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Solo el dueño borra el grupo"
  on public.groups for delete
  to authenticated
  using (auth.uid() = owner_id);

create policy "Solo los miembros ven la lista de miembros"
  on public.group_members for select
  to authenticated
  using (exists (select 1 from public.group_members gm2 where gm2.group_id = group_id and gm2.user_id = auth.uid()));

create policy "Cada usuario se añade solo a sí mismo como miembro"
  on public.group_members for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Cada usuario sale del grupo por su cuenta"
  on public.group_members for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.join_group_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  select id into v_group_id from public.groups where invite_code = p_code;
  if v_group_id is null then
    raise exception 'Código de invitación no válido';
  end if;
  insert into public.group_members (group_id, user_id) values (v_group_id, auth.uid())
  on conflict do nothing;
  return v_group_id;
end;
$$;

grant execute on function public.join_group_by_code to authenticated;

create or replace function public.compute_group_leaderboard(
  p_group_id uuid,
  p_metric text,
  p_period text default 'weekly',
  p_limit int default 100
)
returns table (user_id uuid, username text, value double precision, rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  with member_check as (
    select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid()
  ),
  period_trips as (
    select t.*
    from public.trips t
    where
      exists (select 1 from member_check)
      and exists (select 1 from public.group_members gm where gm.group_id = p_group_id and gm.user_id = t.user_id)
      and (
        p_period = 'all_time'
        or (p_period = 'weekly' and t.started_at >= date_trunc('week', now()))
        or (p_period = 'monthly' and t.started_at >= date_trunc('month', now()))
      )
  ),
  scoped as (
    select pt.*, p.username
    from period_trips pt
    join public.profiles p on p.id = pt.user_id
  ),
  aggregated as (
    select
      user_id,
      username,
      case p_metric
        when 'max_speed' then max(max_speed_kmh)
        when 'total_distance' then sum(distance_meters)
        when 'driving_score' then avg(driving_score)
        when 'trip_count' then count(*)::double precision
        else null
      end as value
    from scoped
    group by user_id, username
  )
  select user_id, username, value, row_number() over (order by value desc) as rank
  from aggregated
  where value is not null
  order by value desc
  limit p_limit;
$$;

grant execute on function public.compute_group_leaderboard to authenticated;

-- Extiende compute_leaderboard (0002) para que el scope "friends" solo
-- cuente follows aceptados, ahora que existen solicitudes pendientes.
create or replace function public.compute_leaderboard(
  p_metric text,
  p_scope text,
  p_scope_value text default null,
  p_period text default 'all_time',
  p_limit int default 200
)
returns table (user_id uuid, username text, value double precision, rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  with period_trips as (
    select t.*
    from public.trips t
    where t.is_public = true
      and (
        p_period = 'all_time'
        or (p_period = 'weekly' and t.started_at >= date_trunc('week', now()))
        or (p_period = 'monthly' and t.started_at >= date_trunc('month', now()))
      )
  ),
  scoped as (
    select pt.*, p.username
    from period_trips pt
    join public.profiles p on p.id = pt.user_id
    where
      p_scope = 'global'
      or (p_scope = 'country' and p.country = p_scope_value)
      or (p_scope = 'city' and p.city = p_scope_value)
      or (
        p_scope = 'friends'
        and (
          pt.user_id = auth.uid()
          or exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid() and f.followed_id = pt.user_id and f.status = 'accepted'
          )
        )
      )
  ),
  aggregated as (
    select
      user_id,
      username,
      case p_metric
        when 'max_speed' then max(max_speed_kmh)
        when 'total_distance' then sum(distance_meters)
        when 'driving_score' then avg(driving_score)
        when 'trip_count' then count(*)::double precision
        else null
      end as value
    from scoped
    group by user_id, username
  )
  select user_id, username, value, row_number() over (order by value desc) as rank
  from aggregated
  where value is not null
  order by value desc
  limit p_limit;
$$;

grant execute on function public.compute_leaderboard to authenticated;

-- ── Nuevas insignias: conducción nocturna, racha semanal, score perfecto ─
insert into public.badges (code, name, description) values
  ('conductor_nocturno', 'Conductor nocturno', 'Has completado 5 trayectos entre las 22:00 y las 6:00.'),
  ('racha_semana', 'Racha de una semana', 'Has conducido 7 días seguidos.'),
  ('score_perfecto', 'Score perfecto', 'Conseguiste un driving score de 100 en un trayecto.')
on conflict (code) do nothing;

create or replace function public.check_and_award_badges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := new.user_id;
  v_total_km double precision;
  v_trip_count int;
  v_avg_score_last10 double precision;
  v_night_trip_count int;
  v_max_streak int;
begin
  select coalesce(sum(distance_meters), 0) / 1000.0, count(*)
    into v_total_km, v_trip_count
    from public.trips
    where user_id = v_user_id;

  if v_trip_count = 1 then
    insert into public.user_badges (user_id, badge_id)
    select v_user_id, id from public.badges where code = 'primer_trayecto'
    on conflict do nothing;
  end if;

  if v_trip_count >= 10 then
    insert into public.user_badges (user_id, badge_id)
    select v_user_id, id from public.badges where code = 'diez_trayectos'
    on conflict do nothing;
  end if;

  if v_trip_count >= 50 then
    insert into public.user_badges (user_id, badge_id)
    select v_user_id, id from public.badges where code = 'cincuenta_trayectos'
    on conflict do nothing;
  end if;

  if v_total_km >= 100 then
    insert into public.user_badges (user_id, badge_id)
    select v_user_id, id from public.badges where code = 'distancia_100'
    on conflict do nothing;
  end if;

  if v_total_km >= 500 then
    insert into public.user_badges (user_id, badge_id)
    select v_user_id, id from public.badges where code = 'distancia_500'
    on conflict do nothing;
  end if;

  if v_total_km >= 1000 then
    insert into public.user_badges (user_id, badge_id)
    select v_user_id, id from public.badges where code = 'distancia_1000'
    on conflict do nothing;
  end if;

  if v_total_km >= 5000 then
    insert into public.user_badges (user_id, badge_id)
    select v_user_id, id from public.badges where code = 'distancia_5000'
    on conflict do nothing;
  end if;

  if v_trip_count >= 10 then
    select avg(driving_score) into v_avg_score_last10
    from (
      select driving_score from public.trips
      where user_id = v_user_id and driving_score is not null
      order by started_at desc
      limit 10
    ) recent;

    if v_avg_score_last10 is not null and v_avg_score_last10 >= 90 then
      insert into public.user_badges (user_id, badge_id)
      select v_user_id, id from public.badges where code = 'conduccion_suave'
      on conflict do nothing;
    end if;
  end if;

  select count(*) into v_night_trip_count
  from public.trips
  where user_id = v_user_id
    and (extract(hour from started_at) >= 22 or extract(hour from started_at) < 6);

  if v_night_trip_count >= 5 then
    insert into public.user_badges (user_id, badge_id)
    select v_user_id, id from public.badges where code = 'conductor_nocturno'
    on conflict do nothing;
  end if;

  with days as (
    select distinct started_at::date as d from public.trips where user_id = v_user_id
  ),
  grp as (
    select d, d - (row_number() over (order by d))::int as grp_key from days
  ),
  runs as (
    select count(*) as run_len from grp group by grp_key
  )
  select coalesce(max(run_len), 0) into v_max_streak from runs;

  if v_max_streak >= 7 then
    insert into public.user_badges (user_id, badge_id)
    select v_user_id, id from public.badges where code = 'racha_semana'
    on conflict do nothing;
  end if;

  if new.driving_score = 100 then
    insert into public.user_badges (user_id, badge_id)
    select v_user_id, id from public.badges where code = 'score_perfecto'
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- El trigger ya existe (0003); create or replace de la función de arriba es suficiente.
