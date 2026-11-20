import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { CarteraModule } from './cartera/cartera.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { JwtGuard } from './auth/jwt.guard';
import { MfaGuard } from './auth/mfa.guard';
import { AutorizacionModule } from './autorizacion/autorizacion.module';
import { CondominioGuard } from './autorizacion/condominio.guard';
import { PermisoGuard } from './autorizacion/permiso.guard';
import { ConfigEnvModule } from './config/config.module';
import { ContextoMiddleware } from './contexto/contexto-solicitud';
import { HealthModule } from './health/health.module';
import { PropietariosModule } from './propietarios/propietarios.module';
import { PrismaModule } from './prisma/prisma.module';
import { RecaudosModule } from './recaudos/recaudos.module';
import { CuentasCobroModule } from './cuentas-cobro/cuentas-cobro.module';
import { AmbientalModule } from './ambiental/ambiental.module';

@Module({
  imports: [
    ConfigEnvModule,
    PrismaModule,
    AuditoriaModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    HealthModule,
    AuthModule,
    AutorizacionModule,
    AdminModule,
    CarteraModule,
    PropietariosModule,
    RecaudosModule,
    CuentasCobroModule,
    AmbientalModule,
  ],
  providers: [
    // Orden de ejecución: límite → identidad → MFA → condominio → permiso. Denegar por defecto.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtGuard },
    { provide: APP_GUARD, useExisting: MfaGuard },
    { provide: APP_GUARD, useExisting: CondominioGuard },
    { provide: APP_GUARD, useExisting: PermisoGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ContextoMiddleware).forRoutes('*path');
  }
}
