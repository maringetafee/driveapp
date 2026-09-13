-- DriveRank — esquema inicial (MVP: auth, vehículos, trayectos, stats)
-- Ejecutar con: supabase db push  (o pegar en el SQL editor del proyecto Supabase)

create extension if not exists "uuid-ossp";

-- ── Perfiles ────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  avatar_url text,
  country text,
  city text,
  units text not null default 'kmh' check (units in ('kmh', 'mph')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Los perfiles son visibles por todos los autenticados"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Cada usuario edita solo su perfil"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "Cada usuario crea solo su propio perfil"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- ── Vehículos ("garaje") ───────────────────────────────────────────────
create table public.vehicles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  make text not null,
  model text not null,
  year int,
  image_url text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.vehicles enable row level security;

create policy "Los vehículos son visibles por todos los autenticados"
  on public.vehicles for select
  to authenticated
  using (true);

create policy "Cada usuario gestiona solo sus vehículos"
  on public.vehicles for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Trayectos ────────────────────────────────────────────────────────
create table public.trips (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds int,
  distance_meters double precision,
  avg_speed_kmh double precision,
  max_speed_kmh double precision,
  driving_score smallint check (driving_score between 0 and 100),
  route_geojson jsonb,
  road_type text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index trips_user_id_idx on public.trips (user_id);
create index trips_started_at_idx on public.trips (started_at desc);

alter table public.trips enable row level security;

create policy "Los trayectos públicos son visibles por todos los autenticados"
  on public.trips for select
  to authenticated
  using (is_public = true or auth.uid() = user_id);

create policy "Cada usuario gestiona solo sus trayectos"
  on public.trips for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Métricas detalladas de un trayecto (frenadas, curvas, G-force…) ───
create table public.trip_metrics (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  hard_accelerations int not null default 0,
  hard_brakes int not null default 0,
  sharp_turns int not null default 0,
  stops int not null default 0,
  lane_changes int not null default 0,
  g_force_series jsonb,
  created_at timestamptz not null default now()
);

alter table public.trip_metrics enable row level security;

create policy "trip_metrics sigue la visibilidad del trayecto"
  on public.trip_metrics for select
  to authenticated
  using (
    exists (
      select 1 from public.trips t
      where t.id = trip_id and (t.is_public = true or t.user_id = auth.uid())
    )
  );

create policy "Solo el dueño del trayecto escribe sus métricas"
  on public.trip_metrics for all
  to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

-- ── Social: follows, likes, comments ───────────────────────────────────
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

alter table public.follows enable row level security;

create policy "Follows visibles por todos los autenticados"
  on public.follows for select
  to authenticated
  using (true);

create policy "Cada usuario gestiona solo sus propios follows"
  on public.follows for all
  to authenticated
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id);

create table public.trip_likes (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

alter table public.trip_likes enable row level security;

create policy "Likes visibles por todos los autenticados"
  on public.trip_likes for select
  to authenticated
  using (true);

create policy "Cada usuario gestiona solo sus propios likes"
  on public.trip_likes for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.trip_comments (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.trip_comments enable row level security;

create policy "Comentarios visibles por todos los autenticados"
  on public.trip_comments for select
  to authenticated
  using (true);

create policy "Cada usuario gestiona solo sus propios comentarios"
  on public.trip_comments for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Insignias / logros ──────────────────────────────────────────────────
create table public.badges (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  name text not null,
  description text,
  icon_url text
);

create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id uuid not null references public.badges (id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

create policy "Badges visibles por todos los autenticados"
  on public.badges for select
  to authenticated
  using (true);

create policy "User badges visibles por todos los autenticados"
  on public.user_badges for select
  to authenticated
  using (true);

-- ── Leaderboards (cacheados/calculados periódicamente) ─────────────────
create table public.leaderboard_snapshots (
  id uuid primary key default uuid_generate_v4(),
  metric text not null check (metric in ('max_speed', 'total_distance', 'driving_score', 'trip_count')),
  scope text not null check (scope in ('friends', 'city', 'country', 'global')),
  scope_value text,
  period text not null check (period in ('weekly', 'monthly', 'all_time')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  value double precision not null,
  rank int not null,
  computed_at timestamptz not null default now()
);

create index leaderboard_lookup_idx
  on public.leaderboard_snapshots (metric, scope, scope_value, period, rank);

alter table public.leaderboard_snapshots enable row level security;

create policy "Leaderboards visibles por todos los autenticados"
  on public.leaderboard_snapshots for select
  to authenticated
  using (true);

-- ── Trigger: crear profile automáticamente al registrarse ──────────────
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, units)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'units', 'kmh')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
