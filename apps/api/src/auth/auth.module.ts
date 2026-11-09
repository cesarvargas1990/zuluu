import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ENV, type Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { Mailer, SmtpMailer } from './mailer';
import { MfaGuard } from './mfa.guard';
import { MfaService } from './mfa.service';
import { RecuperacionService } from './recuperacion.service';
import { SesionesService } from './sesiones.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: { algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SesionesService,
    MfaService,
    RecuperacionService,
    JwtGuard,
    MfaGuard,
    { provide: Mailer, useClass: SmtpMailer },
  ],
  exports: [JwtModule, JwtGuard, MfaGuard, RecuperacionService, AuthService],
})
export class AuthModule {}
