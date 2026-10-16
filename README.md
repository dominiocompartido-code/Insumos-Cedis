# Insumos de Limpieza · Farmacias Chávez

App web (PWA) para que sucursales y áreas soliciten insumos de limpieza y oficina, las aprobadoras las confirmen y Logística CEDIS las entregue.

- `src/` — código fuente (`head.html` + `app.js`, `ciclo.js`, `reporte.js`, `xlsx-lite.js`) y archivos de la PWA (`src/pwa/`).
- `app/` — sitio listo que publica Netlify (lo genera `build.py`, no editar a mano).
- Base de datos y usuarios: Supabase, proyecto `insumos-cedis`.

## Cambios

1. Editar los archivos de `src/`.
2. `python3 build.py` (une todo en `app/index.html` y sube la versión de caché).
3. Commit y push a `main` → GitHub Pages publica `app/` solo (ver `.github/workflows/pages.yml`).

`vista-previa.html` es una demo local con datos de ejemplo; no se sube.
