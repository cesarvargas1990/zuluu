import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ACCIONES, AREAS, ROLES, type AreaCodigo } from '@zulu/shared';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { RequiereCondominio } from './decoradores';
import { MembresiasService } from './membresias.service';

const crearMembresia = z
  .object({
    email: z.email('Email inválido'),
    nombre: z.string().trim().min(2).max(120),
    rol: z.enum(ROLES),
  })
  .strict();
const modificarMembresia = z
  .object({ activo: z.boolean().optional(), rol: z.enum(ROLES).optional() })
  .strict()
  .refine((v) => v.activo !== undefined || v.rol !== undefined, 'Indique activo o rol');
const crearPermiso = z
  .object({
    area: z.enum(Object.keys(AREAS) as [AreaCodigo, ...AreaCodigo[]]),
    accion: z.enum(ACCIONES),
    efecto: z.enum(['CONCEDER', 'RESTRINGIR']),
    expedienteId: z.uuid().optional(),
  })
  .strict();

@Controller('membresias')
@RequiereCondominio({ gestion: true })
export class MembresiasController {
  constructor(private readonly membresias: MembresiasService) {}

  @Get()
  listar() {
    return this.membresias.listar();
  }

  @Post()
  crear(@Body(new ZodPipe(crearMembresia)) body: z.infer<typeof crearMembresia>) {
    return this.membresias.crear(body);
  }

  @Patch(':id')
  modificar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(modificarMembresia)) body: z.infer<typeof modificarMembresia>,
  ) {
    return this.membresias.modificar(id, body);
  }

  @Post(':id/permisos')
  crearPermiso(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(crearPermiso)) body: z.infer<typeof crearPermiso>,
  ) {
    return this.membresias.crearPermiso(id, body);
  }

  @Post('permisos/:permisoId/revocar')
  @HttpCode(200)
  revocarPermiso(@Param('permisoId', ParseUUIDPipe) permisoId: string) {
    return this.membresias.revocarPermiso(permisoId);
  }
}
