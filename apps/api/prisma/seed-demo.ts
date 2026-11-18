/**
 * Datos de PRUEBA para todos los módulos (propietarios, unidades, recaudos, cartera).
 * Todo es ficticio. Requiere haber corrido `pnpm db:seed` (usuarios y condominios demo).
 * Usa el rol owner (DATABASE_URL). Idempotente: si ya existe la unidad V-01 del condominio, no repite.
 * Nunca ejecutar contra producción.
 */
import { Prisma, PrismaClient, type MedioPago } from '@prisma/client';

const prisma = new PrismaClient();
const D = (n: number) => new Prisma.Decimal(n);
const fecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const NOMBRES = [
  ['Marta Lucía Rojas Peña', 'NATURAL'],
  ['Jorge Iván Castaño Mejía', 'NATURAL'],
  ['Inversiones Aurora S.A.S.', 'JURIDICA'],
  ['Diana Carolina Ospina Vélez', 'NATURAL'],
  ['Felipe Andrés Londoño Ruiz', 'NATURAL'],
  ['Constructora Horizonte Ltda.', 'JURIDICA'],
  ['Sandra Milena Ríos Gil', 'NATURAL'],
  ['Hernán Darío Pineda Soto', 'NATURAL'],
  ['Luz Marina Cárdenas Toro', 'NATURAL'],
  ['Inmobiliaria Los Cedros S.A.S.', 'JURIDICA'],
  ['Camilo Esteban Arango Mora', 'NATURAL'],
  ['Paula Andrea Giraldo Franco', 'NATURAL'],
] as const;

// perfil de pago por unidad (periodos pagados de 6: 2026-06 … 2026-11)
const PERFILES = [
  'AL_DIA',
  'AL_DIA',
  'MORA_1',
  'AL_DIA',
  'MORA_3',
  'PARCIAL',
  'MORA_MAS',
  'AL_DIA',
  'ANTICIPO',
  'MORA_1',
  'AL_DIA',
  'MORA_3',
  'MORA_MAS',
  'AL_DIA',
] as const;
const PERIODOS = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];

function periodosPagados(perfil: (typeof PERFILES)[number]): number {
  switch (perfil) {
    case 'AL_DIA':
    case 'ANTICIPO':
      return 6;
    case 'MORA_1':
      return 5;
    case 'PARCIAL':
      return 5; // y un abono parcial al siguiente
    case 'MORA_3':
      return 3;
    case 'MORA_MAS':
      return 1;
  }
}

async function poblarCondominio(
  db: Prisma.TransactionClient,
  condominioId: string,
  sufijo: string,
  nUnidades: number,
  usuarios: { admin: string; asistente: string; contadora: string },
) {
  const prisma = db;
  if (await prisma.unidadPrivada.findFirst({ where: { condominioId, codigo: 'V-01' } })) {
    console.log(`  · ${sufijo}: ya tiene datos de prueba, se omite`);
    return;
  }
  const { admin, asistente, contadora } = usuarios;

  // Propietarios
  const propietarios = [];
  for (let i = 0; i < NOMBRES.length; i++) {
    const [nombre, tipo] = NOMBRES[i]!;
    propietarios.push(
      await prisma.propietario.create({
        data: {
          condominioId,
          nombre,
          tipoPersona: tipo,
          tipoDocumento: tipo === 'JURIDICA' ? 'NIT' : 'CC',
          numeroDocumento: tipo === 'JURIDICA' ? `9009${i}0${i}1-${i % 9}` : `1000${i}2345${i}`,
          telefono: `300${String(1000000 + i * 7919).slice(0, 7)}`,
          correo: `propietario${i + 1}.${sufijo}@demo.test`,
          direccion: `Calle ${10 + i} # ${i + 3}-${20 + i}, Majagua`,
          activo: i !== 11,
        },
      }),
    );
  }

  // Unidades + titularidades
  const unidades = [];
  for (let i = 0; i < nUnidades; i++) {
    const esVilla = i < Math.ceil(nUnidades * 0.65);
    const n = esVilla ? i + 1 : i + 1 - Math.ceil(nUnidades * 0.65);
    const u = await prisma.unidadPrivada.create({
      data: {
        condominioId,
        codigo: `${esVilla ? 'V' : 'L'}-${String(n).padStart(2, '0')}`,
        tipo: esVilla ? 'VILLA' : 'LOTE',
        areaM2: D(esVilla ? 180 + (i % 4) * 15 : 600 + (i % 3) * 120),
        coeficiente: D(esVilla ? 0.052 + (i % 4) * 0.004 : 0.031 + (i % 3) * 0.003),
        cuotaMensual: D(esVilla ? 380000 + (i % 4) * 25000 : 210000 + (i % 3) * 30000),
        matriculaInmobiliaria: `050-${70000 + i * 137}`,
        estadoJuridico: i === 6 ? 'Embargo registrado (ficticio)' : 'Sin novedad',
      },
    });
    unidades.push(u);
    const prop = propietarios[i % propietarios.length]!;
    await prisma.titularidad.create({
      data: {
        condominioId,
        propietarioId: prop.id,
        unidadId: u.id,
        tipo: 'TITULAR',
        estado: i === 12 ? 'PENDIENTE_VALIDAR' : i === 13 ? 'OBSERVADO' : 'VALIDADO',
        desde: fecha('2022-03-01'),
        fuente: 'Escritura pública ficticia',
      },
    });
    if (i % 5 === 0) {
      await prisma.titularidad.create({
        data: {
          condominioId,
          propietarioId: propietarios[(i + 4) % propietarios.length]!.id,
          unidadId: u.id,
          tipo: 'COTITULAR',
          estado: 'VALIDADO',
          desde: fecha('2023-06-15'),
        },
      });
    }
  }

  // Cartera y recaudos
  let numObl =
    (await prisma.obligacion.aggregate({ where: { condominioId }, _max: { numero: true } }))._max
      .numero ?? 0;
  let numRec =
    (await prisma.recaudo.aggregate({ where: { condominioId }, _max: { numero: true } }))._max
      .numero ?? 0;
  const medios: MedioPago[] = ['TRANSFERENCIA', 'CONSIGNACION', 'EFECTIVO', 'TRANSFERENCIA'];
  const obligacionesAbiertas: { id: string; unidadId: string; saldo: number }[] = [];

  for (let i = 0; i < unidades.length; i++) {
    const u = unidades[i]!;
    const perfil = PERFILES[i % PERFILES.length]!;
    const pagados = periodosPagados(perfil);
    const cuota = Number(u.cuotaMensual);
    const prop = propietarios[i % propietarios.length]!;

    for (let p = 0; p < PERIODOS.length; p++) {
      const periodo = PERIODOS[p]!;
      const emision = fecha(`${periodo}-01`);
      const obl = await prisma.obligacion.create({
        data: {
          condominioId,
          numero: ++numObl,
          unidadId: u.id,
          concepto: 'CUOTA_ADMINISTRACION',
          periodo,
          descripcion: `Cuota de administración ${periodo}`,
          fechaEmision: emision,
          fechaVencimiento: fecha(`${periodo}-10`),
          valor: D(cuota),
          origen: 'GENERACION',
          creadoPor: contadora,
        },
      });
      await prisma.movimientoCartera.create({
        data: {
          condominioId,
          unidadId: u.id,
          obligacionId: obl.id,
          tipo: 'CARGO',
          valor: D(cuota),
          fecha: emision,
          descripcion: obl.descripcion,
          creadoPor: contadora,
        },
      });

      const pagaTotal = p < pagados;
      const pagaParcial = perfil === 'PARCIAL' && p === pagados;
      if (!pagaTotal && !pagaParcial) {
        obligacionesAbiertas.push({ id: obl.id, unidadId: u.id, saldo: cuota });
        continue;
      }
      const aplicado = pagaTotal ? cuota : Math.round(cuota / 2);
      const extra = perfil === 'ANTICIPO' && p === 5 ? 150000 : 0;
      const fechaPago = fecha(`${periodo}-${String(5 + ((i + p) % 5)).padStart(2, '0')}`);
      const rec = await prisma.recaudo.create({
        data: {
          condominioId,
          numero: ++numRec,
          unidadId: u.id,
          propietarioId: prop.id,
          pagador: prop.nombre,
          fechaPago,
          valor: D(aplicado + extra),
          medio: medios[(i + p) % medios.length]!,
          referencia: `REF-${sufijo.toUpperCase()}-${String(numRec).padStart(5, '0')}`,
          banco: ['Bancolombia', 'Davivienda', 'Banco de Bogotá'][(i + p) % 3]!,
          estado: 'VERIFICADO',
          saldoAFavor: D(extra),
          revisadoPor: contadora,
          revisadoEn: new Date(fechaPago.getTime() + 86_400_000),
          creadoPor: asistente,
        },
      });
      const imp = await prisma.imputacionRecaudo.create({
        data: {
          condominioId,
          recaudoId: rec.id,
          concepto: 'CUOTA_ADMINISTRACION',
          periodo,
          valorObligacion: D(cuota),
          valorAplicado: D(aplicado),
          obligacionId: obl.id,
        },
      });
      await prisma.movimientoCartera.create({
        data: {
          condominioId,
          unidadId: u.id,
          obligacionId: obl.id,
          tipo: 'PAGO',
          valor: D(aplicado),
          fecha: fechaPago,
          recaudoId: rec.id,
          imputacionId: imp.id,
          descripcion: `Pago RC-${String(rec.numero).padStart(4, '0')}`,
          creadoPor: contadora,
        },
      });
      if (pagaParcial)
        obligacionesAbiertas.push({ id: obl.id, unidadId: u.id, saldo: cuota - aplicado });
    }
  }

  const recaudoBase = (extra: Prisma.RecaudoUncheckedCreateInput) => extra;
  const u0 = unidades[0]!,
    u1 = unidades[1]!,
    u2 = unidades[2]!,
    u3 = unidades[3]!;

  // Pendientes, observado, duplicado y por identificar
  await prisma.recaudo.create({
    data: recaudoBase({
      condominioId,
      numero: ++numRec,
      unidadId: u2.id,
      propietarioId: propietarios[2]!.id,
      pagador: propietarios[2]!.nombre,
      fechaPago: fecha('2026-11-14'),
      valor: D(Number(u2.cuotaMensual)),
      medio: 'TRANSFERENCIA',
      referencia: `REF-PEND-${sufijo}-1`,
      banco: 'Bancolombia',
      estado: 'PENDIENTE',
      creadoPor: asistente,
    }),
  });
  await prisma.recaudo.create({
    data: recaudoBase({
      condominioId,
      numero: ++numRec,
      unidadId: u3.id,
      propietarioId: propietarios[3]!.id,
      pagador: propietarios[3]!.nombre,
      fechaPago: fecha('2026-11-15'),
      valor: D(520000),
      medio: 'CONSIGNACION',
      referencia: `REF-PEND-${sufijo}-2`,
      banco: 'Davivienda',
      observacion: 'Comprobante pendiente de revisar',
      estado: 'PENDIENTE',
      creadoPor: asistente,
    }),
  });
  await prisma.recaudo.create({
    data: recaudoBase({
      condominioId,
      numero: ++numRec,
      unidadId: u1.id,
      propietarioId: propietarios[1]!.id,
      pagador: propietarios[1]!.nombre,
      fechaPago: fecha('2026-11-12'),
      valor: D(399999),
      medio: 'TRANSFERENCIA',
      referencia: `REF-OBS-${sufijo}-1`,
      banco: 'Banco de Bogotá',
      estado: 'OBSERVADO',
      observacionVerificacion: 'El valor no coincide con el comprobante.',
      revisadoPor: contadora,
      revisadoEn: fecha('2026-11-13'),
      creadoPor: asistente,
    }),
  });
  const dupRef = `REF-DUP-${sufijo}-1`;
  for (const estado of ['VERIFICADO', 'PENDIENTE'] as const) {
    const r = await prisma.recaudo.create({
      data: recaudoBase({
        condominioId,
        numero: ++numRec,
        unidadId: u0.id,
        propietarioId: propietarios[0]!.id,
        pagador: propietarios[0]!.nombre,
        fechaPago: fecha('2026-11-16'),
        valor: D(80000),
        medio: 'EFECTIVO',
        referencia: dupRef,
        estado,
        posibleDuplicado: estado === 'PENDIENTE',
        revisadoPor: estado === 'VERIFICADO' ? contadora : null,
        revisadoEn: estado === 'VERIFICADO' ? fecha('2026-11-17') : null,
        saldoAFavor: estado === 'VERIFICADO' ? D(80000) : D(0),
        creadoPor: asistente,
      }),
    });
    void r;
  }
  for (let k = 1; k <= 2; k++) {
    await prisma.recaudo.create({
      data: recaudoBase({
        condominioId,
        numero: ++numRec,
        pagador: k === 1 ? 'Consignación sin nombre' : 'Transferencia Nequi',
        fechaPago: fecha(`2026-11-1${k}`),
        valor: D(210000 * k),
        medio: k === 1 ? 'CONSIGNACION' : 'OTRO',
        referencia: `REF-XID-${sufijo}-${k}`,
        banco: 'Bancolombia',
        observacion: 'Pago por identificar: falta unidad',
        estado: 'PENDIENTE',
        creadoPor: asistente,
      }),
    });
  }

  // Recaudo anulado con su reverso
  const oblAnul = await prisma.obligacion.findFirstOrThrow({
    where: { condominioId, unidadId: u3.id, periodo: '2026-11' },
  });
  const recAnul = await prisma.recaudo.create({
    data: recaudoBase({
      condominioId,
      numero: ++numRec,
      unidadId: u3.id,
      propietarioId: propietarios[3]!.id,
      pagador: propietarios[3]!.nombre,
      fechaPago: fecha('2026-11-06'),
      valor: D(Number(oblAnul.valor)),
      medio: 'TRANSFERENCIA',
      referencia: `REF-ANU-${sufijo}-1`,
      banco: 'Bancolombia',
      estado: 'ANULADO',
      revisadoPor: contadora,
      revisadoEn: fecha('2026-11-07'),
      anuladoPor: admin,
      anuladoEn: fecha('2026-11-10'),
      motivoAnulacion: 'Transferencia devuelta por el banco (dato de prueba).',
      creadoPor: asistente,
    }),
  });
  const impAnul = await prisma.imputacionRecaudo.create({
    data: {
      condominioId,
      recaudoId: recAnul.id,
      concepto: 'CUOTA_ADMINISTRACION',
      periodo: '2026-11',
      valorObligacion: oblAnul.valor,
      valorAplicado: oblAnul.valor,
      obligacionId: oblAnul.id,
    },
  });
  for (const [tipo, f] of [
    ['PAGO', '2026-11-07'],
    ['REVERSO_PAGO', '2026-11-10'],
  ] as const) {
    await prisma.movimientoCartera.create({
      data: {
        condominioId,
        unidadId: u3.id,
        obligacionId: oblAnul.id,
        tipo,
        valor: oblAnul.valor,
        fecha: fecha(f),
        recaudoId: recAnul.id,
        imputacionId: impAnul.id,
        descripcion: tipo === 'PAGO' ? 'Pago verificado' : 'Reverso por anulación',
        creadoPor: contadora,
      },
    });
  }

  // Ajustes (cuatro ojos: quien resuelve no es quien solicita)
  const oblA = obligacionesAbiertas[0]!,
    oblB = obligacionesAbiertas[1]!,
    oblC = obligacionesAbiertas[2]!;
  await prisma.ajusteCartera.create({
    data: {
      condominioId,
      obligacionId: oblA.id,
      tipo: 'CREDITO',
      valor: D(50000),
      estado: 'PENDIENTE',
      motivo: 'Descuento por pronto pago acordado en asamblea (dato de prueba).',
      solicitadoPor: asistente,
    },
  });
  const ajAp = await prisma.ajusteCartera.create({
    data: {
      condominioId,
      obligacionId: oblB.id,
      tipo: 'CREDITO',
      valor: D(30000),
      estado: 'APROBADO',
      motivo: 'Corrección de cobro duplicado.',
      solicitadoPor: asistente,
      resueltoPor: admin,
      resueltoEn: fecha('2026-11-12'),
      notaResolucion: 'Verificado contra el extracto.',
    },
  });
  await prisma.movimientoCartera.create({
    data: {
      condominioId,
      unidadId: oblB.unidadId,
      obligacionId: oblB.id,
      tipo: 'AJUSTE_CREDITO',
      valor: D(30000),
      fecha: fecha('2026-11-12'),
      ajusteId: ajAp.id,
      descripcion: 'Ajuste aprobado: corrección de cobro duplicado',
      creadoPor: admin,
    },
  });
  oblB.saldo -= 30000;
  await prisma.ajusteCartera.create({
    data: {
      condominioId,
      obligacionId: oblC.id,
      tipo: 'DEBITO',
      valor: D(25000),
      estado: 'RECHAZADO',
      motivo: 'Cobro de recargo no previsto.',
      solicitadoPor: asistente,
      resueltoPor: admin,
      resueltoEn: fecha('2026-11-13'),
      notaResolucion: 'El reglamento no contempla el recargo.',
    },
  });

  // Gestiones y compromisos sobre unidades en mora
  const enMora = [...new Set(obligacionesAbiertas.map((o) => o.unidadId))].slice(0, 6);
  const canales = ['TELEFONO', 'CORREO', 'WHATSAPP', 'PRESENCIAL', 'CARTA', 'TELEFONO'] as const;
  for (let k = 0; k < enMora.length; k++) {
    const gestion = await prisma.gestionCobro.create({
      data: {
        condominioId,
        unidadId: enMora[k]!,
        fecha: fecha(`2026-11-${String(3 + k).padStart(2, '0')}`),
        canal: canales[k]!,
        contacto: propietarios[k % propietarios.length]!.nombre,
        resultado: k % 2 ? 'Promete pagar la próxima semana.' : 'No contesta; se deja mensaje.',
        proximaFecha: fecha(`2026-11-${String(20 + k).padStart(2, '0')}`),
        creadoPor: asistente,
      },
    });
    if (k % 2) {
      await prisma.compromisoPago.create({
        data: {
          condominioId,
          unidadId: enMora[k]!,
          gestionId: gestion.id,
          fechaPactada: fecha(k === 1 ? '2026-11-10' : '2026-11-25'),
          valor: D(400000),
          estado: k === 1 ? 'INCUMPLIDO' : k === 3 ? 'CUMPLIDO' : 'ABIERTO',
          observaciones: 'Compromiso verbal registrado (dato de prueba).',
          creadoPor: asistente,
        },
      });
    }
  }

  // Importación de propietarios pendiente de revisión
  await prisma.importacionPropietarios.create({
    data: {
      condominioId,
      archivo: 'propietarios-demo.xlsx',
      filas: [{ fila: 2, nombre: 'Nuevo Propietario Demo', unidad: 'V-99' }],
      resumen: { total: 1, validas: 1, conErrores: 0 },
      estado: 'PENDIENTE_REVISION',
      creadaPor: asistente,
    },
  });

  console.log(
    `  · ${sufijo}: ${propietarios.length} propietarios, ${unidades.length} unidades, ` +
      `${numObl} obligaciones, ${numRec} recaudos`,
  );
}

/** Agrupa copropiedades bajo un condominio (multiempresa), creándolo si no existe. */
async function agrupar(nombre: string, condominioIds: string[]) {
  const g = await prisma.grupoCondominio.upsert({
    where: { nombre },
    update: {},
    create: { nombre },
  });
  await prisma.condominio.updateMany({
    where: { id: { in: condominioIds } },
    data: { grupoId: g.id },
  });
}

async function main() {
  const usr = async (email: string) =>
    (await prisma.usuario.findUniqueOrThrow({ where: { email } })).id;
  const opciones = { timeout: 120_000, maxWait: 20_000 };

  // Modo un solo condominio (p. ej. la copropiedad de prueba de producción):
  // DEMO_NIT=... DEMO_ADMIN=correo DEMO_ASISTENTE=correo DEMO_CONTADORA=correo
  if (process.env.DEMO_NIT) {
    const condominio = await prisma.condominio.findUniqueOrThrow({
      where: { nit: process.env.DEMO_NIT },
    });
    const usuarios = {
      admin: await usr(process.env.DEMO_ADMIN!),
      asistente: await usr(process.env.DEMO_ASISTENTE!),
      contadora: await usr(process.env.DEMO_CONTADORA!),
    };
    console.log(`Datos de prueba en ${condominio.razonSocial}:`);
    await prisma.$transaction(
      (tx) => poblarCondominio(tx, condominio.id, 'prueba', 14, usuarios),
      opciones,
    );
    return;
  }

  const [admin, asistente, contadora, adminLago] = await Promise.all([
    usr('administradora@demo.test'),
    usr('asistente@demo.test'),
    usr('contadora@demo.test'),
    usr('admin.lago@demo.test'),
  ]);
  const palmas = await prisma.condominio.findUniqueOrThrow({ where: { nit: '900000001-1' } });
  const lago = await prisma.condominio.findUniqueOrThrow({ where: { nit: '900000002-2' } });

  console.log('Datos de prueba:');
  await prisma.$transaction(
    (tx) => poblarCondominio(tx, palmas.id, 'palmas', 14, { admin, asistente, contadora }),
    opciones,
  );
  await prisma.$transaction(
    (tx) => poblarCondominio(tx, lago.id, 'lago', 6, { admin: adminLago, asistente, contadora }),
    opciones,
  );
  await agrupar('Majagua Villa Campestre (demo)', [palmas.id, lago.id]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
