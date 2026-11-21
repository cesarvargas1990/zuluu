import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { DocumentosController } from './documentos.controller';
import { DocumentosService } from './documentos.service';

@Module({ imports: [AuditoriaModule], controllers: [DocumentosController], providers: [DocumentosService] })
export class DocumentosModule {}
