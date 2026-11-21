ALTER TABLE "expediente_digital"
  ADD COLUMN "propietario_id" UUID,
  ADD COLUMN "unidad_id" UUID,
  ADD COLUMN "responsable_id" UUID;

ALTER TABLE "expediente_digital"
  ADD CONSTRAINT "expediente_digital_propietario_fkey"
    FOREIGN KEY ("condominio_id", "propietario_id") REFERENCES "propietario"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "expediente_digital_unidad_fkey"
    FOREIGN KEY ("condominio_id", "unidad_id") REFERENCES "unidad_privada"("condominio_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "expediente_digital_responsable_fkey"
    FOREIGN KEY ("responsable_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "expediente_digital_condominio_propietario_idx" ON "expediente_digital"("condominio_id", "propietario_id");
CREATE INDEX "expediente_digital_condominio_unidad_idx" ON "expediente_digital"("condominio_id", "unidad_id");
CREATE INDEX "expediente_digital_condominio_responsable_idx" ON "expediente_digital"("condominio_id", "responsable_id");
