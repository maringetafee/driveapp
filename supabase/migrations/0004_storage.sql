-- DriveRank — bucket de Storage para fotos de vehículos (onboarding, garaje,
-- resultados de Mod Car). Público en lectura (son fotos de perfil/coche que
-- se muestran en perfiles públicos); solo el dueño del vehículo puede
-- escribir en la carpeta con el id de su vehículo.

insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', true)
on conflict (id) do nothing;

create policy "Fotos de coche visibles por todos"
on storage.objects for select
to public
using (bucket_id = 'vehicle-photos');

create policy "El dueño del vehículo sube sus fotos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'vehicle-photos'
  and exists (
    select 1 from public.vehicles v
    where v.id::text = (storage.foldername(name))[1]
      and v.user_id = auth.uid()
  )
);

create policy "El dueño del vehículo actualiza sus fotos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'vehicle-photos'
  and exists (
    select 1 from public.vehicles v
    where v.id::text = (storage.foldername(name))[1]
      and v.user_id = auth.uid()
  )
);

create policy "El dueño del vehículo borra sus fotos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'vehicle-photos'
  and exists (
    select 1 from public.vehicles v
    where v.id::text = (storage.foldername(name))[1]
      and v.user_id = auth.uid()
  )
);
