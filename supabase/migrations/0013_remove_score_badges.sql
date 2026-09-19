-- Roadly — quita el "driving score" como disparador de insignias. La app ya no
-- calcula ni guarda trips.driving_score. Parte de la versión de
-- check_and_award_badges de la 0012 (racha, conductor nocturno...) y solo cambia:
--  * "Conducción suave" pasa a basarse en la regularidad (acelerones + frenazos
--    + curvas bruscas cada 100 km), la misma métrica del récord "Trayecto más suave".
--  * "Score perfecto" deja de concederse (se conserva la fila para quien ya la tiene).
-- No se toca la columna trips.driving_score ni el case muerto de los rankings.

update public.badges
set description = 'Menos de 3 acelerones, frenazos o curvas bruscas por cada 100 km en tus últimos 10 trayectos.'
where code = 'conduccion_suave';

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
  v_avg_events_per_100km double precision;
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
    select avg(events_per_100km) into v_avg_events_per_100km
    from (
      select ((tm.hard_accelerations + tm.hard_brakes + tm.sharp_turns)::double precision / t.distance_meters) * 100000 as events_per_100km
      from public.trips t
      join public.trip_metrics tm on tm.trip_id = t.id
      where t.user_id = v_user_id and t.distance_meters >= 5000
      order by t.started_at desc
      limit 10
    ) recent;

    if v_avg_events_per_100km is not null and v_avg_events_per_100km <= 3 then
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
