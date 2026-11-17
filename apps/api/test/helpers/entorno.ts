import { randomUUID } from 'node:crypto';
import { Controller, Get, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, type Rol } from '@prisma/client';
import { authenticator } from 'otplib';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { cifrar } from '../../src/auth/cifrado';
import { Mailer, type Correo } from '../../src/auth/mailer';
import { hashPassword } from '../../src/auth/password';
import { RequierePermiso } from '../../src/autorizacion/decoradores';
import { cargarEnv } from '../../src/config/env';
import { configurarApp } from '../../src/configurar-app';

export const PASSWORD = 'clave-de-prueba-segura';

/** Rutas de prueba que simulan endpoints de negocio protegidos (no existen en producción). */
@Controller('prueba')
class PruebaController {
  @Post('finanzas/aprobar') @RequierePermiso('02', 'aprobar') aprobarPago() {
    return { ok: true };
  }
  @Get('finanzas') @RequierePermiso('02', 'leer') leerFinanzas() {
    return { ok: true };
  }
  @Get('juridico') @RequierePermiso('04', 'leer') leerJuridico() {
    return { ok: true };
  }
  @Get('juridico/expedientes/:expedienteId') @RequierePermiso('04', 'leer') leerExpediente() {
    return { ok: true };
  }
  @Get('contratos') @RequierePermiso('03', 'leer') leerContratos() {
    return { ok: true };
  }
  @Get('consejo') @RequierePermiso('09', 'leer') leerConsejo() {
    return { ok: true };
  }
}

export class MailerFalso extends Mailer {
  enviados: Correo[] = [];
  fallar = false;
  async enviar(c: Correo) {
    if (this.fallar) throw new Error('SMTP no disponible');
    this.enviados.push(c);
  }
  tokenDe(email: string) {
    const correo = [...this.enviados].reverse().find((c) => c.para === email);
    return correo ? decodeURIComponent(/token=([^\s]+)/.exec(correo.texto)![1]!) : undefined;
  }
}

export interface Entorno {
  app: INestApplication;
  http: ReturnType<typeof request>;
  owner: PrismaClient;
  mailer: MailerFalso;
  sufijo: string;
  condominios: string[];
  usuarios: string[];
  cerrar(): Promise<void>;
}

export async function crearEntorno(): Promise<Entorno> {
  const mailer = new MailerFalso();
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [PruebaController],
  })
    .overrideProvider(Mailer)
    .useValue(mailer)
    .compile();
  const app = configurarApp(modulo.createNestApplication());
  await app.init();
  const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const e: Entorno = {
    app,
    http: request(app.getHttpServer()),
    owner,
    mailer,
    sufijo: randomUUID().slice(0, 8),
    condominios: [],
    usuarios: [],
    async cerrar() {
      const extra = await owner.usuario.findMany({
        where: { email: { endsWith: `.${e.sufijo}@prueba.test` } },
      });
      e.usuarios.push(...extra.map((u) => u.id));
      await limpiar(owner, e.condominios, e.usuarios);
      await owner.$disconnect();
      await app.close();
    },
  };
  return e;
}

let hashCache: Promise<string> | undefined;

export async function crearCondominio(e: Entorno, nombre = 'Prueba') {
  const c = await e.owner.condominio.create({
    data: { razonSocial: `${nombre} ${e.sufijo}`, nit: `T-${randomUUID()}` },
  });
  e.condominios.push(c.id);
  return c.id;
}

export interface OpcionesUsuario {
  roles?: { condominioId: string; rol: Rol }[];
  superadmin?: boolean;
  mfa?: boolean;
  activo?: boolean;
}

/** Crea un usuario de prueba; si `mfa`, deja el TOTP activo y devuelve su secreto. */
export async function crearUsuario(e: Entorno, alias: string, o: OpcionesUsuario = {}) {
  const secreto = o.mfa ? authenticator.generateSecret() : undefined;
  const email = `${alias}.${e.sufijo}@prueba.test`.toLowerCase();
  const u = await e.owner.usuario.create({
    data: {
      email,
      nombre: alias,
      passwordHash: await (hashCache ??= hashPassword(PASSWORD)),
      esSuperadmin: o.superadmin ?? false,
      activo: o.activo ?? true,
      mfaSecretoCifrado: secreto ? cifrar(secreto, cargarEnv().mfaClave) : null,
      mfaActivadoEn: secreto ? new Date() : null,
    },
  });
  e.usuarios.push(u.id);
  const membresias = [];
  for (const r of o.roles ?? []) {
    membresias.push(
      await e.owner.membresia.create({
        data: { condominioId: r.condominioId, usuarioId: u.id, rol: r.rol },
      }),
    );
  }
  return { id: u.id, email, secreto, membresias };
}

/** Login completo (incluye TOTP si el usuario tiene secreto). Devuelve token y cookie de renovación. */
export async function iniciarSesion(e: Entorno, u: { email: string; secreto?: string }) {
  const r = await e.http.post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`login ${r.status}: ${JSON.stringify(r.body)}`);
  let token: string = r.body.accessToken;
  const cookie = r.get('set-cookie')![0]!.split(';')[0]!;
  if (u.secreto) {
    const v = await e.http
      .post('/api/v1/auth/mfa/verificar')
      .set('authorization', `Bearer ${token}`)
      .send({ codigo: authenticator.generate(u.secreto) });
    if (v.status !== 200) throw new Error(`mfa ${v.status}`);
    token = v.body.accessToken;
  }
  return { token, cookie, login: r.body };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export async function eventos(
  e: Entorno,
  filtro: { accion?: string; actorId?: string; condominioId?: string; objetoId?: string },
) {
  return e.owner.auditoria.findMany({ where: filtro, orderBy: { id: 'asc' } });
}

async function limpiar(owner: PrismaClient, condominios: string[], usuarios: string[]) {
  const enC = { condominioId: { in: condominios } };
  const enU = { usuarioId: { in: usuarios } };
  await owner.auditoria.deleteMany({
    where: { OR: [enC, { actorId: { in: usuarios } }, { objetoId: { in: usuarios } }] },
  });
  await owner.movimientoCartera.deleteMany({ where: enC });
  await owner.ajusteCartera.deleteMany({ where: enC });
  await owner.compromisoPago.deleteMany({ where: enC });
  await owner.gestionCobro.deleteMany({ where: enC });
  await owner.obligacion.deleteMany({ where: enC });
  await owner.importacionCartera.deleteMany({ where: enC });
  await owner.soporteRecaudo.deleteMany({ where: enC });
  await owner.imputacionRecaudo.deleteMany({ where: enC });
  await owner.recaudo.deleteMany({ where: enC });
  await owner.importacionRecaudos.deleteMany({ where: enC });
  await owner.titularidad.deleteMany({ where: enC });
  await owner.documentoPropietario.deleteMany({ where: enC });
  await owner.importacionPropietarios.deleteMany({ where: enC });
  await owner.propietario.deleteMany({ where: enC });
  await owner.unidadPrivada.deleteMany({ where: enC });
  await owner.permiso.deleteMany({ where: enC });
  await owner.accesoExcepcional.deleteMany({ where: { OR: [enC, enU] } });
  await owner.membresia.deleteMany({ where: { OR: [enC, enU] } });
  await owner.sesion.deleteMany({ where: enU });
  await owner.codigoRespaldo.deleteMany({ where: enU });
  await owner.tokenRecuperacion.deleteMany({ where: enU });
  await owner.usuario.deleteMany({ where: { id: { in: usuarios } } });
  await owner.condominio.deleteMany({ where: { id: { in: condominios } } });
}
