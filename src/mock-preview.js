(function(){
  const D = window.__MOCK;
  let n = 1, seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const NOW = Date.now(), H = 3600e3, iso = t => new Date(t).toISOString();
  const pad = x => String(x).padStart(2,'0');
  const cod = t => `P-${String(n++).padStart(4,'0')}`;
  const comunes = ['15564','15525','15533','15559','15570','15547','22614','25639','27228','15581','26336','15563','15519','27029','25226'];
  const M = Object.fromEntries(D.maestro.map(m => [m.codigo, m]));
  const pedidos = [];
  const unidades = D.unidades;
  const items = () => { const out = [], k = 3 + Math.floor(rnd() * 6); while(out.length < k){ const c = pick(comunes), m = M[c]; if(m && !out.some(x => x.codigo === c)) out.push({codigo:c, descripcion:m.descripcion, unidad:m.unidad, categoria:m.categoria, cantidad:1 + Math.floor(rnd() * (c === '25639' ? 40 : 8)), observacion:'-'}); } return out; };
  const base = (u, ts, its) => ({id:'p'+pedidos.length, codigo:'', ts:iso(ts), unidad_id:u.id, solicitante:u.tipo === 'Sucursal' ? 'Regente ' + u.nombre.replace(/^SUC[\s.\-]*\d*\s*/,'').split(' ')[0].toLowerCase().replace(/^./, c => c.toUpperCase()) : 'Encargado/a de ' + u.nombre, items:its, items_original:null, estado:'Enviada', confirmado_ts:null, confirmado_por:null, nota:null, motivo_rechazo:null, entregado_ts:null, recibido_por:null});
  // ciclos anteriores: agosto y septiembre 2026
  [[2026,7],[2026,8]].forEach(([y, mo], ci) => unidades.forEach(u => {
    if(rnd() < (u.tipo === 'Sucursal' ? .12 : .35)) return;               // algunas salas no piden
    const dia = rnd() < .9 ? 10 + Math.floor(rnd() * 11) : 21 + Math.floor(rnd() * 3);
    const p = base(u, new Date(y, mo, dia, 9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60)).getTime(), items());
    const ct = new Date(y, mo, Math.max(dia + 1, 21 + Math.floor(rnd() * 5)), 11).getTime(); p.confirmado_ts = iso(ct);
    const r = rnd();
    if(r < .06){ p.estado = 'Rechazada'; p.motivo_rechazo = pick(['Ya se envió dotación este mes.','Cantidades fuera del consumo habitual.','Solicitud duplicada.']); }
    else { if(rnd() < .3){ p.items_original = p.items.map(z => ({...z})); p.items = p.items.map((z,j) => j === 0 ? {...z, cantidad:Math.max(1, Math.round(z.cantidad/2))} : z); p.nota = 'Se ajustó al consumo promedio.'; }
      if(ci === 1 && r > .93){ p.estado = 'Confirmada'; } else { p.estado = 'Entregada'; p.entregado_ts = iso(new Date(y, mo + 1, 1 + Math.floor(rnd() * 10), 15).getTime()); p.recibido_por = 'Personal de la sucursal'; } }
    pedidos.push(p);
  }));
  // ciclo actual (octubre): algunas ya enviaron
  unidades.forEach(u => { if(rnd() > .42) return; const p = base(u, new Date(2026, 9, 10 + Math.floor(rnd() * 3), 9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60)).getTime(), items());
    if(rnd() < .25){ p.estado = 'Confirmada'; p.confirmado_ts = iso(new Date(2026, 9, 12, 16).getTime()); } pedidos.push(p); });
  D.unidades.push({id:'SUC-230', nombre:'SUC-230 NUEVA SALA DEMO', tipo:'Sucursal', grupo_id:'SUP-YESSICA', codigo_sala:null, muelle:null, regional:'SANTA CRUZ', activa:true, creada_ts:iso(NOW - 4 * 24 * H)});
  D.precios = [{"codigo": "15574", "precio": 10.8132}, {"codigo": "15564", "precio": 14.789}, {"codigo": "15519", "precio": 3.19}, {"codigo": "34896", "precio": 10.005}, {"codigo": "34897", "precio": 13.3328}, {"codigo": "33581", "precio": 36.54}, {"codigo": "27228", "precio": 42.1949}, {"codigo": "27230", "precio": 42.195}, {"codigo": "27232", "precio": 36.6625}, {"codigo": "25645", "precio": 28.5572}, {"codigo": "27229", "precio": 36.5098}, {"codigo": "27231", "precio": 40.1591}, {"codigo": "15563", "precio": 15.66}, {"codigo": "26336", "precio": 19.1397}, {"codigo": "15557", "precio": 84.64}, {"codigo": "27008", "precio": 82.4322}, {"codigo": "15532", "precio": 2.2114}, {"codigo": "15529", "precio": 8.5761}, {"codigo": "15530", "precio": 13.7473}, {"codigo": "15527", "precio": 24.36}, {"codigo": "18158", "precio": 41.735}, {"codigo": "15525", "precio": 12.1808}, {"codigo": "15573", "precio": 47.85}, {"codigo": "15571", "precio": 9.565}, {"codigo": "15550", "precio": 30.3764}, {"codigo": "32066", "precio": 118.5938}, {"codigo": "31724", "precio": 75.798}, {"codigo": "26610", "precio": 14.3292}, {"codigo": "15896", "precio": 45.8733}, {"codigo": "20131", "precio": 49.59}, {"codigo": "15533", "precio": 4.7827}, {"codigo": "15568", "precio": 11.434}, {"codigo": "27029", "precio": 40.02}, {"codigo": "27028", "precio": 13.92}, {"codigo": "15559", "precio": 7.396}, {"codigo": "17159", "precio": 21.75}, {"codigo": "20458", "precio": 13.92}, {"codigo": "15570", "precio": 27.375}, {"codigo": "26997", "precio": 13.5645}, {"codigo": "15547", "precio": 4.7474}, {"codigo": "15569", "precio": 30.45}, {"codigo": "25225", "precio": 7.395}, {"codigo": "25226", "precio": 9.57}, {"codigo": "15663", "precio": 43.5382}, {"codigo": "15664", "precio": 47.7667}, {"codigo": "15554", "precio": 261.0}, {"codigo": "15543", "precio": 7.4553}, {"codigo": "22614", "precio": 20.1178}, {"codigo": "25664", "precio": 40.6}, {"codigo": "24982", "precio": 14.6251}, {"codigo": "24568", "precio": 5.9164}, {"codigo": "15534", "precio": 32.4224}, {"codigo": "35417", "precio": 6.09}, {"codigo": "31661", "precio": 33.234}, {"codigo": "15545", "precio": 6.5037}, {"codigo": "25639", "precio": 13.398}, {"codigo": "15575", "precio": 25.8375}, {"codigo": "15540", "precio": 8.5}, {"codigo": "19040", "precio": 8.2622}, {"codigo": "16018", "precio": 0.9077}, {"codigo": "16021", "precio": 0.4345}, {"codigo": "16020", "precio": 2.2737}, {"codigo": "25533", "precio": 1.3017}, {"codigo": "26979", "precio": 121.6225}, {"codigo": "15556", "precio": 25.52}, {"codigo": "18474", "precio": 5.2386}, {"codigo": "15542", "precio": 5.58}, {"codigo": "15567", "precio": 8.985}, {"codigo": "15581", "precio": 9.135}];
  D.maestro.forEach((x, k) => { if(!x.proveedor) x.proveedor = ['ANTALIS','CIMBOL','ANTALIS','PAPELERIA LA PAZ',null][k % 5]; });
  D.inventario = D.maestro.map((x, k) => ({codigo:x.codigo, stock:[0, 3, 8, 15, 40, 120, 6, 25][(k * 7 + x.codigo.length) % 8]})); D.inventario.push({codigo:'4919', stock:32, descripcion:'ALCOHOL EN GEL NEUTRO TELCHI 1000 ML', unidad:'FCO'}, {codigo:'15870', stock:5, descripcion:'TERMOMETRO DIGITAL MICROLIFE/RIGIDO', unidad:'PZA'}); D.inventario_cargas = [{ts:new Date().toISOString(), archivo:'Inventario de ejemplo', items:D.inventario.length}];
  D.config = [{clave:'kit_apertura', valor:[{"codigo":"15574","cantidad":1},{"codigo":"15564","cantidad":2},{"codigo":"24981","cantidad":1},{"codigo":"15519","cantidad":4},{"codigo":"15563","cantidad":2},{"codigo":"26336","cantidad":3},{"codigo":"25645","cantidad":10},{"codigo":"27232","cantidad":10},{"codigo":"27230","cantidad":10},{"codigo":"27228","cantidad":10},{"codigo":"27231","cantidad":5},{"codigo":"27229","cantidad":5},{"codigo":"15557","cantidad":1},{"codigo":"15525","cantidad":3},{"codigo":"15529","cantidad":1},{"codigo":"15527","cantidad":3},{"codigo":"18158","cantidad":1},{"codigo":"15535","cantidad":1},{"codigo":"15573","cantidad":1},{"codigo":"15571","cantidad":1},{"codigo":"15550","cantidad":2},{"codigo":"15533","cantidad":3},{"codigo":"15568","cantidad":1},{"codigo":"15570","cantidad":2},{"codigo":"15559","cantidad":2},{"codigo":"26997","cantidad":1},{"codigo":"15548","cantidad":2},{"codigo":"15569","cantidad":1},{"codigo":"25225","cantidad":2},{"codigo":"15554","cantidad":1},{"codigo":"22614","cantidad":3},{"codigo":"15534","cantidad":1},{"codigo":"15576","cantidad":2},{"codigo":"15545","cantidad":2},{"codigo":"25639","cantidad":50},{"codigo":"15540","cantidad":1},{"codigo":"15575","cantidad":1},{"codigo":"15523","cantidad":1},{"codigo":"15567","cantidad":2},{"codigo":"15581","cantidad":20},{"codigo":"28259","cantidad":2}]}];
  pedidos.sort((a,b) => Date.parse(a.ts) - Date.parse(b.ts)); n = 1; pedidos.forEach(p => p.codigo = cod(Date.parse(p.ts))); pedidos.reverse();
  const res = data => Promise.resolve({data, error:null});
  const err = m => Promise.resolve({data:null, error:{message:m}});
  function q(table){
    const rows = () => table === 'pedidos' ? pedidos : D[table];
    let filtro = null;
    const b = {
      select(){ return b; }, order(){ return b; }, limit(){ return b; },
      then(r, j){ return res(rows()).then(r, j); },
      insert(o){ const p = {id:'n'+Date.now(), codigo:cod(Date.now()), ts:iso(Date.now()), estado:'Enviada', items_original:null, confirmado_ts:null, entregado_ts:null, nota:null, motivo_rechazo:null, recibido_por:null, ...o}; pedidos.unshift(p);
        return {select(){ return {single(){ return res(p); }}; }}; },
      update(o){ return {eq(k, v){ const r = rows().find(x => x[k] === v); if(r) Object.assign(r, o); return res(null); }}; },
    };
    return b;
  }
  const rolActual = () => window.__ROL;
  D.cuentas = [{email:'dagarcia@farmaciaschavez.com.bo', creado:new Date().toISOString(), ultimo:new Date().toISOString(), confirmado:true}, {email:'logistica2gh@farmaciaschavez.com.bo', creado:new Date().toISOString(), ultimo:null, confirmado:true}];
  window.supabase = {createClient(){ const cli = {
    from: q,
    functions:{ invoke(fn, o){ const b = o.body || {}; if(fn !== 'usuarios') return res(null);
      if(b.accion === 'listar') return Promise.resolve({data:{usuarios:D.cuentas.slice()}, error:null});
      const ya = D.cuentas.find(c => c.email === b.email);
      if(b.accion === 'crear'){ if(!ya) D.cuentas.push({email:b.email, creado:new Date().toISOString(), ultimo:null, confirmado:true}); return Promise.resolve({data:{ok:true, existia:!!ya}, error:null}); }
      if(b.accion === 'restablecer') return Promise.resolve({data: ya ? {ok:true} : {error:'Ese correo no tiene cuenta. Créela primero.'}, error:null});
      return Promise.resolve({data:{error:'Acción no válida'}, error:null}); } },
    rpc(name, a){
      if(name === 'mi_rol') return res(rolActual() || {admin:false, grupos:[]});
      const p = pedidos.find(x => x.id === a?.p_id); const now = iso(Date.now());
      if(name === 'confirmar_pedido'){ if(p.estado !== 'Enviada') return err('El pedido ya no está pendiente'); if(JSON.stringify(p.items) !== JSON.stringify(a.p_items)) p.items_original = p.items_original || p.items; p.items = a.p_items; p.estado = 'Confirmada'; p.confirmado_ts = now; p.nota = (a.p_nota || '').trim() || null; }
      if(name === 'rechazar_pedido'){ p.estado = 'Rechazada'; p.confirmado_ts = now; p.motivo_rechazo = a.p_motivo; }
      if(name === 'entregar_pedido'){ p.estado = 'Entregada'; p.entregado_ts = now; p.recibido_por = (a.p_recibido || '').trim() || null; }
      if(name === 'confirmar_varios'){ let c = 0; a.p_ids.forEach(id => { const q = pedidos.find(x => x.id === id); if(q && q.estado === 'Enviada'){ q.estado = 'Confirmada'; q.confirmado_ts = now; c++; } }); return res(c); }
      if(name === 'entregar_varios'){ let c = 0; a.p_ids.forEach(id => { const q = pedidos.find(x => x.id === id); if(q && q.estado === 'Confirmada'){ q.estado = 'Entregada'; q.entregado_ts = now; q.recibido_por = (a.p_recibido || '').trim() || null; c++; } }); return res(c); }
      if(name === 'crear_unidad'){
        const g = D.grupos.find(x => x.id === a.p_grupo); let nom = (a.p_nombre || '').trim().replace(/\s+/g, ' ').toUpperCase();
        if(D.unidades.some(u => u.nombre.toLowerCase() === nom.toLowerCase())) return err('Ya existe una sala o área con ese nombre');
        if(a.p_codigo && D.unidades.some(u => u.codigo_sala === a.p_codigo)) return err('Ese código de sala ya está registrado');
        const tipo = g.tipo === 'Oficina central' ? 'Oficina central' : g.tipo === 'CEDIS' ? 'CEDIS' : 'Sucursal';
        if(tipo !== 'Sucursal') nom = nom.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
        const num = /^SUC[ .\-]*(\d+)/.exec(nom); let id = tipo === 'Sucursal' && num ? 'SUC-' + num[1] : (tipo === 'Sucursal' ? 'S-' : tipo === 'CEDIS' ? 'CED-' : 'OFC-') + nom.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 30);
        while(D.unidades.some(u => u.id === id)) id += '-2';
        D.unidades.push({id, nombre:nom, tipo, grupo_id:a.p_grupo, codigo_sala:tipo === 'Sucursal' ? (a.p_codigo || null) : null, muelle:tipo === 'Sucursal' ? (a.p_muelle || null) : null, regional:tipo === 'Sucursal' ? ((a.p_regional || '').toUpperCase() || null) : null, activa:true});
        return res(id); }
      if(name === 'crear_material'){ const cod = (a.p_codigo||'').trim(), d = (a.p_descripcion||'').trim().replace(/\s+/g,' ').toUpperCase();
        if(D.maestro.some(y => y.codigo === cod)) return err('El código ' + cod + ' ya existe'); if(D.maestro.some(y => y.descripcion.toUpperCase() === d)) return err('Ya existe un material con ese nombre');
        const x = {codigo:cod, descripcion:d, unidad:(a.p_unidad||'').toUpperCase(), categoria:a.p_categoria||'General', subcategoria:'General'}; D.maestro.push(x); return res(x); }
      if(name === 'guardar_traspaso'){ const x = pedidos.find(y => y.id === a.p_id); if(!x || !['Confirmada','Entregada'].includes(x.estado)) return err('La solicitud debe estar confirmada o entregada'); x.nro_traspaso = (a.p_nro || '').trim() || null; return res(null); }
      if(name === 'guardar_precio'){ const x = D.precios.find(y => y.codigo === a.p_codigo); if(x) x.precio = a.p_precio; else D.precios.push({codigo:a.p_codigo, precio:a.p_precio}); return res(null); }
      if(name === 'guardar_kit'){ const k = D.config.find(x => x.clave === 'kit_apertura'); k.valor = a.p_items.filter(x => +x.cantidad > 0).map(x => ({codigo:x.codigo, cantidad:+x.cantidad})); return res(k.valor.length); }
      if(name === 'fijar_exigir_ingreso'){ const c = (D.config || []).find(x => x.clave === 'exigir_ingreso'); if(c) c.valor = a.p_valor; else (D.config = D.config || []).push({clave:'exigir_ingreso', valor:a.p_valor}); return res(null); }
      if(name === 'cargar_inventario'){ D.inventario.forEach(x => x.stock = 0); a.p_items.forEach(i => { const x = D.inventario.find(y => y.codigo === i.codigo); if(x) x.stock += +i.stock; else D.inventario.push({codigo:i.codigo, stock:+i.stock, descripcion:i.descripcion, unidad:i.unidad}); if(a.p_costos && i.costo){ const pr = D.precios.find(y => y.codigo === i.codigo); if(pr) pr.precio = i.costo; } }); D.inventario_cargas.unshift({ts:new Date().toISOString(), archivo:a.p_archivo, items:a.p_items.length}); return res(a.p_items.length); }
      if(name === 'guardar_proveedor'){ const x = D.maestro.find(y => y.codigo === a.p_codigo); if(!x) return err('Material no encontrado'); x.proveedor = (a.p_proveedor || '').trim().toUpperCase() || null; return res(null); }
      if(name === 'listar_roles'){ D.admins ||= [{email:'dagarcia@farmaciaschavez.com.bo', nombre:'Logística CEDIS', activo:true, rol:'logistica'}]; return res(D.admins.slice()); }
      if(name === 'guardar_rol'){ D.admins ||= []; const e = a.p_email.toLowerCase(); const x = D.admins.find(y => y.email === e); if(x){ x.activo = a.p_activo; x.rol = a.p_rol; } else D.admins.push({email:e, nombre:a.p_nombre, activo:a.p_activo, rol:a.p_rol}); return res(null); }
      if(name === 'guardar_admin'){ D.admins ||= []; const e = a.p_email.toLowerCase(); const x = D.admins.find(y => y.email === e); if(x) x.activo = a.p_activo; else D.admins.push({email:e, nombre:a.p_nombre, activo:a.p_activo}); return res(null); }
      if(name === 'guardar_correo_unidad'){ const u = D.unidades.find(x => x.id === a.p_id); if(!u) return err('Sala no encontrada'); const c = (a.p_correo || '').trim().toLowerCase() || null; if(c && D.unidades.some(x => x.id !== u.id && x.correo === c)) return err('Ese correo ya está asignado a otra sala o área'); u.correo = c; return res(null); }
      if(name === 'editar_unidad'){ const u = D.unidades.find(x => x.id === a.p_id); if(!u) return err('Sala no encontrada'); Object.assign(u, {codigo_sala:a.p_codigo || null, muelle:a.p_muelle || null, regional:(a.p_regional || '').toUpperCase() || null}); if(a.p_creada) u.creada_ts = new Date(a.p_creada + 'T12:00:00').toISOString(); return res(null); }
      if(name === 'entregar_ajustado'){ const x = pedidos.find(y => y.id === a.p_id); if(!x || x.estado !== 'Confirmada') return err('El pedido no está confirmado');
        let dif = false; const ent = x.items.map(i => { const q = a.p_items ? (a.p_items.find(z => z.codigo === i.codigo)?.cantidad ?? i.cantidad) : i.cantidad; if(+q !== +i.cantidad) dif = true; return {...i, cantidad:+q}; });
        if(dif && !(a.p_nota || '').trim()) return err('Indique el motivo de la diferencia en la entrega');
        Object.assign(x, {estado:'Entregada', entregado_ts:iso(Date.now()), recibido_por:a.p_recibido || null, items_entregados:dif ? ent : null, nota_entrega:dif ? a.p_nota : null}); return res(null); }
      if(name === 'anular_pedido'){ const x = pedidos.find(y => y.id === a.p_id); if(x && x.estado === 'Enviada'){ x.estado = 'Anulada'; x.anulado_ts = iso(Date.now()); return res(null); } return err('Solo se puede anular una solicitud que todavía no fue confirmada'); }
      if(name === 'cerrar_material'){ const x = D.maestro.find(y => y.codigo === a.p_codigo); if(x) x.activo = !!a.p_activo; return res(x); }
      if(name === 'cambiar_categoria'){ const x = D.maestro.find(y => y.codigo === a.p_codigo); if(x) x.categoria = a.p_categoria; return res(x); }
      if(name === 'cerrar_unidad'){ const u = D.unidades.find(x => x.id === a.p_id); if(u) u.activa = !!a.p_activa; return res(null); }
      if(name === 'reabrir_pedido'){ p.estado = 'Enviada'; p.confirmado_ts = null; p.motivo_rechazo = null; }
      return res(null); },
    auth: { onAuthStateChange(cb){ window.__authCb = cb; setTimeout(() => cb('INITIAL_SESSION', null), 10); return {data:{subscription:{unsubscribe(){}}}}; },
      signOut(){ window.__ROL = null; window.__authCb && window.__authCb('SIGNED_OUT', null); return res(null); },
      signInWithPassword(){ return err('demo'); }, signUp(){ return err('demo'); }, resetPasswordForEmail(){ return err('demo'); }, updateUser(){ return res(null); } },
    channel(){ const c = {on(){ return c; }, subscribe(){ return c; }}; return c; },
  }; return cli; }};
  window.verComo = v => { window.__ROL = v === 'sol' ? null : String(v).startsWith('u:') ? {admin:false, grupos:[], unidad:v.slice(2)} : v === 'consulta' ? {admin:false, consulta:true, grupos:[]} : v === 'log' ? {admin:true, grupos:[]} : {admin:false, grupos:[v]}; window.__authCb && window.__authCb('SIGNED_IN', window.__ROL ? {user:{}} : null); };
})();
