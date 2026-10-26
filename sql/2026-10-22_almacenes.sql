-- Nivel nacional: almacenes (Santa Cruz / La Paz)
create table if not exists public.almacenes(
  id text primary key, nombre text not null, codigo text, muelles boolean not null default false, orden int not null default 1);
insert into public.almacenes(id,nombre,codigo,muelles,orden) values
  ('SCZ','Santa Cruz','05489',true,1), ('LPZ','La Paz','15493',false,2)
on conflict (id) do nothing;
alter table public.almacenes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='almacenes' and policyname='leer almacenes') then
    create policy "leer almacenes" on public.almacenes for select to anon, authenticated using (true);
  end if;
end $$;

alter table public.unidades add column if not exists almacen text not null default 'SCZ' references public.almacenes(id);
alter table public.grupos   add column if not exists almacen text references public.almacenes(id);   -- null = nacional (Oficina central)
update public.grupos set almacen = 'SCZ' where id <> 'OFC' and almacen is null;
alter table public.admins   add column if not exists almacen text references public.almacenes(id);   -- null = logística nacional
alter table public.maestro  add column if not exists almacenes text[] not null default '{SCZ,LPZ}';
update public.maestro set almacenes = '{SCZ}';
alter table public.inventario_cargas add column if not exists almacen text not null default 'SCZ';

create table if not exists public.inventario_alm(
  almacen text not null references public.almacenes(id), codigo text not null, stock numeric not null default 0,
  descripcion text, unidad text, actualizado timestamptz not null default now(), primary key (almacen, codigo));
insert into public.inventario_alm(almacen,codigo,stock,descripcion,unidad,actualizado)
  select 'SCZ', codigo, stock, descripcion, unidad, coalesce(actualizado, now()) from public.inventario on conflict do nothing;
create table if not exists public.precios_alm(
  almacen text not null references public.almacenes(id), codigo text not null, precio numeric not null,
  actualizado timestamptz not null default now(), primary key (almacen, codigo));
insert into public.precios_alm(almacen,codigo,precio,actualizado)
  select 'SCZ', codigo, precio, actualizado from public.precios on conflict do nothing;
alter table public.inventario_alm enable row level security;
alter table public.precios_alm enable row level security;

-- ---------- permisos por almacén ----------
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.admins where activo and rol = 'logistica' and almacen is null and lower(email) = lower(coalesce(auth.jwt()->>'email','')));
$$;
create or replace function public.es_logistica(p_alm text) returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.admins where activo and rol = 'logistica' and (almacen is null or almacen = p_alm) and lower(email) = lower(coalesce(auth.jwt()->>'email','')));
$$;
create or replace function public.es_logistica_alguna() returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.admins where activo and rol = 'logistica' and lower(email) = lower(coalesce(auth.jwt()->>'email','')));
$$;
create or replace function public.alm_unidad(p_id text) returns text language sql stable security definer set search_path=public as $$
  select coalesce((select almacen from public.unidades where id = p_id), 'SCZ');
$$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='inventario_alm' and policyname='ver inventario alm') then
    create policy "ver inventario alm" on public.inventario_alm for select to authenticated using (public.ve_precios());
  end if;
  if not exists (select 1 from pg_policies where tablename='precios_alm' and policyname='ver precios alm') then
    create policy "ver precios alm" on public.precios_alm for select to authenticated using (public.ve_precios());
  end if;
end $$;

create or replace function public.ve_precios() returns boolean language sql stable security definer set search_path=public as $$
  select public.es_logistica_alguna() or public.es_consulta() or exists (select 1 from public.grupos g where g.aprobador_email is not null and lower(g.aprobador_email) = lower(coalesce(auth.jwt()->>'email','')));
$$;
create or replace function public.puede_catalogo() returns boolean language sql stable security definer set search_path=public as $$
  select public.es_logistica_alguna() or exists (select 1 from public.grupos g where g.tipo in ('Oficina central','CEDIS','Sin asignar') and g.aprobador_email is not null and lower(g.aprobador_email)=lower(coalesce(auth.jwt()->>'email','')));
$$;
create or replace function public.puede_aprobar(p_grupo text) returns boolean language sql stable security definer set search_path=public as $$
  select public.is_admin() or exists (
    select 1 from public.grupos g where g.id = p_grupo and (
      (g.almacen is not null and public.es_logistica(g.almacen))
      or (g.aprobador_email is not null and lower(g.aprobador_email) = lower(coalesce(auth.jwt()->>'email','')))));
$$;
create or replace function public.requiere_aprobacion_final(p_unidad text, p_tipo text) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(p_tipo,'Mensual') <> 'Apertura' and coalesce((select g.tipo from public.unidades u join public.grupos g on g.id = u.grupo_id where u.id = p_unidad), '') not in ('CEDIS','Oficina central');
$$;
create or replace function public.mi_rol() returns json language sql stable security definer set search_path=public as $$
  with e as (select lower(coalesce(auth.jwt()->>'email','')) m)
  select json_build_object('admin', public.es_logistica_alguna(), 'nacional', public.is_admin(),
    'almacen', (select a.almacen from public.admins a, e where a.activo and a.rol = 'logistica' and lower(a.email) = e.m limit 1),
    'consulta', public.es_consulta(), 'final', public.es_aprobador_final(),
    'grupos', coalesce((select json_agg(id) from public.grupos, e where aprobador_email is not null and lower(aprobador_email) = e.m), '[]'::json),
    'unidad', (select id from public.unidades, e where activa and correo is not null and lower(correo) = e.m limit 1),
    'unidades', coalesce((select json_agg(id order by (lower(coalesce(correo,'')) = e.m) desc, nombre) from public.unidades, e where activa and (lower(coalesce(correo,'')) = e.m or e.m = any(correos_extra))), '[]'::json))
  from e;
$$;

-- entregas y traspasos: logística del almacén de la sala
create or replace function public.entregar_pedido(p_id uuid, p_recibido text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.es_logistica(public.alm_unidad((select unidad_id from public.pedidos where id = p_id))) then raise exception 'permission denied: solo logística registra entregas'; end if;
  update public.pedidos set estado='Entregada', entregado_ts=now(), recibido_por=left(nullif(trim(p_recibido),''),100)
  where id = p_id and estado = 'Aprobada';
  if not found then raise exception 'El pedido no está aprobado'; end if;
end $$;
create or replace function public.entregar_varios(p_ids uuid[], p_recibido text) returns integer language plpgsql security definer set search_path=public as $$
declare n int;
begin
  if not public.es_logistica_alguna() then raise exception 'permission denied: solo logística registra entregas'; end if;
  if coalesce(array_length(p_ids,1),0) > 500 then raise exception 'Demasiadas solicitudes a la vez'; end if;
  update public.pedidos p set estado='Entregada', entregado_ts=now(), recibido_por=left(nullif(trim(p_recibido),''),100)
  from public.unidades u
  where p.id = any(p_ids) and p.estado = 'Aprobada' and u.id = p.unidad_id and public.es_logistica(u.almacen);
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function public.entregar_ajustado(p_id uuid, p_recibido text, p_items jsonb, p_nota text) returns void language plpgsql security definer set search_path=public as $$
declare v public.pedidos; ent jsonb := '[]'::jsonb; it jsonb; q numeric; dif boolean := false;
begin
  select * into v from public.pedidos where id = p_id for update;
  if not found or v.estado <> 'Aprobada' then raise exception 'El pedido no está aprobado'; end if;
  if not public.es_logistica(public.alm_unidad(v.unidad_id)) then raise exception 'permission denied: solo logística registra entregas'; end if;
  if p_items is not null then
    if jsonb_typeof(p_items) <> 'array' then raise exception 'Formato de cantidades inválido'; end if;
    for it in select * from jsonb_array_elements(v.items) loop
      q := null;
      select (x->>'cantidad')::numeric into q from jsonb_array_elements(p_items) x where x->>'codigo' = it->>'codigo' limit 1;
      if q is null then q := (it->>'cantidad')::numeric; end if;
      if q < 0 or q > (it->>'cantidad')::numeric then raise exception 'La cantidad a entregar de % debe estar entre 0 y %', it->>'descripcion', it->>'cantidad'; end if;
      if q <> (it->>'cantidad')::numeric then dif := true; end if;
      ent := ent || jsonb_build_array(it || jsonb_build_object('cantidad', q));
    end loop;
    if dif and coalesce(nullif(trim(p_nota),''), '') = '' then raise exception 'Indique el motivo de la diferencia en la entrega'; end if;
  end if;
  update public.pedidos set estado='Entregada', entregado_ts=now(), recibido_por=left(nullif(trim(p_recibido),''),100),
    items_entregados = case when dif then ent else null end, nota_entrega = case when dif then left(trim(p_nota),500) else null end
  where id = p_id;
end $$;
create or replace function public.guardar_traspaso(p_id uuid, p_nro text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.es_logistica(public.alm_unidad((select unidad_id from public.pedidos where id = p_id))) then raise exception 'Solo logística registra el número de traspaso'; end if;
  update public.pedidos set nro_traspaso = left(nullif(trim(p_nro),''), 40) where id = p_id and estado in ('Confirmada','Aprobada','Entregada');
  if not found then raise exception 'La solicitud debe estar aprobada o entregada'; end if;
end $$;

-- precios por almacén (la solicitud fija el costo del almacén de su sala)
create or replace function public.fijar_precios() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.estado in ('Confirmada','Aprobada') and (tg_op = 'INSERT' or old.estado not in ('Confirmada','Aprobada')) then
    select jsonb_object_agg(p.codigo, p.precio) into new.precios
    from public.precios_alm p where p.almacen = public.alm_unidad(new.unidad_id) and p.codigo in (select x->>'codigo' from jsonb_array_elements(new.items) x);
  end if;
  return new;
end $$;
create or replace function public.guardar_precio_alm(p_almacen text, p_codigo text, p_precio numeric) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.es_logistica(p_almacen) then raise exception 'Solo logística de ese almacén puede editar costos'; end if;
  if p_precio is null then update public.precios_alm set precio = 0, actualizado = now() where almacen = p_almacen and codigo = p_codigo; return; end if;
  if p_precio < 0 then raise exception 'El precio no puede ser negativo'; end if;
  insert into public.precios_alm(almacen, codigo, precio) values (p_almacen, p_codigo, round(p_precio, 4))
  on conflict (almacen, codigo) do update set precio = excluded.precio, actualizado = now();
  if p_almacen = 'SCZ' then
    insert into public.precios(codigo, precio) values (p_codigo, round(p_precio, 4)) on conflict (codigo) do update set precio = excluded.precio, actualizado = now();
  end if;
end $$;
create or replace function public.guardar_precio(p_codigo text, p_precio numeric) returns void language plpgsql security definer set search_path=public as $$
begin perform public.guardar_precio_alm('SCZ', p_codigo, p_precio); end $$;

create or replace function public.cargar_inventario_alm(p_almacen text, p_items jsonb, p_archivo text, p_costos boolean) returns integer language plpgsql security definer set search_path=public as $$
declare n int := 0; it jsonb;
begin
  if not public.es_logistica(p_almacen) then raise exception 'permission denied: solo logística de ese almacén carga inventario'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'El archivo no tiene insumos'; end if;
  update public.inventario_alm set stock = 0, actualizado = now() where almacen = p_almacen and stock <> 0;
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce(it->>'codigo','') = '' then continue; end if;
    insert into public.inventario_alm(almacen, codigo, stock, descripcion, unidad, actualizado)
      values (p_almacen, it->>'codigo', greatest(0, coalesce((it->>'stock')::numeric, 0)), nullif(left(trim(it->>'descripcion'),150),''), nullif(left(upper(trim(it->>'unidad')),10),''), now())
      on conflict (almacen, codigo) do update set stock = public.inventario_alm.stock + excluded.stock,
        descripcion = coalesce(excluded.descripcion, public.inventario_alm.descripcion), unidad = coalesce(excluded.unidad, public.inventario_alm.unidad), actualizado = now();
    if p_costos and (it->>'costo') is not null and (it->>'costo')::numeric > 0 and exists(select 1 from public.maestro m where m.codigo = it->>'codigo') then
      perform public.guardar_precio_alm(p_almacen, it->>'codigo', (it->>'costo')::numeric);
    end if;
    if nullif(trim(it->>'proveedor'),'') is not null and public.is_admin() then
      update public.maestro set proveedor = upper(left(trim(it->>'proveedor'),40)) where codigo = it->>'codigo';
    end if;
    n := n + 1;
  end loop;
  insert into public.inventario_cargas(por, archivo, items, almacen) values (lower(auth.jwt()->>'email'), left(p_archivo, 120), n, p_almacen);
  return n;
end $$;
create or replace function public.cargar_inventario(p_items jsonb, p_archivo text, p_costos boolean) returns integer language plpgsql security definer set search_path=public as $$
begin return public.cargar_inventario_alm('SCZ', p_items, p_archivo, p_costos); end $$;

-- materiales: en qué almacén(es) se entrega cada uno (una sola lista)
create or replace function public.guardar_almacenes_material(p_codigo text, p_almacenes text[]) returns void language plpgsql security definer set search_path=public as $$
declare l text[];
begin
  if not public.is_admin() then raise exception 'permission denied: solo logística nacional'; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into l from unnest(coalesce(p_almacenes,'{}')) x where x in (select id from public.almacenes);
  if cardinality(l) = 0 then raise exception 'Elija al menos un almacén'; end if;
  update public.maestro set almacenes = l where codigo = p_codigo;
  if not found then raise exception 'Material no encontrado'; end if;
end $$;

-- salas: logística del almacén administra las suyas
create or replace function public.crear_unidad_alm(p_nombre text, p_grupo text, p_codigo text, p_muelle text, p_regional text, p_almacen text) returns text language plpgsql security definer set search_path=public as $$
declare
  v_tipo_g text; v_alm_g text; v_alm text; v_tipo text; v_nom text := upper(regexp_replace(trim(coalesce(p_nombre,'')), '\s+', ' ', 'g'));
  v_num text; v_base text; v_id text; i int := 1;
  v_cod text := nullif(trim(coalesce(p_codigo,'')), ''); v_mue text := nullif(trim(coalesce(p_muelle,'')), ''); v_reg text := nullif(upper(trim(coalesce(p_regional,''))), '');
begin
  select tipo, almacen into v_tipo_g, v_alm_g from public.grupos where id = p_grupo;
  if not found then raise exception 'El grupo no existe'; end if;
  v_alm := coalesce(v_alm_g, nullif(p_almacen,''), 'SCZ');
  if not (public.is_admin() or (v_tipo_g <> 'Sin asignar' and public.puede_aprobar(p_grupo)) or public.es_logistica(v_alm)) then raise exception 'permission denied: no puede crear en este grupo'; end if;
  if char_length(v_nom) < 3 or char_length(v_nom) > 80 then raise exception 'Escriba un nombre de 3 a 80 caracteres'; end if;
  v_tipo := case v_tipo_g when 'Oficina central' then 'Oficina central' when 'CEDIS' then 'CEDIS' else 'Sucursal' end;
  if v_tipo <> 'Sucursal' then v_nom := initcap(lower(v_nom)); v_cod := null; v_mue := null; v_reg := null; end if;
  if not coalesce((select muelles from public.almacenes where id = v_alm), false) then v_mue := null; end if;
  if v_mue is not null and v_mue not in ('DESP-01','DESP-02','DESP-03','DESP-04','DESP-05') then raise exception 'Muelle no válido'; end if;
  if v_cod is not null and v_cod !~ '^[0-9]{1,10}$' then raise exception 'El código de sala debe ser numérico'; end if;
  if v_reg is not null and char_length(v_reg) > 40 then raise exception 'Regional demasiado larga'; end if;
  if exists (select 1 from public.unidades where lower(nombre) = lower(v_nom)) then raise exception 'Ya existe una sala o área con ese nombre'; end if;
  if v_cod is not null and exists (select 1 from public.unidades where ltrim(codigo_sala,'0') = ltrim(v_cod,'0')) then raise exception 'Ese código de sala ya está registrado'; end if;
  v_num := substring(v_nom from '^SUC[ .\-]*([0-9]+)');
  if v_tipo = 'Sucursal' and v_num is not null then v_base := 'SUC-' || v_num;
  else v_base := (case v_tipo when 'Sucursal' then 'S-' when 'Oficina central' then 'OFC-' else 'CED-' end)
         || left(trim(both '-' from regexp_replace(translate(upper(v_nom), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z0-9]+', '-', 'g')), 30);
  end if;
  v_id := v_base;
  while exists (select 1 from public.unidades where id = v_id) loop i := i + 1; v_id := v_base || '-' || i; end loop;
  insert into public.unidades (id, nombre, tipo, grupo_id, codigo_sala, muelle, regional, almacen) values (v_id, v_nom, v_tipo, p_grupo, v_cod, v_mue, v_reg, v_alm);
  return v_id;
end $$;
create or replace function public.crear_unidad(p_nombre text, p_grupo text, p_codigo text, p_muelle text, p_regional text) returns text language plpgsql security definer set search_path=public as $$
begin return public.crear_unidad_alm(p_nombre, p_grupo, p_codigo, p_muelle, p_regional, null); end $$;

create or replace function public.editar_unidad(p_id text, p_codigo text, p_muelle text, p_regional text, p_creada date) returns void language plpgsql security definer set search_path=public as $$
declare g text; a text;
begin
  select grupo_id, almacen into g, a from public.unidades where id = p_id;
  if not found then raise exception 'Sala no encontrada'; end if;
  if not (public.is_admin() or public.es_logistica(a) or (g <> 'SIN' and public.puede_aprobar(g))) then raise exception 'No tiene permiso para editar esta sala'; end if;
  if nullif(trim(p_muelle),'') is not null and p_muelle not in ('DESP-01','DESP-02','DESP-03','DESP-04','DESP-05') then raise exception 'Muelle inválido'; end if;
  update public.unidades set codigo_sala = nullif(trim(p_codigo),''), muelle = nullif(trim(p_muelle),''), regional = upper(nullif(trim(p_regional),'')),
    creada_ts = case when p_creada is null then creada_ts else (p_creada::timestamp at time zone 'America/La_Paz') end
  where id = p_id;
end $$;
create or replace function public.cerrar_unidad(p_id text, p_activa boolean) returns void language plpgsql security definer set search_path=public as $$
declare g text; a text;
begin
  select grupo_id, almacen into g, a from public.unidades where id = p_id;
  if not found then raise exception 'La sala o área no existe'; end if;
  if not (public.is_admin() or public.es_logistica(a) or (g <> 'SIN' and public.puede_aprobar(g))) then raise exception 'permission denied: no puede modificar salas de este grupo'; end if;
  update public.unidades set activa = coalesce(p_activa, false) where id = p_id;
end $$;
create or replace function public.guardar_correo_unidad(p_id text, p_correo text) returns void language plpgsql security definer set search_path=public as $$
declare c text := lower(nullif(trim(p_correo),''));
begin
  if not public.es_logistica(public.alm_unidad(p_id)) then raise exception 'permission denied: solo logística asigna usuarios'; end if;
  if c is not null and c !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo inválido'; end if;
  if c is not null and exists(select 1 from public.unidades where lower(correo) = c and id <> p_id) then raise exception 'Ese correo ya está asignado a otra sala o área'; end if;
  update public.unidades set correo = c where id = p_id;
  if not found then raise exception 'Sala no encontrada'; end if;
end $$;
create or replace function public.guardar_correos_extra(p_id text, p_correos text[]) returns void language plpgsql security definer set search_path=public as $$
declare l text[];
begin
  if not public.es_logistica(public.alm_unidad(p_id)) then raise exception 'permission denied: solo logística asigna usuarios'; end if;
  select coalesce(array_agg(distinct lower(trim(x))), '{}') into l from unnest(coalesce(p_correos,'{}')) x where trim(x) <> '';
  if exists (select 1 from unnest(l) x where x !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'Hay un correo inválido'; end if;
  update public.unidades set correos_extra = l where id = p_id;
  if not found then raise exception 'Sala no encontrada'; end if;
end $$;

-- roles: logística puede ser nacional o de un almacén
create or replace function public.listar_roles_alm() returns table(email text, nombre text, activo boolean, rol text, almacen text) language sql stable security definer set search_path=public as $$
  select a.email, a.nombre, a.activo, a.rol, a.almacen from public.admins a where public.is_admin() order by a.activo desc, a.rol, a.email;
$$;
create or replace function public.guardar_rol_alm(p_email text, p_nombre text, p_activo boolean, p_rol text, p_almacen text) returns void language plpgsql security definer set search_path=public as $$
declare e text := lower(trim(p_email)); r text := coalesce(nullif(p_rol,''), 'logistica'); al text := nullif(p_almacen,'');
begin
  if not public.is_admin() then raise exception 'permission denied: solo logística nacional'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo inválido'; end if;
  if r not in ('logistica','consulta') then raise exception 'Rol inválido'; end if;
  if al is not null and not exists (select 1 from public.almacenes where id = al) then raise exception 'Almacén inválido'; end if;
  if r = 'consulta' then al := null; end if;
  if e = lower(coalesce(auth.jwt()->>'email','')) and (not p_activo or r <> 'logistica' or al is not null) then raise exception 'No puede quitarse a sí misma el rol de logística nacional'; end if;
  insert into public.admins(email, nombre, activo, rol, almacen) values (e, nullif(trim(p_nombre),''), p_activo, r, al)
    on conflict (email) do update set activo = excluded.activo, rol = excluded.rol, almacen = excluded.almacen, nombre = coalesce(excluded.nombre, public.admins.nombre);
end $$;
create or replace function public.guardar_rol(p_email text, p_nombre text, p_activo boolean, p_rol text) returns void language plpgsql security definer set search_path=public as $$
begin perform public.guardar_rol_alm(p_email, p_nombre, p_activo, p_rol, null); end $$;

-- políticas de edición directa: logística del almacén
alter policy "admin edita grupos" on public.grupos using (public.is_admin() or (almacen is not null and public.es_logistica(almacen))) with check (public.is_admin() or (almacen is not null and public.es_logistica(almacen)));
alter policy "admin edita unidades" on public.unidades using (public.es_logistica(almacen)) with check (public.es_logistica(almacen) and exists (select 1 from public.grupos g where g.id = grupo_id and (g.almacen is null or g.almacen = unidades.almacen)));
-- 2026-10-22: salas ven costos
create policy "salas ven precios alm" on public.precios_alm for select to anon, authenticated using ((auth.uid() is not null) or (not public.exige_ingreso()));
-- 2026-10-22: material de reemplazo para compras
alter table public.maestro add column if not exists reemplazo text;
update public.maestro set reemplazo = '27233' where codigo = '25645';
-- 2026-10-23: consulta puede pedir para cualquier sala o área
-- puede_pedir(): se agregó public.es_consulta()
-- 2026-10-23: jefatura (Helen, Hubert) ve la lista de roles
-- es_jefatura(); listar_roles_alm() permite is_admin() or es_jefatura()
-- 2026-10-23: presupuesto mensual por sala (migración presupuesto_salas)
-- unidades.presupuesto; ciclo_de(); valor_items(); usado_presupuesto(); trigger trg_controlar_presupuesto (bloquea envío/edición si supera); guardar_presupuestos(jsonb)
-- 2026-10-23: guardar_presupuestos permite también es_aprobador_final() (Helen)
-- 2026-10-23: sin aprobación final (requiere_aprobacion_final() devuelve false)
-- 2026-10-23: rol gerencia (Helen) en admins; es_gerencia(); guardar_grupo(); OFC aprobado por Olvy Tomicha
-- 2026-10-23: rol jefatura (Hubert) en admins; es_jefatura() por rol, ya no por grupo; Olvy y Juan quedan como aprobadores (supervisora)
-- 2026-10-26: áreas de oficina unidas (unidades.area_ofc), presupuesto compartido; grupos SUP-ELVA/JOVANA/LINA (LPZ), SUP-RANDY (Regional Occidente), OFC-LPZ
