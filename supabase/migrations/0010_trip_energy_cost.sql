-- Roadly — gasto en combustible/electricidad por trayecto.
-- Cada coche guarda su tipo de energía y su consumo medio (L/100 km o kWh/100 km)
-- y, opcionalmente, un precio fijo por litro/kWh. Al terminar un trayecto la app
-- calcula el gasto con el precio medio de las gasolineras cercanas (datos del
-- Ministerio) y lo guarda en el propio trayecto, para que no cambie si luego se
-- edita el coche o sube la gasolina.

alter table public.vehicles add column if not exists fuel_type text
  check (fuel_type in ('gasoline', 'diesel', 'hybrid', 'electric', 'lpg'));
alter table public.vehicles add column if not exists consumption_per_100km real
  check (consumption_per_100km > 0 and consumption_per_100km < 100);
alter table public.vehicles add column if not exists energy_price real
  check (energy_price > 0 and energy_price < 10);

alter table public.trips add column if not exists fuel_type text
  check (fuel_type in ('gasoline', 'diesel', 'hybrid', 'electric', 'lpg'));
-- Litros o kWh consumidos en el trayecto.
alter table public.trips add column if not exists energy_used real check (energy_used >= 0);
-- Precio por litro/kWh usado en el cálculo.
alter table public.trips add column if not exists energy_price real check (energy_price > 0);
alter table public.trips add column if not exists energy_cost_eur real check (energy_cost_eur >= 0);
