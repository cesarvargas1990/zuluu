-- REQ-005: documentos administrativos de cobro, separados de las obligaciones contables.
CREATE TYPE "EstadoPeriodoCobro" AS ENUM ('CONFIGURADO', 'BORRADORES_GENERADOS', 'CERRADO');
CREATE TYPE "EstadoCuentaCobro" AS ENUM ('BORRADOR', 'PENDIENTE_APROBACION', 'APROBADO', 'EMITIDO', 'ANULADO');
CREATE TYPE "EstadoEnvioCuentaCobro" AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO');

CREATE TABLE "periodo_cobro" (
  "id" UUID NOT NULL,
  "condominio_id" UUID NOT NULL,
  "periodo" VARCHAR(7) NOT NULL,
  "fecha_corte" DATE NOT NULL,
  "fecha_vencimiento" DATE NOT NULL,
  "estado" "EstadoPeriodoCobro" NOT NULL DEFAULT 'CONFIGURADO',
  "creado_por" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "periodo_cobro_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "periodo_cobro_condominio_fkey" FOREIGN KEY ("condominio_id") REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "periodo_cobro_fechas_check" CHECK ("fecha_vencimiento" >= "fecha_corte"),
  CONSTRAINT "periodo_cobro_periodo_check" CHECK ("periodo" ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
CREATE UNIQUE INDEX "periodo_cobro_condominio_id_periodo_key" ON "periodo_cobro"("condominio_id", "periodo");
CREATE UNIQUE INDEX "periodo_cobro_condominio_id_id_key" ON "periodo_cobro"("condominio_id", "id");
CREATE INDEX "periodo_cobro_condominio_id_estado_periodo_idx" ON "periodo_cobro"("condominio_id", "estado", "periodo");

CREATE TABLE "concepto_cobro" (
  "id" UUID NOT NULL,
  "condominio_id" UUID NOT NULL,
  "periodo_id" UUID NOT NULL,
  "nombre" VARCHAR(120) NOT NULL,
  "descripcion" VARCHAR(300),
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_por" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "concepto_cobro_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "concepto_cobro_periodo_fkey" FOREIGN KEY ("condominio_id", "periodo_id") REFERENCES "periodo_cobro"("condominio_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "concepto_cobro_condominio_id_periodo_id_activo_idx" ON "concepto_cobro"("condominio_id", "periodo_id", "activo");

CREATE TABLE "cuenta_cobro" (
  "id" UUID NOT NULL,
  "condominio_id" UUID NOT NULL,
  "periodo_id" UUID NOT NULL,
  "unidad_id" UUID NOT NULL,
  "numero" INTEGER,
  "estado" "EstadoCuentaCobro" NOT NULL DEFAULT 'BORRADOR',
  "version" INTEGER NOT NULL DEFAULT 1,
  "snapshot" JSONB NOT NULL,
  "total" DECIMAL(18,2) NOT NULL,
  "pdf" BYTEA,
  "generado_por" UUID NOT NULL,
  "aprobado_por" UUID,
  "aprobado_en" TIMESTAMPTZ(3),
  "emitido_por" UUID,
  "emitido_en" TIMESTAMPTZ(3),
  "anulado_por" UUID,
  "anulado_en" TIMESTAMPTZ(3),
  "motivo_anulacion" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "cuenta_cobro_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cuenta_cobro_condominio_fkey" FOREIGN KEY ("condominio_id") REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cuenta_cobro_periodo_fkey" FOREIGN KEY ("condominio_id", "periodo_id") REFERENCES "periodo_cobro"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cuenta_cobro_unidad_fkey" FOREIGN KEY ("condominio_id", "unidad_id") REFERENCES "unidad_privada"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cuenta_cobro_total_check" CHECK ("total" >= 0),
  CONSTRAINT "cuenta_cobro_numero_estado_check" CHECK (("estado" = 'ANULADO') OR (("estado" = 'BORRADOR' OR "estado" = 'PENDIENTE_APROBACION' OR "estado" = 'APROBADO') AND "numero" IS NULL) OR ("estado" = 'EMITIDO' AND "numero" IS NOT NULL))
);
CREATE UNIQUE INDEX "cuenta_cobro_condominio_id_numero_key" ON "cuenta_cobro"("condominio_id", "numero");
CREATE UNIQUE INDEX "cuenta_cobro_condominio_id_id_key" ON "cuenta_cobro"("condominio_id", "id");
CREATE UNIQUE INDEX "cuenta_cobro_unidad_periodo_activa" ON "cuenta_cobro"("condominio_id", "periodo_id", "unidad_id") WHERE "estado" <> 'ANULADO';
CREATE INDEX "cuenta_cobro_condominio_id_periodo_id_estado_idx" ON "cuenta_cobro"("condominio_id", "periodo_id", "estado");
CREATE INDEX "cuenta_cobro_condominio_id_unidad_id_created_at_idx" ON "cuenta_cobro"("condominio_id", "unidad_id", "created_at");

CREATE TABLE "envio_cuenta_cobro" (
  "id" UUID NOT NULL,
  "condominio_id" UUID NOT NULL,
  "cuenta_id" UUID NOT NULL,
  "canal" VARCHAR(30) NOT NULL,
  "destinatario" VARCHAR(254) NOT NULL,
  "estado" "EstadoEnvioCuentaCobro" NOT NULL DEFAULT 'PENDIENTE',
  "detalle" VARCHAR(500),
  "enviado_por" UUID NOT NULL,
  "enviado_en" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "envio_cuenta_cobro_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "envio_cuenta_cobro_condominio_fkey" FOREIGN KEY ("condominio_id") REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "envio_cuenta_cobro_cuenta_fkey" FOREIGN KEY ("condominio_id", "cuenta_id") REFERENCES "cuenta_cobro"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "envio_cuenta_cobro_condominio_id_cuenta_id_created_at_idx" ON "envio_cuenta_cobro"("condominio_id", "cuenta_id", "created_at");

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['periodo_cobro', 'concepto_cobro', 'cuenta_cobro', 'envio_cuenta_cobro'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (condominio_id = app_condominio_id()) WITH CHECK (condominio_id = app_condominio_id())', t || '_tenant', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO zulu_app', t);
  END LOOP;
END $$;

-- El estado del envío se completa desde PENDIENTE a ENVIADO/FALLIDO con auditoría.
