import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { RecaudoDetalle, RecaudoListado, ResumenRecaudos } from '@/api/recaudos';
import { renderApp, servidorFalso, yoDe } from '@/test/utilidades';

// Datos ficticios.
const pago = (extra: Partial<RecaudoListado> = {}): RecaudoListado => ({
  id: 'p1',
  numero: 1,
  numeroVisible: 'RC-0001',
  unidadId: 'u1',
  propietarioId: null,
  pagador: 'Pagador ejemplo A',
  fechaPago: '2026-11-10',
  valor: '580000',
  medio: 'TRANSFERENCIA',
  referencia: 'TRX-10291',
  banco: null,
  observacion: null,
  estado: 'PENDIENTE',
  origen: 'MANUAL',
  posibleDuplicado: false,
  saldoAFavor: '0',
  observacionVerificacion: null,
  revisadoEn: null,
  anuladoEn: null,
  motivoAnulacion: null,
  createdAt: '2026-11-10T15:00:00Z',
  unidad: { id: 'u1', codigo: '101-1', tipo: 'VILLA' },
  propietario: null,
  _count: { soportes: 0 },
  ...extra,
});

const resumen = (items: RecaudoListado[]): ResumenRecaudos => ({
  total: items.length,
  valorRecibido: String(items.reduce((s, i) => s + Number(i.valor), 0)),
  valorVerificado: '0',
  saldoAFavor: '0',
  pendientes: items.filter((i) => i.estado === 'PENDIENTE').length,
  observados: 0,
  verificados: 0,
  anulados: 0,
  sinIdentificar: items.filter((i) => !i.unidadId).length,
});

const detalle = (extra: Partial<RecaudoDetalle> = {}): RecaudoDetalle => ({
  ...pago(),
  creadoPorNombre: 'Andrés Asistente',
  revisadoPorNombre: null,
  anuladoPorNombre: null,
  imputaciones: [],
  soportes: [],
  historial: [
    {
      id: '1',
      accion: 'recaudo.registrado',
      actor: 'Andrés Asistente',
      antes: null,
      despues: {},
      createdAt: '2026-11-10T15:00:00Z',
    },
  ],
  ...extra,
});

function servidor(rol: 'ASISTENTE' | 'CONTADORA' | 'OPERACIONES', items: RecaudoListado[]) {
  return servidorFalso({
    'POST /auth/refresh': () => ({ status: 200, cuerpo: { accessToken: 't' } }),
    'GET /auth/yo': () => ({
      status: 200,
      cuerpo: yoDe({
        mfa: { requerido: rol === 'CONTADORA', configurado: true, verificado: true },
        condominios: [{ condominioId: 'c1', razonSocial: 'Condominio Demo', rol }],
      }),
    }),
    'GET /recaudos': () => ({ status: 200, cuerpo: { items, resumen: resumen(items) } }),
    'GET /recaudos?bandeja=revision': () => ({
      status: 200,
      cuerpo: { items: items.filter((i) => !i.unidadId), resumen: resumen([]) },
    }),
    'GET /unidades?buscar=&estado=activas': () => ({
      status: 200,
      cuerpo: [
        {
          id: 'u1',
          codigo: '101-1',
          tipo: 'VILLA',
          cuotaMensual: '580000',
          activa: true,
          titularidades: [],
        },
      ],
    }),
    'GET /propietarios?buscar=&estado=activos': () => ({ status: 200, cuerpo: [] }),
  });
}

describe('Pagos y recaudos', () => {
  it('un rol sin acceso a finanzas no ve el menú ni la pantalla', async () => {
    servidor('OPERACIONES', []);
    renderApp('/recaudos');
    expect(
      await screen.findByRole('heading', { name: 'No tiene acceso a esta sección' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pagos y recaudos' })).not.toBeInTheDocument();
  });

  it('la asistente consulta y registra, pero no exporta', async () => {
    servidor('ASISTENTE', [
      pago(),
      pago({ id: 'p2', numeroVisible: 'RC-0002', unidadId: null, unidad: null, valor: '400000' }),
    ]);
    renderApp('/recaudos');
    const fila = (await screen.findByText('RC-0001')).closest('tr')!;
    expect(within(fila).getByText('Villa · 101-1')).toBeInTheDocument();
    expect(within(fila).getByText('Pendiente de verificar')).toBeInTheDocument();
    expect(within(fila).getByText(/580\.000/)).toBeInTheDocument();
    const sinUnidad = screen.getByText('RC-0002').closest('tr')!;
    expect(within(sinUnidad).getByText('Sin identificar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pagos y recaudos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
    expect(await screen.findByText('Por identificar y observados (1)')).toBeInTheDocument();
  });

  it('sin pagos muestra el estado vacío con la acción principal', async () => {
    servidor('ASISTENTE', []);
    renderApp('/recaudos');
    expect(
      await screen.findByRole('heading', { name: 'Aún no hay pagos registrados' }),
    ).toBeInTheDocument();
  });

  it('registra interpretando el valor en formato colombiano y advierte duplicados', async () => {
    const s = servidor('ASISTENTE', []);
    s.manejadores['POST /recaudos'] = (c) => {
      const cuerpo = c as { confirmarDuplicado?: boolean };
      return cuerpo.confirmarDuplicado
        ? { status: 201, cuerpo: { ...pago(), id: 'p9', numeroVisible: 'RC-0009' } }
        : {
            status: 409,
            cuerpo: {
              mensaje: 'Encontramos un pago similar. Revise antes de continuar.',
              duplicados: [
                {
                  id: 'p1',
                  numeroVisible: 'RC-0001',
                  fechaPago: '2026-11-10',
                  valor: '580000',
                  referencia: 'TRX-10291',
                  estado: 'PENDIENTE',
                  unidad: '101-1',
                },
              ],
            },
          };
    };
    renderApp('/recaudos');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Registrar pago' }));
    const guardar = screen.getByRole('button', { name: 'Guardar pago' });
    expect(guardar).toBeDisabled();
    await u.type(screen.getByLabelText('Valor recibido (COP) *'), '580.000');
    expect(screen.getByText(/Se registrará \$\s?580\.000/)).toBeInTheDocument();
    await u.type(screen.getByLabelText('Referencia de la operación'), 'TRX-10291');
    await u.selectOptions(within(screen.getByRole('dialog')).getByLabelText('Villa o lote'), 'u1');
    await u.click(guardar);

    const alerta = await screen.findByText(
      'Encontramos un pago similar. Revise antes de continuar.',
    );
    expect(alerta.closest('[role="alert"]')).toHaveTextContent('RC-0001');
    const primero = s.llamadas.find((l) => l.clave === 'POST /recaudos')!.cuerpo as Record<
      string,
      unknown
    >;
    expect(primero).toMatchObject({
      valor: '580000',
      medio: 'TRANSFERENCIA',
      referencia: 'TRX-10291',
      unidadId: 'u1',
    });
    expect(primero.confirmarDuplicado).toBeUndefined();

    await u.click(screen.getByRole('button', { name: 'No es el mismo pago: registrar' }));
    expect(
      await screen.findByText('Pago RC-0009 registrado. Está pendiente de verificación.'),
    ).toBeInTheDocument();
    expect(s.llamadas.filter((l) => l.clave === 'POST /recaudos').at(-1)!.cuerpo).toMatchObject({
      confirmarDuplicado: true,
    });
  });

  it('la contadora distribuye y verifica; el excedente se muestra como saldo a favor', async () => {
    const s = servidor('CONTADORA', [pago({ valor: '700000' })]);
    s.manejadores['GET /recaudos/p1'] = () => ({
      status: 200,
      cuerpo: detalle({ valor: '700000' }),
    });
    s.manejadores['POST /recaudos/p1/verificar'] = () => ({
      status: 200,
      cuerpo: detalle({
        valor: '700000',
        estado: 'VERIFICADO',
        saldoAFavor: '120000',
        imputaciones: [
          {
            id: 'i1',
            concepto: 'CUOTA_ADMINISTRACION',
            periodo: '2026-11',
            valorObligacion: '580000',
            valorAplicado: '580000',
            saldoPendiente: '0',
          },
        ],
      }),
    });
    renderApp('/recaudos');
    const u = userEvent.setup();
    expect(await screen.findByRole('button', { name: 'Exportar' })).toBeInTheDocument();
    await u.click(await screen.findByRole('button', { name: 'Ver detalle de RC-0001' }));
    await u.click(await screen.findByRole('button', { name: /Distribuir y verificar/ }));
    expect(screen.getByText('Imputación', { selector: '.nav-link' })).toHaveClass('active');
    expect(screen.getByText('Información general')).not.toHaveClass('active');
    // Propone la cuota mensual de la unidad; el resto queda como saldo a favor.
    expect(screen.getByLabelText('Valor a aplicar de la fila 1')).toHaveValue('580000');
    const saldo = screen.getByText('Saldo a favor').nextElementSibling!;
    expect(saldo).toHaveTextContent(/120\.000/);

    await u.clear(screen.getByLabelText('Valor a aplicar de la fila 1'));
    await u.type(screen.getByLabelText('Valor a aplicar de la fila 1'), '800.000');
    expect(screen.getByRole('button', { name: 'Verificar y aplicar' })).toBeDisabled();
    await u.clear(screen.getByLabelText('Valor a aplicar de la fila 1'));
    await u.type(screen.getByLabelText('Valor a aplicar de la fila 1'), '580.000');
    await u.click(screen.getByRole('button', { name: 'Verificar y aplicar' }));

    expect(
      await screen.findByText('Pago verificado y aplicado correctamente.'),
    ).toBeInTheDocument();
    expect(s.llamadas.find((l) => l.clave === 'POST /recaudos/p1/verificar')!.cuerpo).toEqual({
      imputaciones: [
        {
          concepto: 'CUOTA_ADMINISTRACION',
          periodo: '2026-11',
          valorObligacion: '580000',
          valorAplicado: '580000',
        },
      ],
      observacion: null,
    });
    expect(screen.getByText(/Saldo a favor \(anticipo\)/)).toHaveTextContent(/120\.000/);
  });

  it('la asistente no ve acciones de verificación ni anulación en el detalle', async () => {
    const s = servidor('ASISTENTE', [pago()]);
    s.manejadores['GET /recaudos/p1'] = () => ({ status: 200, cuerpo: detalle() });
    renderApp('/recaudos');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Ver detalle de RC-0001' }));
    expect(
      await screen.findByText(/Pendiente de verificación por contabilidad/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Distribuir y verificar/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anular pago/ })).not.toBeInTheDocument();
  });
});
