import { Module } from '@nestjs/common';
import { AmbientalController } from './ambiental.controller';
import { AmbientalService } from './ambiental.service';

@Module({ controllers: [AmbientalController], providers: [AmbientalService] })
export class AmbientalModule {}
