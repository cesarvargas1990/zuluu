# Especificación: Auditoría de accesos

## Propósito

Dejar evidencia inalterable de eventos de seguridad (§9, §11 trazabilidad 100 %).

## Requisitos

### Requisito: Eventos auditados

El sistema MUST registrar en la bitácora, con actor, fecha, acción, objeto, IP y resultado:

| Evento                                                           | Antes/después |
| ---------------------------------------------------------------- | ------------- |
| login exitoso / fallido / bloqueado                              | —             |
| logout, reuso de renovación                                      | —             |
| MFA registrado / verificado / fallido / código de respaldo usado | —             |
| recuperación solicitada / completada                             | —             |
| membresía creada / modificada / desactivada                      | Sí            |
| concesión o restricción creada / revocada                        | Sí            |
| acceso excepcional abierto / usado / vencido                     | Sí            |
| acceso denegado (403)                                            | —             |

#### Escenario: Login fallido auditado

- DADO un intento con contraseña incorrecta
- CUANDO se rechaza
- ENTONCES existe un registro `auth.login_fallido` con IP y sin la contraseña

#### Escenario: Cambio de permisos con antes/después

- DADO una ADMINISTRADORA que revoca una concesión
- CUANDO la operación termina
- ENTONCES el registro contiene el estado anterior y el nuevo

#### Escenario: Cambio y auditoría son atómicos

- DADO un fallo al escribir la auditoría
- CUANDO se modifica una membresía
- ENTONCES el cambio no se aplica

### Requisito: Inalterabilidad

La bitácora MUST NOT poder modificarse ni borrarse desde la aplicación.

#### Escenario: Intento de borrado

- DADO el rol de aplicación
- CUANDO intenta borrar o actualizar un registro de auditoría
- ENTONCES la base de datos lo rechaza

### Requisito: Aislamiento de la bitácora

Los eventos de un condominio MUST ser visibles solo en su contexto; los eventos sin condominio (login) MUST NOT ser visibles para usuarios de condominios.

#### Escenario: Consulta desde otro condominio

- DADO eventos del condominio A
- CUANDO una ADMINISTRADORA de B consulta la bitácora
- ENTONCES no ve eventos de A

### Requisito: Datos sensibles fuera de la bitácora

La bitácora MUST NOT contener contraseñas, secretos TOTP, tokens ni códigos de respaldo.

#### Escenario: Registro de MFA

- DADO el registro de un TOTP
- CUANDO se audita
- ENTONCES el registro no contiene el secreto
