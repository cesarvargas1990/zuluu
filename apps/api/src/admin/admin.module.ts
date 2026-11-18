import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ParametrosModule } from '../parametros/parametros.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SuperadminGuard } from './superadmin.guard';

@Module({
  imports: [AuthModule, ParametrosModule],
  controllers: [AdminController],
  providers: [AdminService, SuperadminGuard],
})
export class AdminModule {}
