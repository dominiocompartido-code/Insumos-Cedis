// ---------- ciclo mensual de dotación y alertas ----------
// Envío 10–20 · Aprobación 21–25 · Compras 26–fin de mes · Entrega 1–10 del mes siguiente
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const hoy = () => window.__HOY ? new Date(window.__HOY) : new Date();
const cicloDe = ts => { const d = new Date(ts); return d.getFullYear() * 100 + d.getMonth() + 1; };
function cicloActivo(){ const d = hoy(); let y = d.getFullYear(), m = d.getMonth() + 1; if(d.getDate() < 10){ m--; if(!m){ m = 12; y--; } } return y * 100 + m; }
const cicloMenos = (c, k) => { let y = Math.floor(c / 100), m = c % 100 - k; while(m < 1){ m += 12; y--; } return y * 100 + m; };
const nombreCiclo = c => { const n = MESES[c % 100 - 1]; return n[0].toUpperCase() + n.slice(1) + ' ' + Math.floor(c / 100); };
function fases(c){ const y = Math.floor(c / 100), m = c % 100 - 1, d = (mm, dd) => new Date(y, mm, dd);
  return {envio:[d(m,10), d(m,21)], aprob:[d(m,21), d(m,26)], compras:[d(m,26), d(m+1,1)], entrega:[d(m+1,1), d(m+1,11)]}; }
const FASES = [['envio','Envío de solicitudes','Sucursales y áreas'],['aprob','Aprobación','Supervisoras, Helen y Jefe. CEDI'],['compras','Compras','Logística CEDIS'],['entrega','Entrega a salas','Logística CEDIS']];
function faseActual(c){ const f = fases(c), t = hoy(); for(const [k] of FASES) if(t >= f[k][0] && t < f[k][1]) return k; return t < f.envio[0] ? 'antes' : 'cerrado'; }
const diasHasta = fin => Math.max(0, Math.ceil((fin - hoy()) / 864e5)); // días que quedan, contando hoy
const fCorta = d => `${d.getDate()}/${d.getMonth() + 1}`;
const tarde = p => { if(p.tipo === 'Apertura') return false; const d = new Date(p.ts).getDate(); return d > 20; };
const delCiclo = (c, filtro = () => true) => pedidos.filter(p => cicloDe(p.ts) === c && p.tipo !== 'Apertura' && filtro(p));
const cicloMas = c => { let y = Math.floor(c / 100), m = c % 100 + 1; if(m > 12){ m = 1; y++; } return y * 100 + m; };
// primer ciclo en que la sala debía pedir: el de su apertura si abrió antes del cierre del envío (día 20), si no el siguiente
const primerCiclo = u => { if(!u || !u.creada_ts) return 0; const t = Date.parse(u.creada_ts), c = cicloDe(t); return t < fases(c).envio[1] ? c : cicloMas(c); };
const vigenteEn = (u, c) => c >= primerCiclo(u);
const delCicloTodos = (c, filtro = () => true) => pedidos.filter(p => cicloDe(p.ts) === c && filtro(p));
function sinEnviar(c, gids){ const con = new Set(delCicloTodos(c).map(p => p.unidad_id)); return UL.filter(u => u.activa && vigenteEn(u, c) && (!gids || gids.includes(u.grupo_id)) && !con.has(u.id)); }
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

function lineaCiclo(c){
  const f = fases(c), act = faseActual(c);
  return `<div class="ciclo"><div class="ciclo-head"><b>Ciclo ${esc(nombreCiclo(c))}</b><span class="sub" style="margin:0">${act === 'cerrado' ? 'Ciclo cerrado' : act === 'antes' ? `Empieza el ${fCorta(f.envio[0])}` : `Fase actual: <strong>${FASES.find(x => x[0] === act)[1]}</strong> · quedan ${plural(diasHasta(f[act][1]), 'día', 'días')}`}</span></div>
    <ol class="fases">${FASES.map(([k, t, q]) => { const pas = hoy() >= f[k][1], cur = k === act;
      return `<li class="${cur ? 'cur' : pas ? 'pas' : ''}"><b>${t}</b><span>${fCorta(f[k][0])} – ${fCorta(new Date(f[k][1] - 864e5))}</span><small>${q}</small></li>`; }).join('')}</ol></div>`;
}

function lineaCicloCorta(c){
  const f = fases(c), act = faseActual(c), i = FASES.findIndex(x => x[0] === act), sig = FASES[i + 1];
  const txt = act === 'cerrado' ? 'Ciclo cerrado' : act === 'antes' ? `Empieza el ${fCorta(f.envio[0])}`
    : `<strong>${FASES[i][1]}</strong> (${fCorta(f[act][0])} – ${fCorta(new Date(f[act][1] - 864e5))}) · quedan <strong>${plural(diasHasta(f[act][1]), 'día', 'días')}</strong>${sig ? ` <span class="sub" style="margin:0">· Sigue: ${sig[1]} desde el ${fCorta(f[sig[0]][0])}</span>` : ''}`;
  return `<div class="ciclo-corta"><b>Ciclo ${esc(nombreCiclo(c))}</b><span>${txt}</span></div>`;
}

// alertas según quién mira: [{nivel:'info'|'warn'|'bad', titulo, texto, tab?}]
function alertas(){
  const A = [], c = cicloActivo(), f = fases(c), fa = faseActual(c);
  // sucursal o área elegida
  if(unidadSel && U[unidadSel] && !rol.admin && !rol.grupos.length){
    const u = U[unidadSel], mios = delCiclo(c, p => p.unidad_id === u.id), dEnv = diasHasta(f.envio[1]);
    if(mios.length){ const r = mios.find(p => p.estado === 'Rechazada' && !mios.some(q => q.estado !== 'Rechazada'));
      if(r) A.push({nivel:'bad', titulo:'Su solicitud fue rechazada', texto:`${r.codigo}: ${r.motivo_rechazo || ''}`, tab:'seguimiento'}); }
    else if(fa === 'envio') A.push({nivel: dEnv <= 3 ? 'warn' : 'info', titulo: dEnv <= 3 ? `Últimos días: quedan ${plural(dEnv, 'día', 'días')} para enviar` : `Tiene hasta el ${fCorta(new Date(f.envio[1] - 864e5))} para enviar su solicitud`, texto:`${u.nombre} todavía no envió la solicitud del ciclo ${nombreCiclo(c)}.`, tab:'solicitar'});
    else if(fa !== 'antes') A.push({nivel:'bad', titulo:'Plazo de envío vencido', texto:`${u.nombre} no envió su solicitud del ciclo ${nombreCiclo(c)} (plazo hasta el ${fCorta(new Date(f.envio[1] - 864e5))}). Si envía ahora, quedará como fuera de plazo.`, tab:'solicitar'});
  }
  // aprobadores
  const gids = rol.admin ? null : rol.grupos;
  if(rol.admin || rol.grupos.length){
    const pend = pedidos.filter(p => p.estado === 'Enviada' && puedeAprobar(p)), dAp = diasHasta(f.aprob[1]);
    if(pend.length){
      if(fa === 'aprob') A.push({nivel: dAp <= 3 ? 'warn' : 'info', titulo:`${plural(pend.length, 'solicitud por confirmar', 'solicitudes por confirmar')}`, texto:`Plazo para confirmar o rechazar: hasta el ${fCorta(new Date(f.aprob[1] - 864e5))} (quedan ${plural(dAp, 'día', 'días')}).`, tab:'bandeja'});
      else if(fa === 'compras' || fa === 'entrega' || fa === 'cerrado') A.push({nivel:'bad', titulo:`${plural(pend.length, 'solicitud vencida', 'solicitudes vencidas')} sin confirmar`, texto:`El plazo de aprobación terminó el ${fCorta(new Date(f.aprob[1] - 864e5))}.`, tab:'bandeja'});
      else A.push({nivel:'info', titulo:`${plural(pend.length, 'solicitud por confirmar', 'solicitudes por confirmar')}`, texto:'Puede ir confirmándolas desde ya.', tab:'bandeja'});
    }
    const apert = pend.filter(p => p.tipo === 'Apertura');
    if(apert.length){ const tardes = apert.filter(p => riesgoApertura(p));
      A.push({nivel: tardes.length ? 'bad' : 'warn', apertura:true, titulo:`${plural(apert.length, 'solicitud de apertura', 'solicitudes de apertura')} por confirmar`, texto:apert.map(p => `${U[p.unidad_id]?.nombre || ''}: ${txtAbre(p.fecha_apertura)}${riesgoApertura(p) ? ' — ' + riesgoApertura(p).toLowerCase() : ''}`).join('; ') + (tardes.length ? '.' : '. Confírmela en menos de 24 h.'), tab:'bandeja'}); }
    const faltan = sinEnviar(c, gids);
    if(faltan.length && fa !== 'antes'){
      const dEnv = diasHasta(f.envio[1]), lista = faltan.slice(0, 6).map(u => u.nombre).join(', ') + (faltan.length > 6 ? '…' : '');
      if(fa === 'envio' && dEnv <= 3) A.push({nivel:'warn', titulo:`${plural(faltan.length, 'sala o área aún no envía', 'salas o áreas aún no envían')}`, texto:`Quedan ${plural(dEnv, 'día', 'días')} de plazo. ${lista}`, tab: rol.admin ? 'cobertura' : 'grupo'});
      else if(fa !== 'envio') A.push({nivel:'bad', titulo:`${plural(faltan.length, 'sala o área no envió', 'salas o áreas no enviaron')} a tiempo`, texto:lista, tab: rol.admin ? 'cobertura' : 'grupo'});
    }
  }
  // logística: entregas
  if(rol.admin){
    const apEnt = pedidos.filter(p => p.tipo === 'Apertura' && p.estado === 'Confirmada');
    if(apEnt.length){ const urg = apEnt.filter(p => riesgoApertura(p));
      A.push({nivel: urg.length ? 'bad' : 'warn', apertura:true, titulo:`${plural(apEnt.length, 'apertura por entregar', 'aperturas por entregar')}`, texto:apEnt.map(p => `${U[p.unidad_id]?.nombre || ''}: ${txtAbre(p.fecha_apertura)}`).join('; ') + '. Entréguela al menos 2 días antes de la inauguración.', tab:'entregar'}); }
    const porEnt = pedidos.filter(p => p.estado === 'Confirmada'), dEn = diasHasta(f.entrega[1]);
    if(porEnt.length && fa === 'entrega') A.push({nivel: dEn <= 3 ? 'warn' : 'info', titulo:`${plural(porEnt.length, 'solicitud por entregar', 'solicitudes por entregar')}`, texto:`Plazo de entrega a salas: hasta el ${fCorta(new Date(f.entrega[1] - 864e5))} (quedan ${plural(dEn, 'día', 'días')}).`, tab:'entregar'});
    if(porEnt.length && fa === 'cerrado') A.push({nivel:'bad', titulo:`${plural(porEnt.length, 'entrega atrasada', 'entregas atrasadas')}`, texto:'El plazo de entrega del ciclo ya terminó.', tab:'entregar'});
    if(fa === 'compras'){ const conf = delCiclo(c, p => p.estado === 'Confirmada' || p.estado === 'Entregada').length; A.push({nivel:'info', titulo:'Fase de compras', texto:`${plural(conf, 'solicitud aprobada', 'solicitudes aprobadas')} en el ciclo. Genere el reporte de dotación en Preparación.`, tab:'preparacion'}); }
    const prev = cicloMenos(c, 1), conDot = new Set(delCicloTodos(prev, p => p.estado === 'Entregada').map(p => p.unidad_id));
    const nodot = UL.filter(u => u.activa && u.tipo === 'Sucursal' && vigenteEn(u, prev) && !conDot.has(u.id)).length;
    if(nodot && pedidos.some(p => cicloDe(p.ts) === prev)) A.push({nivel:'info', titulo:`${plural(nodot, 'sala no fue dotada', 'salas no fueron dotadas')} en ${nombreCiclo(prev)}`, texto:'Vea el detalle en Cobertura.', tab:'cobertura'});
  }
  return A;
}
const ICONO = {bad:'!', warn:'!', info:'i'};
function avisoHtml(a){ return `<div class="aviso ${a.nivel}"><span class="aviso-i" aria-hidden="true">${ICONO[a.nivel]}</span><div><b>${esc(a.titulo)}</b><div>${esc(a.texto)}</div></div>${a.tab && a.tab !== tab ? `<button class="btn btn-sm" data-ir="${a.tab}">Ver</button>` : ''}</div>`; }
function bloqueAvisos(filtro){ const l = alertas().filter(filtro || (() => true)).sort((a,b) => ({bad:0,warn:1,info:2}[a.nivel] - {bad:0,warn:1,info:2}[b.nivel])); return l.length ? `<div class="avisos">${l.map(avisoHtml).join('')}</div>` : ''; }
function actualizarCampana(){
  const l = alertas(), n = l.filter(a => a.nivel !== 'info').length, b = $('nAlertas');
  if(b){ b.textContent = n; b.hidden = !n; }
  return l;
}
function abrirAlertas(){
  const l = alertas();
  const perm = 'Notification' in window ? Notification.permission : 'na';
  $('alertasBody').innerHTML = (l.length ? l.map(avisoHtml).join('') : '<p class="sub" style="margin:0">No hay alertas por ahora.</p>') +
    (perm === 'default' ? '<div class="row right"><button class="btn btn-primary btn-sm" id="btnPermiso">Activar avisos en este dispositivo</button></div>' : perm === 'granted' ? '<p class="sub" style="margin:0">Avisos activados en este dispositivo: al abrir la app le llegará una notificación con las alertas del día.</p>' : '');
  $('mAlertas').hidden = false;
}
async function notificarDelDia(){
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const l = alertas().filter(a => a.nivel !== 'info'); if(!l.length) return;
  const clave = 'fch_notif_' + hoy().toDateString() + (rol.admin ? 'L' : rol.grupos.join()) + (unidadSel || '');
  if(store.get(clave)) return; store.set(clave, '1');
  const titulo = l.length === 1 ? l[0].titulo : `${l.length} alertas de insumos`, cuerpo = l.map(a => a.titulo).join(' · ');
  try{ const reg = await navigator.serviceWorker?.getRegistration(); if(reg) reg.showNotification(titulo, {body:cuerpo, icon:'icon-192.png', badge:'icon-192.png', tag:'fch-alertas'}); else new Notification(titulo, {body:cuerpo, icon:'icon-192.png'}); }catch(e){}
}

// ---------- vista: cobertura (salas dotadas por ciclo) ----------
let fCobQ = '', fCobGr = 'TODOS', fCobSolo = true, fCobTipo = 'Sucursal', fCobEst = 'TODOS', fCobCiclo = 5;
function estadoCiclo(uid, c){
  const l = delCicloTodos(c, p => p.unidad_id === uid); if(!l.length) return null;
  for(const e of ['Entregada','Confirmada','Enviada','Rechazada']) if(l.some(p => p.estado === e)) return e;
}
const inicioDatos = () => pedidos.length ? Math.min(...pedidos.map(p => cicloDe(p.ts))) : cicloActivo();
const contarSinDotar = (est, ciclos, ini) => est.slice(0, 5).filter((e, i) => ciclos[i] >= ini && e !== 'Entregada').length;
const gruposCob = () => rol.admin ? GL : GL.filter(g => rol.grupos.includes(g.id));
const unidadesCob = (tipo, gr) => UL.filter(u => u.activa && (rol.admin || rol.grupos.includes(u.grupo_id)) && (!rol.admin || tipo === 'TODOS' || u.tipo === tipo) && (gr === 'TODOS' || u.grupo_id === gr));
function vCobertura(){
  if(!rol.admin && fCobGr !== 'TODOS' && !rol.grupos.includes(fCobGr)) fCobGr = 'TODOS';
  const c = cicloActivo(), ciclos = [5,4,3,2,1,0].map(k => cicloMenos(c, k));
  const us = unidadesCob(fCobTipo, fCobGr).filter(u => coincideSala(u, fCobQ)), gs = gruposCob();
  const ini = inicioDatos();
  const iniU = u => Math.max(ini, primerCiclo(u));
  const todas = us.map(u => { const est = ciclos.map(cc => estadoCiclo(u.id, cc)); const sinDot = contarSinDotar(est, ciclos, iniU(u)); return {u, est, sinDot}; });
  const antesC = ciclos[fCobCiclo] < ini, estDe = x => (antesC || ciclos[fCobCiclo] < iniU(x.u)) ? 'antes' : (x.est[fCobCiclo] || 'none');
  const cuenta = e => todas.filter(x => estDe(x) === e).length;
  const filas = todas.filter(x => fCobEst !== 'TODOS' ? estDe(x) === fCobEst : (!fCobSolo || x.est[5] !== 'Entregada' || x.est[4] !== 'Entregada'))
    .sort((a,b) => b.sinDot - a.sinDot || ordU(a.u) - ordU(b.u));
  const L = {Entregada:'Entregada', Confirmada:'Confirmada', Enviada:'Enviada', Rechazada:'Rechazada'};
  return `<section class="panel"><div class="panel-head"><div><h2>Cobertura de dotación por sala</h2><p class="sub">${rol.admin ? 'Estado de cada sala' : `Estado de cada sala de ${esc(gs.map(g => g.nombre).join(', '))}`} en los últimos 6 ciclos. Una sala queda dotada cuando su solicitud se entrega. Los ciclos anteriores al uso de la app aparecen vacíos.</p></div>
    <div class="row"><input id="fCobQ" placeholder="Buscar sala o código…" value="${esc(fCobQ)}" style="width:200px" autocomplete="off">${rol.admin ? `<select id="fCobTipo" style="width:auto">${[['Sucursal','Solo sucursales'],['TODOS','Sucursales y áreas']].map(([v,t]) => `<option value="${v}" ${fCobTipo === v ? 'selected' : ''}>${t}</option>`).join('')}</select>` : ''}${gs.length > 1 ? `<select id="fCobGr" style="width:auto"><option value="TODOS">${rol.admin ? 'Todos los grupos' : 'Todos mis grupos'}</option>${gs.map(g => `<option value="${g.id}" ${fCobGr === g.id ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('')}</select>` : ''}
    <label class="row" style="gap:6px;font-size:13px"><input type="checkbox" id="fCobSolo" ${fCobSolo ? 'checked' : ''} ${fCobEst !== 'TODOS' ? 'disabled' : ''} style="width:auto"> Solo las que tienen algún ciclo reciente sin dotar</label><button class="btn btn-ok" id="btnExpCob">Exportar a Excel</button></div></div>
    <div class="row" style="gap:8px;align-items:center"><span class="sub" style="margin:0">Filtrar por estado en</span><select id="fCobCiclo" style="width:auto">${ciclos.map((cc, i) => `<option value="${i}" ${fCobCiclo === i ? 'selected' : ''}>${esc(nombreCiclo(cc))}${cc === c ? ' (actual)' : ''}</option>`).join('')}</select></div>
    <div class="leyenda filtro" role="group" aria-label="Filtrar por estado">${[['TODOS','Todas',''],['Entregada','Dotada (entregada)','Entregada'],['Confirmada','Aprobada, por entregar','Confirmada'],['Enviada','Enviada','Enviada'],['Rechazada','Rechazada','Rechazada'],['none','Sin solicitud','none']].map(([v,t,cl]) => `<button type="button" class="ley-btn" data-cobest="${v}" aria-pressed="${fCobEst === v}">${v === 'TODOS' ? '' : `<i class="${cl}"></i>`}${t}${v === 'TODOS' ? '' : ` <b>${antesC ? 0 : cuenta(v)}</b>`}</button>`).join('')}</div>
    ${fCobEst !== 'TODOS' ? `<p class="sub" style="margin:0">Mostrando ${plural(filas.length, 'sala', 'salas')} con estado <b>${esc({Entregada:'Dotada (entregada)', Confirmada:'Aprobada, por entregar', Enviada:'Enviada', Rechazada:'Rechazada', none:'Sin solicitud'}[fCobEst])}</b> en ${esc(nombreCiclo(ciclos[fCobCiclo]))}.${antesC ? ' Ese ciclo es anterior al uso de la app.' : ''}</p>` : ''}
    <div class="tbl-wrap"><table><thead><tr><th>Sala / área</th><th>Aprueba</th>${ciclos.map(cc => `<th class="num">${esc(nombreCiclo(cc).replace(/ \d+$/, '').slice(0,3))}${cc === c ? ' (actual)' : ''}</th>`).join('')}<th class="num" title="Ciclos anteriores en que la sala no recibió insumos, desde que se usa la app">Ciclos sin dotar</th></tr></thead><tbody>` +
    (filas.length ? filas.map(x => `<tr><td><strong>${esc(x.u.nombre)}</strong><div class="sub" style="margin:0">${esc(x.u.muelle || x.u.tipo)}</div></td><td><span class="gtag" data-g="${esc(x.u.grupo_id)}">${esc(G[x.u.grupo_id]?.aprobador || '')}</span></td>
      ${x.est.map((e, i) => ciclos[i] < iniU(x.u) ? `<td class="num"><span class="cel antes" title="${ciclos[i] < ini ? 'Antes de usar la app' : 'Antes de la apertura de la sala'}"></span></td>` : `<td class="num"><span class="cel ${e || 'none'}" title="${esc(nombreCiclo(ciclos[i]) + ': ' + (e ? L[e] : 'sin solicitud'))}">${e ? e[0] : '–'}</span></td>`).join('')}
      <td class="num">${x.sinDot ? `<span class="chip ${x.sinDot >= 2 ? 'alerta' : 'ajuste'}">${x.sinDot}</span>` : '0'}</td></tr>`).join('') : `<tr><td colspan="9" class="empty">${fCobQ.trim() ? 'Ninguna sala coincide con la búsqueda.' : fCobEst !== 'TODOS' ? 'Ninguna sala tiene ese estado en el ciclo elegido.' : 'Todas las salas de este filtro fueron dotadas en los últimos ciclos.'}</td></tr>`) + '</tbody></table></div></section>';
}
function exportarCobertura(){
  const c = cicloActivo(), ciclos = [5,4,3,2,1,0].map(k => cicloMenos(c, k)), W = XL.libro(), h = W.hoja('Cobertura');
  const cab = {b:true, sz:10, color:'FFFFFFFF', fill:'FF1F3864', h:'center', v:'center', wrap:true, bt:'thin', bb:'thin', bl:'thin', br:'thin'};
  const COL = {Entregada:'FFC6EFCE', Confirmada:'FFDDEBF7', Enviada:'FFFFEB9C', Rechazada:'FFFFC7CE'};
  ['Cod. Sucursal','Sala / área','Muelle','Aprueba', ...ciclos.map(nombreCiclo), 'Ciclos sin dotar'].forEach((t, i) => h.set(0, i, t, cab));
  h.altos[0] = 30; [10,32,10,26,11,11,11,11,11,11,10].forEach((w, i) => h.anchos[i] = w);
  unidadesCob(fCobTipo, fCobGr).sort((a,b) => ordU(a) - ordU(b)).forEach((u, r) => {
    const est = ciclos.map(cc => estadoCiclo(u.id, cc)), s = (hh, ex = {}) => ({sz:9, h:hh, v:'center', bt:'thin', bb:'thin', bl:'thin', br:'thin', ...ex});
    h.set(r + 1, 0, numSi(u.codigo_sala), s('center')); h.set(r + 1, 1, u.nombre, s('left')); h.set(r + 1, 2, u.muelle || '', s('center')); h.set(r + 1, 3, G[u.grupo_id]?.aprobador || '', s('left'));
    const iu = Math.max(inicioDatos(), primerCiclo(u));
    est.forEach((e, i) => h.set(r + 1, 4 + i, ciclos[i] < iu ? '' : (e || 'Sin solicitud'), s('center', {fill:ciclos[i] < iu ? null : (COL[e] || 'FFF2F2F2')})));
    h.set(r + 1, 10, contarSinDotar(est, ciclos, iu), s('center', {b:true}));
  });
  h.freeze = 1; h.titulos = ['1','1']; h.ajustarAncho = true;
  descargar(W.generar(), `Cobertura_Dotacion_${new Date().toISOString().slice(0,10)}.xlsx`);
}
