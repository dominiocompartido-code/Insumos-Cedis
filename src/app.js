const SB_URL = 'https://dwmxkpyesvhdqsljslhi.supabase.co';
const SB_KEY = 'sb_publishable_TNAPKgtLvxnUOO0lm8bVDg_xdceHenR';
const H = 3600e3;
let sb = null, sesion = null, rol = {admin:false, grupos:[]};
let G = {}, GL = [], U = {}, UL = [], M = {}, ML = [], pedidos = [];
let listo = false, tab = null, tabPedida = null;
let EXIGIR = false;
let unidadSel = null, borrador = [], solicitanteNom = '', esApertura = false, fechaAp = '';

// ---------- utilidades ----------
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const T = v => v ? Date.parse(v) : null;
const fF = ts => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`; };
const fFH = ts => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const horas = ms => ms / H;
const titulo = s => String(s || '').toLocaleLowerCase('es').replace(/(^|[\s\-(])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es')).trim();
const fDias = h => { const d = h / 24; if(d < 1) return 'menos de 1 día'; const v = d < 10 ? Math.round(d * 10) / 10 : Math.round(d); return `${String(v).replace('.', ',')} ${v === 1 ? 'día' : 'días'}`; };
const hace = ts => { const h = horas(Date.now() - ts); return h < 1 ? 'hace minutos' : h < 24 ? `hace ${Math.round(h)} h` : `hace ${Math.round(h/24)} d`; };
const chip = e => `<span class="chip ${esc(e)}">${esc(e)}</span>`;
const store = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} } };
function toast(m){ const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 4000); }
document.addEventListener('click', e => { const c = e.target.closest('[data-close]'); if(c) $(c.dataset.close).hidden = true; });
function confirmar(msg, o = {}){
  return new Promise(res => {
    const si = $('confirmSi');
    if(o.html) $('confirmMsg').innerHTML = msg; else $('confirmMsg').textContent = msg;
    $('confirmTitulo') && ($('confirmTitulo').textContent = o.titulo || 'Confirmar');
    $('confirmNo').textContent = o.no || 'Cancelar';
    si.textContent = o.si || 'Sí, continuar'; si.className = 'btn ' + (o.tono || 'btn-danger');
    $('mConfirm').hidden = false; si.focus();
    const fin = v => { $('mConfirm').hidden = true; si.onclick = $('confirmNo').onclick = null; res(v); };
    $('confirmSi').onclick = () => fin(true); $('confirmNo').onclick = () => fin(false);
  });
}
function errMsg(e){
  const m = (e && (e.message || e.error_description)) || '';
  if(/permission denied|row-level security/i.test(m)) return 'No tiene permiso para esta acción.';
  if(/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revise su internet e intente de nuevo.';
  return m || 'Ocurrió un error. Intente de nuevo.';
}
function setSync(live, txt){ $('syncDot').classList.toggle('live', live); $('syncTxt').textContent = txt; }
const grupoDe = p => U[p.unidad_id]?.grupo_id || 'SIN';
const matActivo = m => m && m.activo !== false;
const puedeCatalogo = () => rol.admin || rol.grupos.some(g => ['OFC','CEDIS','SIN'].includes(g));
const puedeAprobar = p => rol.admin || rol.grupos.includes(grupoDe(p));
const corto = u => { const m = /^SUC-(\d+)$/.exec(u.id); return m ? m[1] : u.nombre.replace(/^SUC[\s.\-]*/i,'').split(/\s+/)[0].slice(0,6); };
const normP = r => ({...r, ts:T(r.ts), confirmado_ts:T(r.confirmado_ts), entregado_ts:T(r.entregado_ts), anulado_ts:T(r.anulado_ts), tipo:r.tipo || 'Mensual', items:r.items || []});
let anuladas = [];
const claves = (() => { try{ return JSON.parse(localStorage.getItem('fch_claves') || '{}'); }catch(e){ return {}; } })();
const guardarClave = (id, c) => { claves[id] = c; try{ localStorage.setItem('fch_claves', JSON.stringify(claves)); }catch(e){} };
async function hashClave(c){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(c)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }

// ---------- carga ----------
// ---------- notificaciones push ----------
const VAPID_PUB = 'BB38a7OWgCr4T7czdl6gJKfB5T1hs43481W2FQb04tmozB9ntXFNIk9ZkmOOVSw5wBH8pdVJ3wSEuy9iy9DOcBg';
const pushSoportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && location.protocol === 'https:';
const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
async function activarPush(silencioso, unidad){
  if(!pushSoportado()) { if(!silencioso) toast('Este navegador no admite notificaciones. En iPhone, instale la app en la pantalla de inicio.'); return false; }
  try{
    if(Notification.permission !== 'granted'){ if(silencioso) return false; const r = await Notification.requestPermission(); if(r !== 'granted'){ toast('No se activaron las notificaciones.'); render(); return false; } }
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, j) => setTimeout(() => j(new Error('sw')), 8000))]);
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64u(VAPID_PUB)});
    const j = sub.toJSON(), aprob = rol.admin || rol.grupos.length;
    const {error} = await sb.rpc('registrar_push', {p_endpoint:j.endpoint, p_p256dh:j.keys.p256dh, p_auth:j.keys.auth, p_unidad:aprob ? null : (unidad || salaEquipo() || unidadSel || null)});
    if(error) throw error;
    store.set('fch_push', '1');
    if(!silencioso){ reg.showNotification('Notificaciones activadas', {body: aprob ? 'Le avisaremos cuando lleguen solicitudes nuevas.' : 'Le avisaremos cuando confirmen o entreguen sus solicitudes.', icon:'icon-192.png', badge:'icon-192.png'}); toast('Notificaciones activadas en este equipo.'); render(); }
    return true;
  }catch(e){ if(!silencioso) toast('No se pudieron activar las notificaciones: ' + errMsg(e)); return false; }
}
function bannerPush(){
  if(!pushSoportado() || Notification.permission === 'granted' || Notification.permission === 'denied' || store.get('fch_push_no') === '1') return '';
  const aprob = rol.admin || rol.grupos.length;
  return `<div class="notice info push-box"><span>🔔 <strong>Active las notificaciones</strong> para enterarse ${aprob ? 'de las solicitudes nuevas' : 'cuando confirmen o entreguen sus solicitudes'} aunque la app esté cerrada.</span><span style="display:flex;gap:6px"><button class="btn btn-sm" id="btnPushNo">Ahora no</button><button class="btn btn-sm btn-primary" id="btnPush">Activar</button></span></div>`;
}
let KIT = [], P = {};
const verPrecios = () => rol.admin || rol.grupos.length > 0;
let INV = {}, INV_INFO = null;
async function cargarInventario(){ INV = {}; INV_INFO = null; if(!verTablero()) return;
  try{ const [a, b] = await Promise.all([sb.from('inventario').select('*'), sb.from('inventario_cargas').select('*').order('ts', {ascending:false}).limit(1)]);
    (a.data || []).forEach(r => INV[r.codigo] = +r.stock || 0); const l = (b.data || []).slice().sort((x, y) => new Date(y.ts) - new Date(x.ts)); INV_INFO = l[0] || null; }catch(e){} }
async function cargarPrecios(){ P = {}; if(!verPrecios()) return; try{ const {data} = await sb.from('precios').select('*'); (data || []).forEach(r => P[r.codigo] = +r.precio); }catch(e){} }
const fBs = n => 'Bs ' + (+n || 0).toLocaleString('es-BO', {minimumFractionDigits:2, maximumFractionDigits:2});
const precioDe = (p, cod) => { const v = p && p.precios && p.precios[cod] != null ? +p.precios[cod] : P[cod]; return v != null && !isNaN(v) ? v : null; };
function valorPedido(p, entregado){ const its = entregado && p.items_entregados ? p.items_entregados : p.items; let total = 0, sin = 0; its.forEach(i => { const v = precioDe(p, i.codigo); if(v == null){ if(+i.cantidad) sin++; } else total += v * (+i.cantidad || 0); }); return {total, sin}; }
async function cargarBase(){
  const kitP = sb.from('config').select('*').then(r => { const k = (r.data || []).find(x => x.clave === 'kit_apertura'); KIT = k ? k.valor || [] : []; EXIGIR = (r.data || []).some(x => x.clave === 'exigir_ingreso' && x.valor === true); }, () => {});
  const [g, u, m] = await Promise.all([
    sb.from('grupos').select(rol.admin ? '*' : 'id,nombre,tipo,aprobador,orden').order('orden'),
    sb.from('unidades').select('*'),
    sb.from('maestro').select('*').order('descripcion'),
  ]);
  await kitP;
  for(const r of [g,u,m]) if(r.error) throw r.error;
  GL = g.data; G = Object.fromEntries(GL.map(x => [x.id, x]));
  UL = u.data.sort((a,b) => ordU(a) - ordU(b) || a.nombre.localeCompare(b.nombre,'es')); U = Object.fromEntries(UL.map(x => [x.id, x]));
  ML = m.data; M = Object.fromEntries(ML.map(x => [x.codigo, x]));
}
function ordU(u){ const m = /^SUC-(\d+)$/.exec(u.id); return u.tipo !== 'Sucursal' ? 100000 + (u.tipo === 'CEDIS' ? 1000 : 0) : m ? +m[1] : 5000; }
async function cargarPedidos(){
  const {data, error} = await sb.from('pedidos').select('*').order('ts', {ascending:false}).limit(3000);
  if(error){ setSync(false, 'Sin conexión'); return; }
  const todos = data.map(normP); pedidos = todos.filter(p => p.estado !== 'Anulada'); anuladas = todos.filter(p => p.estado === 'Anulada'); setSync(true, 'En vivo'); renderSuave();
}
let recarga; const programar = fn => { clearTimeout(recarga); recarga = setTimeout(fn, 300); };

// ---------- roles y pestañas ----------
const verTablero = () => rol.admin || rol.grupos.some(g => g === 'OFC' || g === 'CEDIS');
const esJefatura = () => !rol.admin && verTablero();
const SUB_TABLERO = [['tablero','Resumen'],['bandeja','Por confirmar'],['preparacion','Preparación'],['entregar','Por entregar']];
function tabsDisponibles(){
  const t = [['solicitar','Solicitar']]; if(rol.admin || !rol.grupos.length) t.push(['seguimiento','Seguimiento']);
  if(rol.admin) t.push(['tablero','Tablero', SUB_TABLERO], ['inventario','Inventario'], ['cobertura','Cobertura'], ['todos','Todos']);
  else if(verTablero()) t.push(['tablero','Tablero', SUB_TABLERO], ['inventario','Inventario'], ['grupo','Mi grupo'], ['cobertura','Cobertura'], ['todos','Todos']);
  else if(rol.grupos.length) t.push(['bandeja','Por confirmar'], ['grupo','Mi grupo'], ['cobertura','Cobertura']);
  t.push(['materiales','Materiales']);
  if(rol.admin) t.push(['config','Configuración']);
  return t;
}
const planoTabs = ts => ts.flatMap(([id,l,sub]) => sub ? sub : [[id,l]]);
let subAbierto = false;
function actualizarInsignia(c){
  const n = (c.bandeja || 0) + (rol.admin ? (c.entregar || 0) : 0);
  try{ document.title = (n ? `(${n}) ` : '') + 'Farmacias Chávez'; }catch(e){}
  try{ if(navigator.setAppBadge){ n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } }catch(e){}
}
function contadores(){
  const c = {};
  c.bandeja = pedidos.filter(p => p.estado === 'Enviada' && puedeAprobar(p)).length;
  if(rol.admin){ c.entregar = pedidos.filter(p => p.estado === 'Confirmada').length; c.tablero = c.bandeja + c.entregar; }
  else if(verTablero()){ c.entregar = pedidos.filter(p => p.estado === 'Confirmada').length; c.tablero = c.bandeja; }
  return c;
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if(!b) return; if(!b.dataset.grupo) cerrarMenu();
  const id = b.dataset.tab, grupo = SUB_TABLERO.some(x => x[0] === tab);
  if(b.dataset.grupo){ if(grupo && subAbierto){ subAbierto = false; render(); return; } subAbierto = true; if(grupo) { render(); return; } }
  tab = id; sel.clear(); store.set('fch_tab', tab); render(); });
$('subtabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if(b){ tab = b.dataset.tab; sel.clear(); store.set('fch_tab', tab); render(); } });
let sel = new Set(), visibles = [];
function cerrarMenu(){ document.body.classList.remove('menu-abierto'); $('btnMenu')?.setAttribute('aria-expanded', 'false'); }
const esEscritorio = () => matchMedia('(min-width:901px)').matches;
try{ if(localStorage.getItem('fch_menu_oculto') === '1') document.body.classList.add('menu-oculto'); }catch(e){}
$('btnMenu').addEventListener('click', () => {
  if(esEscritorio()){ const oc = document.body.classList.toggle('menu-oculto'); try{ localStorage.setItem('fch_menu_oculto', oc ? '1' : '0'); }catch(e){} $('btnMenu').setAttribute('aria-expanded', String(!oc)); return; }
  document.documentElement.style.setProperty('--menu-top', Math.max(0, document.querySelector('header.top').getBoundingClientRect().bottom) + 'px');
  const ab = document.body.classList.toggle('menu-abierto'); $('btnMenu').setAttribute('aria-expanded', String(ab)); });
$('sideFondo').addEventListener('click', cerrarMenu);
const ajustarAltoHdr = () => { const h = document.querySelector('header.top')?.offsetHeight || 62; document.documentElement.style.setProperty('--hdr-h', h + 'px'); };
addEventListener('resize', ajustarAltoHdr); setTimeout(ajustarAltoHdr, 0); setTimeout(ajustarAltoHdr, 800);
function vBloqueo(){
  if(!EXIGIR) return '';
  if(!sesion) return `<section class="panel bloqueo"><div class="bloqueo-in"><div class="bloqueo-ico">🔐</div><h2>Ingrese con su usuario</h2><p class="sub">Para enviar o ver solicitudes de insumos, ingrese con el correo y la contraseña de su sala o área.</p><button class="btn btn-primary" data-ir-login="1">Ingresar</button><p class="sub" style="margin-top:14px">¿No tiene usuario? Pídalo a Logística CEDIS.</p></div></section>`;
  if(!rol.admin && !rol.grupos.length && !salaUsuario()) return `<section class="panel bloqueo"><div class="bloqueo-in"><div class="bloqueo-ico">⏳</div><h2>Su usuario no está vinculado a una sala</h2><p class="sub">Ingresó como <strong>${esc(sesion.user?.email || '')}</strong>, pero todavía no está asignado a ninguna sucursal o área. Comuníquese con Logística CEDIS.</p><button class="btn" data-ir-login="1">Salir</button></div></section>`;
  return '';
}
document.addEventListener('click', e => { if(e.target.closest?.('[data-ir-login]')) $('btnLogin').click(); });
function render(){
  if(!listo) return;
  const ts = tabsDisponibles(); if(!tab || !planoTabs(ts).some(t => t[0] === tab)) tab = ts[0][0];
  const c = contadores(); actualizarInsignia(c); const enGrupo = SUB_TABLERO.some(x => x[0] === tab) && ts.some(t => t[2]);
  if(enGrupo && !render._g) subAbierto = true; if(!enGrupo) subAbierto = false; render._g = enGrupo;
  const ICO = {solicitar:'📝', seguimiento:'🔎', tablero:'📊', bandeja:'✅', preparacion:'📦', entregar:'🚚', cobertura:'🗺️', todos:'📋', grupo:'👥', materiales:'🧴', config:'⚙️', inventario:'🏬'};
  const badge = (id, n) => n ? ` <span class="badge">${n}</span>` : '';
  $('tabs').innerHTML = ts.map(([id,l,sub]) => sub
    ? `<button role="tab" data-tab="${id}" data-grupo="1" class="${enGrupo ? 'grupo-on' : ''}" aria-selected="false" aria-expanded="${subAbierto}"><span class="ico">${ICO[id] || '•'}</span>${l}${badge(id, c[id])}<span class="caret" aria-hidden="true">&#9662;</span></button>` +
      (subAbierto ? sub.map(([sid, sl], k) => `<button role="tab" class="sub${k === 0 ? ' sub-ini' : ''}${k === sub.length - 1 ? ' sub-fin' : ''}" data-tab="${sid}" aria-selected="${tab === sid}">${sid === 'tablero' ? 'Resumen' : sl}${sid !== 'tablero' ? badge(sid, c[sid]) : ''}</button>`).join('') : '')
    : `<button role="tab" data-tab="${id}" aria-selected="${tab === id}"><span class="ico">${ICO[id] || '•'}</span>${l}${badge(id, c[id])}</button>`).join('');
  $('subtabs').hidden = true; $('subtabs').innerHTML = '';
  const bloqueo = vBloqueo(); if(bloqueo){ $('tabs').innerHTML = ''; $('main').innerHTML = bloqueo; actualizarCampana(); return; }
  const V = {solicitar:vSolicitar, seguimiento:vSeguimiento, materiales:vMateriales, bandeja:vBandeja, grupo:vGrupo, tablero:vTablero, entregar:vEntregar, preparacion:vPreparacion, cobertura:vCobertura, todos:vTodos, config:vConfig, inventario:vInventario};
  const foco = document.activeElement?.id, pos = document.activeElement?.selectionStart;
  $('main').innerHTML = V[tab]();
  if(foco && $(foco) && $(foco).tagName === 'INPUT'){ $(foco).focus(); try{ $(foco).setSelectionRange(pos,pos); }catch(e){} }
  if(tab === 'solicitar') pintaBorrador();
  if(tab === 'materiales') pintaMateriales();
  actualizarCampana();
}

function renderSuave(){
  // no rehacer formularios mientras alguien escribe; solo actualizar contadores
  if(tab === 'solicitar' || tab === 'config' || document.activeElement?.classList?.contains('combo-in')){ const c = contadores(); document.querySelectorAll('#tabs [data-tab]').forEach(b => { const n = c[b.dataset.tab]; let s = b.querySelector('.badge'); if(n){ if(!s){ s = document.createElement('span'); s.className = 'badge'; b.append(' ', s); } s.textContent = n; } else if(s) s.remove(); }); return; }
  render();
}
document.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.matches('tr[data-ver]')) abrirDet(e.target.dataset.ver); });

// ---------- selector de sucursal / área ----------
// buscador de sucursal o área: se escribe para filtrar o se abre la lista completa
function selectorUnidad(id, val){
  const u = val && U[val];
  return `<div class="combo"><input id="${id}" class="combo-in" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-lista"
    placeholder="Escriba el número o nombre (ej.: 43 o Viedma)" value="${u ? esc(u.nombre) : ''}" data-actual="${u ? esc(u.nombre) : ''}">
    <button type="button" class="combo-btn" data-combo-abrir="${id}" aria-label="Ver la lista completa" tabindex="-1">▾</button>
    <div class="results combo-lista" id="${id}-lista" role="listbox" hidden></div></div>`;
}
const normTxt = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function filtrarUnidades(q){
  const act = UL.filter(u => u.activa), t = normTxt(q).trim();
  if(!t) return act;
  const num = /^\d+$/.test(t) ? t : null, pal = t.split(/\s+/);
  return act.map(u => {
    const n = normTxt(u.nombre), m = /^SUC-(\d+)$/.exec(u.id); let p = 0;
    if(num && m && m[1] === num) p = 100;
    else if(num && u.codigo_sala === num) p = 90;
    else if(num && m && m[1].startsWith(num)) p = 60;
    else if(num && (u.codigo_sala || '').startsWith(num)) p = 50;
    else if(pal.every(w => n.includes(w))) p = n.startsWith(t) || n.replace(/^suc[\s.\-]*\d*\s*/, '').startsWith(t) ? 40 : 30;
    return {u, p};
  }).filter(x => x.p).sort((a,b) => b.p - a.p || ordU(a.u) - ordU(b.u)).map(x => x.u);
}
let comboAct = -1;
function pintaCombo(inp, q){
  const box = $(inp.id + '-lista'), l = filtrarUnidades(q); comboAct = l.length ? 0 : -1;
  let html = '', ult = null;
  l.forEach((u, i) => { const g = u.tipo === 'Sucursal' ? 'Sucursales' : u.tipo;
    if(!q.trim() && g !== ult){ html += `<div class="combo-grp">${esc(g)}</div>`; ult = g; }
    html += `<button type="button" role="option" data-u="${esc(u.id)}" data-i="${i}" class="${i === 0 ? 'act' : ''}"><span>${esc(u.nombre)}</span><span class="chip">${esc(u.tipo === 'Sucursal' ? (u.codigo_sala || 'sala') : u.tipo)}</span></button>`; });
  box.innerHTML = html || '<div class="none">No se encontró. Pruebe con el número de sala o parte del nombre.</div>';
  box.hidden = false; inp.setAttribute('aria-expanded', 'true');
}
function cerrarCombo(inp, restaurar){ const box = inp && $(inp.id + '-lista'); if(!box) return; box.hidden = true; inp.setAttribute('aria-expanded', 'false'); if(restaurar) inp.value = inp.dataset.actual || ''; }
function moverCombo(inp, d){ const bs = [...$(inp.id + '-lista').querySelectorAll('button[data-u]')]; if(!bs.length) return; comboAct = (comboAct + d + bs.length) % bs.length; bs.forEach((b, i) => b.classList.toggle('act', i === comboAct)); bs[comboAct].scrollIntoView({block:'nearest'}); }
document.addEventListener('focusin', e => { if(e.target.classList?.contains('combo-in')){ e.target.select(); pintaCombo(e.target, ''); } });
document.addEventListener('focusout', e => { if(e.target.classList?.contains('combo-in')){ const inp = e.target; setTimeout(() => { if(document.activeElement !== inp) cerrarCombo(inp, true); }, 180); } });
document.addEventListener('keydown', e => {
  const inp = e.target; if(!inp.classList?.contains('combo-in')) return;
  const box = $(inp.id + '-lista');
  if(e.key === 'ArrowDown'){ e.preventDefault(); box.hidden ? pintaCombo(inp, inp.value) : moverCombo(inp, 1); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); moverCombo(inp, -1); }
  else if(e.key === 'Enter'){ e.preventDefault(); const b = box.querySelectorAll('button[data-u]')[comboAct]; if(b) elegirUnidad(b.dataset.u); }
  else if(e.key === 'Escape'){ cerrarCombo(inp, true); inp.blur(); }
});
document.addEventListener('mousedown', e => { if(e.target.closest('.combo-lista, .combo-btn')) e.preventDefault(); });
// elección manual de sala: en el Solicitar, la primera vez que una sucursal se elige en este equipo, se pregunta si el equipo es solo de esa sala
async function elegirUnidad(id){
  setUnidad(id);
  const u = U[id];
  if(tab !== 'solicitar' || !u || u.tipo !== 'Sucursal' || rol.admin || rol.grupos.length || sesion || EXIGIR || salaEquipo() || store.get('fch_equipo_compartido') === '1') return;
  const si = await confirmar(`<div class="conf-envio"><span class="sub" style="margin:0">¿Este celular o computadora lo usa solo</span><b>${esc(u.nombre)}</b></div><p class="sub" style="margin:8px 0 0">Si responde que sí, la app se abrirá siempre con esta sucursal elegida y no se podrá cambiar por error. Si lo usan varias salas, responda "No, lo usan varias".</p>`, {html:true, titulo:'¿Equipo de esta sala?', si:'Sí, solo esta sala', no:'No, lo usan varias', tono:'btn-primary'});
  if(si){ store.set('fch_sala_equipo', id); toast(`Equipo vinculado a ${u.nombre}.`); } else store.set('fch_equipo_compartido', '1');
  render();
}
function setUnidad(id){
  unidadSel = id && U[id] ? id : null;
  if(unidadSel) store.set('fch_unidad', unidadSel);
  borrador = [];
  render();
}
document.addEventListener('change', e => {
  if(e.target.id === 'nSol'){ e.target.value = titulo(e.target.value); solicitanteNom = e.target.value; }
  const id = e.target.id;
  if(id === 'fEnt'){ fEnt = e.target.value; render(); }
  if(id === 'fPrep'){ fPrep = e.target.value; render(); }
  if(id === 'fTodEst'){ fTodEst = e.target.value; render(); }
  if(id === 'fTodGr'){ fTodGr = e.target.value; render(); }
  if(id === 'fGrupoEst'){ fGrupoEst = e.target.value; render(); }
  if(id === 'fCfgGr'){ fCfgGr = e.target.value; render(); }
  if(e.target.dataset.nk != null){ const k = +e.target.dataset.nk, v = parseInt(e.target.value); if(v >= 0) borrador[k].cantidad = v; else e.target.value = borrador[k].cantidad; pintaResumen(); }
  if(e.target.dataset.ug){ asignarGrupo(e.target.dataset.ug, e.target.value, e.target); }
  if(e.target.dataset.sel){ const id = e.target.dataset.sel; e.target.checked ? sel.add(id) : sel.delete(id); render(); }
  if(id === 'selTodos'){ e.target.checked ? visibles.forEach(v => sel.add(v)) : visibles.forEach(v => sel.delete(v)); render(); }
  if(id === 'fMatCat'){ fMatCat = e.target.value; pintaMateriales(); }
  if(e.target.dataset.trasp){ const id = e.target.dataset.trasp, v = e.target.value.trim(), q = pedidos.find(x => x.id === id);
    sb.rpc('guardar_traspaso', {p_id:id, p_nro:v}).then(({error}) => { if(error){ toast(errMsg(error)); return; } if(q) q.nro_traspaso = v || null; toast(v ? `${q?.codigo}: traspaso ${v} guardado.` : `${q?.codigo}: traspaso borrado.`); }); }
  if(e.target.dataset.cat){ cambiarCategoria(e.target.dataset.cat, e.target.value, e.target); }
  if(e.target.dataset.precio){ const cod = e.target.dataset.precio, raw = e.target.value.trim(), v = +raw;
    if(raw === '' || isNaN(v) || v < 0){ toast('Ingrese un precio válido (0 o más).'); e.target.value = P[cod] != null ? +P[cod].toFixed(2) : ''; return; }
    sb.rpc('guardar_precio', {p_codigo:cod, p_precio:v}).then(({error}) => { if(error){ toast(errMsg(error)); return; } if(v == null) delete P[cod]; else P[cod] = v; toast(`${M[cod]?.descripcion}: ${v == null ? 'sin precio' : fBs(v)}.`); }); }
  if(id === 'fCobTipo'){ fCobTipo = e.target.value; render(); }
  if(id === 'fCobGr'){ fCobGr = e.target.value; render(); }
  if(id === 'fCobSolo'){ fCobSolo = e.target.checked; render(); }
  if(id === 'fCobCiclo'){ fCobCiclo = +e.target.value; render(); }
  if(id === 'fPrepCiclo'){ fPrepCiclo = +e.target.value; render(); }
  if(id === 'fPrepAlc'){ fPrepAlc = e.target.value; render(); }
});
document.addEventListener('input', e => {
  if(e.target.id === 'fMatQ'){ fMatQ = e.target.value; pintaMateriales(); }
  if(e.target.id === 'fGrupoQ'){ fGrupoQ = e.target.value; const g = $('grupoHist'); if(g) g.innerHTML = histGrupo(pedidos.filter(p => rol.grupos.includes(grupoDe(p)))); }
  if(e.target.id === 'fCobQ'){ fCobQ = e.target.value; render(); }
  if(e.target.classList?.contains('combo-in')) pintaCombo(e.target, e.target.value);
  if(e.target.id === 'nSol') solicitanteNom = e.target.value;
  if(e.target.id === 'nFechaAp') fechaAp = e.target.value;
  if(e.target.id === 'nBuscar') buscarInsumo(e.target.value);
  if(e.target.id === 'fTodQ'){ fTodQ = e.target.value; render(); }
  if(e.target.id === 'fCfgQ'){ fCfgQ = e.target.value; render(); }
});

// ---------- vista: solicitar ----------
const salaUsuario = () => !rol.admin && !rol.grupos.length && rol.unidad && U[rol.unidad]?.activa ? rol.unidad : null;
const salaEquipo = () => { if(salaUsuario()) return salaUsuario(); if(rol.admin || rol.grupos.length) return null; const id = store.get('fch_sala_equipo'); return id && U[id] && U[id].activa ? id : null; };
function vSolicitar(){
  const eq = salaEquipo(); if(eq) unidadSel = eq;
  const u = unidadSel && U[unidadSel];
  let h = `<section class="panel"><div class="panel-head"><div><h2>Nueva solicitud de insumos</h2><p class="sub">${eq ? 'Revise las cantidades y envíe.' : 'Elija su sucursal o área, revise las cantidades y envíe.'} Quien aprueba su grupo la confirmará.</p></div></div>
    ${eq && salaUsuario() ? `<div class="equipo-box"><span>👤 Solicita como <strong>${esc(U[eq].nombre)}</strong></span></div>` : eq ? `<div class="equipo-box"><span>🔒 Este equipo está vinculado a su sala</span><button class="btn btn-sm" id="btnCambiarSala">Cambiar sala</button></div>` : `<label class="f">Sucursal o área${selectorUnidad('selUnidad', unidadSel)}</label>`}`;
  if(u && !rol.admin && !rol.grupos.length) h = bloqueAvisos() + h;
  if(!u){ return lineaCicloMini() + h + `<div class="notice info">Elija su sucursal o área para empezar. Luego agregue los insumos que necesita o cargue su pedido anterior.</div></section>`; }
  const g = G[u.grupo_id];
  const pendiente = pedidos.find(p => p.unidad_id === u.id && p.estado === 'Enviada');
  h += `<div class="unidad-box" data-g="${esc(u.grupo_id)}"><b>${esc(u.nombre)}</b><span class="sub" style="margin:0">${esc(u.tipo)}${u.muelle ? ' · ' + esc(u.muelle) : ''} · la confirma <strong>${esc(g?.aprobador || 'Logística CEDIS')}</strong></span></div>`;
  if(esApertura) h += `<div class="notice apertura"><strong>Solicitud de APERTURA.</strong> Se puede enviar en cualquier fecha, la supervisora la ve primero y la sala igual puede enviar su pedido mensual. <button class="btn btn-sm" id="btnQuitarApertura">Es un pedido normal</button></div>`;
  else if(puedeKit(u)) h += `<div class="notice info kit-box"><span>${salaNueva(u) ? '<strong>Sala nueva.</strong> Para la primera dotación use el kit de apertura: ' : 'Si es la apertura de esta sala, puede cargar el '}${plural(KIT.length, 'insumo estándar', 'insumos estándar')}.</span><button class="btn btn-sm btn-primary" id="btnKit">Cargar kit de apertura</button></div>`;
  if(pendiente && !esApertura) h += `<div class="notice">Esta ${u.tipo === 'Sucursal' ? 'sucursal' : 'área'} ya tiene la solicitud <strong>${esc(pendiente.codigo)}</strong> esperando confirmación (${hace(pendiente.ts)}). Puede enviar otra si hace falta.</div>`;
  h += `<div class="grid g3"><label class="f">Nombre de quien solicita *<input id="nSol" value="${esc(solicitanteNom)}" placeholder="Ej: Dra. Ana Rojas" maxlength="100"></label>${esApertura ? `<label class="f">Fecha de inauguración *<input type="date" id="nFechaAp" value="${esc(fechaAp)}" min="${hoyISO()}"></label>` : ''}</div>
    <div class="row"><div class="search" style="flex:1;min-width:240px"><input id="nBuscar" placeholder="Agregar insumo: busque por código o nombre…" autocomplete="off"><div class="results" id="nRes" hidden></div></div>
    <button class="btn btn-danger" id="btnVaciar" ${borrador.length ? '' : 'disabled'}>Eliminar todo</button></div>
    ${(() => { const ant = ultimoPedido(u.id); return ant ? `<div class="anterior"><span>Último pedido: <strong>${esc(ant.codigo)}</strong> · ${fF(ant.ts)} · ${ant.items.length} insumos · ${chip(ant.estado)}</span><button class="btn btn-accent btn-sm" id="btnAnterior">Cargar pedido anterior</button></div>` : ''; })()}
    <div class="tbl-wrap"><table><thead><tr><th class="hide-sm">Código</th><th>Insumo</th><th class="num hide-sm">Unidad</th><th class="num">Cantidad</th><th class="num"><span class="hide-sm">Quitar</span></th></tr></thead><tbody id="nItems"></tbody></table></div>
    <div class="row" style="justify-content:space-between"><span class="sub" id="nResumen" style="margin:0"></span><button class="btn btn-primary btn-lg" id="nEnviar">Enviar solicitud</button></div></section>`;
  return h;
}
const ultimoPedido = uid => { const l = pedidos.filter(p => p.unidad_id === uid).sort((a,b) => b.ts - a.ts); return l.find(p => p.tipo !== 'Apertura') || l[0]; };
const fDia = d => { const x = typeof d === 'string' ? new Date(d + 'T12:00:00') : new Date(d); return `${x.getDate()}/${x.getMonth() + 1}/${x.getFullYear()}`; };
const diasA = d => Math.round((new Date(d + 'T12:00:00') - new Date(hoyISO() + 'T12:00:00')) / 864e5);
const txtAbre = d => { if(!d) return 'sin fecha de inauguración'; const n = diasA(d); return n > 1 ? `abre en ${n} días (${fDia(d)})` : n === 1 ? `abre mañana (${fDia(d)})` : n === 0 ? 'abre hoy' : `abrió hace ${plural(-n, 'día', 'días')}`; };
const ordenApert = (a,b) => ((b.tipo === 'Apertura') - (a.tipo === 'Apertura')) || (a.tipo === 'Apertura' ? String(a.fecha_apertura || '9999').localeCompare(String(b.fecha_apertura || '9999')) : 0);
const salaNueva = u => u && u.creada_ts && (Date.now() - Date.parse(u.creada_ts)) < 120 * 864e5 && !pedidos.some(p => p.unidad_id === u.id && p.tipo === 'Apertura' && p.estado !== 'Rechazada');
const puedeKit = u => KIT.length && u && (salaNueva(u) || rol.admin || rol.grupos.length);
function cargarKit(){
  const l = KIT.map(k => M[k.codigo] && matActivo(M[k.codigo]) ? {codigo:k.codigo, descripcion:M[k.codigo].descripcion, unidad:M[k.codigo].unidad, categoria:M[k.codigo].categoria, cantidad:+k.cantidad} : null).filter(Boolean);
  borrador = l; esApertura = true; pintaBorrador(); render(); toast(`Se cargó el kit de apertura (${plural(l.length, 'insumo', 'insumos')}). Ajuste lo que haga falta antes de enviar.`);
}
function cargarAnterior(){
  const ant = ultimoPedido(unidadSel); if(!ant) return; esApertura = false;
  const quitados = ant.items.filter(i => M[i.codigo] && !matActivo(M[i.codigo])).length;
  borrador = ant.items.filter(i => !M[i.codigo] || matActivo(M[i.codigo])).map(i => ({codigo:i.codigo, descripcion:M[i.codigo]?.descripcion || i.descripcion, unidad:M[i.codigo]?.unidad || i.unidad, categoria:M[i.codigo]?.categoria || i.categoria, cantidad:+i.cantidad || 0}));
  if(ant.solicitante && !solicitanteNom){ solicitanteNom = ant.solicitante; if($('nSol')) $('nSol').value = ant.solicitante; }
  pintaBorrador(); toast(`Se cargó el pedido ${ant.codigo}${ant.items_original ? ' con las cantidades confirmadas' : ''}. Puede editarlo antes de enviar.${quitados ? ` Se ${quitados === 1 ? 'quitó 1 material eliminado' : `quitaron ${quitados} materiales eliminados`} del maestro.` : ''}`);
}
function pintaBorrador(){
  const tb = $('nItems'); if(!tb) return;
  tb.innerHTML = borrador.length ? borrador.map((i,k) => `<tr><td class="code hide-sm">${esc(i.codigo)}</td><td>${esc(i.descripcion)}<div class="sub show-sm">${esc(i.codigo)} · ${esc(i.unidad)}</div></td><td class="num hide-sm">${esc(i.unidad)}</td>
    <td class="num"><input type="number" min="0" inputmode="numeric" class="qty" id="nq-${k}" data-nk="${k}" value="${i.cantidad}" aria-label="Cantidad de ${esc(i.descripcion)}"></td><td class="num"><button class="btn btn-sm btn-danger" data-nd="${k}" aria-label="Quitar ${esc(i.descripcion)}">✕</button></td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">Busque un insumo arriba para agregarlo a la solicitud.</td></tr>';
  if($('btnVaciar')) $('btnVaciar').disabled = !borrador.length;
  pintaResumen();
}
function pintaResumen(){
  const r = $('nResumen'); if(!r) return;
  const con = borrador.filter(i => i.cantidad > 0), cero = borrador.length - con.length;
  r.textContent = `${con.length} insumos con cantidad${cero ? ` · ${cero} en cero no se enviarán` : ''}`;
}
function buscarInsumo(q){
  const box = $('nRes'); q = q.toLowerCase().trim(); if(!q){ box.hidden = true; return; }
  const f = ML.filter(a => matActivo(a) && (a.codigo.toLowerCase().includes(q) || a.descripcion.toLowerCase().includes(q))).slice(0, 30);
  box.innerHTML = f.length ? f.map(a => `<button type="button" data-add="${esc(a.codigo)}"><span><span class="mono" style="color:var(--brand);font-weight:600">${esc(a.codigo)}</span> ${esc(a.descripcion)}</span><span class="chip">${esc(a.unidad)}</span></button>`).join('')
    : '<div class="none">Ese insumo no está en el maestro. Avise a logística CEDIS.</div>';
  box.hidden = false;
}
document.addEventListener('click', async e => {
  const t = e.target;
  if(!t.closest('.search') && $('nRes')) $('nRes').hidden = true;
  const add = t.closest('[data-add]');
  if(add){ const a = M[add.dataset.add]; const ex = borrador.findIndex(i => i.codigo === a.codigo);
    if(ex >= 0){ toast('Ya está en la lista; cambie la cantidad.'); }
    else borrador.push({codigo:a.codigo, descripcion:a.descripcion, unidad:a.unidad, categoria:a.categoria, cantidad:1});
    $('nBuscar').value = ''; $('nRes').hidden = true; pintaBorrador(); const k = ex >= 0 ? ex : borrador.length - 1; const q = $('nq-' + k); q && (q.focus(), q.select()); return; }
  const nd = t.closest('[data-nd]'); if(nd){ borrador.splice(+nd.dataset.nd, 1); pintaBorrador(); return; }
  if(t.id === 'btnVaciar'){ if(borrador.length && await confirmar(`¿Eliminar los ${borrador.length} insumos de la lista? Tendrá que agregarlos de nuevo.`)){ borrador = []; esApertura = false; fechaAp = ''; pintaBorrador(); render(); toast('Lista vacía.'); } return; }
  if(t.id === 'btnAnterior'){ cargarAnterior(); return; }
  if(t.id === 'nEnviar') enviar(t);
  if(t.id === 'btnKit'){ if(!borrador.length || await confirmar(`Ya tiene ${plural(borrador.length, 'insumo', 'insumos')} en la lista. ¿Reemplazarlos por el kit de apertura?`, {titulo:'Kit de apertura', si:'Sí, reemplazar', tono:'btn-primary'})) cargarKit(); return; }
  if(t.id === 'btnQuitarApertura'){ esApertura = false; render(); toast('Se enviará como pedido mensual.'); return; }
  const ver = t.closest('[data-ver]'); if(ver && !t.closest('.modal') && !t.closest('.chk') && !t.closest('[data-anular]') && !t.closest('[data-conf-ap]') && !t.closest('[data-trasp]')) abrirDet(ver.dataset.ver);
  const ir = t.closest('[data-ir]'); if(ir){ $('mAlertas').hidden = true; tab = ir.dataset.ir; sel.clear(); render(); scrollTo(0, 0); return; }
  if(t.closest('#btnAlertas')){ abrirAlertas(); return; }
  if(t.id === 'btnPush'){ activarPush(false); return; }
  if(t.id === 'btnPushNo'){ store.set('fch_push_no', '1'); render(); return; }
  if(t.id === 'btnPermiso'){ activarPush(false).then(ok => { if(ok) notificarDelDia(); abrirAlertas(); }); return; }
  if(t.id === 'btnConfVarios') confirmarVarios(t);
  if(t.id === 'btnEntVarios') entregarVarios(t);
  if(t.id === 'btnReporte') generarReporte(t);
  if(t.id === 'btnExpCob') exportarCobertura();
  if(t.id === 'btnLimpiarSel'){ sel.clear(); render(); }
  const op = t.closest('.combo-lista [data-u]'); if(op){ elegirUnidad(op.dataset.u); return; }
  const ab = t.closest('[data-combo-abrir]'); if(ab){ const inp = $(ab.dataset.comboAbrir); if($(inp.id + '-lista').hidden){ inp.focus(); } else { cerrarCombo(inp, true); inp.blur(); } return; }
  const cu = t.closest('[data-cerrar]'); if(cu){ cerrarSala(cu.dataset.cerrar, cu.dataset.activa === '1', cu); return; }
  const ce = t.closest('[data-cobest]'); if(ce){ const v = ce.dataset.cobest; fCobEst = (fCobEst === v && v !== 'TODOS') ? 'TODOS' : v; render(); return; }
  if(t.id === 'btnCambiarSala'){ const id = salaEquipo();
    if(id && await confirmar(`Este equipo está vinculado a ${U[id].nombre}. ¿Quiere desvincularlo y elegir otra sucursal o área? Las solicitudes llegan al aprobador de la sala que elija.`, {titulo:'Cambiar sala', si:'Sí, cambiar'})){ store.set('fch_sala_equipo', ''); store.set('fch_equipo_compartido', '1'); unidadSel = null; store.set('fch_unidad', ''); borrador = []; render(); }
    return; }
  const ca = t.closest('[data-conf-ap]'); if(ca){ confirmarApertura(ca.dataset.confAp, ca); return; }
  const an = t.closest('[data-anular]'); if(an){ anularPedido(an.dataset.anular, an); return; }
  if(t.id === 'btnNuevoMat'){ abrirNuevoMaterial(); return; }
  const eu = t.closest('[data-editar-unidad]'); if(eu){ abrirEditarUnidad(eu.dataset.editarUnidad); return; }
  const nu = t.closest('[data-nueva-unidad]'); if(nu){ abrirNuevaUnidad(nu.dataset.nuevaUnidad); return; }
  if(t.id === 'segVerTodas'){ segTodas = true; render(); }
  if(t.dataset.cfgSave) guardarAprobador(t.dataset.cfgSave, t);
  if(t.id === 'btnCopiarLink') copiarLink();
});
async function enviar(btn){
  const nombre = titulo(($('nSol').value || '').trim()); if($('nSol')) $('nSol').value = nombre; solicitanteNom = nombre;
  if(!nombre){ toast('Escriba el nombre de quien solicita.'); $('nSol').focus(); return; }
  const items = borrador.filter(i => i.cantidad > 0).map(i => ({...i, observacion:'-'}));
  if(esApertura){ fechaAp = $('nFechaAp')?.value || fechaAp; if(!fechaAp){ toast('Indique la fecha de inauguración de la sala.'); $('nFechaAp')?.focus(); return; } }
  if(!items.length){ toast('Ponga cantidad al menos a un insumo.'); return; }
  const u = U[unidadSel], ap = G[u?.grupo_id]?.aprobador || 'Logística CEDIS', tot = items.reduce((a,i) => a + (+i.cantidad || 0), 0);
  const ok = await confirmar(`<div class="conf-envio"><span class="sub" style="margin:0">Va a enviar la solicitud de</span><b>${esc(u?.nombre || '')}</b><span>${plural(items.length, 'insumo', 'insumos')} · ${tot} unidades en total</span><span>Solicita: <strong>${esc(nombre)}</strong> · La aprueba: <strong>${esc(ap)}</strong></span>${esApertura ? `<span><span class="chip apertura">Apertura</span> ${esc(txtAbre(fechaAp))}</span>` : ''}</div><p class="sub" style="margin:8px 0 0">Revise que sea su ${u?.tipo === 'Sucursal' ? 'sucursal' : 'área'}. Si se equivoca, podrá anularla desde Seguimiento mientras no la confirmen.</p>`, {html:true, titulo:'¿Es la sala correcta?', si:'Sí, enviar', tono:'btn-primary'});
  if(!ok) return;
  btn.disabled = true; btn.textContent = 'Enviando…';
  try{
    let clave = null, clave_hash = null;
    try{ clave = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()) + '-' + String(Math.random()).slice(2); clave_hash = await hashClave(clave); }catch(e){ clave = null; }
    const fila = {unidad_id:unidadSel, solicitante:nombre.slice(0,100), items}; if(clave_hash) fila.clave_hash = clave_hash; if(esApertura){ fila.tipo = 'Apertura'; fila.fecha_apertura = fechaAp; }
    const {data, error} = await sb.from('pedidos').insert(fila).select('*').single();
    if(error) throw error;
    if(clave) guardarClave(data.id, clave);
    if(!rol.admin && !rol.grupos.length) activarPush(true, data.unidad_id);

    store.set('fch_nombre', nombre);
    pedidos.unshift(normP(data));
    toast(`Solicitud ${data.codigo} enviada a ${G[U[unidadSel].grupo_id]?.aprobador || 'logística'}.`);
    borrador = []; esApertura = false; fechaAp = ''; tab = 'seguimiento'; render();
  }catch(err){ toast(errMsg(err)); btn.disabled = false; btn.textContent = 'Enviar solicitud'; }
}

async function anularPedido(id, btn){
  const p = pedidos.find(x => x.id === id); if(!p) return;
  if(!await confirmar(`¿Anular la solicitud ${p.codigo} de ${U[p.unidad_id]?.nombre || ''}? Ya no llegará al aprobador. Si la envió a la sala equivocada, vuelva a enviarla eligiendo la correcta.`, {titulo:'Anular solicitud', si:'Sí, anular'})) return;
  btn.disabled = true;
  const {error} = await sb.rpc('anular_pedido', {p_id:id, p_clave:claves[id] || null});
  if(error){ btn.disabled = false; toast(errMsg(error)); return; }
  p.estado = 'Anulada'; p.anulado_ts = Date.now(); pedidos = pedidos.filter(x => x.id !== id); anuladas.unshift(p);
  toast(`${p.codigo} anulada.`); render(); programar(cargarPedidos);
}
// ---------- vista: seguimiento ----------
let segTodas = false;
function vSeguimiento(){
  if(salaUsuario()) unidadSel = salaUsuario();
  const u = unidadSel && U[unidadSel];
  let h = (u && pedidos.some(p => p.unidad_id === u.id) ? bannerPush() : '') + (u && !rol.admin && !rol.grupos.length ? bloqueAvisos() : '') + `<section class="panel"><div class="panel-head"><div><h2>Seguimiento de solicitudes</h2><p class="sub">Vea en qué paso está cada solicitud y si se ajustó algo al confirmarla.</p></div></div>
    ${salaUsuario() ? '' : `<label class="f">Sucursal o área${selectorUnidad('segUnidad', unidadSel)}</label>`}`;
  if(!u) return h + '<div class="notice info">Elija su sucursal o área para ver sus solicitudes.</div></section>';
  const l = pedidos.concat(anuladas).filter(p => p.unidad_id === u.id).sort((a,b) => b.ts - a.ts);
  return h + tabla(segTodas ? l : l.slice(0, 20), ['codigo','enviada','items','estado','avance','anular'], 'Esta unidad todavía no envió solicitudes.') +
    (!segTodas && l.length > 20 ? '<div class="row right"><button class="btn btn-sm" id="segVerTodas">Ver todas</button></div>' : '') + '</section>';
}

// ---------- tablas comunes ----------
function tabla(lista, cols, vacio, conSel){
  const C = {
    codigo: ['N° solicitud', p => `<td class="code">${esc(p.codigo)}</td>`],
    unidad: ['Sucursal / área', p => `<td><strong>${esc(U[p.unidad_id]?.nombre || p.unidad_id)}</strong><div class="sub" style="margin:0">${esc(titulo(p.solicitante))}</div></td>`],
    aprob: ['Aprueba', p => `<td><span class="gtag" data-g="${esc(grupoDe(p))}">${esc(G[grupoDe(p)]?.aprobador || '')}</span></td>`],
    muelle: ['Muelle', p => `<td class="num">${esc(U[p.unidad_id]?.muelle || '–')}</td>`],
    enviada: ['Enviada', p => `<td>${fFH(p.ts)}<div class="sub" style="margin:0">${hace(p.ts)}</div></td>`],
    items: ['Ítems', p => `<td class="num">${p.items.length}</td>`],
    valor: ['Valor', p => { const v = valorPedido(p, p.estado === 'Entregada'); return `<td class="num" style="white-space:nowrap">${v.total ? fBs(v.total) : '–'}${v.sin ? `<div class="sub" style="margin:0" title="Insumos sin precio cargado">${v.sin} sin precio</div>` : ''}</td>`; }],
    estado: ['Estado', p => `<td>${chip(p.estado)}${p.items_original ? ' <span class="chip ajuste">ajustada</span>' : ''}${p.items_entregados ? ' <span class="chip alerta">entrega parcial</span>' : ''}${p.tipo === 'Apertura' ? ` <span class="chip apertura">Apertura${p.fecha_apertura && p.estado !== 'Entregada' ? ' · ' + esc(txtAbre(p.fecha_apertura)) : ''}</span>` : ''}${tarde(p) ? ' <span class="chip">fuera de plazo</span>' : ''}${p.estado === 'Enviada' && horas(Date.now() - p.ts) > 48 ? ' <span class="chip alerta">+2 días</span>' : ''}</td>`],
    traspaso: ['N° traspaso', p => !usaTraspaso(p) ? '<td class="sub">No aplica</td>' : rol.admin && p.estado === 'Confirmada' ? `<td class="td-trasp"><input class="trasp-in" data-trasp="${esc(p.id)}" value="${esc(p.nro_traspaso || '')}" maxlength="40" placeholder="Escriba…" aria-label="Número de traspaso de ${esc(p.codigo)}"></td>` : `<td class="mono">${esc(p.nro_traspaso || '–')}</td>`],
    anular: ['', p => `<td class="num">${p.estado === 'Enviada' && (claves[p.id] || rol.admin || (sesion && (rol.unidad === p.unidad_id || rol.grupos.includes(U[p.unidad_id]?.grupo_id)))) ? `<button class="btn btn-sm btn-danger" data-anular="${esc(p.id)}">Anular</button>` : ''}</td>`],
    avance: ['Último avance', p => `<td class="sub">${p.estado === 'Anulada' ? 'Anulada ' + fFH(p.anulado_ts) : p.entregado_ts ? 'Entregada ' + fFH(p.entregado_ts) + (p.nro_traspaso ? ' · Traspaso ' + esc(p.nro_traspaso) : '') : p.confirmado_ts ? (p.estado === 'Rechazada' ? 'Rechazada ' : 'Confirmada ') + fFH(p.confirmado_ts) : 'Esperando confirmación'}</td>`],
  };
  if(verPrecios() && cols.includes('items') && !cols.includes('valor')) cols = cols.flatMap(c => c === 'items' ? ['items','valor'] : [c]);
  if(conSel) visibles = lista.map(p => p.id);
  const todos = conSel && lista.length && lista.every(p => sel.has(p.id));
  return `<div class="tbl-wrap"><table><thead><tr>${conSel ? `<th class="chk"><input type="checkbox" id="selTodos" ${todos ? 'checked' : ''} ${lista.length ? '' : 'disabled'} aria-label="Seleccionar todas"></th>` : ''}${cols.map(c => `<th>${C[c][0]}</th>`).join('')}</tr></thead><tbody>` +
    (lista.length ? lista.map(p => `<tr class="click fila-${esc(p.estado)}${conSel && sel.has(p.id) ? ' marcada' : ''}" data-ver="${esc(p.id)}" tabindex="0">${conSel ? `<td class="chk"><input type="checkbox" data-sel="${esc(p.id)}" ${sel.has(p.id) ? 'checked' : ''} aria-label="Seleccionar ${esc(p.codigo)}"></td>` : ''}${cols.map(c => C[c][1](p)).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length + (conSel ? 1 : 0)}" class="empty">${vacio}</td></tr>`) + '</tbody></table></div>';
}
function kpis(lista){
  const env = lista.filter(p => p.estado === 'Enviada'), conf = lista.filter(p => p.estado === 'Confirmada');
  const ent7 = lista.filter(p => p.estado === 'Entregada' && Date.now() - p.entregado_ts < 7 * 24 * H);
  const ct = lista.filter(p => p.confirmado_ts), prom = ct.length ? ct.reduce((a,p) => a + horas(p.confirmado_ts - p.ts), 0) / ct.length : null;
  const et = lista.filter(p => p.entregado_ts && p.confirmado_ts), promE = et.length ? et.reduce((a,p) => a + horas(p.entregado_ts - p.confirmado_ts), 0) / et.length : null;
  const atras = env.filter(p => horas(Date.now() - p.ts) > 48).length;
  return `<div class="kpis">
    <div class="kpi env"><p>Por confirmar</p><b>${env.length}</b><span>${atras ? `<span class="chip alerta">${atras} con más de 2 días</span>` : 'al día'}</span></div>
    <div class="kpi conf"><p>Confirmadas por entregar</p><b>${conf.length}</b><span>listas para preparar</span></div>
    <div class="kpi ent"><p>Entregadas · 7 días</p><b>${ent7.length}</b><span>solicitudes</span></div>
    <div class="kpi tiempo"><p>Tiempo a confirmar</p><b>${prom == null ? '–' : fDias(prom)}</b><span>promedio</span></div>
    <div class="kpi tiempo"><p>Tiempo a entregar</p><b>${promE == null ? '–' : fDias(promE)}</b><span>desde la confirmación</span></div>${verPrecios() ? (() => { const c = cicloActivo(), l = lista.filter(p => cicloDe(p.ts) === c && (p.estado === 'Confirmada' || p.estado === 'Entregada')), v = l.reduce((a,p) => a + valorPedido(p, p.estado === 'Entregada').total, 0); return `<div class="kpi valor"><p>Valor del ciclo · ${esc(nombreCiclo(c))}</p><b>${fBs(v)}</b><span>${plural(l.length, 'solicitud aprobada', 'solicitudes aprobadas')}</span></div>`; })() : ''}</div>`;
}
function mapa(grupos){
  const ult = {}; pedidos.forEach(p => { if(!ult[p.unidad_id] || ult[p.unidad_id].ts < p.ts) ult[p.unidad_id] = p; });
  return `<div class="leyenda"><span><i></i>Sin solicitud</span><span><i class="Enviada"></i>Enviada</span><span><i class="Confirmada"></i>Confirmada</span><span><i class="Entregada"></i>Entregada</span><span><i class="Rechazada"></i>Rechazada</span></div><div class="mapa">` +
    grupos.map(g => { const us = UL.filter(u => u.grupo_id === g.id && u.activa); if(!us.length) return '';
      const pend = us.filter(u => ult[u.id]?.estado === 'Enviada').length, suc = g.tipo === 'Sucursales' || g.tipo === 'Sin asignar';
      return `<div class="grupo-mapa" data-g="${esc(g.id)}"><header><strong>${esc(g.nombre)} · ${esc(g.aprobador)}</strong><span class="sub" style="margin:0">${us.length} ${suc ? 'sucursales' : 'áreas'}${pend ? ` · <span class="chip Enviada">${pend} por confirmar</span>` : ''}</span></header>
        <div class="tiles ${suc ? '' : 'wide'}">${us.map(u => { const p = ult[u.id]; return `<button class="tile ${p ? p.estado : ''}" ${p ? `data-ver="${esc(p.id)}"` : 'disabled'} title="${esc(u.nombre)} · ${p ? esc(p.estado + ' · ' + p.codigo + ' · ' + fF(p.ts)) : 'sin solicitud'}">${esc(suc ? corto(u) : u.nombre)}</button>`; }).join('')}</div></div>`;
    }).join('') + '</div>';
}
const selGrupo = (id, val, todos = 'Todos los grupos') => `<select id="${id}" style="width:auto"><option value="TODOS">${todos}</option>${GL.map(g => `<option value="${g.id}" ${val === g.id ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('')}</select>`;
const selEstado = (id, val) => `<select id="${id}" style="width:auto">${['TODOS','Enviada','Confirmada','Entregada','Rechazada'].map(e => `<option value="${e}" ${val === e ? 'selected' : ''}>${e === 'TODOS' ? 'Todos los estados' : e}</option>`).join('')}</select>`;

// ---------- vistas: aprobador ----------
function vBandeja(){
  const l = pedidos.filter(p => p.estado === 'Enviada' && puedeAprobar(p)).sort((a,b) => ordenApert(a,b) || a.ts - b.ts);
  const quien = rol.admin ? 'todos los grupos' : rol.grupos.map(g => G[g]?.nombre).join(', ');
  const ctx = !rol.admin ? rol.grupos.map(id => G[id] ? `<div class="ctx-aprob" data-g="${esc(id)}"><b>${esc(G[id].aprobador)}</b><span class="sub" style="margin:0">Confirma ${esc(G[id].nombre)} · ${UL.filter(u => u.grupo_id === id).length} ${G[id].tipo === 'Sucursales' ? 'sucursales' : 'áreas'}</span></div>` : '').join('') : '';
  const n = l.filter(p => sel.has(p.id)).length;
  return bannerPush() + ctx + bloqueAvisos(a => a.tab === 'bandeja' || a.tab === 'grupo' || a.tab === 'cobertura') + `<section class="panel"><div class="panel-head"><div><h2>Solicitudes por confirmar</h2><p class="sub">${esc(quien)}. La más antigua primero. Abra una para ajustar cantidades o rechazar, o marque varias para confirmarlas tal como llegaron.</p></div></div>
    <div class="acciones ${n ? 'on' : ''}"><span><strong>${n}</strong> seleccionadas</span>${n ? '<button class="btn btn-sm" id="btnLimpiarSel">Quitar selección</button>' : ''}<button class="btn btn-primary" id="btnConfVarios" ${n ? '' : 'disabled'}>Confirmar seleccionadas</button></div>
    ${tabla(l, ['codigo','unidad', ...(rol.admin ? ['aprob'] : []), 'enviada','items','estado'], 'No tiene solicitudes pendientes.', true)}</section>`;
}
let fGrupoEst = 'TODOS', fGrupoQ = '';
const coincideSala = (u, q) => { q = normTxt(q).trim(); if(!q) return true; const t = normTxt(`${u?.nombre || ''} ${u?.codigo_sala || ''}`); return q.split(/\s+/).every(w => t.includes(w)); };
function histGrupo(l){
  const q = normTxt(fGrupoQ).trim();
  const f = l.concat(anuladas.filter(p => rol.grupos.includes(grupoDe(p)))).filter(p => (fGrupoEst === 'TODOS' || p.estado === fGrupoEst) && (!q || normTxt(p.codigo).includes(q) || normTxt(p.nro_traspaso || '').includes(q) || coincideSala(U[p.unidad_id], fGrupoQ))).sort((a,b) => b.ts - a.ts);
  return tabla(f.slice(0,300), ['codigo','unidad','enviada','items','estado','avance','anular'], q ? 'Ninguna solicitud coincide con la búsqueda.' : 'Sin solicitudes con este filtro.');
}
function vGrupo(){
  const gs = rol.grupos.map(id => G[id]).filter(Boolean);
  const l = pedidos.filter(p => rol.grupos.includes(grupoDe(p)));
  const c = cicloActivo(), faltan = sinEnviar(c, rol.grupos);
  return lineaCiclo(c) + kpis(l) + `<section class="panel"><div class="panel-head"><div><h2>Sin solicitud en ${esc(nombreCiclo(c))}</h2><p class="sub">${faltan.length ? `${plural(faltan.length, 'sala o área de su grupo todavía no envía', 'salas o áreas de su grupo todavía no envían')}. Recuérdeles el plazo.` : 'Todas las salas de su grupo ya enviaron su solicitud.'}</p></div></div>
    ${faltan.length ? `<div class="faltan">${faltan.map(u => `<span class="chip ${faseActual(c) === 'envio' ? 'ajuste' : 'alerta'}">${esc(u.nombre)}</span>`).join('')}</div>` : ''}</section>
    <section class="panel"><div class="panel-head"><div><h2>Mis sucursales y áreas</h2><p class="sub">Color según la última solicitud de cada una.</p></div><button class="btn btn-primary" data-nueva-unidad="${esc(rol.grupos[0] || '')}">+ Nueva sala o área</button></div>${mapa(gs)}</section>
    <section class="panel"><details class="adm"><summary><h2>Administrar salas del grupo</h2><span class="sub" style="margin:0">Elimine las salas que cerraron o reactive una eliminada por error.</span></summary>
      <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Sala / área</th><th class="num">Cód. sala</th><th class="num">Muelle</th><th class="num">Acción</th></tr></thead><tbody>${UL.filter(u => rol.grupos.includes(u.grupo_id)).sort((a,b) => (b.activa - a.activa) || ordU(a) - ordU(b)).map(u => `<tr class="${u.activa ? '' : 'cerrada'}"><td><strong>${esc(u.nombre)}</strong>${u.activa ? '' : ' <span class="chip alerta">eliminada</span>'}</td><td class="num mono">${esc(u.codigo_sala || '–')}</td><td class="num">${esc(u.muelle || '–')}</td><td class="num" style="white-space:nowrap">${botonEditar(u)}${botonCerrar(u)}</td></tr>`).join('')}</tbody></table></div></details></section>
    <section class="panel"><div class="panel-head"><div><h2>Historial del grupo</h2></div><div class="row"><input id="fGrupoQ" placeholder="Buscar sala, código o N° de solicitud…" value="${esc(fGrupoQ)}" style="width:240px" autocomplete="off">${selEstado('fGrupoEst', fGrupoEst)}</div></div>
    <div id="grupoHist">${histGrupo(l)}</div></section>`;
}

// ---------- vistas: logística ----------
// ---------- aperturas en curso ----------
const aperturasEnCurso = () => pedidos.filter(p => p.tipo === 'Apertura' && (p.estado === 'Enviada' || p.estado === 'Confirmada' || (p.estado === 'Entregada' && Date.now() - p.entregado_ts < 7 * 864e5)))
  .sort((a,b) => ((a.estado === 'Entregada') - (b.estado === 'Entregada')) || String(a.fecha_apertura || '9999').localeCompare(String(b.fecha_apertura || '9999')));
const riesgoApertura = p => { const n = p.fecha_apertura ? diasA(p.fecha_apertura) : null;
  if(p.estado === 'Enviada' && horas(Date.now() - p.ts) > 24) return 'Lleva más de 24 h sin confirmar';
  if(p.estado !== 'Entregada' && n != null && n <= 2) return n < 0 ? 'La sala ya abrió y no se entregó' : `Faltan ${plural(n, 'día', 'días')} para abrir y no se entregó`;
  return ''; };
function vAperturas(){
  const l = aperturasEnCurso(); if(!l.length) return '';
  return `<section class="panel aperturas"><div class="panel-head"><div><h2>Aperturas en curso</h2><p class="sub">Salas nuevas: confirmar en 24 h y entregar al menos 2 días antes de la inauguración.</p></div></div><div class="ap-grid">` +
    l.map(p => { const u = U[p.unidad_id] || {nombre:p.unidad_id}, r = riesgoApertura(p), paso = {Enviada:0, Confirmada:1, Entregada:2}[p.estado];
      const btn = p.estado === 'Enviada' && puedeAprobar(p) ? `<button class="btn btn-sm btn-primary" data-conf-ap="${esc(p.id)}">Confirmar apertura</button>` : p.estado === 'Confirmada' && rol.admin ? `<button class="btn btn-sm btn-ok" data-ver="${esc(p.id)}">Entregar</button>` : '';
      return `<div class="ap-card ${r ? 'riesgo' : ''} ${p.estado === 'Entregada' ? 'lista' : ''}"><div class="ap-top"><b>${esc(u.nombre)}</b>${chip(p.estado)}</div>
        <div class="ap-abre">${esc(txtAbre(p.fecha_apertura))}</div>
        <ol class="ap-pasos">${['Enviada','Confirmada','Entregada'].map((n,i) => `<li class="${i <= paso ? 'ok' : ''}">${n}</li>`).join('')}</ol>
        ${r ? `<div class="ap-alerta">⚠ ${esc(r)}</div>` : ''}
        <div class="ap-pie"><span class="sub" style="margin:0">${esc(p.codigo)} · ${esc(G[U[p.unidad_id]?.grupo_id]?.aprobador || '')}</span><span style="display:flex;gap:6px"><button class="btn btn-sm" data-ver="${esc(p.id)}">Ver</button>${btn}</span></div></div>`; }).join('') + '</div></section>';
}
async function confirmarApertura(id, btn){
  const p = pedidos.find(x => x.id === id); if(!p) return;
  const sup = G[grupoDe(p)]?.aprobador || '', yo = !rol.admin || rol.grupos.includes(grupoDe(p));
  if(!await confirmar(`¿Confirmar la apertura ${p.codigo} de ${U[p.unidad_id]?.nombre || ''} tal como se pidió (${plural(p.items.length, 'insumo', 'insumos')})?${!yo ? ` La confirma logística en lugar de ${sup}; quedará registrado.` : ''}`, {titulo:'Confirmar apertura', si:'Sí, confirmar', tono:'btn-primary'})) return;
  btn.disabled = true;
  const {error} = await sb.rpc('confirmar_pedido', {p_id:id, p_items:p.items, p_nota:!yo ? `Apertura confirmada por Logística CEDIS (en lugar de ${sup}).` : ''});
  if(error){ btn.disabled = false; toast(errMsg(error)); return; }
  toast(`${p.codigo} confirmada. Ya está en Por entregar.`); programar(cargarPedidos);
}
function vTablero(){
  const tot = {Enviada:0, Confirmada:0, Entregada:0, Rechazada:0};
  const filas = GL.map(g => {
    const l = pedidos.filter(p => grupoDe(p) === g.id), c = e => l.filter(p => p.estado === e).length;
    Object.keys(tot).forEach(e => tot[e] += c(e));
    const pend = l.filter(p => p.estado === 'Enviada'); const vieja = pend.length ? Math.max(...pend.map(p => horas(Date.now() - p.ts))) : 0;
    const n = v => v ? v : '<span class="sub">0</span>';
    return `<tr><td><span class="gtag" data-g="${esc(g.id)}">${esc(g.aprobador)}</span>${g.aprobador_email || g.id === 'SIN' ? '' : ' <span class="chip alerta" title="Configure su correo para que pueda ingresar">sin correo</span>'}</td>
      <td class="num">${c('Enviada') ? `<b>${c('Enviada')}</b>` : n(0)}</td><td class="num">${n(c('Confirmada'))}</td><td class="num">${n(c('Entregada'))}</td><td class="num">${n(c('Rechazada'))}</td><td class="num"><b>${l.length}</b></td>${verPrecios() ? `<td class="num" style="white-space:nowrap">${fBs(l.filter(p => cicloDe(p.ts) === cicloActivo() && (p.estado === 'Confirmada' || p.estado === 'Entregada')).reduce((a,p) => a + valorPedido(p, p.estado === 'Entregada').total, 0))}</td>` : ''}
      <td class="num">${pend.length ? (vieja > 48 ? `<span class="chip alerta">${fDias(vieja)}</span>` : fDias(vieja)) : '<span class="sub">–</span>'}</td></tr>`;
  }).join('');
  const T = Object.values(tot).reduce((a,b) => a + b, 0);
  return bannerPush() + lineaCicloCorta(cicloActivo()) + vAperturas() + bloqueAvisos(a => !a.apertura) + kpis(pedidos) + `<section class="panel"><div class="panel-head"><div><h2>Mapa de sucursales y áreas</h2><p class="sub">Color según la última solicitud. Toque un cuadro para abrirla.</p></div></div>${mapa(GL)}</section>
    <section class="panel resumen-aprob"><div class="panel-head"><div><h3 style="margin:0">Resumen por aprobador</h3><p class="sub">Solicitudes de cada aprobador según su estado.</p></div></div>
    <div class="tbl-wrap"><table class="tbl-resumen"><thead><tr><th>Aprobador</th><th class="num">Por confirmar</th><th class="num">Confirmadas</th><th class="num">Entregadas</th><th class="num">Rechazadas</th><th class="num">Total</th>${verPrecios() ? `<th class="num">Valor ${esc(nombreCiclo(cicloActivo()).split(' ')[0].toLowerCase())}</th>` : ''}<th class="num" title="Tiempo de la solicitud más antigua sin confirmar">Más antigua</th></tr></thead><tbody>${filas}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${tot.Enviada}</td><td class="num">${tot.Confirmada}</td><td class="num">${tot.Entregada}</td><td class="num">${tot.Rechazada}</td><td class="num">${T}</td>${verPrecios() ? `<td class="num" style="white-space:nowrap">${fBs(pedidos.filter(p => cicloDe(p.ts) === cicloActivo() && (p.estado === 'Confirmada' || p.estado === 'Entregada')).reduce((a,p) => a + valorPedido(p, p.estado === 'Entregada').total, 0))}</td>` : ''}<td></td></tr></tfoot></table></div></section>`;
}
let fEnt = 'TODOS';
function vEntregar(){
  const l = pedidos.filter(p => p.estado === 'Confirmada' && (fEnt === 'TODOS' || (U[p.unidad_id]?.muelle || 'SIN') === fEnt)).sort((a,b) => ordenApert(a,b) || a.confirmado_ts - b.confirmado_ts);
  const muelles = [...new Set(UL.map(u => u.muelle || 'SIN'))].sort();
  const n = l.filter(p => sel.has(p.id)).length;
  return bloqueAvisos(a => a.tab === 'entregar') + `<section class="panel"><div class="panel-head"><div><h2>Confirmadas por entregar</h2><p class="sub">${rol.admin ? 'La confirmación más antigua primero. Filtre por muelle, marque las que salieron y regístrelas juntas.' : 'Solicitudes confirmadas que Logística CEDIS todavía no entregó, la más antigua primero. Solo consulta.'}</p></div>
    <div class="row">${rol.admin ? '' : '<!--'}<button class="btn btn-sm" id="btnPlantTrasp" title="Excel con las solicitudes por entregar, para completar el N° de traspaso">⬇ Plantilla de traspasos</button><button class="btn btn-sm btn-primary" id="btnSubirTrasp">⬆ Subir traspasos (Excel)</button><input type="file" id="fileTrasp" accept=".xlsx,.xls,.csv" hidden>${rol.admin ? '' : '-->'}
    <select id="fEnt" style="width:auto"><option value="TODOS">Todos los muelles</option>${muelles.map(m => `<option value="${m}" ${fEnt === m ? 'selected' : ''}>${m === 'SIN' ? 'Sin muelle' : m}</option>`).join('')}</select></div></div>
    ${rol.admin ? '' : '<!--'}<div class="acciones ${n ? 'on' : ''}"><span><strong>${n}</strong> seleccionadas</span>${n ? '<button class="btn btn-sm" id="btnLimpiarSel">Quitar selección</button>' : ''}<input id="recVarios" maxlength="100" placeholder="Recibido por (opcional)" style="max-width:220px"><button class="btn btn-ok" id="btnEntVarios" ${n ? '' : 'disabled'}>Marcar entregadas</button></div>${rol.admin ? '' : '-->'}
    ${tabla(l, ['codigo','unidad','muelle','aprob','enviada','items','traspaso','avance'], 'No hay solicitudes confirmadas pendientes de entrega.', rol.admin)}</section>`;
}
let fPrep = 'TODOS', fPrepCiclo = null, fPrepAlc = 'todo';
// Reporte y preparación: solicitudes Confirmadas (no entregadas) cuya confirmación cae en el mes elegido
const mesHoy = () => { const d = hoy(); return d.getFullYear() * 100 + d.getMonth() + 1; };
const mesConf = p => { if(!p.confirmado_ts) return 0; const d = new Date(p.confirmado_ts); return d.getFullYear() * 100 + d.getMonth() + 1; };
const enMesPrep = p => p.estado === 'Confirmada' && mesConf(p) === (fPrepCiclo || mesHoy());
const MUELLES = ['DESP-01','DESP-02','DESP-03','DESP-04','DESP-05','SIN'];
function datosPrep(){
  fPrepCiclo ||= mesHoy();
  const l = pedidos.filter(p => enMesPrep(p) && (fPrep === 'TODOS' || grupoDe(p) === fPrep));
  const m = {}; l.forEach(p => { const mu = U[p.unidad_id]?.muelle || 'SIN'; p.items.forEach(i => { const x = m[i.codigo] ||= {codigo:i.codigo, descripcion:i.descripcion, unidad:i.unidad, por:{}, total:0, unidades:new Set()}; const c = +i.cantidad || 0; x.por[mu] = (x.por[mu]||0) + c; x.total += c; x.unidades.add(p.unidad_id); }); });
  return {l, filas:Object.values(m).sort((a,b) => a.descripcion.localeCompare(b.descripcion,'es'))};
}
function vPreparacion(){
  const {l, filas} = datosPrep();
  const tot = Object.fromEntries(MUELLES.map(mu => [mu, filas.reduce((a,f) => a + (f.por[mu]||0), 0)]));
  const c = fPrepCiclo, enAlc = p => fPrepAlc === 'todo' || U[p.unidad_id]?.tipo === 'Sucursal';
  const aprob = pedidos.filter(p => enMesPrep(p) && enAlc(p)), pend = pedidos.filter(p => p.estado === 'Enviada' && enAlc(p));
  const salas = new Set(aprob.map(p => p.unidad_id)).size, falt = 0;
  return `<section class="panel reporte"><div class="panel-head"><div><h2>Reporte de dotación</h2><p class="sub">Todas las solicitudes <strong>confirmadas en el mes</strong> que todavía no se entregaron. Excel con el formato de "Dotación Sucursales", listo para imprimir en carta.</p></div></div>
    <div class="row"><label class="f">Mes de confirmación<select id="fPrepCiclo">${[0,1,2,3,4,5].map(k => cicloMenos(mesHoy(), k)).map(cc => `<option value="${cc}" ${cc === c ? 'selected' : ''}>${esc(nombreCiclo(cc))}</option>`).join('')}</select></label>
      <label class="f">Incluir<select id="fPrepAlc"><option value="sucursales" ${fPrepAlc === 'sucursales' ? 'selected' : ''}>Solo sucursales</option><option value="todo" ${fPrepAlc === 'todo' ? 'selected' : ''}>Sucursales, oficina central y CEDIS</option></select></label></div>
    <div class="resumen-rep"><span class="chip Confirmada">${plural(aprob.length, 'confirmada por entregar', 'confirmadas por entregar')} · ${plural(salas, 'sala o área', 'salas y áreas')}</span>${pend.length ? `<span class="chip Enviada">${plural(pend.length, 'por confirmar', 'por confirmar')}</span>` : '<span class="chip Entregada">todo confirmado</span>'}${falt ? `<span class="chip alerta">${plural(falt, 'sin solicitud', 'sin solicitud')}</span>` : ''}</div>
    <div class="row right"><button class="btn btn-primary btn-lg" id="btnReporte" ${aprob.length ? '' : 'disabled'}>Generar reporte de dotación (Excel)</button></div></section>
  <section class="panel"><div class="panel-head"><div><h2>Preparación por muelle</h2><p class="sub">Confirmado en ${esc(nombreCiclo(c).toLowerCase())} y aún no entregado: ${plural(l.length, 'solicitud', 'solicitudes')}.</p></div>
    <div class="row">${selGrupo('fPrep', fPrep)}</div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Código</th><th>Insumo</th><th class="num">U.M.</th>${MUELLES.map(m => `<th class="num">${m === 'SIN' ? 'Sin muelle' : m}</th>`).join('')}<th class="num">Total</th><th class="num">N° unidades</th>${verPrecios() ? '<th class="num">Valor</th>' : ''}</tr></thead><tbody>` +
    (filas.length ? filas.map(f => `<tr><td class="code">${esc(f.codigo)}</td><td>${esc(f.descripcion)}</td><td class="num">${esc(f.unidad)}</td>${MUELLES.map(m => f.por[m] ? `<td class="num">${f.por[m]}</td>` : '<td class="num zero">–</td>').join('')}<td class="num"><strong>${f.total}</strong></td><td class="num">${f.unidades.size}</td>${verPrecios() ? `<td class="num" style="white-space:nowrap">${P[f.codigo] != null ? fBs(P[f.codigo] * f.total) : '<span class="sub">sin precio</span>'}</td>` : ''}</tr>`).join('') +
      `<tr class="tot"><td></td><td>Total</td><td></td>${MUELLES.map(m => `<td class="num">${tot[m] || '–'}</td>`).join('')}<td class="num">${filas.reduce((a,f) => a + f.total, 0)}</td><td></td>${verPrecios() ? `<td class="num" style="white-space:nowrap">${fBs(filas.reduce((a,f) => a + (P[f.codigo] || 0) * f.total, 0))}</td>` : ''}</tr>`
      : '<tr><td colspan="11" class="empty">Nada pendiente de preparar.</td></tr>') + '</tbody></table></div></section>';
}
let fTodEst = 'TODOS', fTodGr = 'TODOS', fTodQ = '';
function vTodos(){
  const q = fTodQ.toLowerCase();
  const l = pedidos.filter(p => (fTodEst === 'TODOS' || p.estado === fTodEst) && (fTodGr === 'TODOS' || grupoDe(p) === fTodGr) && (!q || p.codigo.toLowerCase().includes(q) || (U[p.unidad_id]?.nombre || '').toLowerCase().includes(q) || (p.nro_traspaso || '').toLowerCase().includes(q)));
  return `<section class="panel"><div class="panel-head"><div><h2>Todas las solicitudes</h2><p class="sub">${l.length} de ${pedidos.length}${l.length > 300 ? ' · se muestran las 300 más recientes' : ''}</p></div>
    <div class="row"><input id="fTodQ" placeholder="Buscar sucursal, N° o traspaso…" value="${esc(fTodQ)}" style="width:200px">${selEstado('fTodEst', fTodEst)}${selGrupo('fTodGr', fTodGr)}</div></div>
    ${tabla(l.slice(0,300), ['codigo','unidad','aprob','enviada','items','estado','avance'], 'Ninguna solicitud coincide.')}</section>`;
}

// ---------- configuración ----------
let fCfgGr = 'TODOS', fCfgQ = '';
let pleg = {}; try{ pleg = JSON.parse(localStorage.getItem('fch_pleg')) || {}; }catch(e){}
const plegCls = k => pleg[k] ? ' plegado' : '';
const plegBtn = k => `<button type="button" class="pleg" data-pleg="${k}" aria-expanded="${!pleg[k]}" title="${pleg[k] ? 'Mostrar' : 'Ocultar'}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
document.addEventListener('click', e => { const b = e.target.closest?.('[data-pleg]'); if(!b) return; const k = b.dataset.pleg; pleg[k] = !pleg[k];
  try{ localStorage.setItem('fch_pleg', JSON.stringify(pleg)); }catch(e){}
  const sec = b.closest('section'); sec.classList.toggle('plegado', pleg[k]); b.setAttribute('aria-expanded', !pleg[k]); b.title = pleg[k] ? 'Mostrar' : 'Ocultar'; });
// ---------- ingreso de salas (usuarios por correo) ----------
function vIngreso(){
  const act = UL.filter(u => u.activa), con = act.filter(u => u.correo).length, falta = act.length - con;
  return `<section class="panel${plegCls('ingreso')}"><div class="panel-head"><div><h2>Usuarios de salas y áreas ${plegBtn('ingreso')}</h2>
    <p class="sub">${con} de ${act.length} salas y áreas tienen usuario${falta ? ` · <span class="chip alerta">${falta} sin usuario</span>` : ' · <span class="chip Entregada">todas</span>'}</p></div>
    <div class="row"><button class="btn btn-sm" id="btnPlantCorreos">⬇ Plantilla de usuarios</button><button class="btn btn-sm btn-primary" id="btnSubirCorreos">⬆ Subir usuarios (Excel)</button><input type="file" id="fileCorreos" accept=".xlsx,.xls,.csv" hidden></div></div>
    <div class="ingreso-estado ${EXIGIR ? 'on' : ''}"><div><strong>Ingreso obligatorio: ${EXIGIR ? 'activado' : 'desactivado'}</strong>
      <p class="sub" style="margin:2px 0 0">${EXIGIR ? 'Solo se puede enviar y ver solicitudes ingresando con usuario. Cada solicitud queda firmada con el correo de quien la envió.' : 'Hoy cualquiera con el enlace puede enviar solicitudes sin ingresar. Actívelo cuando las salas ya tengan su usuario creado en Supabase y vinculado aquí.'}</p></div>
      <button class="btn ${EXIGIR ? '' : 'btn-primary'}" id="btnExigir">${EXIGIR ? 'Desactivar' : 'Activar ingreso obligatorio'}</button></div>
    <p class="sub" style="margin:0">Pasos: 1) cree cada usuario en Supabase → Authentication → Users (marque <em>Auto Confirm User</em>); 2) descargue la plantilla, complete la columna Correo y súbala aquí. También puede asignarlo uno por uno con <strong>Editar</strong> en la lista de salas.</p></section>`;
}
async function cambiarExigir(btn){
  const nuevo = !EXIGIR;
  const act = UL.filter(u => u.activa), falta = act.filter(u => !u.correo).length;
  const ok = await confirmar(nuevo ? `${falta ? `<p><strong>${falta} salas o áreas todavía no tienen usuario</strong> y no podrán enviar solicitudes hasta que se los asigne.</p>` : ''}<p>Desde ahora, quien no ingrese con su usuario no podrá enviar ni ver solicitudes. ¿Activar?</p>` : '<p>Cualquiera con el enlace podrá volver a enviar solicitudes sin ingresar. ¿Desactivar el ingreso obligatorio?</p>', {html:true, titulo: nuevo ? 'Activar ingreso obligatorio' : 'Desactivar ingreso obligatorio', si: nuevo ? 'Sí, activar' : 'Sí, desactivar', tono: nuevo ? 'btn-primary' : 'btn-danger'});
  if(!ok) return;
  btn.disabled = true; const {error} = await sb.rpc('fijar_exigir_ingreso', {p_valor:nuevo}); btn.disabled = false;
  if(error){ toast('No se pudo cambiar: ' + errMsg(error)); return; }
  EXIGIR = nuevo; toast(nuevo ? 'Ingreso obligatorio activado.' : 'Ingreso obligatorio desactivado.'); render();
}
function plantillaCorreos(){
  const l = UL.filter(u => u.activa).sort((a,b) => (G[a.grupo_id]?.nombre || '').localeCompare(G[b.grupo_id]?.nombre || '', 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  const W = XL.libro(), h = W.hoja('Usuarios'), cab = {b:true, sz:10, color:'FFFFFFFF', fill:'FF1F3864', h:'center', v:'center', wrap:true, bt:'thin', bb:'thin', bl:'thin', br:'thin'};
  ['Cód. sala','Sala / área','Tipo','Grupo','Correo'].forEach((t, c) => h.set(0, c, t, cab));
  [11,40,15,30,38].forEach((w, c) => h.anchos[c] = w);
  l.forEach((u, r) => { const s = (hh, ex = {}) => ({sz:10, h:hh, v:'center', bt:'thin', bb:'thin', bl:'thin', br:'thin', ...ex});
    h.set(r + 1, 0, u.codigo_sala || '', s('center')); h.set(r + 1, 1, u.nombre, s('left')); h.set(r + 1, 2, u.tipo || '', s('left')); h.set(r + 1, 3, G[u.grupo_id]?.nombre || '', s('left')); h.set(r + 1, 4, u.correo || '', s('left', {fill:'FFFFF2CC'})); });
  h.freeze = 1; h.filtro = `A1:E${l.length + 1}`;
  descargar(W.generar(), `Usuarios_salas_${hoyISO()}.xlsx`);
}
let impCo = null;
const correoOk = c => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);
async function leerCorreos(file){
  try{
    await cargarLibXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), {type:'array'}), ws = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:''}).filter(f => f.some(c => String(c).trim()));
    let hi = filas.findIndex(f => f.some(c => /correo|mail/i.test(normTxt(String(c)))));
    if(hi < 0) hi = 0;
    const cab = filas[hi].map(c => normTxt(String(c))), datos = filas.slice(hi + 1);
    let cc = cab.findIndex(t => /correo|mail/.test(t)); if(cc < 0) cc = filas[0].findIndex((_, i) => datos.some(f => String(f[i]).includes('@')));
    const cs = cab.findIndex(t => /cod/.test(t)), cn = cab.findIndex(t => /sala|area|sucursal|nombre/.test(t) && !/cod/.test(t));
    if(cc < 0 || (cs < 0 && cn < 0)){ toast('No encontré las columnas de sala y correo. Use la plantilla.'); return; }
    const vistos = {};
    impCo = datos.map(f => { const correo = String(f[cc] || '').trim().toLowerCase(), cod = cs >= 0 ? normCod(f[cs]) : '', nom = cn >= 0 ? String(f[cn] || '').trim() : '';
      if(!correo) return null;
      let u = cod ? UL.find(x => x.codigo_sala && normCod(x.codigo_sala) === cod) : null;
      if(!u && nom) u = UL.find(x => normTxt(x.nombre) === normTxt(nom));
      let est = !u ? 'nosala' : !correoOk(correo) ? 'malo' : (u.correo || '') === correo ? 'igual' : 'ok';
      if(est === 'ok' || est === 'igual'){ if(vistos[correo] && vistos[correo] !== u.id) est = 'dup'; vistos[correo] = u.id; }
      return {u, correo, ref: nom || cod, est}; }).filter(Boolean);
    // correo ya usado por otra sala que no se cambia en este archivo
    impCo.forEach(x => { if(x.est === 'ok'){ const otra = UL.find(y => y.id !== x.u.id && y.correo === x.correo); if(otra && !impCo.some(z => z.u && z.u.id === otra.id && z.correo !== x.correo)) x.est = 'otra', x.otra = otra; } });
    pintarCorreos(file.name); $('mCorreos').hidden = false;
  }catch(e){ toast(errMsg(e)); }
}
function pintarCorreos(nombre){
  const etq = {ok:'<span class="chip Entregada">Se asigna</span>', igual:'<span class="chip">Ya lo tiene</span>', nosala:'<span class="chip alerta">Sala no encontrada</span>', malo:'<span class="chip alerta">Correo inválido</span>', dup:'<span class="chip alerta">Correo repetido en el archivo</span>', otra:'<span class="chip alerta">Correo de otra sala</span>'};
  const ok = impCo.filter(x => x.est === 'ok');
  $('coBody').innerHTML = `<p class="sub" style="margin:0">Archivo: <strong>${esc(nombre)}</strong> · ${plural(impCo.length, 'fila con correo', 'filas con correo')}.</p>
    <div class="tbl-wrap" style="max-height:52vh;overflow:auto"><table><thead><tr><th>Sala / área</th><th>Correo</th><th>Antes</th><th>Resultado</th></tr></thead><tbody>${impCo.map(x => `<tr><td>${x.u ? `<strong>${esc(x.u.nombre)}</strong>` : esc(x.ref)}</td><td class="mono" style="font-size:12px">${esc(x.correo)}</td><td class="mono sub" style="font-size:12px">${esc(x.u?.correo || '–')}</td><td>${etq[x.est]}${x.otra ? ` <span class="sub">(${esc(x.otra.nombre)})</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">El archivo no tiene correos.</td></tr>'}</tbody></table></div>`;
  $('coAplicar').textContent = ok.length ? `Asignar ${plural(ok.length, 'usuario', 'usuarios')}` : 'Nada para asignar'; $('coAplicar').disabled = !ok.length;
}
async function aplicarCorreos(btn){
  const ok = impCo.filter(x => x.est === 'ok'); btn.disabled = true; let n = 0; const fallos = [];
  for(const x of ok){ const {error} = await sb.rpc('guardar_correo_unidad', {p_id:x.u.id, p_correo:x.correo}); if(error) fallos.push(x.u.nombre + ': ' + errMsg(error)); else { n++; x.u.correo = x.correo; } }
  btn.disabled = false; $('mCorreos').hidden = true;
  toast(`${plural(n, 'usuario asignado', 'usuarios asignados')}.${fallos.length ? ' No se pudo: ' + fallos.slice(0, 3).join(' · ') : ''}`);
  try{ await cargarBase(); }catch(_){} render();
}
document.addEventListener('click', e => {
  const t = e.target;
  if(t.id === 'btnExigir') cambiarExigir(t);
  if(t.id === 'btnPlantCorreos') plantillaCorreos();
  if(t.id === 'btnSubirCorreos') $('fileCorreos').click();
  if(t.id === 'coAplicar') aplicarCorreos(t);
});
document.addEventListener('change', e => { if(e.target.id === 'fileCorreos' && e.target.files[0]){ leerCorreos(e.target.files[0]); e.target.value = ''; } });
function vConfig(){
  const q = fCfgQ.toLowerCase();
  const us = UL.filter(u => (fCfgGr === 'TODOS' || u.grupo_id === fCfgGr) && (!q || u.nombre.toLowerCase().includes(q) || (u.codigo_sala || '').includes(q))).sort((a,b) => (b.activa - a.activa));
  const sin = UL.filter(u => u.grupo_id === 'SIN').length;
  return vIngreso() + `<section class="panel"><div class="panel-head"><div><h2>Aprobadores</h2><p class="sub">Cada aprobador ingresa con el correo que figure aquí. Mientras no tenga correo, sus solicitudes las puede confirmar logística.</p></div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Grupo</th><th>Nombre del aprobador</th><th>Correo para ingresar</th><th class="num">Unidades</th><th></th></tr></thead><tbody>` +
    GL.map(g => `<tr><td><strong class="gtag" data-g="${esc(g.id)}">${esc(g.nombre)}</strong><div class="sub" style="margin:0">${esc(g.tipo)}</div></td>
      <td><input id="cfgN-${g.id}" value="${esc(g.aprobador)}" maxlength="80"></td><td><input type="email" id="cfgE-${g.id}" value="${esc(g.aprobador_email || '')}" placeholder="correo@farmaciachavez.com.bo"></td>
      <td class="num">${UL.filter(u => u.grupo_id === g.id).length}</td><td><button class="btn btn-sm btn-primary" data-cfg-save="${g.id}">Guardar</button></td></tr>`).join('') +
    `</tbody></table></div></section>
    <section class="panel${plegCls('salas')}"><div class="panel-head"><div><h2>Sucursales y áreas por grupo ${plegBtn('salas')}</h2><button class="btn btn-primary" data-nueva-unidad="" style="margin-top:6px">+ Nueva sala o área</button><p class="sub">${sin ? `<span class="chip alerta">${sin} sucursales sin supervisora</span> · ` : ''}Cambie el grupo y se guarda al instante. Las salas eliminadas quedan al final y se pueden reactivar.</p></div>
      <div class="row"><input id="fCfgQ" placeholder="Buscar sucursal o código…" value="${esc(fCfgQ)}" style="width:200px">${selGrupo('fCfgGr', fCfgGr)}</div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Sucursal / área</th><th class="num">Cód. sala</th><th class="num">Muelle</th><th>Regional</th><th>Grupo que aprueba</th><th>Enlace directo</th><th class="num">Sala</th></tr></thead><tbody>` +
    (us.length ? us.map(u => `<tr class="${u.activa ? '' : 'cerrada'}"><td><strong>${esc(u.nombre)}</strong><div class="sub" style="margin:0">${esc(u.tipo)}${u.creada_ts ? ' · abrió ' + fCorta(new Date(u.creada_ts)) + '/' + new Date(u.creada_ts).getFullYear() : ''}${u.activa ? '' : ' · <span class="chip alerta">eliminada</span>'}${u.correo ? `<br><span title="Usuario que ingresa como esta sala">👤 ${esc(u.correo)}</span>` : ''}</div></td><td class="num mono">${esc(u.codigo_sala || '–')}</td><td class="num">${esc(u.muelle || '–')}</td><td>${esc(u.regional || '–')}</td>
      <td><select data-ug="${esc(u.id)}" id="ug-${esc(u.id)}" aria-label="Grupo de ${esc(u.nombre)}">${GL.map(g => `<option value="${g.id}" ${u.grupo_id === g.id ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('')}</select></td>
      <td class="mono sub" style="font-size:11px;word-break:break-all">?u=${esc(u.id)}</td><td class="num" style="white-space:nowrap">${botonEditar(u)}${botonCerrar(u)}</td></tr>`).join('') : '<tr><td colspan="7" class="empty">Ninguna coincide.</td></tr>') +
    `</tbody></table></div><p class="sub" style="margin:0">El enlace directo abre la página con esa sucursal ya elegida: agregue <span class="mono">?u=CÓDIGO</span> al final de la dirección de la página. <button class="btn btn-sm" id="btnCopiarLink">Copiar lista de enlaces</button></p></section>` + vKit();
}
// ---------- kit de apertura (editable por logística) ----------
let kitEd = null;
function vKit(){
  if(!kitEd) kitEd = KIT.map(k => ({...k}));
  const cambios = JSON.stringify(kitEd) !== JSON.stringify(KIT);
  return `<section class="panel${plegCls('kit')}" id="secKit"><div class="panel-head"><div><h2>Kit de apertura ${plegBtn('kit')}</h2><p class="sub">Insumos que se cargan con un botón cuando abre una sala nueva (${plural(kitEd.length, 'insumo', 'insumos')}). La sala puede ajustarlo antes de enviar.</p></div>
    <div class="row">${cambios ? '<button class="btn" id="btnKitDescartar">Descartar cambios</button>' : ''}<button class="btn btn-primary" id="btnKitGuardar" ${cambios ? '' : 'disabled'}>Guardar kit</button></div></div>
    <div class="search" style="max-width:520px"><input id="kitBuscar" placeholder="Agregar insumo al kit: busque por código o nombre…" autocomplete="off"><div class="results" id="kitRes" hidden></div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Código</th><th>Insumo</th><th class="num">U.M.</th><th class="num">Cantidad</th><th class="num">Quitar</th></tr></thead><tbody>` +
    (kitEd.length ? kitEd.map((k,i) => { const m = M[k.codigo] || {}; return `<tr class="${matActivo(m) ? '' : 'cerrada'}"><td class="code">${esc(k.codigo)}</td><td>${esc(m.descripcion || '¿?')}${matActivo(m) ? '' : ' <span class="chip alerta">material eliminado</span>'}</td><td class="num">${esc(m.unidad || '')}</td>
      <td class="num"><input type="number" min="1" class="qty" data-kq="${i}" value="${esc(k.cantidad)}" aria-label="Cantidad de ${esc(m.descripcion || k.codigo)}"></td><td class="num"><button class="btn btn-sm btn-danger" data-kx="${i}">Quitar</button></td></tr>`; }).join('')
      : '<tr><td colspan="5" class="empty">El kit está vacío. Agregue insumos con el buscador.</td></tr>') + '</tbody></table></div></section>';
}
function buscarKit(q){
  const box = $('kitRes'); q = normTxt(q).trim(); if(!q){ box.hidden = true; return; }
  const pal = q.split(/\s+/), f = ML.filter(m => matActivo(m) && !kitEd.some(k => k.codigo === m.codigo) && pal.every(w => normTxt(m.descripcion + ' ' + m.codigo).includes(w))).slice(0, 20);
  box.innerHTML = f.length ? f.map(m => `<button type="button" data-kadd="${esc(m.codigo)}"><span><span class="mono" style="color:var(--brand);font-weight:600">${esc(m.codigo)}</span> ${esc(m.descripcion)}</span><span class="chip">${esc(m.unidad)}</span></button>`).join('') : '<div class="none">No hay coincidencias (o ya está en el kit).</div>';
  box.hidden = false;
}
const repintarKit = () => setTimeout(() => { const sec = $('secKit'); if(sec && sec.isConnected){ const y = scrollY; sec.outerHTML = vKit(); scrollTo(0, y); } }, 0);
document.addEventListener('input', e => { if(e.target.id === 'kitBuscar') buscarKit(e.target.value); });
document.addEventListener('change', e => { const i = e.target.dataset?.kq; if(i == null) return; const v = parseInt(e.target.value); if(v > 0){ kitEd[i].cantidad = v; repintarKit(); } else { e.target.value = kitEd[i].cantidad; toast('La cantidad debe ser mayor a 0.'); } });
document.addEventListener('click', async e => {
  const t = e.target;
  const ad = t.closest?.('[data-kadd]'); if(ad){ kitEd.push({codigo:ad.dataset.kadd, cantidad:1}); repintarKit(); toast(`${M[ad.dataset.kadd]?.descripcion} agregado al kit. Ajuste la cantidad.`); return; }
  if(t.closest?.('[data-kx]')){ kitEd.splice(+t.closest('[data-kx]').dataset.kx, 1); repintarKit(); return; }
  if(t.id === 'btnKitDescartar'){ kitEd = null; repintarKit(); return; }
  if(t.id === 'btnKitGuardar'){ t.disabled = true;
    const {error} = await sb.rpc('guardar_kit', {p_items:kitEd});
    if(error){ t.disabled = false; toast(errMsg(error)); return; }
    KIT = kitEd.map(k => ({...k})); kitEd = null; repintarKit(); toast('Kit de apertura guardado.'); }
});
async function guardarAprobador(id, btn){
  const nombre = $('cfgN-' + id).value.trim(), email = $('cfgE-' + id).value.trim().toLowerCase();
  if(!nombre){ toast('Escriba el nombre del aprobador.'); return; }
  if(email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast('El correo no es válido.'); return; }
  btn.disabled = true;
  const {error} = await sb.from('grupos').update({aprobador:nombre, aprobador_email:email || null}).eq('id', id);
  btn.disabled = false;
  if(error){ toast(errMsg(error)); return; }
  G[id].aprobador = nombre; G[id].aprobador_email = email || null; toast('Aprobador guardado.'); render();
}
async function asignarGrupo(uid, gid, sel){
  const prev = U[uid].grupo_id; sel.disabled = true;
  const {error} = await sb.from('unidades').update({grupo_id:gid}).eq('id', uid);
  sel.disabled = false;
  if(error){ sel.value = prev; toast(errMsg(error)); return; }
  U[uid].grupo_id = gid; toast(`${U[uid].nombre} ahora la aprueba ${G[gid].aprobador}.`); render();
}
async function copiarLink(){
  const base = location.href.split('?')[0].split('#')[0];
  const txt = UL.map(u => `${u.nombre}\t${base}?u=${u.id}`).join('\n');
  try{ await navigator.clipboard.writeText(txt); toast('Lista de enlaces copiada. Péguela en Excel.'); }catch(e){ toast('No se pudo copiar automáticamente.'); }
}

// ---------- detalle ----------
let det = null, detItems = [];
let detEnt = [];
function pintaEntResumen(){ const r = $('entResumen'); if(!r || !det) return; const n = det.items.filter((c,k) => +detEnt[k] !== +c.cantidad).length; r.innerHTML = n ? `<span class="chip alerta">Entrega parcial</span> ${plural(n, 'insumo con diferencia', 'insumos con diferencia')}. El motivo es obligatorio.` : 'Se entrega todo lo confirmado.'; $('entMotivoWrap').hidden = !n; }
function abrirDet(id){ det = pedidos.find(p => p.id === id) || anuladas.find(p => p.id === id); if(!det) return; detItems = det.items.map(i => ({...i})); detEnt = det.items.map(i => +i.cantidad); pintaDet(); $('mDet').hidden = false; }
function pintaDet(){
  const p = det, u = U[p.unidad_id] || {nombre:p.unidad_id, tipo:''}, edit = p.estado === 'Enviada' && puedeAprobar(p), rech = p.estado === 'Rechazada';
  $('detTitulo').textContent = `${p.codigo} · ${u.nombre}`;
  const nivel = {Enviada:0, Confirmada:1, Rechazada:1, Entregada:2}[p.estado];
  const paso = (n, ts, i) => { const cls = rech && i === 1 ? 'bad' : rech && i === 2 ? '' : i <= nivel ? 'done' : i === nivel + 1 ? 'now' : '';
    return `<li class="${cls}"><b>${rech && i === 1 ? 'Rechazada' : n}</b>${(cls === 'done' || cls === 'bad') && ts ? fFH(ts) : cls === 'now' ? 'En espera' : 'Pendiente'}</li>`; };
  let h = `<ol class="steps">${paso('Enviada', p.ts, 0)}${paso('Confirmada', p.confirmado_ts, 1)}${paso('Entregada', p.entregado_ts, 2)}</ol>
    <div class="meta"><div><strong>${esc(u.tipo || 'Unidad')}:</strong> ${esc(u.nombre)}</div><div><strong>Solicitó:</strong> ${esc(titulo(p.solicitante))}${p.enviado_por ? ` <span class="sub">(${esc(p.enviado_por)})</span>` : ''}</div><div><strong>Aprueba:</strong> ${esc(G[u.grupo_id]?.aprobador || '')}</div>
    ${u.muelle ? `<div><strong>Muelle:</strong> ${esc(u.muelle)}</div>` : ''}${p.nro_traspaso ? `<div><strong>N° de traspaso:</strong> <span class="mono">${esc(p.nro_traspaso)}</span></div>` : ''}<div><strong>Estado:</strong> ${chip(p.estado)}${p.tipo === 'Apertura' ? ' <span class="chip apertura">Apertura</span>' : ''}</div>${p.tipo === 'Apertura' ? `<div><strong>Inauguración:</strong> ${p.fecha_apertura ? esc(fDia(p.fecha_apertura)) + ' · ' + esc(txtAbre(p.fecha_apertura)) : 'sin fecha'}</div>` : ''}${p.recibido_por ? `<div><strong>Recibió:</strong> ${esc(p.recibido_por)}</div>` : ''}</div>`;
  if(rech) h += `<div class="notice bad"><strong>Motivo del rechazo:</strong> ${esc(p.motivo_rechazo)}</div>`;
  if(p.nota) h += `<div class="notice info"><strong>Nota de quien confirmó:</strong> ${esc(p.nota)}</div>`;
  const orig = p.items_original || p.items;
  if(edit){
    h += `<div class="notice">Puede cambiar cantidades o quitar líneas antes de confirmar. La sucursal verá lo que pidió y lo que usted confirmó.</div>
    <div class="tbl-wrap"><table><thead><tr><th>Código</th><th>Insumo</th><th class="num">U.M.</th><th class="num">Pidió</th><th class="num">Confirmar</th><th class="num">Quitar</th></tr></thead><tbody>` +
      (detItems.length ? detItems.map((i,k) => { const o = orig.find(x => x.codigo === i.codigo);
        return `<tr><td class="code">${esc(i.codigo)}</td><td>${esc(i.descripcion)}</td><td class="num">${esc(i.unidad)}</td><td class="num">${o ? esc(o.cantidad) : '–'}</td>
        <td class="num"><input type="number" min="1" class="qty" id="dq-${k}" data-dk="${k}" value="${esc(i.cantidad)}" aria-label="Cantidad a confirmar"></td><td class="num"><button class="btn btn-sm btn-danger" data-dd="${k}">Quitar</button></td></tr>`; }).join('')
        : '<tr><td colspan="6" class="empty">Quitó todas las líneas. Si no corresponde, rechace la solicitud.</td></tr>') + `</tbody></table></div>
    <label class="f">Nota para la sucursal (opcional)<input id="dNota" maxlength="500" placeholder="Ej: Se ajustó al consumo promedio mensual"></label>
    <div class="row right"><input id="dMotivo" maxlength="500" placeholder="Motivo si la rechaza" style="max-width:300px"><button class="btn btn-danger" id="dRech">Rechazar</button><button class="btn btn-primary" id="dConf">Confirmar solicitud</button></div>`;
  } else {
    const entEdit = rol.admin && p.estado === 'Confirmada';
    if(entEdit){
      h += `<div class="notice">Revise lo que va a entregar. Si no tiene stock de algún insumo, baje la cantidad (puede ser 0) e indique el motivo.</div>
      <div class="tbl-wrap"><table><thead><tr><th>Código</th><th>Insumo</th><th class="num">U.M.</th><th class="num">Confirmado</th><th class="num">A entregar</th></tr></thead><tbody>` +
        p.items.map((c,k) => `<tr><td class="code">${esc(c.codigo)}</td><td>${esc(c.descripcion)}</td><td class="num">${esc(c.unidad)}</td><td class="num">${esc(c.cantidad)}</td>
          <td class="num"><input type="number" min="0" max="${esc(c.cantidad)}" class="qty${+detEnt[k] !== +c.cantidad ? ' cambio' : ''}" data-ek="${k}" value="${esc(detEnt[k])}" aria-label="Cantidad a entregar de ${esc(c.descripcion)}"></td></tr>`).join('') + `</tbody></table></div>
      <p class="sub" id="entResumen" style="margin:0"></p>
      <label class="f" id="entMotivoWrap">Motivo de la diferencia<input id="dNotaEnt" maxlength="500" placeholder="Ej: Sin stock de bolsas, se completa el próximo mes"></label>`;
    } else {
    const aj = !!p.items_original;
    const filas = aj ? [...orig.map(o => ({o, c:p.items.find(x => x.codigo === o.codigo)})), ...p.items.filter(c => !orig.some(o => o.codigo === c.codigo)).map(c => ({o:null, c}))] : p.items.map(c => ({o:c, c}));
    h += `<div class="tbl-wrap"><table><thead><tr><th>Código</th><th>Insumo</th><th class="num">U.M.</th>${aj ? '<th class="num">Pidió</th><th class="num">Confirmado</th>' : '<th class="num">Cantidad</th>'}</tr></thead><tbody>` +
      filas.map(({o,c}) => { const i = c || o; return `<tr><td class="code">${esc(i.codigo)}</td><td>${esc(i.descripcion)}</td><td class="num">${esc(i.unidad)}</td>${aj ? `<td class="num">${o ? esc(o.cantidad) : '–'}</td><td class="num">${!c ? '<span class="quitado">quitado</span>' : (!o || +o.cantidad !== +c.cantidad) ? `<span class="cambio">${esc(c.cantidad)}</span>` : `<strong>${esc(c.cantidad)}</strong>`}</td>` : `<td class="num"><strong>${esc(c.cantidad)}</strong></td>`}</tr>`; }).join('') + '</tbody></table></div>';
    }
    if(p.items_entregados){
      const dif = p.items_entregados.filter(e => { const c = p.items.find(x => x.codigo === e.codigo); return c && +c.cantidad !== +e.cantidad; });
      h += `<div class="notice bad"><strong>Entrega parcial.</strong> ${esc(p.nota_entrega || '')}<ul style="margin:6px 0 0;padding-left:18px">${dif.map(e => `<li>${esc(e.descripcion)}: confirmado ${esc(p.items.find(x => x.codigo === e.codigo).cantidad)}, entregado <strong>${esc(e.cantidad)}</strong></li>`).join('')}</ul></div>`;
    }
    const reab = puedeAprobar(p) && (p.estado === 'Confirmada' || rech);
    if(rol.admin && p.estado === 'Confirmada') h += `<div class="row right">${reab ? '<button class="btn" id="dReabrir">Volver a revisar</button>' : ''}${usaTraspaso(p) ? `<input id="dTrasp" maxlength="40" placeholder="N° de traspaso *" value="${esc(p.nro_traspaso || '')}" style="max-width:180px" inputmode="numeric">` : ''}<input id="dRecibe" maxlength="100" placeholder="Recibido por (opcional)" style="max-width:220px"><button class="btn btn-ok" id="dEnt">Marcar entregada</button></div>`;
    else if(reab) h += `<div class="row right"><span class="sub" style="margin:0">¿Se confirmó o rechazó por error?</span><button class="btn" id="dReabrir">Volver a revisar</button></div>`;
  }
  if(verPrecios()){ const vc = valorPedido(p, false), ve = p.items_entregados ? valorPedido(p, true) : null;
    h += `<div class="valor-det"><span>${p.estado === 'Enviada' ? 'Valor de lo pedido' : 'Valor confirmado'}: <strong>${fBs(vc.total)}</strong></span>${ve ? `<span>Valor entregado: <strong>${fBs(ve.total)}</strong> <span class="chip alerta">−${fBs(vc.total - ve.total)}</span></span>` : ''}${vc.sin ? `<span class="sub" style="margin:0">${plural(vc.sin, 'insumo sin precio cargado', 'insumos sin precio cargado')}</span>` : ''}${p.precios ? '<span class="sub" style="margin:0">Precios al momento de confirmar</span>' : ''}</div>`; }
  $('detBody').innerHTML = h;
  pintaEntResumen();
}
$('detBody').addEventListener('input', e => { const k = e.target.dataset.ek; if(k == null) return; const max = +det.items[k].cantidad, v = parseInt(e.target.value); if(!isNaN(v) && v >= 0 && v <= max){ detEnt[k] = v; e.target.classList.toggle('cambio', v !== max); pintaEntResumen(); } });
$('detBody').addEventListener('change', e => { const ek = e.target.dataset.ek; if(ek != null){ const max = +det.items[ek].cantidad, v = parseInt(e.target.value); if(isNaN(v) || v < 0 || v > max){ e.target.value = detEnt[ek]; toast(`La cantidad a entregar debe estar entre 0 y ${max}.`); } return; }
  const k = e.target.dataset.dk; if(k == null) return; const v = parseInt(e.target.value); if(v > 0) detItems[k].cantidad = v; else e.target.value = detItems[k].cantidad; });
$('detBody').addEventListener('click', async e => {
  const t = e.target;
  if(t.dataset.dd != null){ detItems.splice(+t.dataset.dd, 1); pintaDet(); return; }
  const acciones = {
    dConf: async () => { if(!detItems.length){ toast('No quedan líneas. Rechace la solicitud si no corresponde.'); return null; }
      return [sb.rpc('confirmar_pedido', {p_id:det.id, p_items:detItems, p_nota:$('dNota').value}), `${det.codigo} confirmada. Ya está en la lista de logística.`]; },
    dRech: async () => { const m = $('dMotivo').value.trim(); if(!m){ toast('Escriba el motivo del rechazo.'); $('dMotivo').focus(); return null; }
      return [sb.rpc('rechazar_pedido', {p_id:det.id, p_motivo:m}), `${det.codigo} rechazada. La sucursal verá el motivo.`]; },
    dEnt: async () => { const dif = det.items.some((c,k) => +detEnt[k] !== +c.cantidad), nota = ($('dNotaEnt')?.value || '').trim(), tr = ($('dTrasp')?.value || '').trim();
      if(usaTraspaso(det)){ if(!tr){ toast('Escriba el número de traspaso.'); $('dTrasp').focus(); return null; }
      const {error} = await sb.rpc('guardar_traspaso', {p_id:det.id, p_nro:tr}); if(error){ toast(errMsg(error)); return null; } det.nro_traspaso = tr; }
      if(dif && !nota){ toast('Escriba el motivo de la diferencia.'); $('dNotaEnt').focus(); return null; }
      if(dif && !await confirmar(`¿Registrar ${det.codigo} como entregada con ${plural(det.items.filter((c,k) => +detEnt[k] !== +c.cantidad).length, 'insumo', 'insumos')} en menor cantidad? La sucursal verá lo confirmado, lo entregado y el motivo.`, {titulo:'Entrega parcial', si:'Sí, registrar', tono:'btn-ok'})) return null;
      return [sb.rpc('entregar_ajustado', {p_id:det.id, p_recibido:$('dRecibe').value, p_items:dif ? det.items.map((c,k) => ({codigo:c.codigo, cantidad:detEnt[k]})) : null, p_nota:dif ? nota : null}), dif ? `${det.codigo} entregada parcialmente.` : `${det.codigo} entregada.`]; },
    dReabrir: async () => (await confirmar(`¿Volver ${det.codigo} a "Enviada" para revisarla de nuevo?`)) ? [sb.rpc('reabrir_pedido', {p_id:det.id}), `${det.codigo} volvió a revisión.`] : null,
  };
  if(!acciones[t.id]) return;
  const r = await acciones[t.id](); if(!r) return;
  t.disabled = true;
  const {error} = await r[0];
  if(error){ t.disabled = false; toast(errMsg(error)); return; }
  $('mDet').hidden = true; toast(r[1]); cargarPedidos();
});

// ---------- sesión ----------
async function evaluarSesion(s){
  sesion = s; rol = {admin:false, grupos:[]};
  if(s){ const {data} = await sb.rpc('mi_rol'); if(data) rol = {admin:!!data.admin, grupos:data.grupos || [], unidad:data.unidad || null}; }
  $('btnLogin').textContent = s ? 'Salir' : 'Ingresar';
  $('roleChip').textContent = rol.admin ? 'Logística CEDIS' : esJefatura() ? 'Jefatura · ' + rol.grupos.map(g => G[g]?.aprobador).join(', ') : rol.unidad && U[rol.unidad] && !rol.grupos.length ? U[rol.unidad].nombre : rol.grupos.length ? 'Aprobador · ' + rol.grupos.map(g => G[g]?.aprobador).join(', ') : s ? 'Sin grupo asignado' : EXIGIR ? 'Sin ingresar' : 'Sucursal';
  $('roleChip').classList.toggle('role', rol.admin || rol.grupos.length > 0);
  if(rol.admin){ try{ await cargarBase(); }catch(e){} }
  if(listo && EXIGIR){ try{ await cargarPedidos(); }catch(e){} }
  await cargarPrecios();
  await cargarInventario();
  activarPush(true);
  if(s && !rol.admin && !rol.grupos.length && !rol.unidad) toast('Ingresó, pero su correo todavía no está vinculado a ninguna sala ni grupo. Pida a logística que lo registre.');
  if((rol.admin || rol.grupos.length) && (tab === 'solicitar' || !tab)) tab = rol.admin ? 'tablero' : 'bandeja';
  if(tabPedida && planoTabs(tabsDisponibles()).some(x => x[0] === tabPedida)){ tab = tabPedida; tabPedida = null; }
  render();
}
$('btnLogin').addEventListener('click', async () => {
  if(sesion){ await sb.auth.signOut(); tab = 'solicitar'; toast('Sesión cerrada.'); return; }
  $('loginMsg').hidden = true; $('loginPass').value = ''; $('mLogin').hidden = false; $('loginEmail').focus();
});
function loginMsg(t, tipo){ const m = $('loginMsg'); m.textContent = t; m.className = 'notice' + (tipo ? ' ' + tipo : ''); m.hidden = false; }
$('formLogin').addEventListener('submit', async e => {
  e.preventDefault();
  const {error} = await sb.auth.signInWithPassword({email:$('loginEmail').value.trim(), password:$('loginPass').value});
  if(error){ loginMsg(/confirm/i.test(error.message) ? 'Su usuario aún no está habilitado. Comuníquese con Logística CEDIS.' : 'Correo o contraseña incorrectos.'); return; }
  try{ if($('loginRecordar').checked){ localStorage.removeItem('fch_no_recordar'); } else { localStorage.setItem('fch_no_recordar', '1'); sessionStorage.setItem('fch_sesion_viva', '1'); } }catch(_){}
  $('mLogin').hidden = true; toast('Sesión iniciada.');
});
$('btnVerPass').addEventListener('click', () => { const i = $('loginPass'), v = i.type === 'password'; i.type = v ? 'text' : 'password'; $('btnVerPass').setAttribute('aria-label', v ? 'Ocultar contraseña' : 'Mostrar contraseña'); $('btnVerPass').style.opacity = v ? 1 : .7; });
$('btnCrear')?.addEventListener('click', async () => {
  const email = $('loginEmail').value.trim(), password = $('loginPass').value;
  if(!email || password.length < 8){ loginMsg('Escriba su correo y una contraseña de al menos 8 caracteres, luego presione Crear contraseña.'); return; }
  const {data, error} = await sb.auth.signUp({email, password, options:{emailRedirectTo: location.href.split('#')[0]}});
  if(error){ loginMsg('No se pudo crear: ' + error.message); return; }
  if(data.session){ $('mLogin').hidden = true; toast('Cuenta creada.'); } else loginMsg('Le enviamos un correo de confirmación. Ábralo, confirme y vuelva aquí para ingresar.', 'info');
});
$('btnOlvido').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim(); if(!email){ loginMsg('Escriba su correo primero.'); return; }
  const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.href.split('#')[0]});
  loginMsg(error ? 'No se pudo enviar: ' + error.message : 'Si el correo existe, le llegó un enlace para cambiar la contraseña.', error ? '' : 'info');
});
$('formNuevaPass').addEventListener('submit', async e => {
  e.preventDefault(); const p = $('nuevaPass').value; if(p.length < 8){ toast('Use al menos 8 caracteres.'); return; }
  const {error} = await sb.auth.updateUser({password:p});
  if(error){ toast('No se pudo cambiar: ' + error.message); return; }
  $('mNuevaPass').hidden = true; toast('Contraseña actualizada.');
});

// ---------- inicio ----------
async function iniciar(){
  if(typeof supabase === 'undefined'){ $('main').innerHTML = '<div class="notice bad">No se pudo cargar la página. Revise su conexión a internet y recargue.</div>'; setSync(false, 'Sin conexión'); return; }
  sb = supabase.createClient(SB_URL, SB_KEY);
  try{ if(localStorage.getItem('fch_no_recordar') === '1' && !sessionStorage.getItem('fch_sesion_viva')){ localStorage.removeItem('fch_no_recordar'); await sb.auth.signOut(); } }catch(_){}
  try{ await cargarBase(); }catch(e){ $('main').innerHTML = '<div class="notice bad">No se pudo conectar con la base de datos. Revise su conexión y recargue la página.</div>'; setSync(false, 'Sin conexión'); return; }
  const qs = new URLSearchParams(location.search).get('u'), qtab = new URLSearchParams(location.search).get('tab');
  if(qtab){ tab = qtab; tabPedida = qtab; }
  unidadSel = (qs && U[qs]) ? qs : (U[store.get('fch_unidad')] ? store.get('fch_unidad') : null);
  solicitanteNom = store.get('fch_nombre') || '';
  listo = true;
  sb.auth.onAuthStateChange((ev, s) => { if(ev === 'PASSWORD_RECOVERY') setTimeout(() => $('mNuevaPass').hidden = false, 0); setTimeout(() => evaluarSesion(s), 0); });
  await cargarPedidos();
  setTimeout(notificarDelDia, 1500);
  sb.channel('cambios')
    .on('postgres_changes', {event:'*', schema:'public', table:'pedidos'}, () => programar(cargarPedidos))
    .on('postgres_changes', {event:'*', schema:'public', table:'unidades'}, () => programar(async () => { await cargarBase(); render(); }))
    .subscribe();
  setInterval(cargarPedidos, 60000);
}
// ---------- app instalable ----------
let promptInstalar = null;
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalar = e; if(!instalada()) $('btnInstalar').hidden = false; });
addEventListener('appinstalled', () => { $('btnInstalar').hidden = true; promptInstalar = null; toast('App instalada. Ábrala desde su pantalla de inicio.'); });
if(!instalada() && esIOS) $('btnInstalar').hidden = false;
$('btnInstalar').addEventListener('click', async () => {
  if(promptInstalar){ promptInstalar.prompt(); const r = await promptInstalar.userChoice; if(r.outcome === 'accepted') $('btnInstalar').hidden = true; promptInstalar = null; return; }
  $('instalarTxt').innerHTML = esIOS
    ? '<p style="margin:0">En iPhone o iPad, desde <strong>Safari</strong>:</p><ol style="margin:0;padding-left:20px;display:grid;gap:4px"><li>Toque el botón <strong>Compartir</strong> (cuadrado con flecha hacia arriba).</li><li>Elija <strong>Agregar a inicio</strong>.</li><li>Toque <strong>Agregar</strong>.</li></ol>'
    : '<p style="margin:0">Abra el menú del navegador (⋮) y elija <strong>Instalar app</strong> o <strong>Agregar a pantalla de inicio</strong>.</p>';
  $('mInstalar').hidden = false;
});

iniciar();

// ---------- acciones masivas y reporte ----------
async function confirmarVarios(btn){
  const ids = [...sel].filter(id => pedidos.some(p => p.id === id && p.estado === 'Enviada' && puedeAprobar(p)));
  if(!ids.length){ toast('Marque al menos una solicitud.'); return; }
  if(!await confirmar(`¿Confirmar ${plural(ids.length, 'solicitud', 'solicitudes')} tal como fueron enviadas? Si alguna necesita ajustes, ábrala y confírmela por separado.`)) return;
  btn.disabled = true;
  const {data, error} = await sb.rpc('confirmar_varios', {p_ids:ids});
  btn.disabled = false;
  if(error){ toast(errMsg(error)); return; }
  sel.clear(); toast(`${plural(data ?? ids.length, 'solicitud confirmada', 'solicitudes confirmadas')}.`); cargarPedidos();
}
// ---------- carga masiva de N° de traspaso desde Excel ----------
function plantillaTraspasos(){
  const l = pedidos.filter(p => p.estado === 'Confirmada' && usaTraspaso(p)).sort((a,b) => ordenApert(a,b) || ordU(U[a.unidad_id] || {}) - ordU(U[b.unidad_id] || {}));
  if(!l.length){ toast('No hay solicitudes por entregar.'); return; }
  const W = XL.libro(), h = W.hoja('Traspasos'), cab = {b:true, sz:10, color:'FFFFFFFF', fill:'FF1F3864', h:'center', v:'center', wrap:true, bt:'thin', bb:'thin', bl:'thin', br:'thin'};
  ['N° solicitud','Cód. sala','Sala / área','Muelle','Ítems','N° traspaso'].forEach((t, c) => h.set(0, c, t, cab));
  [13,11,38,10,7,16].forEach((w, c) => h.anchos[c] = w);
  l.forEach((p, r) => { const u = U[p.unidad_id] || {}, s = (hh, ex = {}) => ({sz:10, h:hh, v:'center', bt:'thin', bb:'thin', bl:'thin', br:'thin', ...ex});
    h.set(r + 1, 0, p.codigo, s('center')); h.set(r + 1, 1, u.codigo_sala || '', s('center')); h.set(r + 1, 2, u.nombre || p.unidad_id, s('left')); h.set(r + 1, 3, u.muelle || '', s('center')); h.set(r + 1, 4, p.items.length, s('center')); h.set(r + 1, 5, p.nro_traspaso || '', s('center', {fill:'FFFFF2CC'})); });
  h.freeze = 1; h.filtro = `A1:F${l.length + 1}`;
  descargar(W.generar(), `Traspasos_por_entregar_${hoyISO()}.xlsx`);
}
function cargarLibXLSX(){
  if(window.XLSX) return Promise.resolve();
  return new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; sc.onload = ok; sc.onerror = () => no(new Error('No se pudo cargar el lector de Excel. Revise su conexión.')); document.head.append(sc); });
}
let impTr = null;
const usaTraspaso = p => (U[p.unidad_id]?.tipo || '') !== 'CEDIS';
const normCod = v => String(v ?? '').trim().replace(/\.0+$/, '').replace(/^0+(?=\d)/, '');
function detectarColumnas(cab, filas){
  const n = cab.map(c => normTxt(String(c || '')));
  const busca = (re, no) => n.findIndex(t => re.test(t) && !(no && no.test(t)));
  let tr = busca(/traspas|transfer|nro.?trasp|n.?\s*trasp|n.?doc|documento/);
  let so = busca(/solicitud|pedido/);
  if(so < 0) so = cab.findIndex((_, i) => filas.some(f => /^P-?\d+$/i.test(String(f[i] || '').trim())));
  let sa = busca(/cod.*sala|sala.*cod|codigo sala|cod\.? sala/);
  if(sa < 0) sa = busca(/destino/);
  if(sa < 0) sa = busca(/sala|sucursal|almacen|area/, /muelle|origen/);
  if(tr < 0) tr = busca(/^n(ro|umero|°)?\.?$|numero|nro/);
  let cq = busca(/^cant|cantidad/), ci = -1, de = busca(/descrip|producto|material/);
  if(tr >= 0){ const it = filas.filter(f => !String(f[tr] ?? '').trim());
    let best = 0; cab.forEach((_, i) => { if(i === tr || i === sa || i === cq) return; const k = it.filter(f => /^\d{3,7}$/.test(String(f[i] ?? '').trim())).length; if(k > best){ best = k; ci = i; } });
    if(best < 1) ci = -1; }
  return {tr, so, sa, ci, cq, de};
}
function itemsDeTraspasos(datos, col){
  const out = new Map(); let cur = null;
  datos.forEach(f => { if(String(f[col.tr] ?? '').trim()){ cur = []; out.set(f, cur); return; }
    if(!cur || col.ci < 0 || col.cq < 0) return; const c = normCod(f[col.ci]), q = parseFloat(String(f[col.cq] ?? '').replace(/,/g, ''));
    if(/^\d{3,7}$/.test(c) && q > 0) cur.push({codigo:c, cantidad:q, desc:String(col.de >= 0 ? f[col.de] : '').trim()}); });
  return out;
}
function compararTraspaso(p, its){
  const env = {}, desc = {}; its.forEach(i => { env[i.codigo] = (env[i.codigo] || 0) + i.cantidad; desc[i.codigo] = i.desc; });
  const menos = [], mas = [], extra = []; const enPed = new Set();
  (p.estado === 'Entregada' && p.items_entregados ? p.items_entregados : p.items).forEach(i => { const c = normCod(i.codigo); enPed.add(c); const conf = +i.cantidad || 0, e = env[c] || 0;
    if(e < conf) menos.push({codigo:i.codigo, d:i.descripcion || desc[c] || c, conf, env:e}); else if(e > conf) mas.push({codigo:i.codigo, d:i.descripcion || c, conf, env:e}); });
  Object.keys(env).forEach(c => { if(!enPed.has(c)) extra.push({codigo:c, d:desc[c] || c, env:env[c]}); });
  return {menos, mas, extra, igual: !menos.length && !mas.length && !extra.length};
}
function notaTraspaso(tr, cmp){
  const fq = n => (+n).toLocaleString('es-BO', {maximumFractionDigits:2});
  return (`Según traspaso ${tr}: ` + [
    cmp.menos.length ? 'de menos: ' + cmp.menos.map(x => `${x.d} (${fq(x.env)} de ${fq(x.conf)})`).join(', ') : '',
    cmp.mas.length ? 'de más: ' + cmp.mas.map(x => `${x.d} (${fq(x.env)} de ${fq(x.conf)})`).join(', ') : '',
    cmp.extra.length ? 'no solicitados: ' + cmp.extra.map(x => `${x.d} (${fq(x.env)})`).join(', ') : ''].filter(Boolean).join('; ')).slice(0, 500);
}
function emparejar(f, col){
  const tr = String(f[col.tr] ?? '').trim(); if(!tr) return {estado:'vacio'};
  const pend = pedidos.filter(p => p.estado === 'Confirmada' && usaTraspaso(p));
  if(col.so >= 0){ const v = String(f[col.so] ?? '').trim().toUpperCase().replace(/^P-?/, ''); if(v){ const p = pedidos.find(x => x.codigo.replace(/^P-?/, '') === v.padStart(4, '0') || x.codigo.replace(/^P-?/, '') === v); if(p) return {estado: p.estado === 'Confirmada' || p.estado === 'Entregada' ? 'ok' : 'noconf', p, tr}; } }
  if(col.sa >= 0){ const raw = String(f[col.sa] ?? '').trim(); if(raw){ const c = normCod(raw), q = normTxt(raw);
      let us = UL.filter(u => u.codigo_sala && normCod(u.codigo_sala) === c);
      if(!us.length) us = UL.filter(u => normTxt(u.nombre) === q);
      if(!us.length && q.length >= 4) us = UL.filter(u => normTxt(u.nombre).includes(q) || q.includes(normTxt(u.nombre)));
      const cand = pend.filter(p => us.some(u => u.id === p.unidad_id)).sort((a,b) => (!!a.nro_traspaso - !!b.nro_traspaso) || a.confirmado_ts - b.confirmado_ts);
      const libres = cand.filter(p => !p.nro_traspaso);
      if(libres.length === 1 || (cand.length === 1)) return {estado:'ok', p: libres[0] || cand[0], tr};
      if(cand.length > 1) return {estado:'varias', cand, p: libres[0] || cand[0], tr};
      return {estado: us.length ? 'sinpend' : 'nosala', tr, sala: raw}; } }
  return {estado:'nosala', tr, sala:''};
}
async function leerTraspasos(file){
  try{
    await cargarLibXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), {type:'array'}), ws = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:''}).filter(f => f.some(c => String(c).trim()));
    const clave = /trasp|n.?doc|documento|solicitud|destino|sala|sucursal|almacen|n°|nro|numero/i;
    let hi = -1, mejor = 0;
    filas.slice(0, 25).forEach((f, i) => { const k = f.filter(c => { const t = normTxt(String(c)); return t.length < 40 && clave.test(t) && !/origen|detalle|reporte/.test(t); }).length; if(k > mejor){ mejor = k; hi = i; } });
    if(hi < 0 || mejor < 2) hi = filas.findIndex(f => f.filter(c => /[a-záéíóúñ]/i.test(String(c))).length >= 2);
    if(hi < 0){ toast('No encontré la fila de títulos en el Excel.'); return; }
    const cab = filas[hi], datos = filas.slice(hi + 1);
    impTr = {cab, datos, col: detectarColumnas(cab, datos), nombre: file.name};
    pintarImpTr(); $('mTrasp').hidden = false;
  }catch(e){ toast(errMsg(e)); }
}
function pintarImpTr(){
  const {cab, datos, col} = impTr;
  const opt = (k, txt) => `<label class="f">${txt}<select data-colimp="${k}"><option value="-1">— ninguna —</option>${cab.map((c,i) => `<option value="${i}" ${col[k] === i ? 'selected' : ''}>${esc(String(c) || 'Columna ' + (i + 1))}</option>`).join('')}</select></label>`;
  impTr.res = col.tr < 0 ? [] : datos.map(f => ({f, m: emparejar(f, col)})).filter(x => x.m.estado !== 'vacio');
  { const vistos = {}; impTr.res.forEach(x => { if(x.m.p && x.m.estado === 'ok'){ const k = x.m.p.id; if(vistos[k]){ vistos[k].m.tr = [...new Set((vistos[k].m.tr + ' / ' + x.m.tr).split(' / '))].join(' / ').slice(0, 40); x.m = {...x.m, estado:'unido', destino:vistos[k].m.p}; } else vistos[k] = x; } }); }
  const itsDe = itemsDeTraspasos(datos, col), conItems = col.ci >= 0 && col.cq >= 0;
  impTr.conItems = conItems;
  if(conItems){ const acum = new Map();
    impTr.res.forEach(x => { const its = itsDe.get(x.f) || []; const pid = x.m.estado === 'unido' ? x.m.destino.id : x.m.p?.id; if(!pid) return; if(!acum.has(pid)) acum.set(pid, []); acum.get(pid).push(...its); });
    impTr.res.forEach(x => { x.cmp = null; if((x.m.estado === 'ok' || x.m.estado === 'varias') && x.m.p) x.cmp = compararTraspaso(x.m.p, acum.get(x.m.p.id) || []); }); }
  const ok = impTr.res.filter(x => x.m.estado === 'ok' || x.m.estado === 'varias');
  const fq = n => (+n).toLocaleString('es-BO', {maximumFractionDigits:2});
  const cmpHtml = c => !c ? '' : c.igual ? ' <span class="chip Entregada">Coincide con lo confirmado</span>' : ` <details class="tr-dif"><summary><span class="chip alerta">${[c.menos.length ? plural(c.menos.length, 'de menos', 'de menos') : '', c.mas.length ? c.mas.length + ' de más' : '', c.extra.length ? plural(c.extra.length, 'no solicitado', 'no solicitados') : ''].filter(Boolean).join(' · ')}</span></summary><ul>${c.menos.map(x => `<li>${esc(x.d)}: envía <strong>${fq(x.env)}</strong> de ${fq(x.conf)}</li>`).join('')}${c.mas.map(x => `<li>${esc(x.d)}: envía <strong>${fq(x.env)}</strong>, confirmado ${fq(x.conf)}</li>`).join('')}${c.extra.map(x => `<li>${esc(x.d)} (${esc(x.codigo)}): <strong>${fq(x.env)}</strong>, no estaba en la solicitud</li>`).join('')}</ul></details>`;
  const etq = {unido:'<span class="chip">Se suma al de arriba</span>', ok:'<span class="chip Entregada">Se asigna</span>', varias:'<span class="chip ajuste">Varias pendientes</span>', noconf:'<span class="chip alerta">No está confirmada</span>', sinpend:'<span class="chip alerta">Sin solicitud por entregar</span>', nosala:'<span class="chip alerta">No se encontró</span>'};
  $('trBody').innerHTML = `<p class="sub" style="margin:0">Archivo: <strong>${esc(impTr.nombre)}</strong> · ${plural(datos.length, 'fila', 'filas')}. Revise qué columna es cada dato.</p>
    <div class="grid g3">${opt('tr', 'N° de traspaso *')}${opt('so', 'N° de solicitud')}${opt('sa', 'Código o nombre de sala')}${opt('ci', 'Código de producto')}${opt('cq', 'Cantidad del producto')}${opt('de', 'Descripción')}</div>
    ${conItems ? '' : '<p class="sub" style="margin:0">Sin código de producto y cantidad no se puede comparar lo enviado con lo confirmado.</p>'}
    ${col.tr < 0 ? '<div class="notice bad">Elija la columna del N° de traspaso.</div>' : col.so < 0 && col.sa < 0 ? '<div class="notice bad">Elija la columna de N° de solicitud o la de sala, para saber a qué solicitud va cada traspaso.</div>' : `
    <div class="tbl-wrap" style="max-height:46vh;overflow:auto"><table><thead><tr><th>N° traspaso</th><th>En el Excel</th><th>Se asigna a</th><th>Resultado</th></tr></thead><tbody>${impTr.res.map((x, i) => { const m = x.m;
      const dest = m.estado === 'unido' ? `<strong>${esc(m.destino.codigo)}</strong> · ${esc(U[m.destino.unidad_id]?.nombre || '')}` : m.estado === 'varias' ? `<select data-impvar="${i}">${m.cand.map(p => `<option value="${esc(p.id)}" ${m.p && m.p.id === p.id ? 'selected' : ''}>${esc(p.codigo)} · ${fFH(p.confirmado_ts)}${p.nro_traspaso ? ' (ya tiene ' + esc(p.nro_traspaso) + ')' : ''}</option>`).join('')}</select>` : m.p ? `<strong>${esc(m.p.codigo)}</strong> · ${esc(U[m.p.unidad_id]?.nombre || '')}${m.p.nro_traspaso && m.p.nro_traspaso !== m.tr ? ` <span class="sub">(reemplaza ${esc(m.p.nro_traspaso)})</span>` : ''}` : '<span class="sub">–</span>';
      return `<tr><td class="mono">${esc(m.tr)}</td><td>${esc([col.so >= 0 ? x.f[col.so] : '', col.sa >= 0 ? x.f[col.sa] : ''].filter(Boolean).join(' · '))}</td><td>${dest}</td><td>${etq[m.estado]}${cmpHtml(x.cmp)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">No hay filas con N° de traspaso.</td></tr>'}</tbody></table></div>`}
    <label class="recordar"><input type="checkbox" id="trEntregar"> Marcar también como entregadas las que estén confirmadas${conItems ? ' (si el traspaso trae menos, se registra como entrega parcial con esas cantidades)' : ''}</label>`;
  $('trAplicar').textContent = ok.length ? `Asignar ${plural(ok.length, 'traspaso', 'traspasos')}` : 'Nada para asignar';
  $('trAplicar').disabled = !ok.length;
}
async function aplicarTraspasos(btn){
  const ok = impTr.res.filter(x => x.m.estado === 'ok' || x.m.estado === 'varias');
  btn.disabled = true; let n = 0; const fallos = [];
  for(const x of ok){ const {error} = await sb.rpc('guardar_traspaso', {p_id:x.m.p.id, p_nro:x.m.tr}); if(error) fallos.push(x.m.p.codigo); else { n++; x.m.p.nro_traspaso = x.m.tr; } }
  let ent = 0;
  let parc = 0;
  if($('trEntregar').checked){ const lista = ok.filter(x => x.m.p.estado === 'Confirmada' && !fallos.includes(x.m.p.codigo));
    const conDif = lista.filter(x => x.cmp && x.cmp.menos.length), ids = lista.filter(x => !conDif.includes(x)).map(x => x.m.p.id);
    if(ids.length){ const {data, error} = await sb.rpc('entregar_varios', {p_ids:ids, p_recibido:''}); if(!error) ent = data ?? ids.length; else fallos.push(...lista.filter(x => ids.includes(x.m.p.id)).map(x => x.m.p.codigo)); }
    for(const x of conDif){ const p = x.m.p, env = {}; (x.cmp.menos).forEach(m => env[m.codigo] = m.env);
      const {error} = await sb.rpc('entregar_ajustado', {p_id:p.id, p_recibido:'', p_items:p.items.map(i => ({codigo:i.codigo, cantidad: i.codigo in env ? env[i.codigo] : +i.cantidad})), p_nota:notaTraspaso(p.nro_traspaso || x.m.tr, x.cmp)});
      if(error) fallos.push(p.codigo + ' (' + errMsg(error) + ')'); else { ent++; parc++; } } }
  btn.disabled = false; $('mTrasp').hidden = true;
  toast(`${plural(n, 'traspaso asignado', 'traspasos asignados')}${ent ? ` y ${plural(ent, 'solicitud entregada', 'solicitudes entregadas')}${parc ? ` (${parc} parcial${parc > 1 ? 'es' : ''})` : ''}` : ''}.${fallos.length ? ' No se pudo: ' + fallos.join(', ') : ''}`);
  cargarPedidos();
}
document.addEventListener('change', e => {
  if(e.target.id === 'fileTrasp' && e.target.files[0]){ leerTraspasos(e.target.files[0]); e.target.value = ''; }
  const k = e.target.dataset?.colimp; if(k && impTr){ impTr.col[k] = +e.target.value; pintarImpTr(); }
  const v = e.target.dataset?.impvar; if(v != null && impTr){ const x = impTr.res[+v]; x.m.p = x.m.cand.find(p => p.id === e.target.value); }
});
document.addEventListener('click', e => {
  if(e.target.id === 'btnSubirTrasp') $('fileTrasp').click();
  if(e.target.id === 'btnPlantTrasp') plantillaTraspasos();
  if(e.target.id === 'trAplicar') aplicarTraspasos(e.target);
});
async function entregarVarios(btn){
  const ids = [...sel].filter(id => pedidos.some(p => p.id === id && p.estado === 'Confirmada'));
  if(!ids.length){ toast('Marque al menos una solicitud.'); return; }
  const sinT = ids.map(id => pedidos.find(p => p.id === id)).filter(p => usaTraspaso(p) && !p.nro_traspaso);
  if(sinT.length){ toast(`Falta el número de traspaso en ${sinT.map(p => p.codigo).join(', ')}.`); const i = document.querySelector(`[data-trasp="${sinT[0].id}"]`); if(i) i.focus(); return; }
  if(!await confirmar(`¿Marcar ${plural(ids.length, 'solicitud', 'solicitudes')} como entregadas?`)) return;
  btn.disabled = true;
  const {data, error} = await sb.rpc('entregar_varios', {p_ids:ids, p_recibido:$('recVarios')?.value || ''});
  btn.disabled = false;
  if(error){ toast(errMsg(error)); return; }
  sel.clear(); toast(`${plural(data ?? ids.length, 'solicitud entregada', 'solicitudes entregadas')}.`); cargarPedidos();
}
async function generarReporte(btn){
  const c = fPrepCiclo || mesHoy(), enAlc = p => fPrepAlc === 'todo' || U[p.unidad_id]?.tipo === 'Sucursal';
  const pend = pedidos.filter(p => p.estado === 'Enviada' && enAlc(p)).length;
  if(pend && !await confirmar(`Todavía hay ${plural(pend, 'solicitud', 'solicitudes')} sin confirmar. El reporte solo incluye las confirmadas. ¿Generarlo igual?`)) return;
  btn.disabled = true;
  try{
    const r = libroDotacion(c, fPrepAlc);
    if(!r.salas){ toast('No hay solicitudes confirmadas por entregar en ese mes.'); return; }
    const d = hoy(), f = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
    await descargar(r.bytes, `Dotacion_Sucursales_${f}.xlsx`);
    toast(`Reporte listo: ${plural(r.salas, 'sala', 'salas')}, ${plural(r.insumos, 'insumo', 'insumos')}, ${plural(r.paginas, 'hoja', 'hojas')} para imprimir.`);
  }catch(e){ toast('No se pudo generar el reporte.'); }
  finally{ btn.disabled = false; }
}
function lineaCicloMini(){ const c = cicloActivo(), f = fases(c), fa = faseActual(c);
  return `<div class="notice info">Plazo para enviar solicitudes: del <strong>10 al 20</strong> de cada mes. ${fa === 'envio' ? `Ciclo ${esc(nombreCiclo(c))}: quedan ${plural(diasHasta(f.envio[1]), 'día', 'días')}.` : ''}</div>`; }

// ---------- nueva sala o área ----------
function gruposCreables(){ return rol.admin ? GL : GL.filter(g => rol.grupos.includes(g.id) && g.id !== 'SIN'); }
function ajustarFormUnidad(){
  const g = G[$('uGrupo').value], suc = !g || g.tipo === 'Sucursales' || g.tipo === 'Sin asignar';
  $('uSoloSuc').hidden = !suc;
  $('uNombre').placeholder = suc ? 'Ej: SUC-210 NUEVA SALA' : g.tipo === 'CEDIS' ? 'Ej: Inventarios' : 'Ej: Recursos Humanos';
  $('uAyuda').textContent = suc ? 'Escriba el nombre como en el WMS, por ejemplo "SUC-210 NUEVA SALA". El código de sala y el muelle se usan en el reporte de dotación.' : `Será un área de ${g.nombre}. Sus solicitudes las confirma ${g.aprobador}.`;
}
let editUid = null;
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const isoDia = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function abrirEditarUnidad(uid){
  const u = U[uid]; if(!u) return; editUid = uid;
  $('uTitulo').textContent = 'Editar ' + u.nombre; $('uGrupoWrap').hidden = true; $('uNombre').value = u.nombre; $('uNombre').disabled = true;
  $('uCorreoWrap').hidden = !rol.admin; $('uCorreo').value = u.correo || '';
  $('uCodigo').value = u.codigo_sala || ''; $('uMuelle').value = u.muelle || ''; $('uRegional').value = u.regional || ''; $('uFecha').value = u.creada_ts ? isoDia(u.creada_ts) : '';
  $('dlRegional').innerHTML = [...new Set(UL.map(x => x.regional).filter(Boolean).concat(['SANTA CRUZ','COCHABAMBA','TARIJA','BENI']))].map(r => `<option value="${esc(r)}">`).join('');
  $('uSoloSuc').hidden = false; $('uAyuda').textContent = 'La fecha de apertura sirve para que la cobertura y las alertas cuenten solo desde que la sala abrió. Déjela vacía si la sala ya existía antes de usar la app.';
  $('uMsg').hidden = true; $('uGuardar').textContent = 'Guardar'; $('mUnidad').hidden = false; $('uCodigo').focus();
}
function abrirNuevaUnidad(gid){
  editUid = null; $('uCorreoWrap').hidden = true; $('uTitulo').textContent = 'Nueva sala o área'; $('uGrupoWrap').hidden = false; $('uNombre').disabled = false; $('uGuardar').textContent = 'Crear'; $('uFecha').value = hoyISO();
  const gs = gruposCreables(); if(!gs.length){ toast('No tiene un grupo asignado para crear salas.'); return; }
  $('uGrupo').innerHTML = gs.map(g => `<option value="${g.id}" ${g.id === gid ? 'selected' : ''}>${esc(g.nombre)} · ${esc(g.aprobador)}</option>`).join('');
  $('uGrupo').disabled = gs.length === 1;
  $('dlRegional').innerHTML = [...new Set(UL.map(u => u.regional).filter(Boolean).concat(['SANTA CRUZ','COCHABAMBA','TARIJA','BENI']))].map(r => `<option value="${esc(r)}">`).join('');
  ['uNombre','uCodigo','uRegional'].forEach(id => $(id).value = ''); $('uMuelle').value = ''; $('uMsg').hidden = true;
  ajustarFormUnidad(); $('mUnidad').hidden = false; $('uNombre').focus();
}
$('uGrupo').addEventListener('change', ajustarFormUnidad);
$('formUnidad').addEventListener('submit', async e => {
  e.preventDefault();
  const nombre = $('uNombre').value.trim(), cod = $('uCodigo').value.trim();
  const err = m => { $('uMsg').textContent = m; $('uMsg').hidden = false; };
  if(nombre.length < 3){ err('Escriba el nombre de la sala o área.'); return; }
  if(cod && !/^\d+$/.test(cod)){ err('El código de sala solo lleva números.'); return; }
  const btn = $('uGuardar'); btn.disabled = true;
  if(editUid){
    const {error} = await sb.rpc('editar_unidad', {p_id:editUid, p_codigo:cod, p_muelle:$('uMuelle').value, p_regional:$('uRegional').value, p_creada:$('uFecha').value || null});
    if(error){ btn.disabled = false; err(/permiso/i.test(error.message) ? 'No tiene permiso para editar esta sala.' : error.message); return; }
    const correo = $('uCorreo').value.trim().toLowerCase();
    if(rol.admin && correo !== (U[editUid]?.correo || '')){ const r = await sb.rpc('guardar_correo_unidad', {p_id:editUid, p_correo:correo});
      if(r.error){ btn.disabled = false; err(r.error.message); return; } }
    btn.disabled = false;
    $('mUnidad').hidden = true; try{ await cargarBase(); }catch(_){}
    toast(`${U[editUid]?.nombre || 'Sala'} actualizada.`); render(); return;
  }
  const {data, error} = await sb.rpc('crear_unidad', {p_nombre:nombre, p_grupo:$('uGrupo').value, p_codigo:cod, p_muelle:$('uMuelle').value, p_regional:$('uRegional').value});
  btn.disabled = false;
  if(error){ err(/permission/i.test(error.message) ? 'No tiene permiso para crear salas en ese grupo.' : error.message); return; }
  $('mUnidad').hidden = true;
  if(data && $('uFecha').value && $('uFecha').value !== hoyISO()) await sb.rpc('editar_unidad', {p_id:data, p_codigo:cod, p_muelle:$('uMuelle').value, p_regional:$('uRegional').value, p_creada:$('uFecha').value});
  try{ await cargarBase(); }catch(_){}
  toast(`${U[data]?.nombre || nombre} creada. Ya puede enviar solicitudes.`); render();
});

// ---------- eliminar (cerrar) o reactivar sala ----------
const botonEditar = u => (rol.admin || (u.grupo_id !== 'SIN' && rol.grupos.includes(u.grupo_id))) && u.activa ? `<button class="btn btn-sm" data-editar-unidad="${esc(u.id)}">Editar</button> ` : '';
function botonCerrar(u){
  if(!(rol.admin || (u.grupo_id !== 'SIN' && rol.grupos.includes(u.grupo_id)))) return '';
  return u.activa ? `<button class="btn btn-sm btn-danger" data-cerrar="${esc(u.id)}" data-activa="0">Eliminar</button>` : `<button class="btn btn-sm" data-cerrar="${esc(u.id)}" data-activa="1">Reactivar</button>`;
}
async function cerrarSala(uid, activar, btn){
  const u = U[uid]; if(!u) return;
  if(!activar){
    const pend = pedidos.filter(p => p.unidad_id === uid && (p.estado === 'Enviada' || p.estado === 'Confirmada')).length;
    if(!await confirmar(`¿Eliminar ${u.nombre}? Dejará de aparecer en la lista de sucursales, el mapa, las alertas, la cobertura y los reportes nuevos. Sus solicitudes anteriores se conservan en el historial.${pend ? ` Tiene ${plural(pend, 'solicitud pendiente', 'solicitudes pendientes')}: se mantendrán para que pueda terminarlas.` : ''} Puede reactivarla más adelante.`)) return;
  }
  btn.disabled = true;
  const {error} = await sb.rpc('cerrar_unidad', {p_id:uid, p_activa:activar});
  btn.disabled = false;
  if(error){ toast(errMsg(error)); return; }
  if(!activar && unidadSel === uid){ unidadSel = null; store.set('fch_unidad', ''); }
  try{ await cargarBase(); }catch(_){}
  toast(activar ? `${u.nombre} reactivada.` : `${u.nombre} eliminada de la lista.`); render();
}

// ---------- lista de materiales (para todos) ----------
let fMatQ = '', fMatCat = 'TODAS', ordMat = {k:'', dir:1};
try{ ordMat = JSON.parse(localStorage.getItem('fch_ord_mat')) || ordMat; }catch(e){}
const thOrd = (k, txt, cls) => `<th class="th-ord ${cls || ''}" data-ordmat="${k}" tabindex="0" title="Ordenar">${txt}<span class="flecha" data-fl="${k}"></span></th>`;
const ORD_MAT = {codigo: m => +normCod(m.codigo) || 0, desc: m => normTxt(m.descripcion), um: m => normTxt(m.unidad), cat: m => normTxt(m.categoria || 'General'), costo: m => P[m.codigo] ?? null};
document.addEventListener('click', e => { const th = e.target.closest?.('[data-ordmat]'); if(!th) return; const k = th.dataset.ordmat;
  ordMat = ordMat.k === k ? (ordMat.dir === 1 ? {k, dir:-1} : {k:'', dir:1}) : {k, dir:1};
  try{ localStorage.setItem('fch_ord_mat', JSON.stringify(ordMat)); }catch(e){} pintaMateriales(); });
document.addEventListener('keydown', e => { if((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.ordmat){ e.preventDefault(); e.target.click(); } });
function vMateriales(){
  const cats = [...new Set(ML.map(m => m.categoria || 'General'))].sort((a,b) => a.localeCompare(b,'es'));
  return `<section class="panel"><div class="panel-head"><div><h2>Lista de materiales</h2><p class="sub">Todos los insumos que se pueden pedir (${ML.filter(matActivo).length}). Antes de pedir un material nuevo, revise aquí si ya existe con otro nombre.${puedeCatalogo() ? ' Puede cambiar la categoría o eliminar un material que ya no se entrega; los eliminados quedan al final y se pueden reactivar.' : ''}</p></div>${puedeCatalogo() ? '<button class="btn btn-primary" id="btnNuevoMat">+ Nuevo material</button>' : ''}</div>
    <div class="row"><input id="fMatQ" placeholder="Buscar por código o nombre…" value="${esc(fMatQ)}" style="flex:1;min-width:220px" autocomplete="off">
      <select id="fMatCat" style="width:auto"><option value="TODAS">Todas las categorías</option>${cats.map(c => `<option ${fMatCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <p class="sub" id="matCuenta" style="margin:0"></p>
    <div class="tbl-wrap"><table><thead><tr>${thOrd('codigo','Código')}${thOrd('desc','Material')}${thOrd('um','U.M.','num')}${thOrd('cat','Categoría')}${verPrecios() ? thOrd('costo','Costo unit.','num') : ''}${puedeCatalogo() ? '<th class="num">Acción</th>' : ''}</tr></thead><tbody id="matFilas"></tbody></table></div></section>`;
}
const catsMat = () => [...new Set(ML.map(m => m.categoria || 'General'))].sort((a,b) => a.localeCompare(b,'es'));
async function cambiarCategoria(cod, val, el){
  const m = M[cod]; if(!m) return; const antes = m.categoria || 'General';
  if(val === '__nueva'){
    const td = el.parentElement;
    td.innerHTML = `<span class="row" style="gap:6px;flex-wrap:nowrap"><input data-catnueva="${esc(cod)}" maxlength="40" placeholder="Nombre de la categoría" style="width:170px"><button class="btn btn-primary" data-catok="${esc(cod)}">Guardar</button><button class="btn" data-catx="1">Cancelar</button></span>`;
    td.querySelector('input').focus(); return;
  }
  val = (val || '').trim(); if(!val || val === antes) return pintaMateriales();
  el.disabled = true;
  const {error} = await sb.rpc('cambiar_categoria', {p_codigo:cod, p_categoria:val});
  if(error){ toast('No se pudo cambiar: ' + error.message); return pintaMateriales(); }
  m.categoria = val; toast(`${m.descripcion}: ahora en ${val}.`);
  if(fMatCat !== 'TODAS' && !catsMat().includes(fMatCat)) fMatCat = 'TODAS';
  render();
}
document.addEventListener('click', e => {
  const ok = e.target.closest?.('[data-catok]'); if(ok){ const inp = ok.parentElement.querySelector('input'); cambiarCategoria(ok.dataset.catok, inp.value, inp); }
  if(e.target.closest?.('[data-catx]')) pintaMateriales();
});
document.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.dataset?.catnueva){ cambiarCategoria(e.target.dataset.catnueva, e.target.value, e.target); } });
function abrirNuevoMaterial(){
  ['matDesc','matCod','matUM','matCat'].forEach(i => $(i).value = '');
  $('dlUM').innerHTML = [...new Set(ML.map(m => (m.unidad || '').toUpperCase()).filter(Boolean))].sort().map(u => `<option value="${esc(u)}">`).join('');
  $('dlCat').innerHTML = catsMat().map(c => `<option value="${esc(c)}">`).join('');
  if(fMatCat !== 'TODAS') $('matCat').value = fMatCat;
  $('matMsg').hidden = true; $('matParecidos').hidden = true; $('matGuardar').disabled = false;
  $('mMaterial').hidden = false; $('matDesc').focus();
}
function parecidos(txt){
  const pal = normTxt(txt).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  if(!pal.length) return [];
  return ML.map(m => { const d = normTxt(m.descripcion); return {m, n:pal.filter(w => d.includes(w)).length}; })
    .filter(x => x.n >= Math.min(2, pal.length)).sort((a,b) => b.n - a.n).slice(0, 6).map(x => x.m);
}
function pintaParecidos(){
  const l = parecidos($('matDesc').value), box = $('matParecidos');
  box.hidden = !l.length;
  box.innerHTML = l.length ? `<b>¿Ya existe?</b> Materiales parecidos:<ul style="margin:6px 0 0;padding-left:18px">${l.map(m => `<li><span class="code">${esc(m.codigo)}</span> ${esc(m.descripcion)} <span class="sub">(${esc(m.unidad)})</span>${matActivo(m) ? '' : ' <span class="chip alerta">eliminado</span>'}</li>`).join('')}</ul>` : '';
}
$('matDesc').addEventListener('input', pintaParecidos);
$('matCod').addEventListener('input', () => { const c = $('matCod').value.trim(); $('matMsg').hidden = !M[c]; if(M[c]) $('matMsg').textContent = `El código ${c} ya es "${M[c].descripcion}".`; });
$('formMaterial').addEventListener('submit', async e => {
  e.preventDefault();
  const a = {p_codigo:$('matCod').value.trim(), p_descripcion:$('matDesc').value.trim(), p_unidad:$('matUM').value.trim(), p_categoria:$('matCat').value.trim()};
  $('matGuardar').disabled = true; $('matMsg').hidden = true;
  const {data, error} = await sb.rpc('crear_material', a);
  $('matGuardar').disabled = false;
  if(error){ $('matMsg').textContent = error.message; $('matMsg').hidden = false; return; }
  const m = typeof data === 'string' ? JSON.parse(data) : data;
  if(!ML.some(x => x.codigo === m.codigo)) ML.push(m); ML.sort((x,y) => x.descripcion.localeCompare(y.descripcion,'es')); M[m.codigo] = m;
  $('mMaterial').hidden = true; fMatQ = m.codigo; fMatCat = 'TODAS';
  toast(`Material creado: ${m.codigo} ${m.descripcion}. Ya se puede pedir.`); render();
});
async function cerrarMaterial(cod, activar, btn){
  const m = M[cod]; if(!m) return;
  if(!activar){
    const pend = pedidos.filter(p => p.estado === 'Enviada' && p.items.some(i => i.codigo === cod)).length;
    if(!await confirmar(`¿Eliminar ${m.descripcion} (${m.codigo})? Ya no se podrá pedir y no aparecerá en la lista de materiales. Las solicitudes y reportes anteriores lo conservan.${pend ? ` Está en ${plural(pend, 'solicitud pendiente', 'solicitudes pendientes')}: se mantienen como están.` : ''} Puede reactivarlo más adelante.`)) return;
  }
  btn.disabled = true;
  const {error} = await sb.rpc('cerrar_material', {p_codigo:cod, p_activo:!!activar});
  if(error){ btn.disabled = false; toast('No se pudo: ' + error.message); return; }
  m.activo = !!activar; toast(activar ? `${m.descripcion} se reactivó. Ya se puede pedir.` : `${m.descripcion} se eliminó del maestro.`); render();
}
document.addEventListener('click', e => {
  const c = e.target.closest?.('[data-matcerrar]'); if(c) cerrarMaterial(c.dataset.matcerrar, false, c);
  const a = e.target.closest?.('[data-matactivar]'); if(a) cerrarMaterial(a.dataset.matactivar, true, a);
});
function pintaMateriales(){
  const tb = $('matFilas'); if(!tb) return;
  const q = normTxt(fMatQ).trim(), pal = q.split(/\s+/).filter(Boolean);
  const edit = puedeCatalogo();
  const l = ML.filter(m => (edit || matActivo(m)) && (fMatCat === 'TODAS' || (m.categoria || 'General') === fMatCat) && (!pal.length || pal.every(w => normTxt(m.descripcion + ' ' + m.codigo).includes(w)))).sort((a,b) => { const act = matActivo(b) - matActivo(a); if(act || !ordMat.k) return act;
    const f = ORD_MAT[ordMat.k], x = f(a), y = f(b);
    if(x == null || y == null) return (x == null) - (y == null);
    return (typeof x === 'number' ? x - y : x.localeCompare(y, 'es')) * ordMat.dir; });
  document.querySelectorAll('[data-fl]').forEach(el => { const on = el.dataset.fl === ordMat.k; el.textContent = on ? (ordMat.dir === 1 ? '▲' : '▼') : '⇅'; el.classList.toggle('on', on); el.parentElement.setAttribute('aria-sort', on ? (ordMat.dir === 1 ? 'ascending' : 'descending') : 'none'); });
  $('matCuenta').textContent = q || fMatCat !== 'TODAS' ? `${plural(l.length, 'material encontrado', 'materiales encontrados')}` : '';
  const cats = catsMat();
  const celda = m => edit ? `<select data-cat="${esc(m.codigo)}" aria-label="Categoría de ${esc(m.descripcion)}" style="width:auto;min-width:130px">${cats.map(c => `<option ${(m.categoria || 'General') === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__nueva">+ Nueva categoría…</option></select>` : `<span class="chip">${esc(m.categoria || 'General')}</span>`;
  const acc = m => matActivo(m) ? `<button class="btn btn-sm btn-danger" data-matcerrar="${esc(m.codigo)}">Eliminar</button>` : `<button class="btn btn-sm" data-matactivar="${esc(m.codigo)}">Reactivar</button>`;
  tb.innerHTML = l.length ? l.map(m => `<tr class="${matActivo(m) ? '' : 'cerrada'}"><td class="code">${esc(m.codigo)}</td><td>${esc(m.descripcion)}${matActivo(m) ? '' : ' <span class="chip alerta">eliminado</span>'}</td><td class="num">${esc(m.unidad)}</td><td>${matActivo(m) ? celda(m) : `<span class="chip">${esc(m.categoria || 'General')}</span>`}</td>${verPrecios() ? `<td class="num">${rol.admin ? `<input type="number" min="0" step="0.01" class="qty precio" data-precio="${esc(m.codigo)}" value="${P[m.codigo] != null ? +P[m.codigo].toFixed(2) : ''}" placeholder="–" aria-label="Costo de ${esc(m.descripcion)}">` : (P[m.codigo] != null ? fBs(P[m.codigo]) : '<span class="sub">–</span>')}</td>` : ''}${edit ? `<td class="num">${acc(m)}</td>` : ''}</tr>`).join('')
    : '<tr><td colspan="5" class="empty">No hay materiales con ese nombre. Pruebe con otra palabra o con el código.</td></tr>';
}

// Tab o Enter en la cantidad → vuelve al buscador para agregar el siguiente insumo
document.addEventListener('keydown', e => {
  if((e.key !== 'Tab' && e.key !== 'Enter') || e.shiftKey || e.altKey || e.ctrlKey) return;
  const t = e.target, destino = t.dataset?.nk != null ? 'nBuscar' : t.dataset?.kq != null ? 'kitBuscar' : null;
  if(!destino || !$(destino)) return;
  e.preventDefault();
  t.blur();
  const ir = () => { const b = $(destino); if(b){ b.focus(); b.select?.(); } };
  ir(); setTimeout(ir, 30);
});


// ---------- inventario vs. solicitudes: qué falta para abastecer ----------
let fInvPend = true, fInvQ = '', fInvVer = 'falta', impInv = null;
function datosInventario(){
  const conf = {}, pend = {}, salasC = {}, info = {};
  pedidos.forEach(p => { const dest = p.estado === 'Confirmada' ? conf : p.estado === 'Enviada' ? pend : null; if(!dest) return;
    p.items.forEach(i => { const c = +i.cantidad || 0; if(!c) return; dest[i.codigo] = (dest[i.codigo] || 0) + c; info[i.codigo] ||= i; (salasC[i.codigo] ||= new Set()).add(p.unidad_id); }); });
  const cods = new Set([...Object.keys(conf), ...Object.keys(pend), ...ML.filter(matActivo).map(m => m.codigo)]);
  return [...cods].map(c => { const m = M[c] || info[c] || {}, st = INV[c] || 0, cf = conf[c] || 0, pe = pend[c] || 0, nec = cf + (fInvPend ? pe : 0), saldo = st - nec;
    return {codigo:c, descripcion:m.descripcion || c, unidad:m.unidad || '', stock:st, conf:cf, pend:pe, nec, saldo, falta:Math.max(0, -saldo), salas:salasC[c]?.size || 0, precio:P[c]}; })
    .filter(r => r.nec > 0 || r.stock > 0);
}
function vInventario(){
  const todos = datosInventario(), q = normTxt(fInvQ).trim().split(/\s+/).filter(Boolean);
  const l = todos.filter(r => (fInvVer === 'todos' || (fInvVer === 'falta' ? r.falta > 0 : r.nec > 0)) && (!q.length || q.every(w => normTxt(r.descripcion + ' ' + r.codigo).includes(w))))
    .sort((a, b) => (b.falta > 0) - (a.falta > 0) || b.falta * (b.precio || 0) - a.falta * (a.precio || 0) || b.falta - a.falta || a.descripcion.localeCompare(b.descripcion, 'es'));
  const conNec = todos.filter(r => r.nec > 0), faltan = conNec.filter(r => r.falta > 0), valor = faltan.reduce((a, r) => a + r.falta * (r.precio || 0), 0), sinP = faltan.filter(r => r.precio == null).length;
  const fq = n => (+n).toLocaleString('es-BO', {maximumFractionDigits:2});
  const cuando = INV_INFO ? `Inventario cargado el ${fFH(new Date(INV_INFO.ts).getTime())}${INV_INFO.archivo ? ' · ' + esc(INV_INFO.archivo) : ''}` : 'Todavía no se cargó el inventario';
  return `<section class="panel"><div class="panel-head"><div><h2>Inventario y necesidad de compra</h2><p class="sub">${cuando}. Se resta del stock lo confirmado que falta entregar${fInvPend ? ' y lo que está por confirmar' : ''}.</p></div>
    <div class="row">${rol.admin ? '<button class="btn btn-sm btn-primary" id="btnInvSubir">⬆ Cargar inventario</button><input type="file" id="fileInv" accept=".xlsx,.xls,.csv" hidden>' : ''}<button class="btn btn-sm" id="btnInvExcel" ${faltan.length ? '' : 'disabled'}>⬇ Excel de compra</button></div></div>
    <div class="inv-res"><div class="kpi ${faltan.length ? 'mal' : 'bien'}"><b>${faltan.length}</b><span>de ${conNec.length} insumos solicitados<br>no alcanzan con el stock</span></div>
      <div class="kpi"><b>${fBs(valor)}</b><span>valor a comprar${sinP ? `<br>${plural(sinP, 'insumo sin costo', 'insumos sin costo')}` : ''}</span></div>
      <div class="kpi bien"><b>${conNec.length - faltan.length}</b><span>insumos cubiertos<br>en su totalidad</span></div></div>
    <div class="row"><input id="fInvQ" placeholder="Buscar insumo o código…" value="${esc(fInvQ)}" style="flex:1;min-width:200px" autocomplete="off">
      <select id="fInvVer" style="width:auto"><option value="falta" ${fInvVer === 'falta' ? 'selected' : ''}>Solo lo que falta comprar</option><option value="nec" ${fInvVer === 'nec' ? 'selected' : ''}>Todo lo solicitado</option><option value="todos" ${fInvVer === 'todos' ? 'selected' : ''}>Todo el inventario</option></select>
      <label class="recordar" style="margin:0"><input type="checkbox" id="fInvPend" ${fInvPend ? 'checked' : ''}> Incluir solicitudes por confirmar</label></div>
    <div class="tbl-wrap"><table class="inv"><thead><tr><th>Código</th><th>Insumo</th><th class="num">U.M.</th><th class="num">Stock</th><th class="num">Confirmado<br>por entregar</th><th class="num">Por<br>confirmar</th><th class="num">Necesidad</th><th class="num">Saldo</th><th class="num">A comprar</th>${verPrecios() ? '<th class="num">Valor compra</th>' : ''}</tr></thead><tbody>` +
    (l.length ? l.map(r => `<tr class="${r.falta ? 'inv-falta' : ''}"><td class="code">${esc(r.codigo)}</td><td>${esc(r.descripcion)}${r.salas ? `<div class="sub" style="margin:0">${plural(r.salas, 'sala o área', 'salas y áreas')}</div>` : ''}</td><td class="num">${esc(r.unidad)}</td>
      <td class="num">${fq(r.stock)}</td><td class="num">${r.conf ? fq(r.conf) : '<span class="zero">–</span>'}</td><td class="num ${fInvPend ? '' : 'sub'}">${r.pend ? fq(r.pend) : '<span class="zero">–</span>'}</td><td class="num"><strong>${fq(r.nec)}</strong></td>
      <td class="num ${r.saldo < 0 ? 'neg' : ''}">${fq(r.saldo)}</td><td class="num">${r.falta ? `<strong class="neg">${fq(r.falta)}</strong>` : '<span class="chip Entregada">alcanza</span>'}</td>${verPrecios() ? `<td class="num" style="white-space:nowrap">${r.falta ? (r.precio != null ? fBs(r.falta * r.precio) : '<span class="sub">sin costo</span>') : ''}</td>` : ''}</tr>`).join('')
      : `<tr><td colspan="10" class="empty">${fInvVer === 'falta' ? 'Con el stock actual alcanza para todo lo solicitado. 🎉' : 'No hay insumos para mostrar.'}</td></tr>`) + '</tbody></table></div></section>';
}
function excelCompra(){
  const l = datosInventario().filter(r => r.falta > 0).sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es'));
  const W = XL.libro(), h = W.hoja('Necesidad de compra'), cab = {b:true, sz:10, color:'FFFFFFFF', fill:'FF1F3864', h:'center', v:'center', wrap:true, bt:'thin', bb:'thin', bl:'thin', br:'thin'};
  const cols = ['Código','Insumo','U.M.','Stock','Confirmado por entregar','Por confirmar','Necesidad','A comprar'].concat(verPrecios() ? ['Costo unit. (Bs)','Valor (Bs)'] : []);
  cols.forEach((t, c) => h.set(0, c, t, cab)); [9,40,7,10,13,11,11,11,12,13].forEach((w, c) => h.anchos[c] = w); h.altos[0] = 30;
  l.forEach((r, k) => { const s = (hh, ex = {}) => ({sz:10, h:hh, v:'center', bt:'thin', bb:'thin', bl:'thin', br:'thin', ...ex}), y = k + 1;
    [r.codigo, r.descripcion, r.unidad].forEach((v, c) => h.set(y, c, v, s(c === 1 ? 'left' : 'center')));
    [r.stock, r.conf, fInvPend ? r.pend : 0, r.nec].forEach((v, c) => h.set(y, 3 + c, +v, s('center')));
    h.set(y, 7, +r.falta, s('center', {b:true, fill:'FFFFF2CC'}));
    if(verPrecios()){ h.set(y, 8, r.precio != null ? Math.round(r.precio * 100) / 100 : '', s('right', {fmt:1})); h.set(y, 9, r.precio != null ? null : '', s('right', {fmt:1}), r.precio != null ? `H${y + 1}*I${y + 1}` : undefined); } });
  if(verPrecios() && l.length){ const y = l.length + 1; h.set(y, 8, 'Total', {b:true, sz:10, h:'right'}); h.set(y, 9, null, {b:true, sz:10, h:'right', fmt:1, bt:'thin'}, `SUM(J2:J${y})`); }
  h.freeze = 1; h.filtro = `A1:${verPrecios() ? 'J' : 'H'}${l.length + 1}`;
  descargar(W.generar(), `Necesidad_compra_insumos_${hoyISO()}.xlsx`);
}
// carga de inventario: Excel con columnas de código y stock (y costo opcional), o el reporte del sistema
async function leerInventario(file){
  try{
    await cargarLibXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), {type:'array'}), ws = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:''}).filter(f => f.some(c => String(c).trim()));
    prepararInventario(filas, file.name);
  }catch(e){ toast(errMsg(e)); }
}
function prepararInventario(filas, nombre){
  const num = v => { const t = String(v ?? '').trim().replace(/\s/g, ''); if(!/^-?[\d.,]+$/.test(t)) return null; const n = parseFloat(/,\d{1,2}$/.test(t) && !/\.\d/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')); return isNaN(n) ? null : n; };
  const ancho = Math.max(...filas.slice(0, 200).map(f => f.length));
  // fila de títulos (si hay)
  const hi = filas.slice(0, 15).findIndex(f => f.some(c => /cod/i.test(normTxt(String(c)))) && f.some(c => /stock|saldo|exist|cant|fisico|disponible/i.test(normTxt(String(c)))));
  const cab = hi >= 0 ? filas[hi].map(c => normTxt(String(c))) : [];
  const datos = hi >= 0 ? filas.slice(hi + 1) : filas;
  let cc = cab.findIndex(t => /cod/.test(t) && !/barra/.test(t)), cs = cab.findIndex(t => /stock|saldo|exist|fisico|disponible/.test(t)), cp = cab.findIndex(t => /costo|precio|c\.?\s*u|unit/.test(t));
  if(cs < 0) cs = cab.findIndex(t => /^cant|cantidad/.test(t));
  if(cc < 0){ let best = 0; for(let i = 0; i < ancho; i++){ const k = datos.filter(f => M[normCod(f[i])]).length; if(k > best){ best = k; cc = i; } } }
  if(cc >= 0 && cs < 0){ for(let i = cc + 1; i < ancho; i++){ if(datos.filter(f => num(f[i]) != null).length > datos.length * .6){ cs = i; break; } } }
  if(cc >= 0 && cs >= 0 && cp < 0){ for(let i = cs + 1; i < ancho; i++){ if(datos.filter(f => num(f[i]) != null).length > datos.length * .6){ cp = i; break; } } }
  if(cc < 0 || cs < 0){ toast('No reconocí las columnas de código y stock. El archivo debe tener una columna "Código" y otra "Stock" (o "Saldo").'); return; }
  const por = {};
  datos.forEach(f => { const c = normCod(f[cc]), st = num(f[cs]); if(!/^\d{3,7}$/.test(c) || st == null) return; const x = por[c] ||= {codigo:c, stock:0, costo:null}; x.stock += st; const pc = cp >= 0 ? num(f[cp]) : null; if(pc != null && pc > 0) x.costo = pc; });
  const items = Object.values(por);
  if(!items.length){ toast('El archivo no tiene filas con código y stock.'); return; }
  impInv = {items, nombre, conCosto: cp >= 0};
  const enMae = items.filter(i => M[i.codigo]), cambian = enMae.filter(i => (INV[i.codigo] || 0) !== i.stock), faltanMae = ML.filter(m => matActivo(m) && !por[m.codigo]);
  $('invBody').innerHTML = `<p class="sub" style="margin:0">Archivo: <strong>${esc(nombre)}</strong> · ${plural(items.length, 'insumo', 'insumos')} con stock (${enMae.length} están en la lista de materiales de la app).</p>
    <div class="notice info">Esta carga <strong>reemplaza</strong> el inventario anterior: lo que no venga en el archivo queda con stock 0.${faltanMae.length ? ` ${plural(faltanMae.length, 'material de la app no aparece', 'materiales de la app no aparecen')} en el archivo.` : ''}</div>
    <div class="tbl-wrap" style="max-height:46vh;overflow:auto"><table><thead><tr><th>Código</th><th>Insumo</th><th class="num">Stock antes</th><th class="num">Stock nuevo</th>${impInv.conCosto ? '<th class="num">Costo</th>' : ''}</tr></thead><tbody>${enMae.sort((a, b) => (M[a.codigo].descripcion || '').localeCompare(M[b.codigo].descripcion || '', 'es')).map(i => `<tr><td class="code">${esc(i.codigo)}</td><td>${esc(M[i.codigo].descripcion)}</td><td class="num sub">${INV[i.codigo] ?? '–'}</td><td class="num"><strong>${i.stock}</strong></td>${impInv.conCosto ? `<td class="num">${i.costo != null ? fBs(i.costo) : '–'}</td>` : ''}</tr>`).join('')}</tbody></table></div>
    ${impInv.conCosto ? '<label class="recordar"><input type="checkbox" id="invCostos"> Actualizar también los costos de los materiales con los del archivo</label>' : ''}`;
  $('invAplicar').textContent = `Cargar inventario (${plural(cambian.length, 'cambio', 'cambios')})`;
  $('mInv').hidden = false;
}
async function aplicarInventario(btn){
  btn.disabled = true;
  const {data, error} = await sb.rpc('cargar_inventario', {p_items:impInv.items, p_archivo:impInv.nombre, p_costos:!!$('invCostos')?.checked});
  btn.disabled = false;
  if(error){ toast('No se pudo cargar: ' + errMsg(error)); return; }
  $('mInv').hidden = true; toast(`Inventario actualizado: ${plural(data ?? impInv.items.length, 'insumo', 'insumos')}.`);
  await cargarInventario(); if($('invCostos')?.checked) await cargarPrecios(); render();
}
document.addEventListener('click', e => {
  const t = e.target;
  if(t.id === 'btnInvSubir') $('fileInv').click();
  if(t.id === 'btnInvExcel') excelCompra();
  if(t.id === 'invAplicar') aplicarInventario(t);
});
document.addEventListener('change', e => {
  const t = e.target;
  if(t.id === 'fileInv' && t.files[0]){ leerInventario(t.files[0]); t.value = ''; }
  if(t.id === 'fInvPend'){ fInvPend = t.checked; render(); }
  if(t.id === 'fInvVer'){ fInvVer = t.value; render(); }
});
document.addEventListener('input', e => { if(e.target.id === 'fInvQ'){ fInvQ = e.target.value; render(); } });
