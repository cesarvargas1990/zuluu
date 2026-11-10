import { describe, expect, it } from 'vitest';
import { correoInvitacion, correoRecuperacion } from './correos';

const base = {
  nombre: 'Nora <Prueba>',
  enlace: 'https://cesarvargas.tech/zulu/restablecer?token=abc',
  urlIngreso: 'https://cesarvargas.tech/zulu/ingresar',
};

describe('correoInvitacion', () => {
  const c = correoInvitacion({ ...base, horas: 72 });

  it('tiene asunto de bienvenida', () => {
    expect(c.asunto).toBe('Bienvenido a ZULU ADMIN: active su cuenta');
  });

  it('explica los pasos del primer ingreso en texto plano', () => {
    expect(c.texto).toContain(base.enlace);
    expect(c.texto).toContain(base.urlIngreso);
    expect(c.texto).toMatch(/1\. .*contraseña/);
    expect(c.texto).toMatch(/12 caracteres/);
    expect(c.texto).toMatch(/verificación en dos pasos/);
    expect(c.texto).toMatch(/72 horas/);
    expect(c.texto).toMatch(/Olvidé mi contraseña/);
  });

  it('incluye versión HTML con el enlace y escapa el nombre', () => {
    expect(c.html).toContain(`href="${base.enlace}"`);
    expect(c.html).toContain('Nora &lt;Prueba&gt;');
    expect(c.html).not.toContain('<Prueba>');
  });
});

describe('correoRecuperacion', () => {
  it('indica vigencia de 30 minutos y un solo uso', () => {
    const c = correoRecuperacion({ ...base, minutos: 30 });
    expect(c.asunto).toBe('Restablecer contraseña de ZULU ADMIN');
    expect(c.texto).toContain(base.enlace);
    expect(c.texto).toMatch(/30 minutos/);
    expect(c.html).toContain(`href="${base.enlace}"`);
  });
});
