import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccesoExcepcionalController } from './acceso-excepcional.controller';
import { CondominioGuard } from './condominio.guard';
import { MembresiasController } from './membresias.controller';
import { MembresiasService } from './membresias.service';
import { PermisoGuard } from './permiso.guard';

@Module({
  imports: [AuthModule],
  controllers: [MembresiasController, AccesoExcepcionalController],
  providers: [MembresiasService, CondominioGuard, PermisoGuard],
  exports: [CondominioGuard, PermisoGuard],
})
export class AutorizacionModule {}
