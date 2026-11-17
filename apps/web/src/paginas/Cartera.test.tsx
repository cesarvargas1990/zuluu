import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Ajuste, ResumenCartera, UnidadCartera } from '@/api/cartera';
import { renderApp, servidorFalso, yoDe } from '@/test/utilidades';

// Datos ficticios.
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const tramos = {
  CORRIENTE: '420000',
  '01_30': '0',
  '31_60': '700000',
  '61_90': '550000',
  MAS_90: '0',
};
const unidad = (extra: Partial<UnidadCartera> = {}): UnidadCartera => ({
  unidad: { id: 'u1', codigo: '01', tipo: 'VILLA' },
  propietarios: [{ id: 'p1', nombre: 'Persona Ficticia Uno' }],
  saldo: '1250000',
  vencido: '1250000',
  corriente: '0',
  porTramo: tramos,
  saldoAFavor: '0',
  obligacionesAbiertas: 2,
  periodoMasAntiguo: '2026-09',
  diasMora: 67,
  estado: 'VENCIDA',
  compromisosAbiertos: 1,
  ultimaGestion: '2026-11-10',
  proximaGestion: '2026-11-20',
  ...extra,
});
const resumen: ResumenCartera = {
  total: '1670000',
  vencido: '1250000',
  corriente: '420000',
  saldoAFavor: '120000',
  unidades: 2,
  unidadesConSaldo: 2,
  unidadesVencidas: 1,
  obligacionesAbiertas: 3,
  compromisosAbiertos: 1,
  porTramo: tramos,
};
const ajuste = (extra: Partial<Ajuste> = {}): Ajuste => ({
  id: 'a1',
  obligacionId: 'o1',
  tipo: 'CREDITO',
  valor: '20000',
  motivo: 'Descuento aprobado por el consejo',
  soporte: 'Acta ficticia 12',
  estado: 'PENDIENTE',
  notaResolucion: null,
  resueltoEn: null,
  createdAt: '2026-11-10T15:00:00Z',
  solicitadoPorNombre: 'Carla Contadora',
  resueltoPorNombre: null,
  esPropio: false,
  unidad: { id: 'u1', codigo: '01', tipo: 'VILLA' },
  obligacion: {
    numeroVisible: 'OBL-00031',
    concepto: 'CUOTA_ADMINISTRACION',
    periodo: '2026-10',
    valor: '550000',
  },
  ...extra,
});

function servidor(rol: 'ASISTENTE' | 'CONTADORA' | 'OPERACIONES', ajustes: Ajuste[] = []) {
  const lista = {
    corte: hoy,
    resumen,
    unidades: [
      unidad(),
      unidad({
        unidad: { id: 'u2', codigo: '02', tipo: 'VILLA' },
        propietarios: [],
        saldo: '420000',
        vencido: '0',
        estado: 'CORRIENTE',
        diasMora: 0,
        compromisosAbiertos: 0,
        ultimaGestion: null,
      }),
    ],
  };
  return servidorFalso({
    'POST /auth/refresh': () => ({ status: 200, cuerpo: { accessToken: 't' } }),
    'GET /auth/yo': () => ({
      status: 200,
      cuerpo: yoDe({
        mfa: { requerido: rol === 'CONTADORA', configurado: true, verificado: true },
        condominios: [{ condominioId: 'c1', razonSocial: 'Condominio Demo', rol }],
      }),
    }),
    [`GET /cartera?corte=${hoy}`]: () => ({ status: 200, cuerpo: lista }),
    'GET /cartera/ajustes': () => ({ status: 200, cuerpo: ajustes }),
    'GET /cartera/gestiones': () => ({ status: 200, cuerpo: [] }),
    'GET /cartera/compromisos': () => ({ status: 200, cuerpo: [] }),
    'GET /unidades?buscar=&estado=activas': () => ({
      status: 200,
      cuerpo: [
        {
          id: 'u1',
          codigo: '01',
          tipo: 'VILLA',
          cuotaMensual: '550000',
          activa: true,
          titularidades: [],
        },
      ],
    }),
    'GET /propietarios?buscar=&estado=activos': () => ({ status: 200, cuerpo: [] }),
  });
}

describe('Gestión de cartera', () => {
  it('un rol sin acceso a finanzas no entra', async () => {
    servidor('OPERACIONES');
    renderApp('/cartera');
    expect(
      await screen.findByRole('heading', { name: 'No tiene acceso a esta sección' }),
    ).toBeInTheDocument();
  });

  it('muestra indicadores, antigüedad y la cartera por unidad con el estado en texto', async () => {
    servidor('CONTADORA');
    renderApp('/cartera');
    const fila = (
      await screen.findByRole('button', { name: 'Ver estado de cuenta de 01' })
    ).closest('tr')!;
    expect(within(fila).getByText('Persona Ficticia Uno')).toBeInTheDocument();
    expect(within(fila).getByText('Vencida')).toBeInTheDocument();
    expect(within(fila).getByText('67 días de mora')).toBeInTheDocument();
    expect(within(fila).getAllByText(/1\.250\.000/).length).toBe(2);
    expect(within(fila).getByText('1 compromiso abierto')).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('button', { name: 'Ver estado de cuenta de 02' }).closest('tr')!,
      ).getByText('Corriente'),
    ).toBeInTheDocument();
    expect(screen.getByText('Cartera total').parentElement).toHaveTextContent(/1\.670\.000/);
    expect(screen.getByText('Cartera vencida').parentElement).toHaveTextContent(
      '1 unidades en mora',
    );
    expect(screen.getByText('61–90 días').closest('div')).toHaveTextContent(/550\.000/);
    expect(screen.getByRole('link', { name: 'Gestión de cartera' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('HU-03: la asistente registra una gestión con compromiso y no ve acciones financieras', async () => {
    const s = servidor('ASISTENTE', [ajuste()]);
    s.manejadores['POST /cartera/gestiones'] = () => ({
      status: 201,
      cuerpo: { id: 'g1', compromiso: { id: 'k1' } },
    });
    renderApp('/cartera');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Registrar gestión' }));
    const dlg = within(screen.getByRole('dialog'));
    await u.selectOptions(dlg.getByLabelText('Villa o lote *'), 'u1');
    await u.selectOptions(dlg.getByLabelText('Canal *'), 'WHATSAPP');
    await u.type(dlg.getByLabelText('Resultado u observaciones *'), 'Acepta pagar el viernes');
    await u.click(dlg.getByLabelText('La persona se comprometió a pagar'));
    await u.type(dlg.getByLabelText('Fecha pactada *'), '2026-12-01');
    await u.type(dlg.getByLabelText('Valor comprometido *'), '550.000');
    await u.click(dlg.getByRole('button', { name: 'Registrar gestión' }));
    expect(
      await screen.findByText(
        'Compromiso registrado. El saldo no cambia hasta aplicar un pago válido.',
      ),
    ).toBeInTheDocument();
    expect(s.llamadas.find((l) => l.clave === 'POST /cartera/gestiones')!.cuerpo).toMatchObject({
      unidadId: 'u1',
      canal: 'WHATSAPP',
      resultado: 'Acepta pagar el viernes',
      compromiso: { fechaPactada: '2026-12-01', valor: '550000' },
    });

    await u.click(screen.getByText('Ajustes (1)'));
    expect(await screen.findByText(/Crédito por/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar ajuste' })).not.toBeInTheDocument();
    await u.click(screen.getByText('Obligaciones'));
    expect(screen.queryByRole('button', { name: /Registrar obligación/ })).not.toBeInTheDocument();
  });

  it('quien solicitó un ajuste no lo puede aprobar; otra persona sí, con nota', async () => {
    const s = servidor('CONTADORA', [
      ajuste({ id: 'propio', esPropio: true }),
      ajuste({ id: 'ajeno' }),
    ]);
    s.manejadores['POST /cartera/ajustes/ajeno/resolver'] = () => ({
      status: 200,
      cuerpo: { id: 'ajeno', estado: 'APROBADO' },
    });
    renderApp('/cartera');
    const u = userEvent.setup();
    await u.click(await screen.findByText('Ajustes (2)'));
    expect(
      await screen.findByText('Usted lo solicitó: debe autorizarlo otra persona.'),
    ).toBeInTheDocument();
    const aprobar = screen.getByRole('button', { name: 'Aprobar ajuste' });
    expect(aprobar).toBeDisabled();
    await u.type(screen.getByLabelText('Nota de autorización *'), 'Conforme con el acta');
    await u.click(aprobar);
    expect(await screen.findByText('Ajuste aprobado y aplicado al saldo.')).toBeInTheDocument();
    expect(
      s.llamadas.find((l) => l.clave === 'POST /cartera/ajustes/ajeno/resolver')!.cuerpo,
    ).toEqual({
      aprobar: true,
      nota: 'Conforme con el acta',
    });
  });
});
