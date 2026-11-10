/** Contenido de los correos transaccionales (texto plano + HTML simple con la identidad ZULU). */

export interface Contenido {
  asunto: string;
  texto: string;
  html: string;
}

interface Base {
  nombre: string;
  enlace: string;
  urlIngreso: string;
}

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function plantilla(
  titulo: string,
  cuerpoHtml: string,
  enlace: string,
  textoBoton: string,
  pie: string,
) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f4;font-family:Arial,Helvetica,sans-serif;color:#142019">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f4;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0b2e1a;padding:20px 28px;color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:1px">ZULU <span style="font-size:12px;font-weight:normal;letter-spacing:0">ADMIN · Majagua Digital</span></td></tr>
<tr><td style="height:4px;background:linear-gradient(90deg,#8cc63f 50%,#f08a24 50%)"></td></tr>
<tr><td style="padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">${titulo}</h1>
${cuerpoHtml}
<p style="margin:24px 0"><a href="${enlace}" style="background:#14522f;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">${textoBoton}</a></p>
<p style="font-size:12px;color:#4f5e55;margin:0">Si el botón no funciona, copie y pegue este enlace en su navegador:<br><a href="${enlace}" style="color:#14522f;word-break:break-all">${enlace}</a></p>
</td></tr>
<tr><td style="padding:16px 28px;background:#f4f6f4;font-size:12px;color:#4f5e55">${pie}</td></tr>
</table></td></tr></table></body></html>`;
}

export function correoInvitacion({
  nombre,
  enlace,
  urlIngreso,
  horas,
}: Base & { horas: number }): Contenido {
  const asunto = 'Bienvenido a ZULU ADMIN: active su cuenta';
  const texto = [
    `Hola ${nombre}:`,
    '',
    'Se creó su cuenta en ZULU ADMIN, la plataforma de administración de condominios de ZULU Servicios Integrales.',
    '',
    'Para ingresar por primera vez:',
    `1. Abra este enlace y defina su contraseña (mínimo 12 caracteres): ${enlace}`,
    `2. Ingrese en ${urlIngreso} con su email y la contraseña que definió.`,
    '3. Si su perfil lo requiere, configure la verificación en dos pasos: instale Google Authenticator o Microsoft Authenticator en su celular, escanee el código QR que verá en pantalla y guarde sus códigos de respaldo.',
    '',
    `El enlace es personal, sirve una sola vez y vence en ${horas} horas. Si vence, use "Olvidé mi contraseña" en la pantalla de ingreso.`,
    '',
    'Si usted no esperaba este correo, ignórelo.',
  ].join('\n');
  const html = plantilla(
    `Hola ${escapar(nombre)}, bienvenido`,
    `<p style="margin:0 0 12px">Se creó su cuenta en <strong>ZULU ADMIN</strong>. Para ingresar por primera vez:</p>
<ol style="margin:0 0 12px;padding-left:20px;line-height:1.6">
<li><strong>Defina su contraseña</strong> con el botón de abajo (mínimo 12 caracteres).</li>
<li><strong>Ingrese</strong> en <a href="${urlIngreso}" style="color:#14522f">${urlIngreso}</a> con su email y esa contraseña.</li>
<li>Si su perfil lo requiere, <strong>configure la verificación en dos pasos</strong>: instale Google Authenticator o Microsoft Authenticator, escanee el código QR que verá en pantalla y guarde sus códigos de respaldo.</li>
</ol>
<p style="margin:0;color:#4f5e55;font-size:14px">El enlace es personal, sirve una sola vez y vence en ${horas} horas. Si vence, use “Olvidé mi contraseña” en la pantalla de ingreso.</p>`,
    enlace,
    'Definir mi contraseña',
    'Si usted no esperaba este correo, ignórelo. ZULU Servicios Integrales S.A.S.',
  );
  return { asunto, texto, html };
}

export function correoRecuperacion({
  nombre,
  enlace,
  urlIngreso,
  minutos,
}: Base & { minutos: number }): Contenido {
  const asunto = 'Restablecer contraseña de ZULU ADMIN';
  const texto = [
    `Hola ${nombre}:`,
    '',
    `Para definir una contraseña nueva abra este enlace (válido ${minutos} minutos, un solo uso):`,
    enlace,
    '',
    `Luego ingrese en ${urlIngreso}. Por seguridad se cerrarán sus sesiones abiertas.`,
    '',
    'Si usted no lo solicitó, ignore este mensaje: su contraseña actual sigue funcionando.',
  ].join('\n');
  const html = plantilla(
    'Restablecer contraseña',
    `<p style="margin:0 0 12px">Hola ${escapar(nombre)}, recibimos una solicitud para restablecer su contraseña.</p>
<p style="margin:0;color:#4f5e55;font-size:14px">El enlace vale ${minutos} minutos y sirve una sola vez. Por seguridad se cerrarán sus sesiones abiertas.</p>`,
    enlace,
    'Definir contraseña nueva',
    'Si usted no lo solicitó, ignore este mensaje: su contraseña actual sigue funcionando.',
  );
  return { asunto, texto, html };
}
