import { expect, test } from '@playwright/test';
import { configurarMfa, ingresar } from './ayudas';

test('la administradora agrega una persona, concede Jurídica a la asistente y desactiva a la nueva', async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@demo.test`;
  await ingresar(page, 'administradora@demo.test');
  await configurarMfa(page);
  await expect(
    page.getByRole('heading', { name: '¿Con qué copropiedad va a trabajar?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Condominio Demo Las Palmas/ }).click();
  await page.getByRole('link', { name: 'Personas y permisos' }).click();
  await expect(page.getByRole('heading', { name: 'Personas y permisos' })).toBeVisible();

  await page.getByRole('button', { name: 'Agregar persona' }).click();
  await page.getByLabel('Nombre completo').fill('Persona E2E');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Rol', { exact: true }).selectOption('OPERACIONES');
  await page.getByRole('button', { name: 'Guardar persona' }).click();
  await expect(page.getByRole('status')).toContainText('Persona E2E recibirá un correo');
  const filaNueva = page.getByRole('row').filter({ hasText: email });
  await expect(filaNueva).toBeVisible();

  const filaAsistente = page.getByRole('row').filter({ hasText: 'asistente@demo.test' });
  await filaAsistente.getByRole('button', { name: 'Permisos' }).click();
  const panel = page.getByRole('region', { name: 'Permisos de Andrés Asistente' });
  await panel.getByLabel('Área').selectOption('04');
  await panel.getByLabel('Acción').selectOption('leer');
  await panel.getByRole('button', { name: 'Conceder' }).click();
  await expect(panel.getByRole('row', { name: /04 Jurídica y convivencia/ })).toContainText(
    'Leer (concedido)',
  );

  await filaNueva.getByRole('button', { name: 'Desactivar' }).click();
  await page.getByRole('button', { name: 'Sí, desactivar' }).click();
  await expect(filaNueva.getByText('Inactiva')).toBeVisible();
});
