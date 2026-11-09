import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Valida el body con Zod; responde 400 con mensajes en español. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly esquema: ZodType<T>) {}

  transform(valor: unknown): T {
    const r = this.esquema.safeParse(valor);
    if (!r.success) {
      throw new BadRequestException({
        mensaje: 'Datos inválidos',
        errores: r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
      });
    }
    return r.data;
  }
}
