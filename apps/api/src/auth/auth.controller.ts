import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { PermitirSinMfa, Publico } from './decoradores';
import type { RequestAutenticado } from './jwt.guard';
import { membresiasDeUsuario } from './membresias-usuario';
import { MfaService } from './mfa.service';
import { RecuperacionService } from './recuperacion.service';

export const COOKIE_REFRESH = 'zulu_rt';
const RUTA_COOKIE = `${(process.env.WEB_BASE_PATH ?? '').replace(/\/+$/, '')}/api/v1/auth`;

const login = z
  .object({ email: z.string().trim().min(3).max(254), password: z.string().min(1).max(256) })
  .strict();
const codigo = z.object({ codigo: z.string().trim().min(6).max(20) }).strict();
const recuperar = z.object({ email: z.string().trim().min(3).max(254) }).strict();
const restablecer = z
  .object({ token: z.string().min(20).max(200), password: z.string().max(256) })
  .strict();

/** Límite por IP en endpoints de autenticación (configurable con AUTH_RATE_LIMIT). */
const LimiteAuth = () =>
  Throttle({ default: { limit: () => Number(process.env.AUTH_RATE_LIMIT ?? 10), ttl: 60_000 } });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly recuperacion: RecuperacionService,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Publico()
  @LimiteAuth()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(login)) body: z.infer<typeof login>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.auth.login(body.email, body.password);
    this.ponerCookie(res, r.refreshToken);
    return {
      accessToken: r.accessToken,
      mfaRequerido: r.mfaRequerido,
      mfaConfigurado: r.mfaConfigurado,
    };
  }

  @Publico()
  @LimiteAuth()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const origen = req.get('origin');
    if (origen && origen !== this.env.WEB_ORIGIN)
      throw new ForbiddenException('Origen no permitido.');
    const token: unknown = req.cookies?.[COOKIE_REFRESH];
    if (typeof token !== 'string')
      throw new UnauthorizedException('Sesión inválida o vencida. Inicie sesión de nuevo.');
    try {
      const r = await this.auth.renovar(token);
      this.ponerCookie(res, r.refreshToken);
      return { accessToken: r.accessToken };
    } catch (e) {
      res.clearCookie(COOKIE_REFRESH, { path: RUTA_COOKIE });
      throw e;
    }
  }

  @PermitirSinMfa()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: RequestAutenticado, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.auth.sid, req.auth.sub);
    res.clearCookie(COOKIE_REFRESH, { path: RUTA_COOKIE });
  }

  @PermitirSinMfa()
  @Get('yo')
  async yo(@Req() req: RequestAutenticado) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: req.auth.sub } });
    const membresias = await membresiasDeUsuario(this.prisma, usuario.id);
    return {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      esSuperadmin: usuario.esSuperadmin,
      mfa: {
        requerido: req.auth.mfaReq,
        configurado: !!usuario.mfaActivadoEn,
        verificado: req.auth.mfa,
      },
      condominios: membresias.map((m) => ({
        condominioId: m.condominio_id,
        razonSocial: m.razon_social,
        rol: m.rol,
        grupoId: m.grupo_id,
        grupoNombre: m.grupo_nombre,
      })),
    };
  }

  @PermitirSinMfa()
  @LimiteAuth()
  @Post('mfa/registro')
  @HttpCode(200)
  iniciarMfa(@Req() req: RequestAutenticado) {
    return this.mfa.iniciarRegistro(req.auth.sub);
  }

  @PermitirSinMfa()
  @LimiteAuth()
  @Post('mfa/confirmar')
  @HttpCode(200)
  async confirmarMfa(
    @Req() req: RequestAutenticado,
    @Body(new ZodPipe(codigo)) body: z.infer<typeof codigo>,
  ) {
    const codigosRespaldo = await this.mfa.confirmarRegistro(
      req.auth.sub,
      req.auth.sid,
      body.codigo,
    );
    return { codigosRespaldo, accessToken: await this.auth.reemitir(req.auth.sub, req.auth.sid) };
  }

  @PermitirSinMfa()
  @LimiteAuth()
  @Post('mfa/verificar')
  @HttpCode(200)
  async verificarMfa(
    @Req() req: RequestAutenticado,
    @Body(new ZodPipe(codigo)) body: z.infer<typeof codigo>,
  ) {
    await this.mfa.verificar(req.auth.sub, req.auth.sid, body.codigo);
    return { accessToken: await this.auth.reemitir(req.auth.sub, req.auth.sid) };
  }

  @Publico()
  @LimiteAuth()
  @Post('recuperar')
  @HttpCode(202)
  async recuperar(@Body(new ZodPipe(recuperar)) body: z.infer<typeof recuperar>) {
    await this.recuperacion.solicitar(body.email);
    return {
      mensaje: 'Si el email está registrado, recibirá un enlace para restablecer la contraseña.',
    };
  }

  @Publico()
  @LimiteAuth()
  @Post('restablecer')
  @HttpCode(204)
  async restablecer(@Body(new ZodPipe(restablecer)) body: z.infer<typeof restablecer>) {
    await this.recuperacion.restablecer(body.token, body.password);
  }

  private ponerCookie(res: Response, token: string) {
    const opciones: CookieOptions = {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.env.NODE_ENV === 'production',
      path: RUTA_COOKIE,
      maxAge: this.env.REFRESH_MAX_DIAS * 24 * 3_600_000,
    };
    res.cookie(COOKIE_REFRESH, token, opciones);
  }
}
