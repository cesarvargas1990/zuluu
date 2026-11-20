CREATE TYPE "EstadoProcesoAmbiental" AS ENUM ('POR_VERIFICAR','SOLICITADO','RADICADO','REQUERIDO','PRORROGADO','EN_TRAMITE','APROBADO','NEGADO','DESISTIDO','CERRADO');
CREATE TYPE "EstadoObligacionAmbiental" AS ENUM ('PENDIENTE_VALIDAR','ABIERTA','EN_CURSO','CUMPLIDA','VENCIDA','CANCELADA');

CREATE TABLE "proceso_ambiental" (
  "id" UUID NOT NULL, "condominio_id" UUID NOT NULL, "codigo" VARCHAR(10) NOT NULL,
  "titulo" VARCHAR(200) NOT NULL, "autoridad" VARCHAR(160), "numero_expediente" VARCHAR(120), "radicado" VARCHAR(120),
  "objeto" VARCHAR(2000), "antecedente" VARCHAR(2000), "proximo_paso" VARCHAR(1000),
  "estado_juridico" "EstadoProcesoAmbiental" NOT NULL DEFAULT 'POR_VERIFICAR', "estado_tecnico" "EstadoProcesoAmbiental" NOT NULL DEFAULT 'POR_VERIFICAR',
  "prioridad" VARCHAR(20) NOT NULL DEFAULT 'MEDIA', "responsable" VARCHAR(180),
  "fecha_expedicion" DATE, "fecha_recepcion" DATE, "fecha_notificacion" DATE, "notificacion_verificada" BOOLEAN NOT NULL DEFAULT false,
  "plazo_dias" INTEGER, "metodo_computo" VARCHAR(300), "fecha_vencimiento_validada" DATE, "vencimiento_verificado" BOOLEAN NOT NULL DEFAULT false,
  "costo_estimado" DECIMAL(18,2), "creado_por" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "proceso_ambiental_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "proceso_ambiental_condominio_fkey" FOREIGN KEY ("condominio_id") REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "proceso_ambiental_plazo_check" CHECK ("plazo_dias" IS NULL OR "plazo_dias" >= 0),
  CONSTRAINT "proceso_ambiental_notificacion_check" CHECK (NOT "notificacion_verificada" OR "fecha_notificacion" IS NOT NULL),
  CONSTRAINT "proceso_ambiental_vencimiento_check" CHECK (NOT "vencimiento_verificado" OR ("fecha_vencimiento_validada" IS NOT NULL AND "notificacion_verificada" AND "plazo_dias" IS NOT NULL))
);
CREATE UNIQUE INDEX "proceso_ambiental_condominio_id_codigo_key" ON "proceso_ambiental"("condominio_id","codigo");
CREATE UNIQUE INDEX "proceso_ambiental_condominio_id_id_key" ON "proceso_ambiental"("condominio_id","id");
CREATE INDEX "proceso_ambiental_condominio_estado_idx" ON "proceso_ambiental"("condominio_id","estado_juridico","prioridad");
CREATE INDEX "proceso_ambiental_condominio_radicado_idx" ON "proceso_ambiental"("condominio_id","radicado");

CREATE TABLE "actuacion_ambiental" (
  "id" UUID NOT NULL, "condominio_id" UUID NOT NULL, "proceso_id" UUID NOT NULL, "asunto" VARCHAR(240) NOT NULL,
  "tipo" VARCHAR(60) NOT NULL, "entidad" VARCHAR(160), "radicado" VARCHAR(120), "descripcion" VARCHAR(4000) NOT NULL,
  "fecha_expedicion" DATE, "fecha_recepcion" DATE, "fecha_notificacion" DATE,
  "estado" VARCHAR(40) NOT NULL DEFAULT 'PENDIENTE_VERIFICACION', "responsable" VARCHAR(180), "creado_por" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "actuacion_ambiental_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "actuacion_ambiental_proceso_fkey" FOREIGN KEY ("condominio_id","proceso_id") REFERENCES "proceso_ambiental"("condominio_id","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "actuacion_ambiental_condominio_id_id_key" ON "actuacion_ambiental"("condominio_id","id");
CREATE INDEX "actuacion_ambiental_proceso_fecha_idx" ON "actuacion_ambiental"("condominio_id","proceso_id","created_at");
CREATE INDEX "actuacion_ambiental_radicado_idx" ON "actuacion_ambiental"("condominio_id","radicado");

CREATE TABLE "obligacion_ambiental" (
  "id" UUID NOT NULL, "condominio_id" UUID NOT NULL, "proceso_id" UUID NOT NULL, "titulo" VARCHAR(240) NOT NULL,
  "descripcion" VARCHAR(2000), "responsable" VARCHAR(180), "estado" "EstadoObligacionAmbiental" NOT NULL DEFAULT 'PENDIENTE_VALIDAR',
  "fecha_notificacion" DATE, "notificacion_validada" BOOLEAN NOT NULL DEFAULT false, "plazo_dias" INTEGER,
  "fecha_vencimiento" DATE, "vencimiento_validado" BOOLEAN NOT NULL DEFAULT false, "prioridad" VARCHAR(20) NOT NULL DEFAULT 'MEDIA',
  "evidencia_cierre" VARCHAR(1000), "creado_por" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "obligacion_ambiental_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "obligacion_ambiental_proceso_fkey" FOREIGN KEY ("condominio_id","proceso_id") REFERENCES "proceso_ambiental"("condominio_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "obligacion_ambiental_plazo_check" CHECK ("plazo_dias" IS NULL OR "plazo_dias" >= 0),
  CONSTRAINT "obligacion_ambiental_notificacion_check" CHECK (NOT "notificacion_validada" OR "fecha_notificacion" IS NOT NULL),
  CONSTRAINT "obligacion_ambiental_vencimiento_check" CHECK (NOT "vencimiento_validado" OR ("fecha_vencimiento" IS NOT NULL AND "notificacion_validada" AND "plazo_dias" IS NOT NULL))
);
CREATE INDEX "obligacion_ambiental_proceso_estado_idx" ON "obligacion_ambiental"("condominio_id","proceso_id","estado");
CREATE INDEX "obligacion_ambiental_fecha_vencimiento_idx" ON "obligacion_ambiental"("condominio_id","fecha_vencimiento");

CREATE TABLE "documento_ambiental" (
  "id" UUID NOT NULL, "condominio_id" UUID NOT NULL, "proceso_id" UUID NOT NULL, "actuacion_id" UUID,
  "nombre" VARCHAR(180) NOT NULL, "tipo" VARCHAR(80) NOT NULL, "mime_type" VARCHAR(100) NOT NULL,
  "tamano" INTEGER NOT NULL, "sha256" CHAR(64) NOT NULL, "contenido" BYTEA NOT NULL,
  "verificacion" VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_VALIDAR', "creado_por" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "documento_ambiental_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "documento_ambiental_proceso_fkey" FOREIGN KEY ("condominio_id","proceso_id") REFERENCES "proceso_ambiental"("condominio_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "documento_ambiental_actuacion_fkey" FOREIGN KEY ("condominio_id","actuacion_id") REFERENCES "actuacion_ambiental"("condominio_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "documento_ambiental_tamano_check" CHECK ("tamano" > 0)
);
CREATE INDEX "documento_ambiental_proceso_fecha_idx" ON "documento_ambiental"("condominio_id","proceso_id","created_at");
CREATE UNIQUE INDEX "documento_ambiental_condominio_id_id_key" ON "documento_ambiental"("condominio_id","id");

CREATE TABLE "relacion_documento_ambiental" (
  "id" UUID NOT NULL, "condominio_id" UUID NOT NULL, "documento_id" UUID NOT NULL, "proceso_id" UUID NOT NULL,
  "motivo" VARCHAR(500) NOT NULL, "creado_por" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "relacion_documento_ambiental_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "relacion_documento_ambiental_documento_fkey" FOREIGN KEY ("condominio_id","documento_id") REFERENCES "documento_ambiental"("condominio_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "relacion_documento_ambiental_proceso_fkey" FOREIGN KEY ("condominio_id","proceso_id") REFERENCES "proceso_ambiental"("condominio_id","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "relacion_documento_ambiental_condominio_documento_proceso_key" ON "relacion_documento_ambiental"("condominio_id","documento_id","proceso_id");
CREATE INDEX "relacion_documento_ambiental_proceso_idx" ON "relacion_documento_ambiental"("condominio_id","proceso_id");

CREATE TABLE "relacion_proceso_ambiental" (
  "id" UUID NOT NULL, "condominio_id" UUID NOT NULL, "origen_id" UUID NOT NULL, "destino_id" UUID NOT NULL,
  "motivo" VARCHAR(500) NOT NULL, "creado_por" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "relacion_proceso_ambiental_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "relacion_proceso_ambiental_origen_fkey" FOREIGN KEY ("condominio_id","origen_id") REFERENCES "proceso_ambiental"("condominio_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "relacion_proceso_ambiental_destino_fkey" FOREIGN KEY ("condominio_id","destino_id") REFERENCES "proceso_ambiental"("condominio_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "relacion_proceso_ambiental_distintos_check" CHECK ("origen_id" <> "destino_id")
);
CREATE UNIQUE INDEX "relacion_proceso_ambiental_condominio_origen_destino_key" ON "relacion_proceso_ambiental"("condominio_id","origen_id","destino_id");
CREATE INDEX "relacion_proceso_ambiental_destino_idx" ON "relacion_proceso_ambiental"("condominio_id","destino_id");

CREATE TABLE "movimiento_financiero_ambiental" (
  "id" UUID NOT NULL, "condominio_id" UUID NOT NULL, "proceso_id" UUID NOT NULL, "tipo" VARCHAR(30) NOT NULL,
  "concepto" VARCHAR(240) NOT NULL, "valor" DECIMAL(18,2) NOT NULL, "fecha" DATE, "referencia" VARCHAR(120),
  "estado" VARCHAR(40) NOT NULL DEFAULT 'PENDIENTE_CONCILIACION', "nota" VARCHAR(1000), "creado_por" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "movimiento_financiero_ambiental_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "movimiento_financiero_ambiental_proceso_fkey" FOREIGN KEY ("condominio_id","proceso_id") REFERENCES "proceso_ambiental"("condominio_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "movimiento_financiero_ambiental_valor_check" CHECK ("valor" > 0)
);
CREATE INDEX "movimiento_financiero_ambiental_proceso_fecha_idx" ON "movimiento_financiero_ambiental"("condominio_id","proceso_id","created_at");

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['proceso_ambiental','actuacion_ambiental','obligacion_ambiental','documento_ambiental','relacion_documento_ambiental','relacion_proceso_ambiental','movimiento_financiero_ambiental'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (condominio_id = app_condominio_id()) WITH CHECK (condominio_id = app_condominio_id())', t || '_tenant', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON "proceso_ambiental", "obligacion_ambiental" TO zulu_app;
GRANT SELECT, INSERT ON "actuacion_ambiental", "relacion_proceso_ambiental", "movimiento_financiero_ambiental" TO zulu_app;
GRANT SELECT, INSERT ON "documento_ambiental" TO zulu_app;
GRANT UPDATE ("verificacion") ON "documento_ambiental" TO zulu_app; -- original inmutable.
GRANT SELECT, INSERT ON "relacion_documento_ambiental" TO zulu_app;
