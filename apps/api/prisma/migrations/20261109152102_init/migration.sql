-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('SUPERADMIN_ZULU', 'ADMINISTRADORA', 'ASISTENTE', 'CONTADORA', 'ASESOR_JURIDICO', 'OPERACIONES', 'CONSEJO');

-- CreateTable
CREATE TABLE "condominio" (
    "id" UUID NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "condominio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "password_hash" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresia" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membresia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" BIGSERIAL NOT NULL,
    "condominio_id" UUID,
    "actor_id" UUID,
    "accion" TEXT NOT NULL,
    "objeto_tipo" TEXT NOT NULL,
    "objeto_id" TEXT,
    "antes" JSONB,
    "despues" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "condominio_nit_key" ON "condominio"("nit");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "membresia_condominio_id_idx" ON "membresia"("condominio_id");

-- CreateIndex
CREATE UNIQUE INDEX "membresia_condominio_id_usuario_id_rol_key" ON "membresia"("condominio_id", "usuario_id", "rol");

-- CreateIndex
CREATE INDEX "auditoria_condominio_id_created_at_idx" ON "auditoria"("condominio_id", "created_at");

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_condominio_id_fkey" FOREIGN KEY ("condominio_id") REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_condominio_id_fkey" FOREIGN KEY ("condominio_id") REFERENCES "condominio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Aislamiento multi-tenant (RLS) y bitácora inalterable
-- El rol de aplicación (zulu_app) NO es owner ni tiene BYPASSRLS.
-- Su contraseña/LOGIN se configura por ambiente, nunca en migraciones.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zulu_app') THEN
    CREATE ROLE zulu_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO zulu_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "condominio", "usuario", "membresia" TO zulu_app;
GRANT SELECT, INSERT ON "auditoria" TO zulu_app;           -- append-only
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO zulu_app;

-- Condominio actual de la transacción ('' o NULL => ninguno visible)
CREATE OR REPLACE FUNCTION app_condominio_id() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.condominio_id', true), '')::uuid $$;

ALTER TABLE "condominio" ENABLE ROW LEVEL SECURITY;
CREATE POLICY condominio_tenant ON "condominio"
  USING ("id" = app_condominio_id());

ALTER TABLE "membresia" ENABLE ROW LEVEL SECURITY;
CREATE POLICY membresia_tenant ON "membresia"
  USING ("condominio_id" = app_condominio_id())
  WITH CHECK ("condominio_id" = app_condominio_id());

ALTER TABLE "auditoria" ENABLE ROW LEVEL SECURITY;
CREATE POLICY auditoria_select ON "auditoria" FOR SELECT
  USING ("condominio_id" = app_condominio_id());
CREATE POLICY auditoria_insert ON "auditoria" FOR INSERT
  WITH CHECK ("condominio_id" IS NULL OR "condominio_id" = app_condominio_id());
