# Manual de acceso a ZULU ADMIN

## Objetivo

Esta guía explica cómo activar una cuenta recibida por invitación y cómo iniciar sesión en ZULU ADMIN con contraseña y verificación en dos pasos (MFA/2FA).

## Requisitos

- Tener una cuenta activa creada por el administrador del sistema.
- Poder abrir el correo de invitación enviado a la dirección asociada a la cuenta.
- Para perfiles que requieren MFA, tener un teléfono con una aplicación compatible con códigos TOTP, como Google Authenticator, Microsoft Authenticator u otra aplicación que permita agregar una cuenta mediante QR o clave de configuración.

## 1. Activar la cuenta desde el correo

1. Abra el correo **“Bienvenido a ZULU ADMIN: active su cuenta”**. Revise también las carpetas de correo no deseado o spam.
2. Seleccione **Definir mi contraseña**. El enlace es personal, se puede usar una sola vez y vence a las **72 horas**.
3. En la página de ZULU ADMIN, escriba una contraseña nueva de al menos **12 caracteres** y repítala para confirmarla.
4. Seleccione **Guardar contraseña**. Cuando aparezca la confirmación, seleccione **Ir a ingresar**.

Si el enlace venció o ya se usó, vaya a la pantalla de ingreso y seleccione **Olvidé mi contraseña**. Ingrese el correo de su cuenta y use el nuevo enlace que recibirá. El enlace de recuperación vence en **30 minutos** y también sirve una sola vez. Si no recibe la invitación, pida al administrador que revise la cuenta y reenvíe la invitación.

## 2. Iniciar sesión

1. Abra [ZULU ADMIN](https://cesarvargas.tech/zulu/ingresar).
2. Escriba el correo al que llegó la invitación y la contraseña que acaba de definir.
3. Seleccione **Ingresar**.
4. Según el perfil de la cuenta, ocurrirá una de estas opciones:
   - **El perfil no requiere MFA:** se abrirá el sistema.
   - **El perfil requiere MFA y aún no lo configuró:** ZULU ADMIN le pedirá configurarlo. Siga la sección 3.
   - **El perfil requiere MFA y ya lo configuró:** ZULU ADMIN le pedirá un código de la aplicación. Siga la sección 4.

El sistema exige MFA a los superadministradores ZULU y a los perfiles de **Administrador**, **Contador** y **Asesor jurídico**. Los demás perfiles pueden ingresar sin MFA, salvo que su política de acceso cambie.

## 3. Configurar Google Authenticator u otra aplicación

La configuración se realiza una sola vez por cuenta.

1. Instale o abra una aplicación de autenticación compatible con TOTP, por ejemplo **Google Authenticator** o **Microsoft Authenticator**.
2. En la pantalla **Proteja su cuenta**, agregue una cuenta nueva en la aplicación y escanee el QR que muestra ZULU ADMIN.
3. Si no puede escanear el QR, agregue la cuenta manualmente usando la clave que aparece debajo del QR. Mantenga esa clave privada y no la envíe a nadie.
4. La aplicación mostrará un código temporal de **6 dígitos** para ZULU ADMIN. Escríbalo en el campo **Código de 6 dígitos** y seleccione **Activar verificación**.
5. ZULU ADMIN mostrará **10 códigos de respaldo**. Guárdelos en un lugar seguro, separado del teléfono. Cada código se puede usar una sola vez y no volverá a mostrarse.
6. Marque **Guardé mis códigos de respaldo en un lugar seguro** y seleccione **Continuar**.

La verificación en dos pasos ya quedó activa. No cierre la pantalla antes de guardar los códigos de respaldo.

## 4. Ingresar con MFA en sesiones posteriores

1. Ingrese su correo y contraseña en la pantalla de ZULU ADMIN.
2. Abra la aplicación de autenticación que registró para ZULU ADMIN.
3. Escriba el código temporal de **6 dígitos** que muestra la aplicación y seleccione **Verificar**.
4. Al validarse el código, se abrirá el sistema.

Los códigos cambian periódicamente. Si uno vence antes de enviarlo, espere a que la aplicación muestre el siguiente y úselo.

### Ingresar con un código de respaldo

Si no tiene el teléfono, seleccione **Usar un código de respaldo** en la pantalla MFA, escriba uno de los códigos guardados y seleccione **Verificar**. El código utilizado queda invalidado; conserve los demás para futuras emergencias.

## 5. Recuperar el acceso

### Olvidó la contraseña

1. En la pantalla de ingreso, seleccione **Olvidé mi contraseña**.
2. Escriba el correo de la cuenta y seleccione **Enviar enlace**.
3. Abra el correo de recuperación y use el enlace antes de que pasen **30 minutos**.
4. Defina una contraseña nueva de al menos **12 caracteres** y vuelva a ingresar.

Al cambiar la contraseña, el sistema cierra las sesiones abiertas. La recuperación de contraseña no reemplaza ni desactiva la verificación MFA.

### Perdió el teléfono y los códigos de respaldo

Contacte al administrador de ZULU ADMIN para solicitar ayuda con la verificación de la cuenta. No comparta la contraseña, el QR, la clave de configuración ni códigos MFA por correo o chat.

## 6. Recomendaciones de seguridad

- Use una contraseña única para ZULU ADMIN y no la comparta.
- No reenvíe el correo de invitación: contiene un enlace personal de un solo uso.
- No comparta los códigos temporales, códigos de respaldo, QR ni clave manual con ninguna persona.
- Guarde los códigos de respaldo en un lugar seguro. Cada uno es de un solo uso.
- Al terminar en un equipo compartido, seleccione **Salir** y cierre el navegador.

## Solución de problemas

| Situación | Qué hacer |
| --- | --- |
| El enlace de invitación venció o ya se usó | Use **Olvidé mi contraseña** para solicitar un enlace nuevo o pida al administrador que reenvíe la invitación. |
| El sistema indica que el correo o la contraseña son incorrectos | Verifique el correo usado para la invitación. Si no recuerda la contraseña, use **Olvidé mi contraseña**. |
| El código de 6 dígitos no funciona | Compruebe que está usando la cuenta de ZULU ADMIN en la aplicación, espere el siguiente código y revise que la hora del teléfono esté configurada automáticamente. |
| No puede escanear el QR | Agregue la cuenta manualmente con la clave que aparece debajo del QR. |
| No ve la pantalla MFA después de ingresar | El perfil puede no requerir MFA. Los superadministradores ZULU, Administradores, Contadores y Asesores jurídicos sí deben configurarlo. |
| No recibió el correo | Revise spam y correo no deseado. Si no aparece, contacte al administrador para que confirme la dirección y reenvíe la invitación. |
