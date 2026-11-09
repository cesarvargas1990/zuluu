import { Injectable, NotFoundException } from '@nestjs/common';
import type { Accion, AreaCodigo, Rol } from '@zulu/shared';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { RecuperacionService } from '../auth/recuperacion.service';
import { contexto } from '../contexto/contexto-solicitud';
import { PrismaService } from '../prisma/prisma.service';

const NO_ENCONTRADO = 'Recurso no encontrado.';

@Injectable()
export class MembresiasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly recuperacion: RecuperacionService,
  ) {}

  private get condominioId() {
    return contexto.actual().condominioId!;
  }

  listar() {
    return this.prisma.withTenant(this.condominioId, (tx) =>
      tx.membresia.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          usuario: { select: { id: true, email: true, nombre: true, activo: true } },
          permisos: { where: { revocadoEn: null } },
        },
      }),
    );
  }

  /** Vincula un usuario (lo crea sin contraseña si no existe y le envía enlace para definirla). */
  async crear(datos: { email: string; nombre: string; rol: Rol }) {
    const email = datos.email.trim().toLowerCase();
    let nuevoUsuario = false;
    const membresia = await this.prisma.withTenant(this.condominioId, async (tx) => {
      let usuario = await tx.usuario.findUnique({ where: { email } });
      if (!usuario) {
        usuario = await tx.usuario.create({ data: { email, nombre: datos.nombre } });
        nuevoUsuario = true;
      }
      const m = await tx.membresia.upsert({
        where: {
          condominioId_usuarioId_rol: {
            condominioId: this.condominioId,
            usuarioId: usuario.id,
            rol: datos.rol,
          },
        },
        create: { condominioId: this.condominioId, usuarioId: usuario.id, rol: datos.rol },
        update: { activo: true },
      });
      await this.auditoria.registrar(tx, {
        accion: 'membresia.creada',
        objetoTipo: 'membresia',
        objetoId: m.id,
        condominioId: this.condominioId,
        despues: { usuarioId: usuario.id, email, rol: m.rol, activo: m.activo, nuevoUsuario },
      });
      return m;
    });
    const correoEnviado = nuevoUsuario
      ? await this.recuperacion.solicitar(email, 'bienvenida')
      : null;
    return { ...membresia, nuevoUsuario, correoEnviado };
  }

  async modificar(id: string, cambios: { activo?: boolean; rol?: Rol }) {
    return this.prisma.withTenant(this.condominioId, async (tx) => {
      const antes = await tx.membresia.findFirst({ where: { id } });
      if (!antes) throw new NotFoundException(NO_ENCONTRADO);
      const despues = await tx.membresia.update({ where: { id }, data: cambios });
      await this.auditoria.registrar(tx, {
        accion: cambios.activo === false ? 'membresia.desactivada' : 'membresia.modificada',
        objetoTipo: 'membresia',
        objetoId: id,
        condominioId: this.condominioId,
        antes: { rol: antes.rol, activo: antes.activo },
        despues: { rol: despues.rol, activo: despues.activo },
      });
      return despues;
    });
  }

  async crearPermiso(
    membresiaId: string,
    datos: {
      area: AreaCodigo;
      accion: Accion;
      efecto: 'CONCEDER' | 'RESTRINGIR';
      expedienteId?: string;
    },
  ) {
    return this.prisma.withTenant(this.condominioId, async (tx) => {
      const membresia = await tx.membresia.findFirst({ where: { id: membresiaId } });
      if (!membresia) throw new NotFoundException(NO_ENCONTRADO);
      const permiso = await tx.permiso.create({
        data: {
          condominioId: this.condominioId,
          membresiaId,
          area: datos.area,
          accion: datos.accion,
          efecto: datos.efecto,
          expedienteId: datos.expedienteId ?? null,
          creadoPor: contexto.actual().usuarioId!,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'permiso.creado',
        objetoTipo: 'permiso',
        objetoId: permiso.id,
        condominioId: this.condominioId,
        despues: {
          membresiaId,
          area: permiso.area,
          accion: permiso.accion,
          efecto: permiso.efecto,
          expedienteId: permiso.expedienteId,
        },
      });
      return permiso;
    });
  }

  async revocarPermiso(permisoId: string) {
    return this.prisma.withTenant(this.condominioId, async (tx) => {
      const antes = await tx.permiso.findFirst({ where: { id: permisoId, revocadoEn: null } });
      if (!antes) throw new NotFoundException(NO_ENCONTRADO);
      const despues = await tx.permiso.update({
        where: { id: permisoId },
        data: { revocadoEn: new Date() },
      });
      await this.auditoria.registrar(tx, {
        accion: 'permiso.revocado',
        objetoTipo: 'permiso',
        objetoId: permisoId,
        condominioId: this.condominioId,
        antes: { area: antes.area, accion: antes.accion, efecto: antes.efecto, revocadoEn: null },
        despues: { revocadoEn: despues.revocadoEn },
      });
      return despues;
    });
  }
}
