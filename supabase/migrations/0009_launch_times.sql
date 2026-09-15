-- Roadly — tiempos de aceleración desde parado (0-50 y 0-100 km/h), medidos
-- por GPS en la app, y nueva categoría "0-100" en los rankings. Es la única
-- métrica donde gana el valor más bajo, por eso el orden se invierte para ella.

alter table public.trips add column if not exists zero_to_50_s real check (zero_to_50_s > 0);
alter table public.trips add column if not exists zero_to_100_s real check (zero_to_100_s > 0);

alter table public.leaderboard_snapshots drop constraint if exists leaderboard_snapshots_metric_check;
alter table public.leaderboard_snapshots add constraint leaderboard_snapshots_metric_check
  check (metric in ('max_speed', 'total_distance', 'driving_score', 'trip_count', 'zero_to_100'));

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
        when 'zero_to_100' then min(zero_to_100_s)::double precision
        else null
      end as value
    from scoped
    group by user_id, username
  ),
  ranked as (
    select
      user_id,
      username,
      value,
      row_number() over (order by case when p_metric = 'zero_to_100' then -value else value end desc) as rank
    from aggregated
    where value is not null
  )
  select user_id, username, value, rank
  from ranked
  order by rank
  limit p_limit;
$$;

grant execute on function public.compute_leaderboard to authenticated;

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
        when 'zero_to_100' then min(zero_to_100_s)::double precision
        else null
      end as value
    from scoped
    group by user_id, username
  ),
  ranked as (
    select
      user_id,
      username,
      value,
      row_number() over (order by case when p_metric = 'zero_to_100' then -value else value end desc) as rank
    from aggregated
    where value is not null
  )
  select user_id, username, value, rank
  from ranked
  order by rank
  limit p_limit;
$$;

grant execute on function public.compute_group_leaderboard to authenticated;
