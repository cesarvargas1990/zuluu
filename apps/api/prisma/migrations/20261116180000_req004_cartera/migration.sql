-- REQ-004 · Gestión de cartera y cuentas por cobrar. Migración aditiva.
ALTER TYPE "ConceptoImputacion" ADD VALUE IF NOT EXISTS 'SALDO_INICIAL';

CREATE TYPE "OrigenObligacion" AS ENUM ('MANUAL', 'GENERACION', 'IMPORTACION');
CREATE TYPE "TipoMovimientoCartera" AS ENUM ('CARGO', 'PAGO', 'REVERSO_PAGO', 'AJUSTE_DEBITO', 'AJUSTE_CREDITO', 'CREDITO_APLICADO');
CREATE TYPE "TipoAjusteCartera" AS ENUM ('DEBITO', 'CREDITO');
CREATE TYPE "EstadoAjusteCartera" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');
CREATE TYPE "CanalGestion" AS ENUM ('TELEFONO', 'CORREO', 'WHATSAPP', 'PRESENCIAL', 'CARTA', 'OTRO');
CREATE TYPE "EstadoCompromiso" AS ENUM ('ABIERTO', 'CUMPLIDO', 'INCUMPLIDO', 'CANCELADO');
CREATE TYPE "EstadoImportacionCartera" AS ENUM ('PENDIENTE', 'APROBADA', 'DESCARTADA');

CREATE TABLE "obligacion" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "unidad_id" UUID NOT NULL,
    "concepto" "ConceptoImputacion" NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "descripcion" VARCHAR(300),
    "fecha_emision" DATE NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "origen" "OrigenObligacion" NOT NULL DEFAULT 'MANUAL',
    "importacion_id" UUID,
    "creado_por" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "obligacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "obligacion_condominio_id_fkey" FOREIGN KEY ("condominio_id")
      REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "obligacion_condominio_id_unidad_id_fkey" FOREIGN KEY ("condominio_id", "unidad_id")
      REFERENCES "unidad_privada"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "obligacion_valor_check" CHECK ("valor" > 0),
    CONSTRAINT "obligacion_fechas_check" CHECK ("fecha_vencimiento" >= "fecha_emision"),
    CONSTRAINT "obligacion_periodo_check" CHECK ("periodo" ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
CREATE UNIQUE INDEX "obligacion_condominio_id_numero_key" ON "obligacion"("condominio_id", "numero");
CREATE UNIQUE INDEX "obligacion_condominio_id_id_key" ON "obligacion"("condominio_id", "id");
CREATE INDEX "obligacion_condominio_id_unidad_id_periodo_idx" ON "obligacion"("condominio_id", "unidad_id", "periodo");
CREATE INDEX "obligacion_condominio_id_fecha_vencimiento_idx" ON "obligacion"("condominio_id", "fecha_vencimiento");
-- Sin doble contabilización: una sola obligación por unidad, concepto y periodo (salvo "otro concepto").
CREATE UNIQUE INDEX "obligacion_unica_por_concepto_periodo" ON "obligacion"("condominio_id", "unidad_id", "concepto", "periodo")
  WHERE "concepto" <> 'OTRO';

CREATE TABLE "movimiento_cartera" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "unidad_id" UUID NOT NULL,
    "obligacion_id" UUID NOT NULL,
    "tipo" "TipoMovimientoCartera" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "recaudo_id" UUID,
    "imputacion_id" UUID,
    "ajuste_id" UUID,
    "descripcion" VARCHAR(300),
    "creado_por" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "movimiento_cartera_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "movimiento_cartera_condominio_id_obligacion_id_fkey" FOREIGN KEY ("condominio_id", "obligacion_id")
      REFERENCES "obligacion"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "movimiento_cartera_condominio_id_recaudo_id_fkey" FOREIGN KEY ("condominio_id", "recaudo_id")
      REFERENCES "recaudo"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "movimiento_cartera_valor_check" CHECK ("valor" > 0)
);
CREATE INDEX "movimiento_cartera_condominio_id_obligacion_id_idx" ON "movimiento_cartera"("condominio_id", "obligacion_id");
CREATE INDEX "movimiento_cartera_condominio_id_unidad_id_fecha_idx" ON "movimiento_cartera"("condominio_id", "unidad_id", "fecha");
CREATE INDEX "movimiento_cartera_condominio_id_recaudo_id_idx" ON "movimiento_cartera"("condominio_id", "recaudo_id");
-- Un pago verificado se refleja una sola vez (HU-04), y su reverso también.
CREATE UNIQUE INDEX "movimiento_cartera_un_pago_por_imputacion" ON "movimiento_cartera"("imputacion_id", "tipo")
  WHERE "imputacion_id" IS NOT NULL;
CREATE UNIQUE INDEX "movimiento_cartera_un_movimiento_por_ajuste" ON "movimiento_cartera"("ajuste_id")
  WHERE "ajuste_id" IS NOT NULL;

CREATE TABLE "ajuste_cartera" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "obligacion_id" UUID NOT NULL,
    "tipo" "TipoAjusteCartera" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "motivo" VARCHAR(1000) NOT NULL,
    "soporte" VARCHAR(500),
    "estado" "EstadoAjusteCartera" NOT NULL DEFAULT 'PENDIENTE',
    "solicitado_por" UUID NOT NULL,
    "resuelto_por" UUID,
    "resuelto_en" TIMESTAMPTZ(3),
    "nota_resolucion" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ajuste_cartera_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ajuste_cartera_condominio_id_obligacion_id_fkey" FOREIGN KEY ("condominio_id", "obligacion_id")
      REFERENCES "obligacion"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ajuste_cartera_valor_check" CHECK ("valor" > 0),
    -- Cuatro ojos: quien solicita un ajuste no lo resuelve.
    CONSTRAINT "ajuste_cartera_cuatro_ojos_check" CHECK ("resuelto_por" IS NULL OR "resuelto_por" <> "solicitado_por")
);
CREATE INDEX "ajuste_cartera_condominio_id_estado_created_at_idx" ON "ajuste_cartera"("condominio_id", "estado", "created_at");
CREATE INDEX "ajuste_cartera_condominio_id_obligacion_id_idx" ON "ajuste_cartera"("condominio_id", "obligacion_id");

CREATE TABLE "gestion_cobro" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "unidad_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "canal" "CanalGestion" NOT NULL,
    "contacto" VARCHAR(180),
    "resultado" VARCHAR(1000) NOT NULL,
    "proxima_fecha" DATE,
    "creado_por" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gestion_cobro_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gestion_cobro_condominio_id_unidad_id_fkey" FOREIGN KEY ("condominio_id", "unidad_id")
      REFERENCES "unidad_privada"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "gestion_cobro_condominio_id_id_key" ON "gestion_cobro"("condominio_id", "id");
CREATE INDEX "gestion_cobro_condominio_id_unidad_id_fecha_idx" ON "gestion_cobro"("condominio_id", "unidad_id", "fecha");
CREATE INDEX "gestion_cobro_condominio_id_proxima_fecha_idx" ON "gestion_cobro"("condominio_id", "proxima_fecha");

CREATE TABLE "compromiso_pago" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "unidad_id" UUID NOT NULL,
    "gestion_id" UUID,
    "fecha_pactada" DATE NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "estado" "EstadoCompromiso" NOT NULL DEFAULT 'ABIERTO',
    "observaciones" VARCHAR(1000),
    "creado_por" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "compromiso_pago_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "compromiso_pago_condominio_id_unidad_id_fkey" FOREIGN KEY ("condominio_id", "unidad_id")
      REFERENCES "unidad_privada"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "compromiso_pago_condominio_id_gestion_id_fkey" FOREIGN KEY ("condominio_id", "gestion_id")
      REFERENCES "gestion_cobro"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "compromiso_pago_valor_check" CHECK ("valor" > 0)
);
CREATE INDEX "compromiso_pago_condominio_id_estado_fecha_pactada_idx" ON "compromiso_pago"("condominio_id", "estado", "fecha_pactada");
CREATE INDEX "compromiso_pago_condominio_id_unidad_id_idx" ON "compromiso_pago"("condominio_id", "unidad_id");

CREATE TABLE "importacion_cartera" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "archivo" VARCHAR(180) NOT NULL,
    "fecha_corte" DATE NOT NULL,
    "filas" JSONB NOT NULL,
    "resumen" JSONB NOT NULL,
    "estado" "EstadoImportacionCartera" NOT NULL DEFAULT 'PENDIENTE',
    "creada_por" UUID NOT NULL,
    "aprobada_por" UUID,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrada_en" TIMESTAMPTZ(3),
    CONSTRAINT "importacion_cartera_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "importacion_cartera_condominio_id_fkey" FOREIGN KEY ("condominio_id")
      REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "importacion_cartera_condominio_id_estado_creada_en_idx" ON "importacion_cartera"("condominio_id", "estado", "creada_en");

ALTER TABLE "imputacion_recaudo" ADD COLUMN "obligacion_id" UUID;

ALTER TABLE "obligacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obligacion_tenant" ON "obligacion"
  USING ("condominio_id" = app_condominio_id()) WITH CHECK ("condominio_id" = app_condominio_id());
ALTER TABLE "movimiento_cartera" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movimiento_cartera_tenant" ON "movimiento_cartera"
  USING ("condominio_id" = app_condominio_id()) WITH CHECK ("condominio_id" = app_condominio_id());
ALTER TABLE "ajuste_cartera" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ajuste_cartera_tenant" ON "ajuste_cartera"
  USING ("condominio_id" = app_condominio_id()) WITH CHECK ("condominio_id" = app_condominio_id());
ALTER TABLE "gestion_cobro" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestion_cobro_tenant" ON "gestion_cobro"
  USING ("condominio_id" = app_condominio_id()) WITH CHECK ("condominio_id" = app_condominio_id());
ALTER TABLE "compromiso_pago" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compromiso_pago_tenant" ON "compromiso_pago"
  USING ("condominio_id" = app_condominio_id()) WITH CHECK ("condominio_id" = app_condominio_id());
ALTER TABLE "importacion_cartera" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "importacion_cartera_tenant" ON "importacion_cartera"
  USING ("condominio_id" = app_condominio_id()) WITH CHECK ("condominio_id" = app_condominio_id());

-- Obligaciones, movimientos y gestiones son inmutables: solo lectura e inserción. Nada se borra.
GRANT SELECT, INSERT ON "obligacion", "movimiento_cartera", "gestion_cobro" TO zulu_app;
GRANT SELECT, INSERT, UPDATE ON "ajuste_cartera", "compromiso_pago", "importacion_cartera" TO zulu_app;
REVOKE DELETE ON "obligacion", "movimiento_cartera", "gestion_cobro", "ajuste_cartera", "compromiso_pago", "importacion_cartera" FROM zulu_app;
