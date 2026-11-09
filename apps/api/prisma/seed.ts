/**
 * Seed de desarrollo con datos FICTICIOS. Nunca cargar datos reales de propietarios.
 * Usa el rol owner (DATABASE_URL). Idempotente.
 */
import { PrismaClient, type Rol } from '@prisma/client';
import { hashPassword } from '../src/auth/password';

const prisma = new PrismaClient();
const password = process.env.SEED_PASSWORD;

const condominios = [
  { nit: '900000001-1', razonSocial: 'Condominio Demo Las Palmas' },
  { nit: '900000002-2', razonSocial: 'Condominio Demo El Lago' },
];

const usuarios: { email: string; nombre: string; rol: Rol }[] = [
  { email: 'administradora@demo.test', nombre: 'Ana Administradora', rol: 'ADMINISTRADORA' },
  { email: 'asistente@demo.test', nombre: 'Andrés Asistente', rol: 'ASISTENTE' },
  { email: 'contadora@demo.test', nombre: 'Carla Contadora', rol: 'CONTADORA' },
  { email: 'juridico@demo.test', nombre: 'Julio Jurídico', rol: 'ASESOR_JURIDICO' },
  { email: 'operaciones@demo.test', nombre: 'Óscar Operaciones', rol: 'OPERACIONES' },
  { email: 'consejo@demo.test', nombre: 'Clara Consejo', rol: 'CONSEJO' },
];

async function main() {
  if (!password) throw new Error('Defina SEED_PASSWORD en .env');
  const passwordHash = await hashPassword(password);

  const [principal, otro] = await Promise.all(
    condominios.map((c) =>
      prisma.condominio.upsert({ where: { nit: c.nit }, update: {}, create: c }),
    ),
  );

  await prisma.usuario.upsert({
    where: { email: 'superadmin@zulu.test' },
    update: {},
    create: {
      email: 'superadmin@zulu.test',
      nombre: 'Super Admin ZULU',
      passwordHash,
      esSuperadmin: true,
    },
  });

  for (const u of usuarios) {
    const usuario = await prisma.usuario.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, nombre: u.nombre, passwordHash },
    });
    await prisma.membresia.upsert({
      where: {
        condominioId_usuarioId_rol: {
          condominioId: principal!.id,
          usuarioId: usuario.id,
          rol: u.rol,
        },
      },
      update: {},
      create: { condominioId: principal!.id, usuarioId: usuario.id, rol: u.rol },
    });
  }

  // Usuario del segundo condominio para probar aislamiento
  const otroAdmin = await prisma.usuario.upsert({
    where: { email: 'admin.lago@demo.test' },
    update: {},
    create: { email: 'admin.lago@demo.test', nombre: 'Laura Lago', passwordHash },
  });
  await prisma.membresia.upsert({
    where: {
      condominioId_usuarioId_rol: {
        condominioId: otro!.id,
        usuarioId: otroAdmin.id,
        rol: 'ADMINISTRADORA',
      },
    },
    update: {},
    create: { condominioId: otro!.id, usuarioId: otroAdmin.id, rol: 'ADMINISTRADORA' },
  });

  console.log(
    `Seed listo: ${condominios.length} condominios, ${usuarios.length + 2} usuarios (contraseña: SEED_PASSWORD)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
