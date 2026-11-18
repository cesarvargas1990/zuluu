# Especificación: control de 2FA (parámetros generales)

## Requisitos

### Requisito: Solo el superadministrador

La pantalla y los endpoints de parámetros MUST ser exclusivos del superadministrador.

#### Escenario: otro rol

- CUANDO una administradora consulta o cambia un parámetro ENTONCES recibe 403 y no ve el menú.

### Requisito: La regla global prima

Con el control global apagado, ninguna persona MUST necesitar 2FA, sin importar su ajuste individual. Con el control global encendido, el ajuste individual MUST decidir; sin ajuste rige la regla por rol.

#### Escenario: global apagado

- DADO un usuario con ajuste «Exigir siempre» y otro de un rol que normalmente lo exige
- CUANDO el control global está apagado
- ENTONCES ambos ingresan solo con contraseña y la pantalla marca «Sin efecto: el control general está apagado».

#### Escenario: global encendido

- CUANDO el control global está encendido
- ENTONCES «Exigir siempre» obliga a registrar y usar 2FA, «No exigir» exime aunque su rol lo exija, y «Según su rol» conserva la regla de siempre.

### Requisito: Aplicación y trazabilidad

Los cambios MUST aplicarse en el siguiente login o renovación de sesión y MUST quedar auditados con valor anterior, nuevo y responsable; guardar el mismo valor no genera evento.

## Decisiones

- De fábrica el control global está encendido: el comportamiento previo no cambia.
- El superadministrador también queda sujeto al control global (confirmación al apagarlo).
