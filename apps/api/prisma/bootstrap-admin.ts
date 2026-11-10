/** Crea únicamente el superadmin inicial de producción; no carga datos demo. */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ZULU_ADMIN_EMAIL?.trim().toLowerCase();
  const nombre = process.env.ZULU_ADMIN_NAME?.trim();
  if (!email || !nombre) {
    throw new Error('Defina ZULU_ADMIN_EMAIL y ZULU_ADMIN_NAME.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ZULU_ADMIN_EMAIL no es válido.');
  }
  if (await prisma.usuario.findUnique({ where: { email } })) {
    throw new Error('Ese correo ya existe; no se modificó ningún usuario.');
  }
  await prisma.usuario.create({
    data: { email, nombre, esSuperadmin: true },
  });
  console.log(`Superadmin creado para ${email}; solicite recuperación para definir la contraseña.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'No fue posible crear el superadmin.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
