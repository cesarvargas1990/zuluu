import { Module } from '@nestjs/common';
import { RecaudosController } from './recaudos.controller';
import { RecaudosService } from './recaudos.service';

@Module({ controllers: [RecaudosController], providers: [RecaudosService] })
export class RecaudosModule {}
