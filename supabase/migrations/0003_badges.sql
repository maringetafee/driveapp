-- Roadly — insignias (fase 4). Se otorgan automáticamente con un trigger
-- tras cada trayecto insertado, así no depende de un job aparte ni de que la
-- app calcule nada client-side. Deliberadamente no hay ninguna insignia por
-- alcanzar una velocidad alta: iría en contra del aviso de seguridad del
-- onboarding. Las insignias premian distancia acumulada, constancia y
-- conducción suave (driving_score alto).

insert into public.badges (code, name, description) values
  ('primer_trayecto', 'Primer trayecto', 'Registraste tu primer trayecto en Roadly.'),
  ('distancia_100', '100 km recorridos', 'Has acumulado 100 km entre todos tus trayectos.'),
  ('distancia_500', '500 km recorridos', 'Has acumulado 500 km entre todos tus trayectos.'),
  ('distancia_1000', '1000 km recorridos', 'Has acumulado 1000 km entre todos tus trayectos.'),
  ('distancia_5000', '5000 km recorridos', 'Has acumulado 5000 km entre todos tus trayectos.'),
  ('diez_trayectos', '10 trayectos', 'Has completado 10 trayectos.'),
  ('cincuenta_trayectos', '50 trayectos', 'Has completado 50 trayectos.'),
  ('conduccion_suave', 'Conducción suave', 'Driving score medio de 90+ en tus últimos 10 trayectos.')
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

  return new;
end;
$$;

drop trigger if exists trip_award_badges on public.trips;
create trigger trip_award_badges
  after insert on public.trips
  for each row execute procedure public.check_and_award_badges();
