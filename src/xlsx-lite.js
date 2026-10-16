// ---------- generador de Excel (.xlsx) con estilos, sin librerías externas ----------
const XL = (() => {
  const enc = new TextEncoder();
  const CRC = (() => { const t = new Uint32Array(256); for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for(let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files){ // [{name, data:Uint8Array}] — método "store"
    const parts = [], central = []; let off = 0;
    const u16 = v => [v & 255, (v >>> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for(const f of files){
      const nm = enc.encode(f.name), c = crc32(f.data), sz = f.data.length;
      const loc = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0)]);
      parts.push(loc, nm, f.data);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nm);
      off += loc.length + nm.length + sz;
    }
    const cdSize = central.reduce((a,b) => a + b.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(off), ...u16(0)]);
    const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((a,b) => a + b.length, 0));
    let p = 0; for(const a of all){ out.set(a, p); p += a.length; } return out;
  }
  const x = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const col = n => { let s = ''; n++; while(n){ const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const ref = (r, c) => col(c) + (r + 1);

  function libro(){
    const fonts = ['<font><sz val="10"/><name val="Calibri"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    const idx = (arr, xml) => { let i = arr.indexOf(xml); if(i < 0){ arr.push(xml); i = arr.length - 1; } return i; };
    const cacheS = new Map();
    function estilo(s){ // {b, sz, color, fill, h, v, wrap, bt, bb, bl, br}
      if(!s) return 0; const k = JSON.stringify(s); if(cacheS.has(k)) return cacheS.get(k);
      const f = idx(fonts, `<font>${s.b ? '<b/>' : ''}<sz val="${s.sz || 10}"/>${s.color ? `<color rgb="${s.color}"/>` : ''}<name val="Calibri"/></font>`);
      const fi = s.fill ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const bd = e => e ? `<${e[0]} style="${e[1]}"><color rgb="FF000000"/></${e[0]}>` : '';
      const b = idx(borders, `<border>${bd(s.bl && ['left', s.bl]) || '<left/>'}${bd(s.br && ['right', s.br]) || '<right/>'}${bd(s.bt && ['top', s.bt]) || '<top/>'}${bd(s.bb && ['bottom', s.bb]) || '<bottom/>'}<diagonal/></border>`);
      const al = (s.h || s.v || s.wrap) ? `<alignment${s.h ? ` horizontal="${s.h}"` : ''}${s.v ? ` vertical="${s.v}"` : ''}${s.wrap ? ' wrapText="1"' : ''}/>` : '';
      const nf = s.fmt ? 4 : 0;
      const i = idx(xfs, `<xf numFmtId="${nf}"${nf ? ' applyNumberFormat="1"' : ''} fontId="${f}" fillId="${fi}" borderId="${b}" xfId="0"${f ? ' applyFont="1"' : ''}${fi ? ' applyFill="1"' : ''}${b ? ' applyBorder="1"' : ''}${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`);
      cacheS.set(k, i); return i;
    }
    const hojas = [];
    function hoja(nombre){
      const h = {nombre, filas:[], anchos:{}, altos:{}, merges:[], cortes:[], freeze:null, filtro:null, titulos:null, ajustarAncho:false, escala:null, centrar:true, pie:'&C&BPágina &P de &N&B',
        set(r, c, v, s, f){ (h.filas[r] ||= [])[c] = {v, s:estilo(s), f}; return h; }};
      hojas.push(h); return h;
    }
    function hojaXml(h){
      const filas = h.filas.map((fila, r) => { if(!fila) return '';
        const celdas = fila.map((c, ci) => { if(!c) return ''; const a = ref(r, ci), s = c.s ? ` s="${c.s}"` : '';
          if(c.f) return `<c r="${a}"${s}><f>${x(c.f)}</f></c>`;
          if(c.v == null || c.v === '') return `<c r="${a}"${s}/>`;
          if(typeof c.v === 'number') return `<c r="${a}"${s}><v>${c.v}</v></c>`;
          return `<c r="${a}"${s} t="inlineStr"><is><t xml:space="preserve">${x(c.v)}</t></is></c>`; }).join('');
        return `<row r="${r + 1}"${h.altos[r] ? ` ht="${h.altos[r]}" customHeight="1"` : ''}>${celdas}</row>`; }).join('');
      const cols = Object.keys(h.anchos).length ? '<cols>' + Object.entries(h.anchos).map(([c, w]) => `<col min="${+c + 1}" max="${+c + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
      const pane = h.freeze ? `<pane ySplit="${h.freeze}" topLeftCell="A${h.freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>` : '';
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr>${h.ajustarAncho ? '<pageSetUpPr fitToPage="1"/>' : ''}</sheetPr><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${filas}</sheetData>
${h.filtro ? `<autoFilter ref="${h.filtro}"/>` : ''}${h.merges.length ? `<mergeCells count="${h.merges.length}">${h.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}
<printOptions horizontalCentered="${h.centrar ? 1 : 0}"/><pageMargins left="0.3" right="0.3" top="0.45" bottom="0.55" header="0.2" footer="0.25"/>
<pageSetup paperSize="1"${h.escala ? ` scale="${h.escala}"` : ''} orientation="portrait"${h.ajustarAncho ? ' fitToWidth="1" fitToHeight="0"' : ''}/><headerFooter><oddFooter>${x(h.pie)}</oddFooter></headerFooter>
${h.cortes.length ? `<rowBreaks count="${h.cortes.length}" manualBreakCount="${h.cortes.length}">${h.cortes.map(r => `<brk id="${r}" max="16383" man="1"/>`).join('')}</rowBreaks>` : ''}</worksheet>`;
    }
    function generar(){
      const files = [], E = s => enc.encode(s);
      files.push({name:'[Content_Types].xml', data:E(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((h,i) => `<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)});
      files.push({name:'_rels/.rels', data:E(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`)});
      const nombres = hojas.map((h, i) => [h.titulos ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${x(h.nombre)}'!$${h.titulos[0]}:$${h.titulos[1]}</definedName>` : '', h.filtro ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${x(h.nombre)}'!$${h.filtro.replace(/([A-Z]+)(\d+)/g, '$1$$$2').replace(':', ':$')}</definedName>` : ''].join('')).join('');
      files.push({name:'xl/workbook.xml', data:E(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${hojas.map((h,i) => `<sheet name="${x(h.nombre)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets>${nombres ? `<definedNames>${nombres}</definedNames>` : ''}</workbook>`)});
      files.push({name:'xl/_rels/workbook.xml.rels', data:E(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((h,i) => `<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)});
      hojas.forEach((h, i) => files.push({name:`xl/worksheets/sheet${i+1}.xml`, data:E(hojaXml(h))}));
      files.push({name:'xl/styles.xml', data:E(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`)});
      return zip(files);
    }
    return {hoja, generar};
  }
  return {libro, col, ref};
})();
