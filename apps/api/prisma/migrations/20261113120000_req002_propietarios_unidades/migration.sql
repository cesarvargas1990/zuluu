CREATE TYPE "TipoPersonaPropietaria" AS ENUM ('NATURAL', 'JURIDICA');
CREATE TYPE "TipoUnidadPrivada" AS ENUM ('VILLA', 'LOTE');
CREATE TYPE "TipoTitularidad" AS ENUM ('TITULAR', 'COTITULAR');
CREATE TYPE "EstadoTitularidad" AS ENUM ('PENDIENTE_VALIDAR', 'VALIDADO', 'OBSERVADO');

CREATE TABLE "propietario" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "tipo_persona" "TipoPersonaPropietaria" NOT NULL DEFAULT 'NATURAL',
    "nombre" VARCHAR(180) NOT NULL,
    "tipo_documento" VARCHAR(40),
    "numero_documento" VARCHAR(80),
    "telefono" VARCHAR(40),
    "correo" VARCHAR(254),
    "direccion" VARCHAR(300),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "propietario_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "propietario_condominio_id_fkey" FOREIGN KEY ("condominio_id")
      REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "propietario_condominio_id_id_key" UNIQUE ("condominio_id", "id")
);

CREATE TABLE "unidad_privada" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "codigo" VARCHAR(60) NOT NULL,
    "tipo" "TipoUnidadPrivada" NOT NULL,
    "area_m2" DECIMAL(12,2),
    "coeficiente" DECIMAL(9,6),
    "cuota_mensual" DECIMAL(14,2),
    "matricula_inmobiliaria" VARCHAR(80),
    "estado_juridico" VARCHAR(120),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "unidad_privada_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "unidad_privada_condominio_id_fkey" FOREIGN KEY ("condominio_id")
      REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "unidad_privada_condominio_id_id_key" UNIQUE ("condominio_id", "id"),
    CONSTRAINT "unidad_privada_condominio_id_codigo_key" UNIQUE ("condominio_id", "codigo")
);

CREATE TABLE "titularidad" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "propietario_id" UUID NOT NULL,
    "unidad_id" UUID NOT NULL,
    "tipo" "TipoTitularidad" NOT NULL,
    "estado" "EstadoTitularidad" NOT NULL DEFAULT 'PENDIENTE_VALIDAR',
    "desde" DATE,
    "hasta" DATE,
    "fuente" VARCHAR(240),
    "soporte" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "titularidad_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "titularidad_condominio_id_fkey" FOREIGN KEY ("condominio_id")
      REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "titularidad_condominio_propietario_fkey" FOREIGN KEY ("condominio_id", "propietario_id")
      REFERENCES "propietario"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "titularidad_condominio_unidad_fkey" FOREIGN KEY ("condominio_id", "unidad_id")
      REFERENCES "unidad_privada"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "titularidad_fecha_valida_check" CHECK ("desde" IS NULL OR "hasta" IS NULL OR "hasta" >= "desde")
);

CREATE INDEX "propietario_condominio_id_activo_nombre_idx" ON "propietario"("condominio_id", "activo", "nombre");
CREATE INDEX "propietario_condominio_id_documento_idx" ON "propietario"("condominio_id", "tipo_documento", "numero_documento");
CREATE INDEX "unidad_privada_condominio_id_tipo_activa_idx" ON "unidad_privada"("condominio_id", "tipo", "activa");
CREATE INDEX "titularidad_condominio_unidad_hasta_idx" ON "titularidad"("condominio_id", "unidad_id", "hasta");
CREATE INDEX "titularidad_condominio_propietario_hasta_idx" ON "titularidad"("condominio_id", "propietario_id", "hasta");

ALTER TABLE "propietario" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "propietario_tenant" ON "propietario"
  USING ("condominio_id" = app_condominio_id())
  WITH CHECK ("condominio_id" = app_condominio_id());

ALTER TABLE "unidad_privada" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unidad_privada_tenant" ON "unidad_privada"
  USING ("condominio_id" = app_condominio_id())
  WITH CHECK ("condominio_id" = app_condominio_id());

ALTER TABLE "titularidad" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "titularidad_tenant" ON "titularidad"
  USING ("condominio_id" = app_condominio_id())
  WITH CHECK ("condominio_id" = app_condominio_id());

GRANT SELECT, INSERT, UPDATE ON "propietario", "unidad_privada", "titularidad" TO zulu_app;
REVOKE DELETE ON "propietario", "unidad_privada", "titularidad" FROM zulu_app;
