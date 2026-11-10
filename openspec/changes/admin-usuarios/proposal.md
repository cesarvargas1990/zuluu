# Propuesta: Administración de usuarios por el superadministrador

## Intención

En producción el único usuario es el superadministrador ZULU. No tiene rol en ningún condominio, así que no puede crear personas ni asignarles roles, y no existe ningún condominio. Hace falta una consola de superadmin para crear usuarios, enviarles por correo las instrucciones del primer ingreso y asignarles roles por condominio (§2: "configura condominios y roles").

## Alcance

### Incluido

- API `/admin/*` solo para superadmin (con MFA): condominios (listar, crear), usuarios (listar, crear, activar/desactivar, reenviar invitación), roles por condominio (asignar, cambiar, desactivar).
- Correo de invitación con instrucciones de primer ingreso (definir contraseña, ingresar, configurar MFA si el rol lo exige); enlace válido 72 h.
- SMTP con usuario y clave (Gmail con clave de aplicación) por variables de entorno.
- Web: sección "Administración ZULU" en la barra lateral (Usuarios, Condominios), visible solo al superadmin.
- Despliegue en https://cesarvargas.tech/zulu.

### Excluido

- Crear otros superadministradores desde la web (sigue por script).
- Ver datos de negocio de un condominio (sigue requiriendo acceso excepcional).

## Capacidades

### Nuevas

- `admin-usuarios`: gestión de usuarios, roles y condominios por el superadmin.

### Modificadas

- Ninguna en spec: la invitación reutiliza el flujo de definir contraseña de `autenticacion`.

## Enfoque

Funciones `SECURITY DEFINER` acotadas para listar condominios y membresías de todos los condominios sin abrir RLS; escrituras por condominio con `withTenant`. Auditoría de cada acción.

## Riesgos

| Riesgo                                | Prob.                       | Mitigación                                                                 |
| ------------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| Correo no llega (SMTP sin configurar) | Alta hasta configurar Gmail | Respuesta `correoEnviado`, aviso en pantalla y botón "Reenviar invitación" |
| Despliegue afecta datos de producción | Baja                        | Respaldo `pg_dump` antes; migraciones aditivas                             |

## Rollback

Revertir el código y redeplegar; la migración solo agrega funciones (se pueden eliminar sin pérdida de datos).

## Criterios de éxito

- [ ] El superadmin crea un condominio y un usuario con rol, y el usuario recibe el correo con instrucciones.
- [ ] El superadmin cambia o quita roles y desactiva usuarios.
- [ ] Ningún otro perfil accede a `/admin/*` (403).
- [ ] Desplegado y verificado en producción.
