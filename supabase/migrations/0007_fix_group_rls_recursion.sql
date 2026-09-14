-- Roadly — fix: "infinite recursion detected in policy for relation
-- group_members" (Postgres 42P17). Las políticas de select de `groups` y
-- `group_members` comprobaban la pertenencia consultando `group_members`
-- desde dentro de su propia política de RLS, así que esa subconsulta
-- disparaba la misma política otra vez, en bucle infinito. La solución
-- estándar en Postgres/Supabase es mover esa comprobación a una función
-- security definer, que consulta la tabla sin pasar por RLS.

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_group_member to authenticated;

drop policy if exists "Solo los miembros ven el grupo" on public.groups;
create policy "Solo los miembros ven el grupo"
  on public.groups for select
  to authenticated
  using (public.is_group_member(id));

drop policy if exists "Solo los miembros ven la lista de miembros" on public.group_members;
create policy "Solo los miembros ven la lista de miembros"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));
