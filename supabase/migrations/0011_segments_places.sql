-- Roadly — tramos tipo Strava (por regularidad, no por velocidad) y lugares
-- conquistados (municipios y provincias por los que ha pasado cada conductor).

-- Segundos desde el inicio de cada punto de route_geojson: hacen falta para
-- saber cuánto se tardó en recorrer un tramo y cómo varió la velocidad.
alter table public.trips add column if not exists route_times real[];
-- Marca cuándo se calcularon los lugares del trayecto (null = pendiente).
alter table public.trips add column if not exists places_scanned_at timestamptz;

-- ── Tramos ───────────────────────────────────────────────────────────
create table if not exists public.segments (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  geometry jsonb not null,
  distance_meters real not null check (distance_meters >= 200),
  min_lat double precision not null,
  max_lat double precision not null,
  min_lon double precision not null,
  max_lon double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists segments_bbox_idx on public.segments (min_lat, max_lat, min_lon, max_lon);

alter table public.segments enable row level security;

drop policy if exists "Tramos visibles para todos" on public.segments;
create policy "Tramos visibles para todos"
  on public.segments for select to authenticated using (true);

drop policy if exists "Cada usuario crea sus tramos" on public.segments;
create policy "Cada usuario crea sus tramos"
  on public.segments for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists "Cada usuario borra sus tramos" on public.segments;
create policy "Cada usuario borra sus tramos"
  on public.segments for delete to authenticated using (auth.uid() = created_by);

create table if not exists public.segment_efforts (
  id uuid primary key default uuid_generate_v4(),
  segment_id uuid not null references public.segments (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null,
  duration_seconds real not null check (duration_seconds > 0),
  avg_speed_kmh real not null,
  -- Desviación típica de la velocidad dentro del tramo: cuanto menor, más regular.
  speed_stddev_kmh real not null check (speed_stddev_kmh >= 0),
  stops int not null default 0,
  created_at timestamptz not null default now(),
  unique (segment_id, trip_id)
);

create index if not exists segment_efforts_segment_idx on public.segment_efforts (segment_id, speed_stddev_kmh);
create index if not exists segment_efforts_user_idx on public.segment_efforts (user_id);

alter table public.segment_efforts enable row level security;

-- Mismas reglas de privacidad que el trayecto al que pertenece el intento.
drop policy if exists "Intentos visibles como su trayecto" on public.segment_efforts;
create policy "Intentos visibles como su trayecto"
  on public.segment_efforts for select to authenticated
  using (exists (select 1 from public.trips t where t.id = segment_efforts.trip_id));

drop policy if exists "Cada usuario registra sus intentos" on public.segment_efforts;
create policy "Cada usuario registra sus intentos"
  on public.segment_efforts for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );

-- ── Lugares conquistados ─────────────────────────────────────────────
create table if not exists public.trip_places (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  municipality_id text not null,
  municipality text not null,
  -- Código INE de la provincia (dos primeros dígitos del código postal).
  province_code text not null check (province_code ~ '^[0-9]{2}$'),
  lat double precision not null,
  lon double precision not null,
  visited_at timestamptz not null,
  primary key (trip_id, municipality_id)
);

create index if not exists trip_places_user_idx on public.trip_places (user_id, province_code);

alter table public.trip_places enable row level security;

drop policy if exists "Lugares visibles como su trayecto" on public.trip_places;
create policy "Lugares visibles como su trayecto"
  on public.trip_places for select to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_places.trip_id));

drop policy if exists "Cada usuario registra sus lugares" on public.trip_places;
create policy "Cada usuario registra sus lugares"
  on public.trip_places for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );
