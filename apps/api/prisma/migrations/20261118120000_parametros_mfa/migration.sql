-- Parámetros generales: control de la verificación en dos pasos (2FA). Migración aditiva.
CREATE TYPE "PoliticaMfaUsuario" AS ENUM ('HEREDAR', 'OBLIGATORIO', 'NO_REQUERIDO');

-- Ajuste individual. HEREDAR = sin ajuste (rige la regla por rol de siempre).
ALTER TABLE "usuario" ADD COLUMN "mfa_politica" "PoliticaMfaUsuario" NOT NULL DEFAULT 'HEREDAR';

-- Tabla global (no pertenece a un condominio, por eso sin RLS). Una fila por parámetro.
CREATE TABLE "parametro_sistema" (
    "clave" VARCHAR(80) NOT NULL,
    "valor" JSONB NOT NULL,
    "actualizado_por" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parametro_sistema_pkey" PRIMARY KEY ("clave")
);

-- De fábrica el control global está ENCENDIDO: el comportamiento actual no cambia.
INSERT INTO "parametro_sistema" ("clave", "valor") VALUES ('mfa_global', 'true'::jsonb);

-- El rol de aplicación lee y actualiza; no crea ni borra parámetros.
GRANT SELECT, UPDATE ON "parametro_sistema" TO zulu_app;
