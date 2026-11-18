import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ROLES } from '@zulu/shared';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { AdminService } from './admin.service';
import { SuperadminGuard } from './superadmin.guard';

const rolAsignado = z
  .object({ condominioId: z.uuid('Condominio inválido'), rol: z.enum(ROLES) })
  .strict();
const crearUsuario = z
  .object({
    nombre: z.string().trim().min(2, 'Escriba el nombre completo').max(120),
    email: z.email('Email inválido').max(254),
    roles: z.array(rolAsignado).max(20).default([]),
  })
  .strict();
const crearCondominio = z
  .object({
    razonSocial: z.string().trim().min(3, 'Escriba la razón social').max(200),
    nit: z.string().trim().min(5, 'NIT inválido').max(30),
  })
  .strict();
const cambiarMfaGlobal = z
  .object({ activo: z.boolean('Indique si el control está activo') })
  .strict();
const cambiarMfaUsuario = z
  .object({ politica: z.enum(['HEREDAR', 'OBLIGATORIO', 'NO_REQUERIDO'], 'Opción no válida') })
  .strict();
const estadoUsuario = z.object({ activo: z.boolean() }).strict();
const modificarMembresia = z
  .object({ condominioId: z.uuid(), rol: z.enum(ROLES).optional(), activo: z.boolean().optional() })
  .strict()
  .refine((v) => v.rol !== undefined || v.activo !== undefined, 'Indique rol o activo');

/** Consola del superadministrador ZULU. Requiere sesión con MFA verificado (guards globales). */
@Controller('admin')
@UseGuards(SuperadminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('parametros')
  parametros() {
    return this.admin.obtenerParametros();
  }

  /** Control global de la verificación en dos pasos: apagado, nadie la necesita. */
  @Patch('parametros/mfa')
  cambiarMfaGlobal(@Body(new ZodPipe(cambiarMfaGlobal)) body: z.infer<typeof cambiarMfaGlobal>) {
    return this.admin.cambiarMfaGlobal(body.activo);
  }

  /** Ajuste individual; solo se aplica si el control global está encendido. */
  @Patch('usuarios/:id/mfa')
  cambiarMfaUsuario(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(cambiarMfaUsuario)) body: z.infer<typeof cambiarMfaUsuario>,
  ) {
    return this.admin.cambiarMfaUsuario(id, body.politica);
  }

  @Get('condominios')
  listarCondominios() {
    return this.admin.listarCondominios();
  }

  @Post('condominios')
  crearCondominio(@Body(new ZodPipe(crearCondominio)) body: z.infer<typeof crearCondominio>) {
    return this.admin.crearCondominio(body);
  }

  @Get('usuarios')
  listarUsuarios() {
    return this.admin.listarUsuarios();
  }

  @Post('usuarios')
  crearUsuario(@Body(new ZodPipe(crearUsuario)) body: z.infer<typeof crearUsuario>) {
    return this.admin.crearUsuario(body);
  }

  @Patch('usuarios/:id')
  cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(estadoUsuario)) body: z.infer<typeof estadoUsuario>,
  ) {
    return this.admin.cambiarEstadoUsuario(id, body.activo);
  }

  @Post('usuarios/:id/invitacion')
  @HttpCode(200)
  reenviarInvitacion(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.reenviarInvitacion(id);
  }

  @Post('usuarios/:id/roles')
  asignarRol(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(rolAsignado)) body: z.infer<typeof rolAsignado>,
  ) {
    return this.admin.asignarRol(id, body);
  }

  @Patch('membresias/:id')
  modificarMembresia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(modificarMembresia)) body: z.infer<typeof modificarMembresia>,
  ) {
    const { condominioId, ...cambios } = body;
    return this.admin.modificarMembresia(id, condominioId, cambios);
  }
}
