import { expect, test } from '@playwright/test';
import { PASSWORD, configurarMfa, ingresar, salir } from './ayudas';

const MAILPIT = 'http://localhost:8025';

/** Busca en Mailpit el último correo enviado a `para` y devuelve su texto. */
async function ultimoCorreo(request: import('@playwright/test').APIRequestContext, para: string) {
  for (let i = 0; i < 20; i++) {
    const r = await request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${para}`)}`,
    );
    const { messages } = (await r.json()) as { messages: { ID: string; Subject: string }[] };
    if (messages.length) {
      const m = await (await request.get(`${MAILPIT}/api/v1/message/${messages[0]!.ID}`)).json();
      return { asunto: messages[0]!.Subject, texto: m.Text as string };
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`No llegó correo a ${para}`);
}

test('el superadmin crea un usuario con rol; el correo llega y la persona entra por primera vez', async ({
  page,
  request,
}) => {
  const email = `e2e-${Date.now()}@demo.test`;

  await ingresar(page, 'superadmin@zulu.test');
  await configurarMfa(page);
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Usuarios' })
    .click();
  await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();

  await page.getByRole('button', { name: 'Crear usuario' }).click();
  await page.getByLabel('Nombre completo').fill('Persona Invitada');
  await page.getByLabel('Email').fill(email);
  await page
    .getByLabel('Condominio del rol 1', { exact: true })
    .selectOption({ label: 'Condominio Demo Las Palmas' });
  await page.getByLabel('Rol 1', { exact: true }).selectOption('ASISTENTE');
  await page.getByRole('button', { name: 'Crear y enviar invitación' }).click();
  await expect(page.getByRole('status')).toContainText(`Le enviamos a ${email} un correo`);
  const fila = page.getByRole('row').filter({ hasText: email });
  await expect(fila).toContainText('Condominio Demo Las Palmas · Asistente administrativa');
  await expect(fila).toContainText('Invitación pendiente');

  const correo = await ultimoCorreo(request, email);
  expect(correo.asunto).toBe('Bienvenido a ZULU ADMIN: active su cuenta');
  expect(correo.texto).toContain('verificación en dos pasos');
  const enlace = /https?:\/\/\S+\/restablecer\?token=\S+/.exec(correo.texto)![0];

  await salir(page);
  await page.goto(enlace.replace(/^https?:\/\/[^/]+/, ''));
  await page.getByLabel('Contraseña nueva').fill(PASSWORD);
  await page.getByLabel('Repita la contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('status')).toContainText('Su contraseña quedó guardada');

  await ingresar(page, email);
  await expect(page.getByRole('heading', { name: 'Hola, Persona' })).toBeVisible();
  await expect(page.getByText('Asistente administrativa').first()).toBeVisible();
});
