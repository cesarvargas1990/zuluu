import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CuentasCobroController } from './cuentas-cobro.controller';
import { CuentasCobroService } from './cuentas-cobro.service';

@Module({
  imports: [AuthModule],
  controllers: [CuentasCobroController],
  providers: [CuentasCobroService],
})
export class CuentasCobroModule {}
