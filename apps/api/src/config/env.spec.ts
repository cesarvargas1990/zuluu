import { describe, expect, it } from 'vitest';
import { cargarEnv } from './env';

const base = {
  APP_DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
  MFA_ENC_KEY: Buffer.alloc(32).toString('base64'),
  WEB_ORIGIN: 'https://cesarvargas.tech',
};

describe('cargarEnv (SMTP y ruta base)', () => {
  it('variables SMTP vacías (compose sin Gmail) equivalen a no definidas', () => {
    const env = cargarEnv({ ...base, SMTP_USER: '', SMTP_PASS: '', SMTP_SECURE: '' });
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASS).toBeUndefined();
    expect(env.SMTP_SECURE).toBeUndefined();
  });

  it('interpreta SMTP_SECURE true/false y rechaza otros valores', () => {
    expect(cargarEnv({ ...base, SMTP_SECURE: 'true' }).SMTP_SECURE).toBe(true);
    expect(cargarEnv({ ...base, SMTP_SECURE: 'false' }).SMTP_SECURE).toBe(false);
    expect(() => cargarEnv({ ...base, SMTP_SECURE: 'si' })).toThrow(/SMTP_SECURE/);
  });

  it('normaliza WEB_BASE_PATH sin barra final', () => {
    expect(cargarEnv({ ...base, WEB_BASE_PATH: '/zulu/' }).WEB_BASE_PATH).toBe('/zulu');
    expect(cargarEnv(base).WEB_BASE_PATH).toBe('');
  });
});
