// ---------- ciclo mensual de dotación y alertas ----------
// El ciclo se nombra por el MES DE USO (= mes del traspaso). Las salas piden un mes antes:
// Ciclo M: envío 10–20 de M-1 · aprobación 21–25 de M-1 · compras 26–fin de M-1 · entrega 1–10 de M.
// Una solicitud enviada del 10 de M-1 al 9 de M cuenta para el ciclo M.
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const hoy = () => window.__HOY ? new Date(window.__HOY) : new Date();
const cicloDe = ts => { const d = new Date(ts); let y = d.getFullYear(), m = d.getMonth() + 1; if(d.getDate() >= 10){ m++; if(m > 12){ m = 1; y++; } } return y * 100 + m; };
function cicloActivo(){ return cicloDe(hoy()); }
const cicloMenos = (c, k) => { let y = Math.floor(c / 100), m = c % 100 - k; while(m < 1){ m += 12; y--; } return y * 100 + m; };
const nombreCiclo = c => { const n = MESES[c % 100 - 1]; return n[0].toUpperCase() + n.slice(1) + ' ' + Math.floor(c / 100); };
function fases(c){ const y = Math.floor(c / 100), m = c % 100 - 2, d = (mm, dd) => new Date(y, mm, dd);
  return {envio:[d(m,10), d(m,21)], aprob:[d(m,21), d(m,26)], compras:[d(m,26), d(m+1,1)], entrega:[d(m+1,1), d(m+1,11)]}; }
const FASES = [['envio','Envío de solicitudes','Sucursales y áreas'],['aprob','Aprobación','Supervisoras, Helen y Jefe. CEDI'],['compras','Compras','Logística CEDIS'],['entrega','Entrega a salas','Logística CEDIS']];
function faseActual(c){ const f = fases(c), t = hoy(); for(const [k] of FASES) if(t >= f[k][0] && t < f[k][1]) return k; return t < f.envio[0] ? 'antes' : 'cerrado'; }
const diasHasta = fin => Math.max(0, Math.ceil((fin - hoy()) / 864e5)); // días que quedan, contando hoy
const fCorta = d => `${d.getDate()}/${d.getMonth() + 1}`;
// Históricos (cargados del reporte de traspasos): solo tienen la fecha real del traspaso; su ciclo es el mes del traspaso
const esHist = p => p.origen === 'historico';
const cicloP = p => { if(esHist(p) && p.entregado_ts){ const d = new Date(p.entregado_ts); return d.getFullYear() * 100 + d.getMonth() + 1; } return cicloDe(p.ts); };
const tarde = p => { if(p.tipo === 'Apertura' || esHist(p)) return false; return new Date(p.ts) >= fases(cicloDe(p.ts)).envio[1]; };
const delCiclo = (c, filtro = () => true) => pedidos.filter(p => cicloP(p) === c && p.tipo !== 'Apertura' && filtro(p));
const cicloMas = c => { let y = Math.floor(c / 100), m = c % 100 + 1; if(m > 12){ m = 1; y++; } return y * 100 + m; };
// primer ciclo en que la sala debía pedir: el de su apertura si abrió antes del cierre del envío (día 20), si no el siguiente
const primerCiclo = u => { if(!u || !u.creada_ts) return 0; const t = Date.parse(u.creada_ts), c = cicloDe(t); return t < fases(c).envio[1] ? c : cicloMas(c); };
const vigenteEn = (u, c) => c >= primerCiclo(u);
const delCicloTodos = (c, filtro = () => true) => pedidos.filter(p => cicloP(p) === c && filtro(p));
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
    const apEnt = pedidos.filter(p => p.tipo === 'Apertura' && p.estado === 'Aprobada');
    if(apEnt.length){ const urg = apEnt.filter(p => riesgoApertura(p));
      A.push({nivel: urg.length ? 'bad' : 'warn', apertura:true, titulo:`${plural(apEnt.length, 'apertura por entregar', 'aperturas por entregar')}`, texto:apEnt.map(p => `${U[p.unidad_id]?.nombre || ''}: ${txtAbre(p.fecha_apertura)}`).join('; ') + '. Entréguela al menos 2 días antes de la inauguración.', tab:'entregar'}); }
    const porEnt = pedidos.filter(p => p.estado === 'Aprobada'), dEn = diasHasta(f.entrega[1]);
    if(porEnt.length && fa === 'entrega') A.push({nivel: dEn <= 3 ? 'warn' : 'info', titulo:`${plural(porEnt.length, 'solicitud por entregar', 'solicitudes por entregar')}`, texto:`Plazo de entrega a salas: hasta el ${fCorta(new Date(f.entrega[1] - 864e5))} (quedan ${plural(dEn, 'día', 'días')}).`, tab:'entregar'});
    if(porEnt.length && fa === 'cerrado') A.push({nivel:'bad', titulo:`${plural(porEnt.length, 'entrega atrasada', 'entregas atrasadas')}`, texto:'El plazo de entrega del ciclo ya terminó.', tab:'entregar'});
    if(fa === 'compras'){ const conf = delCiclo(c, p => p.estado === 'Confirmada' || p.estado === 'Aprobada' || p.estado === 'Entregada').length; A.push({nivel:'info', titulo:'Fase de compras', texto:`${plural(conf, 'solicitud aprobada', 'solicitudes aprobadas')} en el ciclo. Genere el reporte de dotación en Preparación.`, tab:'preparacion'}); }
    const prev = cicloMenos(c, 1), conDot = new Set(delCicloTodos(prev, p => p.estado === 'Entregada').map(p => p.unidad_id));
    const nodot = UL.filter(u => u.activa && u.tipo === 'Sucursal' && vigenteEn(u, prev) && !conDot.has(u.id)).length;
    if(false && nodot && pedidos.some(p => cicloP(p) === prev)) A.push({nivel:'info', titulo:`${plural(nodot, 'sala no fue dotada', 'salas no fueron dotadas')} en ${nombreCiclo(prev)}`, texto:'Vea el detalle en Cobertura.', tab:'cobertura'});
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
  for(const e of ['Entregada','Aprobada','Confirmada','Enviada','Rechazada']) if(l.some(p => p.estado === e)) return e;
}
const inicioDatos = () => pedidos.length ? Math.min(...pedidos.map(cicloP)) : cicloActivo();
const contarSinDotar = (est, ciclos, ini) => est.slice(0, 5).filter((e, i) => ciclos[i] >= ini && e !== 'Entregada').length;
// Logística, Consulta y Jefatura (Helen, Hubert) ven la cobertura de todas las salas
const verTodoCob = () => rol.admin || !!rol.consulta || (typeof esJefatura === 'function' && esJefatura());
const gruposCob = () => verTodoCob() ? GL : GL.filter(g => rol.grupos.includes(g.id));
const unidadesCob = (tipo, gr) => UL.filter(u => u.activa && (verTodoCob() || rol.grupos.includes(u.grupo_id)) && (!verTodoCob() || tipo === 'TODOS' || u.tipo === tipo) && (gr === 'TODOS' || u.grupo_id === gr));
// ---------- indicadores de cobertura: % dotación, plazos y consumo por sala ----------
let fIndCiclo = 4;
const diasEntre = (a, b) => (b - a) / 864e5;
const prom = l => l.length ? l.reduce((x, y) => x + y, 0) / l.length : null;
function indicadoresCiclo(c, us){
  const vig = us.filter(u => vigenteEn(u, c) && c >= inicioDatos());
  const est = vig.map(u => estadoCiclo(u.id, c));
  const dot = est.filter(e => e === 'Entregada').length, pidio = est.filter(Boolean).length;
  const ids = new Set(vig.map(u => u.id)), ped = delCiclo(c, p => ids.has(p.unidad_id));
  const fin = fases(c).envio[1].getTime(), pedV = ped.filter(p => !esHist(p)), aTiempo = pedV.filter(p => p.ts < fin).length;
  const conf = ped.filter(p => p.confirmado_ts), ent = ped.filter(p => p.entregado_ts && p.confirmado_ts);
  return {c, total:vig.length, dot, pidio, cob: vig.length ? dot / vig.length * 100 : null, ped, pedV, aTiempo, pctTiempo: pedV.length ? aTiempo / pedV.length * 100 : null,
    dConf: prom(conf.map(p => diasEntre(p.ts, p.confirmado_ts))), dEnt: prom(ent.map(p => diasEntre(p.confirmado_ts, p.entregado_ts))), conf};
}
const valorSalaCiclo = (uid, c) => delCiclo(c, p => p.unidad_id === uid && (p.estado === 'Confirmada' || p.estado === 'Aprobada' || p.estado === 'Entregada')).reduce((a, p) => a + valorPedido(p, p.estado === 'Entregada').total, 0);
// ---------- tablero visual de cobertura ----------
const EST_COB = [['Entregada','Dotada','var(--tile-ent)'],['Aprobada','Aprobada, por entregar','var(--tile-conf)'],['Confirmada','En aprobación final','var(--tile-fin)'],['Enviada','Enviada, sin confirmar','var(--tile-env)'],['Rechazada','Rechazada','var(--tile-rech)'],['none','Sin solicitud','var(--st-none)']];
const f1c = n => n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('es-BO');
const mesCorto = c => nombreCiclo(c).slice(0, 3);
function deltaCob(a, b, cB, mejorSube = true, suf = ' pts'){
  if(a == null || b == null) return '<span class="ind-d">sin ciclo anterior para comparar</span>';
  const d = a - b; if(Math.abs(d) < 0.05) return `<span class="ind-d">= igual que ${esc(nombreCiclo(cB).split(' ')[0].toLowerCase())}</span>`;
  const bien = mejorSube ? d > 0 : d < 0;
  return `<span class="ind-d ${bien ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${f1c(Math.abs(d))}${suf} vs ${esc(nombreCiclo(cB).split(' ')[0].toLowerCase())}</span>`;
}
function vCobertura(){
  if(!verTodoCob() && fCobGr !== 'TODOS' && !rol.grupos.includes(fCobGr)) fCobGr = 'TODOS';
  const cA = cicloActivo(), ciclos = [5,4,3,2,1,0].map(k => cicloMenos(cA, k)), gs = gruposCob(), us = unidadesCob(fCobTipo, fCobGr);
  const idx = Math.max(1, Math.min(5, fIndCiclo)), c = ciclos[idx], A = indicadoresCiclo(c, us), B = indicadoresCiclo(ciclos[idx - 1], us), ini = inicioDatos();
  const serie = ciclos.map(cc => { const vig = us.filter(u => vigenteEn(u, cc) && cc >= ini), cnt = {}; vig.forEach(u => { const e = estadoCiclo(u.id, cc) || 'none'; cnt[e] = (cnt[e] || 0) + 1; }); return {c:cc, total:vig.length, cnt}; });
  const conP = verPrecios();
  // A) estado por ciclo: columnas apiladas
  const H = 150;
  const colEst = serie.map((x, i) => { const segs = EST_COB.map(([k, l, col]) => { const n = x.cnt[k] || 0; if(!n) return ''; const h = x.total ? Math.max(2, n / x.total * H) : 0;
      return `<span class="seg" style="height:${h}px;background:${col}" data-tip="${esc(nombreCiclo(x.c))} · ${esc(l)}: ${n} de ${x.total} (${f1c(n / x.total * 100)} %)"></span>`; }).join('');
    const pct = x.total ? (x.cnt.Entregada || 0) / x.total * 100 : null;
    return `<div class="col${i === idx ? ' on' : ''}"><span class="col-v">${pct == null ? '' : Math.round(pct) + '%'}</span><div class="stack" style="height:${H}px">${x.total ? segs : '<span class="seg vacio" style="height:2px" data-tip="Sin datos"></span>'}</div><span class="col-l">${esc(mesCorto(x.c))}</span></div>`; }).join('');
  const leyenda = `<div class="leyenda-g">${EST_COB.map(([k, l, col]) => `<span><i style="background:${col}"></i>${esc(l)}</span>`).join('')}</div>`;
  // B) cobertura por grupo
  const porG = gs.filter(g => fCobGr === 'TODOS' || g.id === fCobGr).map(g => { const ug = us.filter(u => u.grupo_id === g.id && vigenteEn(u, c) && c >= ini); const d = ug.filter(u => estadoCiclo(u.id, c) === 'Entregada').length; return {g, n:ug.length, d, p: ug.length ? d / ug.length * 100 : null}; }).filter(x => x.n).sort((a, b) => b.p - a.p);
  const barrasG = porG.map(x => `<div class="hb"><span class="hb-l">${esc(x.g.aprobador)}</span><span class="hb-t" data-tip="${esc(x.g.nombre)}: ${x.d} de ${x.n} dotadas"><span class="hb-f" style="width:${x.p}%"></span></span><span class="hb-v">${Math.round(x.p)}% <small>${x.d}/${x.n}</small></span></div>`).join('') || '<p class="sub">Sin datos en este ciclo.</p>';
  // C) días para confirmar por aprobador (meta: 5 días, ventana de aprobación)
  const porAp = {}; A.conf.forEach(p => { const g = U[p.unidad_id]?.grupo_id; (porAp[g] ||= []).push(diasEntre(p.ts, p.confirmado_ts)); });
  const apL = Object.entries(porAp).map(([g, l]) => ({g, n:l.length, d:prom(l)})).sort((a, b) => b.d - a.d), maxD = Math.max(7, ...apL.map(x => x.d));
  const barrasAp = apL.map(x => `<div class="hb"><span class="hb-l">${esc(G[x.g]?.aprobador || x.g)}</span><span class="hb-t" data-tip="${esc(G[x.g]?.aprobador || x.g)}: ${f1c(x.d)} días en promedio (${plural(x.n, 'solicitud', 'solicitudes')})"><span class="hb-f ${x.d > 5 ? 'tarde' : ''}" style="width:${x.d / maxD * 100}%"></span><span class="hb-meta" style="left:${5 / maxD * 100}%" title="Meta: 5 días"></span></span><span class="hb-v">${f1c(x.d)} d</span></div>`).join('') || '<p class="sub">Todavía no hay solicitudes confirmadas en este ciclo.</p>';
  // D) consumo total por ciclo (Bs)
  const consC = conP ? ciclos.map(cc => ({c:cc, v: delCiclo(cc, p => us.some(u => u.id === p.unidad_id) && (p.estado === 'Confirmada' || p.estado === 'Aprobada' || p.estado === 'Entregada')).reduce((a, p) => a + valorPedido(p, p.estado === 'Entregada').total, 0)})) : [];
  const maxV = Math.max(1, ...consC.map(x => x.v));
  const colCons = consC.map((x, i) => `<div class="col${i === idx ? ' on' : ''}"><span class="col-v">${x.v && (i === idx || i === idx - 1) ? 'Bs ' + Math.round(x.v).toLocaleString('es-BO') : ''}</span><div class="stack" style="height:${H}px"><span class="seg serie" style="height:${x.v ? Math.max(2, x.v / maxV * H) : 2}px" data-tip="${esc(nombreCiclo(x.c))}: ${fBs(x.v)}"></span></div><span class="col-l">${esc(mesCorto(x.c))}</span></div>`).join('');
  // E) salas fuera de lo normal: consumo del ciclo vs su promedio de los 3 anteriores
  const cons = conP ? us.filter(u => vigenteEn(u, c)).map(u => { const v = valorSalaCiclo(u.id, c), hist = [1, 2, 3].map(k => cicloMenos(c, k)).filter(cc => vigenteEn(u, cc)).map(cc => valorSalaCiclo(u.id, cc)).filter(x => x > 0), pr = prom(hist); return {u, v, pr, r: pr ? v / pr : null}; }).filter(x => x.v > 0 && x.pr) : [];
  const fuera = cons.filter(x => x.r >= 1.5 || x.r <= .5).sort((a, b) => Math.abs(Math.log(b.r)) - Math.abs(Math.log(a.r))).slice(0, 8), maxF = Math.max(1, ...fuera.map(x => Math.max(x.v, x.pr)));
  const barrasF = fuera.map(x => `<div class="hb"><span class="hb-l">${esc(x.u.nombre)}</span><span class="hb-t" data-tip="${esc(x.u.nombre)}: ${fBs(x.v)} este ciclo · promedio ${fBs(x.pr)}"><span class="hb-f ${x.r >= 1.5 ? 'alto' : 'bajo'}" style="width:${x.v / maxF * 100}%"></span><span class="hb-prom" style="left:${x.pr / maxF * 100}%"></span></span><span class="hb-v ${x.r >= 1.5 ? 'neg' : ''}">${x.r >= 1 ? '+' : ''}${Math.round((x.r - 1) * 100)}%</span></div>`).join('');
  // G) consumo en Bs por grupo y por sala o área en el ciclo elegido
  const consU = conP ? us.map(u => ({u, v:valorSalaCiclo(u.id, c)})).filter(x => x.v > 0) : [], totC = consU.reduce((a, x) => a + x.v, 0);
  const porGr = gs.filter(g => fCobGr === 'TODOS' || g.id === fCobGr).map(g => { const l = consU.filter(x => x.u.grupo_id === g.id); return {g, v:l.reduce((a, x) => a + x.v, 0), n:l.length}; }).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const maxG = Math.max(1, ...porGr.map(x => x.v));
  const barrasBsG = porGr.map(x => `<div class="hb"><span class="hb-l">${esc(x.g.aprobador)}</span><span class="hb-t" data-tip="${esc(x.g.nombre)}: ${fBs(x.v)} · ${plural(x.n, 'sala o área', 'salas y áreas')} · promedio ${fBs(x.v / x.n)} por sala"><span class="hb-f" style="width:${x.v / maxG * 100}%"></span></span><span class="hb-v">Bs ${Math.round(x.v).toLocaleString('es-BO')} <small>${totC ? Math.round(x.v / totC * 100) : 0}%</small></span></div>`).join('');
  const topU = consU.slice().sort((a, b) => b.v - a.v).slice(0, 10), maxU = Math.max(1, ...topU.map(x => x.v));
  const barrasBsU = topU.map(x => `<div class="hb"><span class="hb-l">${esc(x.u.nombre)}</span><span class="hb-t" data-tip="${esc(x.u.nombre)} (${esc(G[x.u.grupo_id]?.aprobador || '')}): ${fBs(x.v)}"><span class="hb-f" style="width:${x.v / maxU * 100}%"></span></span><span class="hb-v">Bs ${Math.round(x.v).toLocaleString('es-BO')}</span></div>`).join('');
  // F) salas sin solicitud
  const sinSol = us.filter(u => vigenteEn(u, c) && c >= ini && !estadoCiclo(u.id, c)).sort((a, b) => ordU(a) - ordU(b));
  const porEnt = us.filter(u => vigenteEn(u, c) && estadoCiclo(u.id, c) === 'Aprobada').length;
  const kpi = (t, v, d, s, cls = '') => `<div class="ind ${cls}"><div class="ind-t">${t}</div><div class="ind-v">${v}</div>${d}<div class="ind-s">${s}</div></div>`;
  return `<section class="panel"><div class="panel-head"><div><h2>Cobertura e indicadores</h2><p class="sub">${verTodoCob() ? 'Todas las salas' : esc(gs.map(g => g.nombre).join(', '))} · el ciclo elegido comparado con el anterior. Pase el mouse sobre las barras para ver el detalle.</p></div>
    <div class="row"><label class="f" style="margin:0">Ciclo<select id="fIndCiclo">${ciclos.map((cc, i) => i ? `<option value="${i}" ${i === idx ? 'selected' : ''}>${esc(nombreCiclo(cc))}${i === 5 ? ' (en curso)' : ''}</option>` : '').join('')}</select></label>
      ${verTodoCob() ? `<label class="f" style="margin:0">Incluir<select id="fCobTipo">${[['Sucursal','Solo sucursales'],['TODOS','Sucursales y áreas']].map(([v,t]) => `<option value="${v}" ${fCobTipo === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
      ${gs.length > 1 ? `<label class="f" style="margin:0">Grupo<select id="fCobGr"><option value="TODOS">${verTodoCob() ? 'Todos los grupos' : 'Todos mis grupos'}</option>${gs.map(g => `<option value="${g.id}" ${fCobGr === g.id ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('')}</select></label>` : ''}
      <button class="btn btn-sm" id="btnExpCob" style="align-self:flex-end">⬇ Excel por sala</button></div></div>
    <div class="ind-grid k4">
      ${kpi('Cobertura', A.cob == null ? '—' : f1c(A.cob) + ' %', deltaCob(A.cob, B.cob, B.c), `${A.dot} de ${A.total} salas dotadas · ${A.pidio} pidieron`)}
      ${kpi('Enviaron a tiempo', A.pctTiempo == null ? '—' : f1c(A.pctTiempo) + ' %', deltaCob(A.pctTiempo, B.pctTiempo, B.c), `hasta el día ${fases(c).envio[1].getDate() - 1} · ${A.aTiempo} de ${A.pedV.length} solicitudes${A.pedV.length < A.ped.length ? ' (sin históricos)' : ''}`)}
      ${kpi('Días para confirmar', f1c(A.dConf), deltaCob(A.dConf, B.dConf, B.c, false, ' días'), 'promedio desde el envío · meta 5 días', A.dConf > 5 ? 'alerta' : '')}
      ${kpi('Días para entregar', f1c(A.dEnt), deltaCob(A.dEnt, B.dEnt, B.c, false, ' días'), `promedio desde la confirmación${porEnt ? ` · ${plural(porEnt, 'sala por entregar', 'salas por entregar')}` : ''}`)}
    </div>
    <div class="graf-grid">
      <div class="graf"><h3>Estado de las salas por ciclo</h3><p class="sub">El número arriba de cada columna es el % de salas dotadas.</p><div class="cols">${colEst}</div>${leyenda}</div>
      <div class="graf"><h3>Cobertura por grupo · ${esc(nombreCiclo(c))}</h3><p class="sub">% de salas dotadas de cada aprobador.</p><div class="hbs">${barrasG}</div></div>
      <div class="graf"><h3>Días para confirmar por aprobador</h3><p class="sub">La línea punteada es la meta de 5 días; en rojo, quien la supera.</p><div class="hbs">${barrasAp}</div></div>
      ${conP ? `<div class="graf"><h3>Consumo por ciclo (Bs)</h3><p class="sub">Valor de lo aprobado y entregado (sin aperturas).</p><div class="cols">${colCons}</div></div>
      <div class="graf"><h3>Consumo por grupo · ${esc(nombreCiclo(c))}</h3><p class="sub">Valor en Bs de lo aprobado y entregado de cada grupo, y su % del total (${fBs(totC)}).</p><div class="hbs">${barrasBsG || '<p class="sub">Sin consumo en este ciclo.</p>'}</div></div>
      <div class="graf"><h3>Mayor consumo por sala o área · ${esc(nombreCiclo(c))}</h3><p class="sub">Las 10 que más consumieron en Bs (sin aperturas).</p><div class="hbs">${barrasBsU || '<p class="sub">Sin consumo en este ciclo.</p>'}</div></div>
      <div class="graf"><h3>Salas fuera de lo normal · ${esc(nombreCiclo(c))}</h3><p class="sub">Consumo del ciclo frente a su promedio de los 3 anteriores (marca negra). Rojo: 50 % o más arriba; amarillo: la mitad o menos.</p><div class="hbs">${barrasF || '<p class="sub">Ninguna sala pidió fuera de lo normal, o todavía no hay ciclos anteriores para comparar.</p>'}</div></div>` : ''}
      <div class="graf"><h3>Sin solicitud en ${esc(nombreCiclo(c))} <span class="chip ${sinSol.length ? 'alerta' : 'Entregada'}">${sinSol.length}</span></h3><p class="sub">Salas y áreas que no enviaron ninguna solicitud en el ciclo.</p>
        <div class="sin-sol">${sinSol.map(u => `<span class="chip">${esc(u.nombre)}</span>`).join('') || '<span class="sub">Todas pidieron. 🎉</span>'}</div></div>
    </div></section>`;
}
function exportarCobertura(){
  const c = cicloActivo(), ciclos = [5,4,3,2,1,0].map(k => cicloMenos(c, k)), W = XL.libro(), h = W.hoja('Cobertura');
  const cab = {b:true, sz:10, color:'FFFFFFFF', fill:'FF1F3864', h:'center', v:'center', wrap:true, bt:'thin', bb:'thin', bl:'thin', br:'thin'};
  const COL = {Entregada:'FFC6EFCE', Aprobada:'FFDDEBF7', Confirmada:'FFE9DDF7', Enviada:'FFFFEB9C', Rechazada:'FFFFC7CE'};
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
