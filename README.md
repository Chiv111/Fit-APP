# Anvil Fit App

Aplicación web móvil para registrar rutinas, series, cargas, progreso e historial por fecha.

## Desarrollo local

```bash
npm install
npm run dev
```

La configuración local vive en `.env` y no se sube a Git. El frontend acepta:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SUPABASE_AUTH_REDIRECT_URL=
```

La clave `publishable` es pública y está diseñada para el navegador. Nunca agregues una clave `service_role` o `sb_secret` al frontend.

## Base de datos y protección de datos

El proyecto usa Supabase Auth y un documento privado de estado por usuario:

- `public.lockin_state_user`: estado actual, una fila por cuenta.
- `public.lockin_state_revisions`: historial inmutable para recuperación.
- `public.save_lockin_state(...)`: guardado atómico con versión esperada; evita que dos dispositivos se pisen silenciosamente.
- `public.restore_lockin_state(...)`: restaura una copia anterior como una versión nueva, sin borrar el historial.

Row Level Security (RLS) limita todas las lecturas al `auth.uid()` de la sesión. El navegador sólo tiene permisos de lectura directa; los cambios pasan por RPC autenticado, con validación de cuenta y control de versión. `anon` no puede consultar ni modificar progreso.

```bash
supabase link --project-ref boejvavrpolvtabunddo
supabase migration list --linked
supabase db push --linked
```

Las migraciones versionadas están en `supabase/migrations/`.

### Recuperación y exportación

En Ajustes → Tus datos, cada persona puede:

- descargar una copia JSON completa;
- restaurar una copia JSON validada;
- exportar progreso detallado en CSV compatible con Excel;
- consultar y restaurar las últimas versiones privadas guardadas en Supabase.

La cola local conserva cambios cuando no hay internet y los vuelve a intentar al reconectar. El servidor usa compare-and-swap para detectar cambios realizados desde otro dispositivo antes de guardar.

### Operación de respaldos

Las revisiones de la aplicación protegen contra errores de uso, pero no sustituyen el respaldo administrado de toda la base. Para producción:

1. Revisa periódicamente Supabase Dashboard → Database → Backups.
2. Activa Point-in-Time Recovery (PITR) si el plan lo permite y el costo es aceptable.
3. Haz una restauración de prueba antes de cada cambio grande de esquema.
4. Conserva exportaciones periódicas fuera de Supabase.

Nunca prometas pérdida cero absoluta: la meta operativa es tener varias capas independientes de recuperación y comprobarlas.

## Producción

```bash
npm run build
```

Antes de publicar en un dominio nuevo, agrega su URL en Supabase Dashboard → Authentication → URL Configuration → Redirect URLs. La app usa el origen actual como regreso de confirmación y recuperación de contraseña.
