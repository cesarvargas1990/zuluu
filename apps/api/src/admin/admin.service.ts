import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Rol } from '@zulu/shared';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { RecuperacionService } from '../auth/recuperacion.service';
import { decidirMfa, type PoliticaMfa } from '../auth/politica-mfa';
import { SesionesService } from '../auth/sesiones.service';
import { contexto } from '../contexto/contexto-solicitud';
import { ParametrosService } from '../parametros/parametros.service';
import { PrismaService } from '../prisma/prisma.service';

const NO_ENCONTRADO = 'Recurso no encontrado.';

interface FilaCondominio {
  id: string;
  razon_social: string;
  nit: string;
  created_at: Date;
  grupo_id: string | null;
  grupo_nombre: string | null;
}
interface FilaMembresia {
  membresia_id: string;
  usuario_id: string;
  condominio_id: string;
  razon_social: string;
  rol: Rol;
  activo: boolean;
}

export interface RolAsignado {
  condominioId: string;
  rol: Rol;
}

const esDuplicado = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/**
 * Operaciones del superadministrador ZULU (§2: configura condominios y roles).
 * Lecturas entre condominios solo con `comoSuperadmin`; escrituras por condominio con `withTenant`.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly recuperacion: RecuperacionService,
    private readonly sesiones: SesionesService,
    private readonly parametros: ParametrosService,
  ) {}

  // ---------- Condominios ----------
  async listarCondominios() {
    const filas = await this.prisma.comoSuperadmin(
      (tx) => tx.$queryRaw<FilaCondominio[]>`SELECT * FROM app_condominios()`,
    );
    return filas.map((c) => ({
      id: c.id,
      razonSocial: c.razon_social,
      nit: c.nit,
      creadoEn: c.created_at,
      grupoId: c.grupo_id,
      grupoNombre: c.grupo_nombre,
    }));
  }

  async crearCondominio(datos: { razonSocial: string; nit: string; grupoId?: string | null }) {
    const id = randomUUID();
    const grupo = datos.grupoId ? await this.exigirGrupo(datos.grupoId) : null;
    try {
      return await this.prisma.withTenant(id, async (tx) => {
        const c = await tx.condominio.create({
          data: { id, razonSocial: datos.razonSocial, nit: datos.nit, grupoId: grupo?.id ?? null },
        });
        await this.auditoria.registrar(tx, {
          accion: 'condominio.creado',
          objetoTipo: 'condominio',
          objetoId: id,
          condominioId: id,
          despues: { razonSocial: c.razonSocial, nit: c.nit, grupoId: c.grupoId },
        });
        return {
          id: c.id,
          razonSocial: c.razonSocial,
          nit: c.nit,
          creadoEn: c.createdAt,
          grupoId: c.grupoId,
          grupoNombre: grupo?.nombre ?? null,
        };
      });
    } catch (e) {
      if (esDuplicado(e)) throw new ConflictException('Ya existe un condominio con ese NIT.');
      throw e;
    }
  }

  // ---------- Condominios (agrupadores de copropiedades) ----------
  async listarGrupos() {
    const [grupos, conteos] = await Promise.all([
      this.prisma.grupoCondominio.findMany({ orderBy: { nombre: 'asc' } }),
      this.prisma.comoSuperadmin(
        (tx) =>
          tx.$queryRaw<
            { grupo_id: string; copropiedades: bigint }[]
          >`SELECT * FROM app_grupos_conteo()`,
      ),
    ]);
    const por = new Map(conteos.map((c) => [c.grupo_id, Number(c.copropiedades)]));
    return grupos.map((g) => ({
      id: g.id,
      nombre: g.nombre,
      copropiedades: por.get(g.id) ?? 0,
      creadoEn: g.createdAt,
    }));
  }

  async crearGrupo(nombre: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const g = await tx.grupoCondominio.create({ data: { nombre } });
        await this.auditoria.registrar(tx, {
          accion: 'grupo.creado',
          objetoTipo: 'condominio_grupo',
          objetoId: g.id,
          actorId: contexto.actual().usuarioId ?? null,
          despues: { nombre },
        });
        return { id: g.id, nombre: g.nombre, copropiedades: 0, creadoEn: g.createdAt };
      });
    } catch (e) {
      if (esDuplicado(e)) throw new ConflictException('Ya existe un condominio con ese nombre.');
      throw e;
    }
  }

  async renombrarGrupo(id: string, nombre: string) {
    const antes = await this.exigirGrupo(id);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.grupoCondominio.update({ where: { id }, data: { nombre } });
        if (antes.nombre !== nombre)
          await this.auditoria.registrar(tx, {
            accion: 'grupo.renombrado',
            objetoTipo: 'condominio_grupo',
            objetoId: id,
            actorId: contexto.actual().usuarioId ?? null,
            antes: { nombre: antes.nombre },
            despues: { nombre },
          });
      });
    } catch (e) {
      if (esDuplicado(e)) throw new ConflictException('Ya existe un condominio con ese nombre.');
      throw e;
    }
    return { id, nombre };
  }

  /** Asigna (o quita, con `null`) el condominio al que pertenece una copropiedad. */
  async asignarGrupo(condominioId: string, grupoId: string | null) {
    const grupo = grupoId ? await this.exigirGrupo(grupoId) : null;
    return this.prisma.withTenant(condominioId, async (tx) => {
      const c = await tx.condominio.findFirst({ where: { id: condominioId } });
      if (!c) throw new NotFoundException('La copropiedad indicada no existe.');
      if (c.grupoId !== (grupo?.id ?? null)) {
        await tx.condominio.update({
          where: { id: condominioId },
          data: { grupoId: grupo?.id ?? null },
        });
        await this.auditoria.registrar(tx, {
          accion: 'condominio.grupo_asignado',
          objetoTipo: 'condominio',
          objetoId: condominioId,
          condominioId,
          actorId: contexto.actual().usuarioId ?? null,
          antes: { grupoId: c.grupoId },
          despues: { grupoId: grupo?.id ?? null },
        });
      }
      return { id: condominioId, grupoId: grupo?.id ?? null, grupoNombre: grupo?.nombre ?? null };
    });
  }

  private async exigirGrupo(id: string) {
    const g = await this.prisma.grupoCondominio.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('El condominio indicado no existe.');
    return g;
  }

  // ---------- Usuarios ----------
  async listarUsuarios() {
    const [global, usuarios, membresias] = await Promise.all([
      this.parametros.mfaGlobal(),
      this.prisma.usuario.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          email: true,
          nombre: true,
          activo: true,
          esSuperadmin: true,
          passwordHash: true,
          mfaActivadoEn: true,
          mfaPolitica: true,
          createdAt: true,
        },
      }),
      this.prisma.comoSuperadmin(
        (tx) => tx.$queryRaw<FilaMembresia[]>`SELECT * FROM app_membresias_todas()`,
      ),
    ]);
    return usuarios.map((u) =>
      this.vistaUsuario(
        u,
        membresias.filter((m) => m.usuario_id === u.id),
        global,
      ),
    );
  }

  // ---------- Parámetros generales ----------
  async obtenerParametros() {
    return { mfa: await this.parametros.obtenerMfa() };
  }

  async cambiarMfaGlobal(activo: boolean) {
    return this.parametros.cambiarMfaGlobal(activo, contexto.actual().usuarioId ?? null);
  }

  /** Ajuste individual de 2FA. Se guarda aunque el control global esté apagado, pero entonces no se aplica. */
  async cambiarMfaUsuario(id: string, politica: PoliticaMfa) {
    const antes = await this.prisma.usuario.findUnique({ where: { id } });
    if (!antes) throw new NotFoundException(NO_ENCONTRADO);
    if (antes.mfaPolitica !== politica) {
      await this.prisma.$transaction(async (tx) => {
        await tx.usuario.update({ where: { id }, data: { mfaPolitica: politica } });
        await this.auditoria.registrar(tx, {
          accion: 'usuario.mfa_politica_cambiada',
          objetoTipo: 'usuario',
          objetoId: id,
          antes: { politica: antes.mfaPolitica },
          despues: { politica },
        });
      });
    }
    const [vista] = (await this.listarUsuarios()).filter((u) => u.id === id);
    return vista;
  }

  async crearUsuario(datos: { nombre: string; email: string; roles: RolAsignado[] }) {
    const email = datos.email.trim().toLowerCase();
    if (await this.prisma.usuario.findUnique({ where: { email } })) {
      throw new ConflictException('Ya existe un usuario con ese email.');
    }
    for (const r of datos.roles) await this.exigirCondominio(r.condominioId);

    const usuario = await this.prisma.$transaction(async (tx) => {
      const u = await tx.usuario.create({ data: { email, nombre: datos.nombre.trim() } });
      await this.auditoria.registrar(tx, {
        accion: 'usuario.creado',
        objetoTipo: 'usuario',
        objetoId: u.id,
        despues: { email, nombre: u.nombre, roles: datos.roles },
      });
      return u;
    });
    for (const r of datos.roles) await this.asignarRol(usuario.id, r);
    const correoEnviado = await this.recuperacion.solicitar(email, 'bienvenida');
    const [vista] = (await this.listarUsuarios()).filter((u) => u.id === usuario.id);
    return { usuario: vista, correoEnviado };
  }

  async cambiarEstadoUsuario(id: string, activo: boolean) {
    if (id === contexto.actual().usuarioId) {
      throw new BadRequestException('No puede desactivar su propio usuario.');
    }
    const antes = await this.prisma.usuario.findUnique({ where: { id } });
    if (!antes) throw new NotFoundException(NO_ENCONTRADO);
    const despues = await this.prisma.$transaction(async (tx) => {
      const u = await tx.usuario.update({ where: { id }, data: { activo } });
      if (!activo) {
        await tx.sesion.updateMany({
          where: { usuarioId: id, revocadaEn: null },
          data: { revocadaEn: new Date() },
        });
      }
      await this.auditoria.registrar(tx, {
        accion: activo ? 'usuario.reactivado' : 'usuario.desactivado',
        objetoTipo: 'usuario',
        objetoId: id,
        antes: { activo: antes.activo },
        despues: { activo },
      });
      return u;
    });
    return { id: despues.id, activo: despues.activo };
  }

  async reenviarInvitacion(id: string) {
    const u = await this.prisma.usuario.findUnique({ where: { id } });
    if (!u) throw new NotFoundException(NO_ENCONTRADO);
    if (!u.activo)
      throw new BadRequestException(
        'El usuario está desactivado. Reactívelo antes de reenviar la invitación.',
      );
    return { correoEnviado: await this.recuperacion.solicitar(u.email, 'bienvenida') };
  }

  // ---------- Roles ----------
  async asignarRol(usuarioId: string, { condominioId, rol }: RolAsignado) {
    if (!(await this.prisma.usuario.findUnique({ where: { id: usuarioId } })))
      throw new NotFoundException(NO_ENCONTRADO);
    return this.prisma.withTenant(condominioId, async (tx) => {
      if (!(await tx.condominio.findFirst({ where: { id: condominioId } })))
        throw new NotFoundException(NO_ENCONTRADO);
      const m = await tx.membresia.upsert({
        where: { condominioId_usuarioId_rol: { condominioId, usuarioId, rol } },
        create: { condominioId, usuarioId, rol },
        update: { activo: true },
      });
      await this.auditoria.registrar(tx, {
        accion: 'membresia.creada',
        objetoTipo: 'membresia',
        objetoId: m.id,
        condominioId,
        despues: { usuarioId, rol: m.rol, activo: m.activo },
      });
      return { id: m.id, condominioId, rol: m.rol, activo: m.activo };
    });
  }

  async modificarMembresia(
    id: string,
    condominioId: string,
    cambios: { rol?: Rol; activo?: boolean },
  ) {
    try {
      return await this.prisma.withTenant(condominioId, async (tx) => {
        const antes = await tx.membresia.findFirst({ where: { id } });
        if (!antes) throw new NotFoundException(NO_ENCONTRADO);
        const m = await tx.membresia.update({ where: { id }, data: cambios });
        await this.auditoria.registrar(tx, {
          accion: cambios.activo === false ? 'membresia.desactivada' : 'membresia.modificada',
          objetoTipo: 'membresia',
          objetoId: id,
          condominioId,
          antes: { rol: antes.rol, activo: antes.activo },
          despues: { rol: m.rol, activo: m.activo },
        });
        return { id: m.id, condominioId, rol: m.rol, activo: m.activo };
      });
    } catch (e) {
      if (esDuplicado(e))
        throw new ConflictException('La persona ya tiene ese rol en el condominio.');
      throw e;
    }
  }

  // ---------- utilidades ----------
  private async exigirCondominio(condominioId: string) {
    const existe = await this.prisma.withTenant(condominioId, (tx) =>
      tx.condominio.findFirst({ where: { id: condominioId } }),
    );
    if (!existe) throw new NotFoundException('El condominio indicado no existe.');
  }

  private vistaUsuario(
    u: {
      id: string;
      email: string;
      nombre: string;
      activo: boolean;
      esSuperadmin: boolean;
      passwordHash: string | null;
      mfaActivadoEn: Date | null;
      mfaPolitica: PoliticaMfa;
      createdAt: Date;
    },
    membresias: FilaMembresia[],
    global: boolean,
  ) {
    const decision = decidirMfa({
      global,
      politica: u.mfaPolitica,
      esSuperadmin: u.esSuperadmin,
      roles: membresias.filter((m) => m.activo).map((m) => m.rol),
    });
    return {
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      activo: u.activo,
      esSuperadmin: u.esSuperadmin,
      invitacionPendiente: !u.passwordHash,
      mfaConfigurado: !!u.mfaActivadoEn,
      /** Ajuste individual guardado. */
      mfaPolitica: u.mfaPolitica,
      /** Resultado real hoy, considerando el control global y el rol. */
      mfaRequerido: decision.requerido,
      mfaMotivo: decision.motivo,
      creadoEn: u.createdAt,
      roles: membresias.map((m) => ({
        membresiaId: m.membresia_id,
        condominioId: m.condominio_id,
        razonSocial: m.razon_social,
        rol: m.rol,
        activo: m.activo,
      })),
    };
  }
}
