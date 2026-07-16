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

## Base de datos

El proyecto usa Supabase Auth y `public.lockin_state_user` para guardar un documento de estado por usuario. Row Level Security impide que una cuenta pueda leer o modificar el progreso de otra.

```bash
supabase link --project-ref boejvavrpolvtabunddo
supabase migration list --linked
supabase db push --linked
```

Las migraciones versionadas están en `supabase/migrations/`.

## Producción

```bash
npm run build
```

Antes de publicar en un dominio nuevo, agrega su URL en Supabase Dashboard → Authentication → URL Configuration → Redirect URLs. La app usa el origen actual como regreso de confirmación y recuperación de contraseña.
