-- Roadly — fix: crear un grupo fallaba porque el insert en `groups` pedía de
-- vuelta la fila creada (`.select().single()`), y en ese instante el dueño
-- aún no era miembro, así que la política de select ("solo los miembros ven
-- el grupo") lo bloqueaba. Se mueve la creación entera (grupo + alta del
-- dueño como miembro) a una función security definer, igual que ya se hacía
-- para unirse por código.

create or replace function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_code text;
begin
  loop
    v_code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from public.groups where invite_code = v_code);
  end loop;

  insert into public.groups (name, owner_id, invite_code)
  values (p_name, auth.uid(), v_code)
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id) values (v_group_id, auth.uid());

  return v_group_id;
end;
$$;

grant execute on function public.create_group to authenticated;
