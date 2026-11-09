import { expect, type Page } from '@playwright/test';
import { authenticator } from 'otplib';

export const PASSWORD = process.env.SEED_PASSWORD ?? '';

export async function ingresar(page: Page, email: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Completa el registro de MFA leyendo la clave de la pantalla. Devuelve el secreto. */
export async function configurarMfa(page: Page): Promise<string> {
  await expect(page.getByRole('heading', { name: 'Proteja su cuenta' })).toBeVisible();
  const secreto = (await page.locator('code').innerText()).trim();
  await page.getByLabel('Código de 6 dígitos').fill(authenticator.generate(secreto));
  await page.getByRole('button', { name: 'Activar verificación' }).click();
  await expect(page.getByRole('heading', { name: 'Guarde sus códigos de respaldo' })).toBeVisible();
  await page.getByLabel('Guardé mis códigos de respaldo en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  return secreto;
}

export async function salir(page: Page) {
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
}
