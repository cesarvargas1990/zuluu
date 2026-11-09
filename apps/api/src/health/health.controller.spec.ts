import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import type { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  it('reporta db up cuando la consulta responde', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([1]) } as unknown as PrismaService;
    await expect(new HealthController(prisma).check()).resolves.toEqual({ status: 'ok', db: 'up' });
  });

  it('responde 503 cuando la base de datos no está disponible', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('down')),
    } as unknown as PrismaService;
    await expect(new HealthController(prisma).check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
