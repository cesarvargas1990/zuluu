CREATE TYPE "EstadoImportacionPropietarios" AS ENUM ('PENDIENTE_REVISION', 'APROBADA', 'RECHAZADA');

CREATE TABLE "importacion_propietarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "condominio_id" UUID NOT NULL,
    "archivo" VARCHAR(180) NOT NULL,
    "filas" JSONB NOT NULL,
    "resumen" JSONB NOT NULL,
    "estado" "EstadoImportacionPropietarios" NOT NULL DEFAULT 'PENDIENTE_REVISION',
    "creada_por" UUID NOT NULL,
    "aprobada_por" UUID,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisada_en" TIMESTAMPTZ(3),
    CONSTRAINT "importacion_propietarios_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "importacion_propietarios_condominio_id_fkey" FOREIGN KEY ("condominio_id")
      REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "importacion_propietarios_condominio_id_estado_creada_en_idx"
  ON "importacion_propietarios"("condominio_id", "estado", "creada_en");

ALTER TABLE "importacion_propietarios" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "importacion_propietarios_tenant" ON "importacion_propietarios"
  USING ("condominio_id" = app_condominio_id())
  WITH CHECK ("condominio_id" = app_condominio_id());
GRANT SELECT, INSERT, UPDATE ON "importacion_propietarios" TO zulu_app;
