-- Roadly — mantenimiento del coche, ubicación en directo con amigos, y
-- completar 3 insignias que ya estaban mapeadas en la UI (BadgesRow) pero
-- nunca se sembraron ni se concedían: racha_semana, score_perfecto,
-- conductor_nocturno.

-- ── Insignias que faltaban ──────────────────────────────────────────────
insert into public.badges (code, name, description) values
  ('racha_semana', 'Racha de una semana', 'Has conducido 7 días seguidos.'),
  ('score_perfecto', 'Score perfecto', 'Sacaste un driving score de 100 en un trayecto.'),
  ('conductor_nocturno', 'Conductor nocturno', 'Completaste un trayecto de madrugada.')
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
  v_streak int;
  v_night_hour int;
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

  -- Racha de 7 días: solo cuenta si el último día con trayecto es hoy o ayer
  -- (mismo criterio que computeStreak en el cliente), agrupando fechas
  -- consecutivas por la diferencia entre la fecha y su puesto al ordenar.
  if exists (select 1 from public.trips where user_id = v_user_id and started_at::date >= current_date - 1) then
    with days as (
      select distinct started_at::date as d from public.trips where user_id = v_user_id
    ),
    numbered as (
      select d, d - (row_number() over (order by d desc))::int * interval '1 day' as grp
      from days
    )
    select count(*) into v_streak
    from numbered
    where grp = (select grp from numbered order by d desc limit 1);

    if v_streak >= 7 then
      insert into public.user_badges (user_id, badge_id)
      select v_user_id, id from public.badges where code = 'racha_semana'
      on conflict do nothing;
    end if;
  end if;

  if new.driving_score = 100 then
    insert into public.user_badges (user_id, badge_id)
    select v_user_id, id from public.badges where code = 'score_perfecto'
    on conflict do nothing;
  end if;

  -- Aproximado: la hora se lee en UTC (no guardamos la zona horaria del
  -- usuario), así que el rango es orientativo, no exacto por franja local.
  v_night_hour := extract(hour from new.started_at);
  if v_night_hour >= 23 or v_night_hour < 5 then
    insert into public.user_badges (user_id, badge_id)
    select v_user_id, id from public.badges where code = 'conductor_nocturno'
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trip_award_badges on public.trips;
create trigger trip_award_badges
  after insert on public.trips
  for each row execute procedure public.check_and_award_badges();

-- Concede ya "score_perfecto" y "conductor_nocturno" a quien ya las tuviera
-- ganadas con trayectos pasados (la de racha se concederá con el próximo
-- trayecto de cada uno, ya que recalcularla en el pasado es más complejo).
insert into public.user_badges (user_id, badge_id)
select distinct t.user_id, b.id
from public.trips t, public.badges b
where b.code = 'score_perfecto' and t.driving_score = 100
on conflict do nothing;

insert into public.user_badges (user_id, badge_id)
select distinct t.user_id, b.id
from public.trips t, public.badges b
where b.code = 'conductor_nocturno' and (extract(hour from t.started_at) >= 23 or extract(hour from t.started_at) < 5)
on conflict do nothing;

-- ── Mantenimiento del coche ─────────────────────────────────────────────
create table if not exists public.vehicle_maintenance (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  kind text not null check (char_length(kind) between 2 and 60),
  done_at date not null,
  odometer_km integer check (odometer_km >= 0),
  cost_eur numeric(10, 2) check (cost_eur >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_maintenance_vehicle_idx on public.vehicle_maintenance (vehicle_id, done_at desc);

alter table public.vehicle_maintenance enable row level security;

drop policy if exists "El dueño del coche ve y gestiona su mantenimiento" on public.vehicle_maintenance;
create policy "El dueño del coche ve y gestiona su mantenimiento"
  on public.vehicle_maintenance for all
  to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_maintenance.vehicle_id and v.user_id = auth.uid()))
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_maintenance.vehicle_id and v.user_id = auth.uid()));

-- ── Ubicación en directo con amigos ─────────────────────────────────────
-- No se guarda ninguna posición: solo quién comparte con quién y hasta
-- cuándo. Las posiciones viajan solo por un canal de Realtime (broadcast),
-- nunca se persisten.
create table if not exists public.live_shares (
  id uuid primary key default gen_random_uuid(),
  sharer_id uuid not null references public.profiles (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (sharer_id, viewer_id)
);

create index if not exists live_shares_viewer_idx on public.live_shares (viewer_id);

alter table public.live_shares enable row level security;

drop policy if exists "Quien comparte crea y borra sus propios compartidos" on public.live_shares;
create policy "Quien comparte crea y borra sus propios compartidos"
  on public.live_shares for all
  to authenticated
  using (auth.uid() = sharer_id)
  with check (auth.uid() = sharer_id);

drop policy if exists "El invitado ve los compartidos donde participa" on public.live_shares;
create policy "El invitado ve los compartidos donde participa"
  on public.live_shares for select
  to authenticated
  using (auth.uid() = viewer_id or auth.uid() = sharer_id);

-- Notifica al invitado igual que el resto de notificaciones (trigger
-- security definer, sin política de insert para el rol authenticated).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'follow_request', 'follow_accept', 'badge', 'live_share'));

create or replace function public.notify_on_live_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, actor_id, type)
  values (new.viewer_id, new.sharer_id, 'live_share');
  return new;
end;
$$;

drop trigger if exists on_live_share_notify on public.live_shares;
create trigger on_live_share_notify
  after insert on public.live_shares
  for each row execute procedure public.notify_on_live_share();
