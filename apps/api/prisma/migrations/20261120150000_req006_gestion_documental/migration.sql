CREATE TABLE "expediente_digital" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "condominio_id" UUID NOT NULL,
  "area" VARCHAR(2) NOT NULL, "codigo" VARCHAR(40) NOT NULL, "titulo" VARCHAR(240) NOT NULL,
  "asunto" VARCHAR(2000), "responsable" VARCHAR(180), "propietario" VARCHAR(180), "villa" VARCHAR(80),
  "estado" VARCHAR(30) NOT NULL DEFAULT 'ABIERTO', "confidencial" BOOLEAN NOT NULL DEFAULT false,
  "fecha_vencimiento" DATE, "vencimiento_verificado" BOOLEAN NOT NULL DEFAULT false,
  "creado_por" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "expediente_digital_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expediente_digital_condominio_fkey" FOREIGN KEY ("condominio_id") REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "expediente_digital_condominio_id_key" UNIQUE ("condominio_id", "id"),
  CONSTRAINT "expediente_digital_condominio_codigo_key" UNIQUE ("condominio_id", "codigo")
);
CREATE TABLE "documento_digital" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "condominio_id" UUID NOT NULL, "expediente_id" UUID NOT NULL,
  "nombre" VARCHAR(240) NOT NULL, "categoria" VARCHAR(100) NOT NULL, "radicado" VARCHAR(120),
  "fecha_documento" DATE, "estado" VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_VALIDAR',
  "creado_por" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "documento_digital_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "documento_digital_condominio_fkey" FOREIGN KEY ("condominio_id") REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "documento_digital_expediente_fkey" FOREIGN KEY ("condominio_id", "expediente_id") REFERENCES "expediente_digital"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "documento_digital_condominio_id_key" UNIQUE ("condominio_id", "id")
);
CREATE TABLE "version_documento" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "condominio_id" UUID NOT NULL, "documento_id" UUID NOT NULL,
  "numero" INTEGER NOT NULL, "nombre_archivo" VARCHAR(255) NOT NULL, "mime_type" VARCHAR(120) NOT NULL,
  "tamano" INTEGER NOT NULL, "sha256" CHAR(64) NOT NULL, "ruta_privada" VARCHAR(500) NOT NULL,
  "texto_busqueda" TEXT, "creado_por" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "version_documento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "version_documento_documento_fkey" FOREIGN KEY ("condominio_id", "documento_id") REFERENCES "documento_digital"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "version_documento_condominio_id_key" UNIQUE ("condominio_id", "id"),
  CONSTRAINT "version_documento_numero_key" UNIQUE ("condominio_id", "documento_id", "numero")
);
CREATE TABLE "actuacion_digital" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "condominio_id" UUID NOT NULL, "expediente_id" UUID NOT NULL,
  "tipo" VARCHAR(80) NOT NULL, "descripcion" VARCHAR(2000) NOT NULL, "radicado" VARCHAR(120),
  "fecha_actuacion" DATE NOT NULL, "creado_por" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "actuacion_digital_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "actuacion_digital_expediente_fkey" FOREIGN KEY ("condominio_id", "expediente_id") REFERENCES "expediente_digital"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "obligacion_digital" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "condominio_id" UUID NOT NULL, "expediente_id" UUID NOT NULL,
  "titulo" VARCHAR(240) NOT NULL, "responsable" VARCHAR(180), "estado" VARCHAR(30) NOT NULL DEFAULT 'ABIERTA',
  "fecha_vencimiento" DATE, "vencimiento_verificado" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "obligacion_digital_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "obligacion_digital_expediente_fkey" FOREIGN KEY ("condominio_id", "expediente_id") REFERENCES "expediente_digital"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "relacion_documento" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "condominio_id" UUID NOT NULL, "documento_id" UUID NOT NULL,
  "entidad_tipo" VARCHAR(40) NOT NULL, "entidad_id" UUID NOT NULL, "motivo" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "relacion_documento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "relacion_documento_documento_fkey" FOREIGN KEY ("condominio_id", "documento_id") REFERENCES "documento_digital"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "relacion_documento_unique" UNIQUE ("condominio_id", "documento_id", "entidad_tipo", "entidad_id")
);
CREATE TABLE "acceso_documento" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "condominio_id" UUID NOT NULL, "expediente_id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL, "puede_descargar" BOOLEAN NOT NULL DEFAULT true,
  "creado_por" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "acceso_documento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "acceso_documento_expediente_fkey" FOREIGN KEY ("condominio_id", "expediente_id") REFERENCES "expediente_digital"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "acceso_documento_usuario_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "acceso_documento_unique" UNIQUE ("condominio_id", "expediente_id", "usuario_id")
);

CREATE INDEX "expediente_digital_condominio_area_estado_idx" ON "expediente_digital"("condominio_id", "area", "estado");
CREATE INDEX "expediente_digital_condominio_vencimiento_idx" ON "expediente_digital"("condominio_id", "fecha_vencimiento");
CREATE INDEX "documento_digital_condominio_expediente_fecha_idx" ON "documento_digital"("condominio_id", "expediente_id", "created_at");
CREATE INDEX "documento_digital_condominio_radicado_idx" ON "documento_digital"("condominio_id", "radicado");
CREATE INDEX "version_documento_condominio_sha_idx" ON "version_documento"("condominio_id", "sha256");
CREATE INDEX "actuacion_digital_condominio_expediente_fecha_idx" ON "actuacion_digital"("condominio_id", "expediente_id", "fecha_actuacion");
CREATE INDEX "obligacion_digital_condominio_expediente_fecha_idx" ON "obligacion_digital"("condominio_id", "expediente_id", "fecha_vencimiento");
CREATE INDEX "relacion_documento_condominio_entidad_idx" ON "relacion_documento"("condominio_id", "entidad_tipo", "entidad_id");
CREATE INDEX "acceso_documento_condominio_usuario_idx" ON "acceso_documento"("condominio_id", "usuario_id");

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['expediente_digital','documento_digital','version_documento','actuacion_digital','obligacion_digital','relacion_documento','acceso_documento'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (condominio_id = app_condominio_id()) WITH CHECK (condominio_id = app_condominio_id())', t || '_tenant', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON "expediente_digital", "documento_digital", "actuacion_digital", "obligacion_digital", "relacion_documento" TO zulu_app;
GRANT SELECT, INSERT ON "version_documento" TO zulu_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "acceso_documento" TO zulu_app;
