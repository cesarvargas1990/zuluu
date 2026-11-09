import { expect, test } from '@playwright/test';
import { ingresar, salir } from './ayudas';

test('la asistente entra, la recarga mantiene la sesión, no accede a Personas y sale', async ({
  page,
}) => {
  await ingresar(page, 'asistente@demo.test');
  await expect(page.getByRole('heading', { name: 'Hola, Andrés' })).toBeVisible();
  await expect(page.getByText('Asistente administrativa').first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hola, Andrés' })).toBeVisible();

  await expect(page.getByRole('link', { name: 'Personas y permisos' })).toHaveCount(0);
  await page.goto('/personas');
  await expect(page.getByRole('heading', { name: 'No tiene acceso a esta sección' })).toBeVisible();

  await salir(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
});

test('credenciales incorrectas muestran un error en texto', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill('asistente@demo.test');
  await page.getByLabel('Contraseña').fill('no-es-la-clave');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email o contraseña incorrectos.');
  await expect(page.getByLabel('Contraseña')).toBeFocused();
});

test('el ingreso se puede completar solo con teclado', async ({ page }) => {
  await page.goto('/ingresar');
  await expect(page.getByLabel('Email')).toBeFocused();
  await page.keyboard.type('asistente@demo.test');
  await page.keyboard.press('Tab');
  await page.keyboard.type(process.env.SEED_PASSWORD ?? '');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Hola, Andrés' })).toBeVisible();
});
