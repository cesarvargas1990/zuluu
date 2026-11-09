import { expect, test } from '@playwright/test';
import { authenticator } from 'otplib';
import { configurarMfa, ingresar, salir } from './ayudas';

test('la contadora configura MFA la primera vez y luego entra con su código', async ({ page }) => {
  await ingresar(page, 'contadora@demo.test');
  const secreto = await configurarMfa(page);
  await expect(page.getByRole('heading', { name: 'Hola, Carla' })).toBeVisible();

  await salir(page);
  await ingresar(page, 'contadora@demo.test');
  await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible();
  await page.getByLabel('Código de 6 dígitos').fill(authenticator.generate(secreto));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByRole('heading', { name: 'Hola, Carla' })).toBeVisible();
});
