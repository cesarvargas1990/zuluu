import type { Rol } from '@zulu/shared';
import type { PrismaService } from '../prisma/prisma.service';

export interface MembresiaUsuario {
  membresia_id: string;
  condominio_id: string;
  razon_social: string;
  rol: Rol;
  grupo_id: string | null;
  grupo_nombre: string | null;
}

/** Membresías activas del usuario en todos sus condominios (función SECURITY DEFINER acotada). */
export const membresiasDeUsuario = (prisma: PrismaService, usuarioId: string) =>
  prisma.$queryRaw<MembresiaUsuario[]>`SELECT * FROM app_membresias_de_usuario(${usuarioId}::uuid)`;
