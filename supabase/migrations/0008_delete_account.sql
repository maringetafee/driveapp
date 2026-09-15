-- Roadly — permite al usuario borrar su cuenta desde Ajustes (Google Play lo
-- exige a cualquier app que permita registrarse). Borrar la fila de auth.users
-- arrastra en cascada el perfil y todo lo que cuelga de él: coches, trayectos,
-- métricas, likes, comentarios, seguidores, insignias, notificaciones y los
-- grupos de los que es dueño.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
