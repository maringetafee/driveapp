-- DriveRank — leaderboards on-demand (fase 3).
-- No dependemos de un cron para el MVP: la función calcula el ranking al
-- vuelo a partir de `trips`. A partir de unos cuantos miles de trayectos por
-- ámbito, conviene rellenar `leaderboard_snapshots` periódicamente en vez de
-- llamar a esta función en cada apertura de pantalla; ver el comentario al
-- final del archivo para la versión con pg_cron (opcional, requiere que
-- actives la extensión pg_cron en el dashboard de Supabase).

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
            where f.follower_id = auth.uid() and f.followed_id = pt.user_id
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

-- ── Versión con snapshots + pg_cron (opcional, activar cuando el volumen de
-- trayectos haga cara la función anterior en tiempo real) ──────────────────
--
-- 1. Activa la extensión pg_cron desde el dashboard de Supabase:
--    Database → Extensions → busca "pg_cron" → Enable.
-- 2. Ejecuta esto en el SQL Editor:
--
-- create or replace function public.refresh_leaderboard_snapshots()
-- returns void
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   delete from public.leaderboard_snapshots where period = 'weekly';
--   insert into public.leaderboard_snapshots (metric, scope, scope_value, period, user_id, value, rank)
--   select 'max_speed', 'global', null, 'weekly', user_id, value, rank
--   from public.compute_leaderboard('max_speed', 'global', null, 'weekly', 500);
--   -- repite el insert anterior por cada combinación (metric × scope) que quieras cachear.
-- end;
-- $$;
--
-- select cron.schedule('refresh-leaderboards-weekly', '0 * * * *', $$select public.refresh_leaderboard_snapshots()$$);
