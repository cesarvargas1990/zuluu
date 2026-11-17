-- REQ-003 · Registro de pagos y recaudos. Migración aditiva.
CREATE TYPE "MedioPago" AS ENUM ('TRANSFERENCIA', 'CONSIGNACION', 'EFECTIVO', 'OTRO');
CREATE TYPE "EstadoRecaudo" AS ENUM ('PENDIENTE', 'VERIFICADO', 'OBSERVADO', 'ANULADO');
CREATE TYPE "ConceptoImputacion" AS ENUM ('CUOTA_ADMINISTRACION', 'CUOTA_VENCIDA', 'INTERESES', 'CUOTA_EXTRAORDINARIA', 'OTRO');
CREATE TYPE "OrigenRecaudo" AS ENUM ('MANUAL', 'IMPORTACION');
CREATE TYPE "EstadoImportacionRecaudos" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'DESCARTADA');

CREATE TABLE "recaudo" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "unidad_id" UUID,
    "propietario_id" UUID,
    "pagador" VARCHAR(180),
    "fecha_pago" DATE NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "referencia" VARCHAR(80),
    "banco" VARCHAR(120),
    "observacion" VARCHAR(1000),
    "estado" "EstadoRecaudo" NOT NULL DEFAULT 'PENDIENTE',
    "origen" "OrigenRecaudo" NOT NULL DEFAULT 'MANUAL',
    "importacion_id" UUID,
    "posible_duplicado" BOOLEAN NOT NULL DEFAULT false,
    "saldo_a_favor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "observacion_verificacion" VARCHAR(1000),
    "revisado_por" UUID,
    "revisado_en" TIMESTAMPTZ(3),
    "anulado_por" UUID,
    "anulado_en" TIMESTAMPTZ(3),
    "motivo_anulacion" VARCHAR(1000),
    "creado_por" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "recaudo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recaudo_condominio_id_fkey" FOREIGN KEY ("condominio_id")
      REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recaudo_condominio_id_unidad_id_fkey" FOREIGN KEY ("condominio_id", "unidad_id")
      REFERENCES "unidad_privada"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recaudo_condominio_id_propietario_id_fkey" FOREIGN KEY ("condominio_id", "propietario_id")
      REFERENCES "propietario"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recaudo_valor_positivo_check" CHECK ("valor" > 0),
    CONSTRAINT "recaudo_saldo_a_favor_check" CHECK ("saldo_a_favor" >= 0 AND "saldo_a_favor" <= "valor"),
    CONSTRAINT "recaudo_anulacion_con_motivo_check" CHECK ("estado" <> 'ANULADO' OR "motivo_anulacion" IS NOT NULL)
);
CREATE UNIQUE INDEX "recaudo_condominio_id_numero_key" ON "recaudo"("condominio_id", "numero");
CREATE UNIQUE INDEX "recaudo_condominio_id_id_key" ON "recaudo"("condominio_id", "id");
CREATE INDEX "recaudo_condominio_id_estado_fecha_pago_idx" ON "recaudo"("condominio_id", "estado", "fecha_pago");
CREATE INDEX "recaudo_condominio_id_unidad_id_idx" ON "recaudo"("condominio_id", "unidad_id");
CREATE INDEX "recaudo_condominio_id_referencia_idx" ON "recaudo"("condominio_id", "referencia");

CREATE TABLE "imputacion_recaudo" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "recaudo_id" UUID NOT NULL,
    "concepto" "ConceptoImputacion" NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "valor_obligacion" DECIMAL(18,2),
    "valor_aplicado" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "imputacion_recaudo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "imputacion_recaudo_condominio_id_recaudo_id_fkey" FOREIGN KEY ("condominio_id", "recaudo_id")
      REFERENCES "recaudo"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "imputacion_recaudo_valor_check" CHECK ("valor_aplicado" > 0),
    CONSTRAINT "imputacion_recaudo_obligacion_check" CHECK ("valor_obligacion" IS NULL OR "valor_obligacion" >= "valor_aplicado")
);
CREATE INDEX "imputacion_recaudo_condominio_id_recaudo_id_idx" ON "imputacion_recaudo"("condominio_id", "recaudo_id");

CREATE TABLE "soporte_recaudo" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "recaudo_id" UUID NOT NULL,
    "nombre" VARCHAR(180) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "tamano" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "contenido" BYTEA NOT NULL,
    "creado_por" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "soporte_recaudo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "soporte_recaudo_condominio_id_recaudo_id_fkey" FOREIGN KEY ("condominio_id", "recaudo_id")
      REFERENCES "recaudo"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "soporte_recaudo_condominio_id_recaudo_id_created_at_idx" ON "soporte_recaudo"("condominio_id", "recaudo_id", "created_at");

CREATE TABLE "importacion_recaudos" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "archivo" VARCHAR(180) NOT NULL,
    "filas" JSONB NOT NULL,
    "resumen" JSONB NOT NULL,
    "estado" "EstadoImportacionRecaudos" NOT NULL DEFAULT 'PENDIENTE',
    "creada_por" UUID NOT NULL,
    "confirmada_por" UUID,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrada_en" TIMESTAMPTZ(3),
    CONSTRAINT "importacion_recaudos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "importacion_recaudos_condominio_id_fkey" FOREIGN KEY ("condominio_id")
      REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "importacion_recaudos_condominio_id_estado_creada_en_idx" ON "importacion_recaudos"("condominio_id", "estado", "creada_en");

-- Aislamiento por condominio.
ALTER TABLE "recaudo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recaudo_tenant" ON "recaudo"
  USING ("condominio_id" = app_condominio_id())
  WITH CHECK ("condominio_id" = app_condominio_id());

ALTER TABLE "imputacion_recaudo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imputacion_recaudo_tenant" ON "imputacion_recaudo"
  USING ("condominio_id" = app_condominio_id())
  WITH CHECK ("condominio_id" = app_condominio_id());

ALTER TABLE "soporte_recaudo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "soporte_recaudo_tenant" ON "soporte_recaudo"
  USING ("condominio_id" = app_condominio_id())
  WITH CHECK ("condominio_id" = app_condominio_id());

ALTER TABLE "importacion_recaudos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "importacion_recaudos_tenant" ON "importacion_recaudos"
  USING ("condominio_id" = app_condominio_id())
  WITH CHECK ("condominio_id" = app_condominio_id());

-- El dinero no se borra: sin DELETE. Imputaciones y soportes son inmutables (sin UPDATE).
GRANT SELECT, INSERT, UPDATE ON "recaudo", "importacion_recaudos" TO zulu_app;
GRANT SELECT, INSERT ON "imputacion_recaudo", "soporte_recaudo" TO zulu_app;
REVOKE DELETE ON "recaudo", "imputacion_recaudo", "soporte_recaudo", "importacion_recaudos" FROM zulu_app;
