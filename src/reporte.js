// ---------- reporte de dotación en el formato del Excel "Dotacion Sucursales" ----------
const MUELLES_R = ['DESP-01','DESP-02','DESP-03','DESP-04','DESP-05'];
function datosDotacion(ciclo, alcance){
  const incl = p => cicloDe(p.ts) === ciclo && (p.estado === 'Confirmada' || (fPrepEst === 'ciclo' && p.estado === 'Entregada')) && U[p.unidad_id] && (alcance === 'todo' || U[p.unidad_id].tipo === 'Sucursal');
  const porU = {};
  pedidos.filter(incl).forEach(p => { const m = porU[p.unidad_id] ||= {}; (p.estado === 'Entregada' && p.items_entregados ? p.items_entregados : p.items).forEach(i => { const c = +i.cantidad || 0; if(!c) return; const x = m[i.codigo] ||= {codigo:i.codigo, descripcion:M[i.codigo]?.descripcion || i.descripcion, unidad:M[i.codigo]?.unidad || i.unidad, cantidad:0}; x.cantidad += c; }); });
  const muelleDe = u => MUELLES_R.includes(u.muelle) ? u.muelle : 'SIN MUELLE';
  const ordM = m => m === 'SIN MUELLE' ? 99 : MUELLES_R.indexOf(m);
  const unidades = Object.keys(porU).map(id => U[id]).sort((a,b) => ordM(muelleDe(a)) - ordM(muelleDe(b)) || ordU(a) - ordU(b) || a.nombre.localeCompare(b.nombre,'es'))
    .map(u => ({u, muelle:muelleDe(u), items:Object.values(porU[u.id]).sort((a,b) => a.descripcion.localeCompare(b.descripcion,'es'))}));
  return unidades;
}
const numSi = v => (v != null && /^[1-9]\d*$/.test(String(v))) ? +v : (v || '');
function libroDotacion(ciclo, alcance){
  const bloques = datosDotacion(ciclo, alcance);
  const W = XL.libro(), AZUL = 'FF1F3864', GRIS = 'FFD9D9D9', BLANCO = 'FFFFFFFF';
  const cab = {b:true, sz:10, color:'FFFFFFFF', fill:AZUL, h:'center', v:'center', wrap:true, bt:'thin', bb:'thin', bl:'thin', br:'thin'};
  // Hoja 1: Dotacion Sucursales
  const h1 = W.hoja('Dotacion Sucursales');
  ['Cod. Sucursal','Sucursal','Regional','Cod. Insumo','Item','U.M.','Cantidad','Muelle','Responsable'].forEach((t, c) => h1.set(0, c, t, cab));
  h1.altos[0] = 26.1; [8,27.4,10,8,31,5.4,8,8.4,16.4].forEach((w, c) => h1.anchos[c] = w);
  const POR_PAG = 50; let r = 1, enPag = 0, pag = 1; const indice = [];
  bloques.forEach((b, bi) => {
    const n = b.items.length;
    if(enPag > 0 && enPag + n > POR_PAG){ h1.cortes.push(r); pag++; enPag = 0; } // corte después de la fila r (1-based = r)
    const fill = bi % 2 === 0 ? GRIS : BLANCO, ini = r;
    b.items.forEach((it, k) => {
      const prim = k === 0, ult = k === n - 1, bt = prim ? 'medium' : 'thin', bb = ult ? 'medium' : 'thin';
      const s = (h, extra = {}) => ({sz:9, fill, h, v:'center', bt, bb, bl:'thin', br:'thin', ...extra});
      h1.set(r, 0, numSi(b.u.codigo_sala), s('center', {b:prim}));
      h1.set(r, 1, b.u.nombre, s('left', {b:prim}));
      h1.set(r, 2, b.u.regional || '', s('left'));
      h1.set(r, 3, numSi(it.codigo), s('center'));
      h1.set(r, 4, it.descripcion, s('left'));
      h1.set(r, 5, it.unidad, s('center'));
      h1.set(r, 6, it.cantidad, s('center'));
      h1.set(r, 7, b.muelle, s('center', {b:prim}));
      h1.set(r, 8, '', {sz:9, fill:prim ? fill : null, h:'left', v:'top', bt:'medium', bb:'medium', bl:'medium', br:'medium'});
      h1.altos[r] = 15.95; r++; enPag++;
    });
    if(n > 1) h1.merges.push(`I${ini + 1}:I${r}`);
    indice.push({pag, b, items:n, total:b.items.reduce((a,i) => a + i.cantidad, 0)});
  });
  h1.freeze = 1; h1.titulos = ['1','1']; h1.escala = 82; if(r > 1) h1.filtro = `A1:H${r}`;
  // Hoja 2: Consolidado Insumos
  const h2 = W.hoja('Consolidado Insumos');
  const cols = [...MUELLES_R, 'SIN MUELLE'];
  const conP = verPrecios();
  ['N°','Cod. Insumo','Item','U.M.', ...cols, 'Total','N° Salas','Preparado ✓', ...(conP ? ['Costo unit. (Bs)','Valor (Bs)'] : [])].forEach((t, c) => h2.set(0, c, t, cab));
  h2.altos[0] = 30; [4,9,36,6,8.4,8.4,8.4,8.4,8.4,8.4,9,7,10,11,12].forEach((w, c) => h2.anchos[c] = w);
  const ins = {}; bloques.forEach(b => b.items.forEach(i => { const x = ins[i.codigo] ||= {...i, por:{}, total:0, salas:new Set()}; x.por[b.muelle] = (x.por[b.muelle] || 0) + i.cantidad; x.total += i.cantidad; x.salas.add(b.u.id); }));
  const lista = Object.values(ins).sort((a,b) => a.descripcion.localeCompare(b.descripcion,'es'));
  lista.forEach((it, k) => {
    const rr = k + 1, fill = k % 2 ? 'FFF2F2F2' : null, s = (h, ex = {}) => ({sz:10, fill, h, v:'center', bt:'thin', bb:'thin', bl:'thin', br:'thin', ...ex});
    h2.set(rr, 0, k + 1, s('center')); h2.set(rr, 1, numSi(it.codigo), s('center')); h2.set(rr, 2, it.descripcion, s('left')); h2.set(rr, 3, it.unidad, s('center'));
    cols.forEach((m, j) => h2.set(rr, 4 + j, it.por[m] || '', s('center')));
    h2.set(rr, 10, it.total, s('center', {b:true, fill:'FFDDEBF7'})); h2.set(rr, 11, it.salas.size, s('center')); h2.set(rr, 12, '', s('center'));
    if(conP){ const pu = P[it.codigo]; h2.set(rr, 13, pu != null ? Math.round(pu * 100) / 100 : '', s('right', {fmt:'#,##0.00'})); h2.set(rr, 14, pu != null ? null : '', s('right', {fmt:'#,##0.00', b:true}), pu != null ? `K${rr + 1}*N${rr + 1}` : undefined); }
    h2.altos[rr] = 18;
  });
  const tr = lista.length + 1, st = {b:true, sz:10, color:'FFFFFFFF', fill:AZUL, h:'center', v:'center', bt:'thin', bb:'thin', bl:'thin', br:'thin'};
  for(let c = 0; c < (conP ? 15 : 13); c++) h2.set(tr, c, '', st);
  h2.set(tr, 2, 'TOTAL GENERAL', st);
  if(lista.length) for(let c = 4; c <= 10; c++){ const L = XL.col(c); h2.set(tr, c, null, st, `SUM(${L}2:${L}${tr})`); }
  if(conP && lista.length) h2.set(tr, 14, null, {...st, fmt:'#,##0.00', h:'right'}, `SUM(O2:O${tr})`);
  h2.altos[tr] = 20; h2.freeze = 1; h2.titulos = ['1','1']; h2.ajustarAncho = true;
  // Hoja 3: Indice Salas
  const h3 = W.hoja('Indice Salas');
  ['Hoja','Muelle','Cod. Sucursal','Sucursal','Regional','N° Ítems','Cant. total','Responsable'].forEach((t, c) => h3.set(0, c, t, cab));
  h3.altos[0] = 26.1; [6,11,10,34,12,8,9,22].forEach((w, c) => h3.anchos[c] = w);
  indice.forEach((x, k) => {
    const rr = k + 1, fill = k % 2 ? 'FFFFFFFF' : GRIS, s = (h, ex = {}) => ({sz:9, fill, h, v:'center', bt:'thin', bb:'thin', bl:'thin', br:'thin', ...ex});
    h3.set(rr, 0, x.pag, s('center', {b:true})); h3.set(rr, 1, x.b.muelle, s('center')); h3.set(rr, 2, numSi(x.b.u.codigo_sala), s('center'));
    h3.set(rr, 3, x.b.u.nombre, s('left')); h3.set(rr, 4, x.b.u.regional || '', s('left')); h3.set(rr, 5, x.items, s('center')); h3.set(rr, 6, x.total, s('center')); h3.set(rr, 7, '', s('left'));
    h3.altos[rr] = 13.5;
  });
  h3.freeze = 1; h3.titulos = ['1','1']; h3.ajustarAncho = true;
  return {bytes:W.generar(), salas:bloques.length, insumos:lista.length, paginas:pag};
}
async function descargar(bytes, nombre){
  const tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  try{ const dl = window.claude?.use ? await window.claude.use('downloads') : null; if(dl){ await dl.save({filename:nombre, data:new Blob([bytes], {type:tipo})}); return; } }catch(e){ if(e && e.code === 'declined') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], {type:tipo})); a.download = nombre; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
