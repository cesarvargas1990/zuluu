import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp, servidorFalso, yoDe } from '@/test/utilidades';

const codigos = Array.from({ length: 10 }, (_, i) => `codigo${i}x`);

describe('Configurar MFA', () => {
  it('muestra la clave, confirma, enseña los códigos una vez y exige confirmar que se guardaron', async () => {
    let verificado = false;
    servidorFalso({
      'POST /auth/refresh': () => ({ status: 200, cuerpo: { accessToken: 't' } }),
      'GET /auth/yo': () => ({
        status: 200,
        cuerpo: yoDe({
          mfa: { requerido: true, configurado: verificado, verificado },
          condominios: [{ condominioId: 'c1', razonSocial: 'Las Palmas', rol: 'ADMINISTRADORA' }],
        }),
      }),
      'POST /auth/mfa/registro': () => ({
        status: 200,
        cuerpo: {
          secreto: 'JBSWY3DPEHPK3PXP',
          otpauthUrl: 'otpauth://totp/ZULU%20ADMIN:ana?secret=JBSWY3DPEHPK3PXP',
        },
      }),
      'POST /auth/mfa/confirmar': () => {
        verificado = true;
        return { status: 200, cuerpo: { codigosRespaldo: codigos, accessToken: 't2' } };
      },
    });
    renderApp('/');
    const u = userEvent.setup();

    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    await u.type(screen.getByLabelText('Código de 6 dígitos'), '123456');
    await u.click(screen.getByRole('button', { name: 'Activar verificación' }));

    for (const c of codigos) expect(await screen.findByText(c)).toBeInTheDocument();
    const continuar = screen.getByRole('button', { name: 'Continuar' });
    expect(continuar).toBeDisabled();
    await u.click(screen.getByLabelText('Guardé mis códigos de respaldo en un lugar seguro'));
    await u.click(continuar);
    expect(await screen.findByRole('heading', { name: /Hola, Ana/ })).toBeInTheDocument();
    expect(screen.queryByText(codigos[0]!)).not.toBeInTheDocument();
  });
});
