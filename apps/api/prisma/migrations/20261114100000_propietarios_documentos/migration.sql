CREATE TABLE "documento_propietario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "condominio_id" UUID NOT NULL,
    "propietario_id" UUID NOT NULL,
    "nombre" VARCHAR(180) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "tamano" INTEGER NOT NULL,
    "contenido" BYTEA NOT NULL,
    "creado_por" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documento_propietario_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documento_propietario_condominio_id_propietario_id_fkey"
      FOREIGN KEY ("condominio_id", "propietario_id") REFERENCES "propietario"("condominio_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "documento_propietario_condominio_id_propietario_id_created_at_idx"
  ON "documento_propietario"("condominio_id", "propietario_id", "created_at");

ALTER TABLE "documento_propietario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documento_propietario" FORCE ROW LEVEL SECURITY;
CREATE POLICY "documento_propietario_tenant_policy" ON "documento_propietario"
  USING ("condominio_id" = app_condominio_id())
  WITH CHECK ("condominio_id" = app_condominio_id());
GRANT SELECT, INSERT ON "documento_propietario" TO zulu_app;
