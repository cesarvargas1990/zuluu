import { Global, Module } from '@nestjs/common';
import { ENV, cargarEnv } from './env';

@Global()
@Module({ providers: [{ provide: ENV, useFactory: () => cargarEnv() }], exports: [ENV] })
export class ConfigEnvModule {}
