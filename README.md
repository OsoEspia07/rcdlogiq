# RCDlogiq

MVP web/PWA para gestionar residuos de construccion y demolicion con PostgreSQL. Funciona localmente con pgAdmin 4 y queda preparado para primer deploy gratuito en Vercel conectado a Neon.

## Stack

- Next.js App Router, React, TypeScript y TailwindCSS.
- PostgreSQL con driver `pg`; local en pgAdmin 4 o production en Neon.
- Auth propia con cookies HTTP-only y password hashing `scrypt`.
- Uploads locales en `storage/` durante desarrollo y storage en PostgreSQL para Vercel/serverless.
- PDF generado server-side y registrado en PostgreSQL.
- Geocoding automatico al crear obra con fallback local y mapa operativo embebido.
- Hardening minimo: rate limiting, headers de seguridad, validacion server-side, uploads restringidos y logs de seguridad.

## Configuracion con pgAdmin 4

1. Abre pgAdmin 4.
2. Crea una base de datos, por ejemplo `rcd_passport`.
3. Abre Query Tool sobre esa base.
4. Ejecuta [db/schema.sql](</C:/Users/juanc/Documents/Codex/2026-05-14/construir-una-plataforma-web-y-mobile-2/db/schema.sql>).
5. Si ya tenias la base creada antes de Fase 3, ejecuta [db/phase3.sql](</C:/Users/juanc/Documents/Codex/2026-05-14/construir-una-plataforma-web-y-mobile-2/db/phase3.sql>).
6. Ejecuta [db/phase6.sql](</C:/Users/juanc/Documents/Codex/2026-05-14/construir-una-plataforma-web-y-mobile-2/db/phase6.sql>) para activar asignacion operativa, cumplimiento, alertas, incidentes, tracking y control operativo.
7. Opcional: ejecuta [db/seed.sql](</C:/Users/juanc/Documents/Codex/2026-05-14/construir-una-plataforma-web-y-mobile-2/db/seed.sql>).
8. Copia `.env.example` a `.env.local` y ajusta:

```bash
DATABASE_URL=postgres://postgres:your_password@localhost:5432/rcd_passport
NEXT_PUBLIC_APP_URL=http://localhost:3000
SESSION_SECRET=change-this-long-random-secret
NODE_ENV=development
LOCAL_STORAGE_ROOT=storage
FILE_STORAGE_DRIVER=local
```

## Deploy gratuito en Vercel + Neon

1. Crea un proyecto gratuito en Neon y copia el connection string pooled si Neon lo ofrece.
2. Ejecuta en Neon, en este orden:

```sql
-- db/schema.sql
-- db/phase3.sql si vienes de una base anterior
-- db/phase6.sql
-- db/vercel_neon.sql
-- db/security_hardening.sql
```

3. En Vercel configura estas variables:

```bash
DATABASE_URL=postgres://...
NEXT_PUBLIC_APP_URL=https://tu-app.vercel.app
SESSION_SECRET=un-secreto-largo-y-aleatorio
NODE_ENV=production
FILE_STORAGE_DRIVER=database
```

`NEXT_PUBLIC_MAPBOX_TOKEN` es opcional para mapas reales. Sin token, la app mantiene el fallback visual.

Notas de produccion:

- No se usa storage persistente local en Vercel. Los archivos del piloto se guardan en `file_objects` dentro de Neon.
- La capa Postgres limita conexiones en production para cuidar el free tier.
- `vercel.json` deja el build explicito con `npm run build`.

## Ejecutar

```bash
npm install
npm run dev
```

App: `http://localhost:3000`

## Auth

El signup crea usuarios en `users` con rol:

- cliente
- transportador
- planta

El rol `admin` no se permite desde UI. Puedes promover un usuario desde pgAdmin:

```sql
update users set role = 'admin' where email = 'tu@email.com';
```

## APIs

- `POST /api/projects`: crea obras para clientes.
- `GET /api/pickup-requests`: lista solicitudes visibles.
- `POST /api/pickup-requests`: crea solicitud, `residue_passport`, QR y primer `tracking_event`.
- `POST /api/assignments`: asigna transportador, vehiculo y planta desde admin.
- `POST /api/tracking-events`: cambia estado y registra auditoria.
- `POST /api/weight-tickets`: registra peso, aprueba recepcion y genera certificado.
- `POST /api/uploads`: guarda evidencias y registra `photos`.
- `GET /api/certificates/:id`: genera PDF con datos reales, timeline y evidencias.
- `GET /passport/:id`: pagina verificable de trazabilidad del residuo.
- `GET/POST /api/dispatch/suggestions`: calcula y guarda sugerencias automaticas de transportador, vehiculo y planta.
- `GET/PATCH /api/operational-alerts`: lista y gestiona alertas operacionales.
- `GET/POST/PATCH /api/incidents`: crea, asigna y resuelve incidentes.
- `GET/POST /api/vehicle-locations`: guarda tracking periodico de vehiculos.
- `GET /api/operations/control-tower`: snapshot operacional para torre de control.

## Tablas

El schema incluye:

- `users`
- `app_sessions`
- `projects`
- `pickup_requests`
- `residue_passports`
- `tracking_events`
- `vehicles`
- `drivers`
- `plants`
- `weight_tickets`
- `certificates`
- `photos`
- `payments`
- `vehicle_locations`
- `sla_metrics`
- `operational_alerts`
- `transporter_scores`
- `incidents`
- `incident_comments`
- `notifications`
- `operational_events`
- `dispatch_suggestions`
- `file_objects`
- `security_logs`
- vista `analytics`
- vista `operations_analytics`

## Seguridad

Esta version usa RBAC real con tablas `roles`, `permissions`, `role_permissions` y `user_roles`.

Permisos granulares incluidos:

- `pickup.create`
- `pickup.read.own`
- `pickup.read.all`
- `pickup.assign`
- `pickup.cancel.own`
- `tracking.update`
- `weight.register`
- `certificate.generate`
- `admin.audit.read`

Tambien valida transiciones de estado por rol en backend:

- cliente ve solo sus solicitudes
- transportador ve servicios asignados
- planta ve recepciones de su planta
- admin ve todo

La UI renderiza dashboards distintos por rol: cliente marketplace, transportador fleet operations, planta recepcion/bascula y admin control tower.

## Hardening de produccion

- Rate limits server-side para login, signup, uploads, tracking, PDFs y APIs mutables.
- Cookies `httpOnly`, `sameSite=lax`, `secure` en produccion y expiracion de sesion.
- Headers globales: CSP, HSTS, `X-Frame-Options`, `nosniff`, Referrer Policy y Permissions Policy.
- Validacion server-side de UUIDs, enums, numeros, strings, fechas y transiciones operativas.
- Uploads limitados a JPG, JPEG, PNG y PDF, maximo 10MB y nombres internos.
- `security_logs` registra rate limits, rechazos de upload e intentos invalidos de auth.

Para produccion avanzada, se recomienda complementar esto con roles/privilegios nativos de PostgreSQL, auditoria de sesiones y storage externo dedicado. Para el piloto gratuito en Vercel + Neon, `file_objects` evita escrituras locales incompatibles con serverless.
