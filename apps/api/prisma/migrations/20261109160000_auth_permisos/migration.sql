-- CreateEnum
CREATE TYPE "Accion" AS ENUM ('leer', 'crear', 'editar', 'aprobar', 'exportar', 'eliminar');

-- CreateEnum
CREATE TYPE "EfectoPermiso" AS ENUM ('CONCEDER', 'RESTRINGIR');

-- AlterEnum
BEGIN;
CREATE TYPE "Rol_new" AS ENUM ('ADMINISTRADORA', 'ASISTENTE', 'CONTADORA', 'ASESOR_JURIDICO', 'OPERACIONES', 'CONSEJO');
ALTER TABLE "membresia" ALTER COLUMN "rol" TYPE "Rol_new" USING ("rol"::text::"Rol_new");
ALTER TYPE "Rol" RENAME TO "Rol_old";
ALTER TYPE "Rol_new" RENAME TO "Rol";
DROP TYPE "public"."Rol_old";
COMMIT;

-- AlterTable
ALTER TABLE "usuario" DROP COLUMN "mfa_enabled",
ADD COLUMN     "bloqueado_hasta" TIMESTAMPTZ(3),
ADD COLUMN     "es_superadmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mfa_activado_en" TIMESTAMPTZ(3),
ADD COLUMN     "mfa_secreto_cifrado" TEXT;

-- CreateTable
CREATE TABLE "codigo_respaldo" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "hash" TEXT NOT NULL,
    "usado_en" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigo_respaldo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "familia_id" UUID NOT NULL,
    "refresh_hash" TEXT NOT NULL,
    "mfa_verificado" BOOLEAN NOT NULL DEFAULT false,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "revocada_en" TIMESTAMPTZ(3),
    "reemplazada_por" UUID,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_recuperacion" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "hash" TEXT NOT NULL,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "usado_en" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_recuperacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permiso" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "membresia_id" UUID NOT NULL,
    "area" VARCHAR(2) NOT NULL,
    "accion" "Accion" NOT NULL,
    "expediente_id" UUID,
    "efecto" "EfectoPermiso" NOT NULL,
    "creado_por" UUID NOT NULL,
    "revocado_en" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acceso_excepcional" (
    "id" UUID NOT NULL,
    "condominio_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "justificacion" TEXT NOT NULL,
    "vence_en" TIMESTAMPTZ(3) NOT NULL,
    "revocado_en" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceso_excepcional_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "codigo_respaldo_usuario_id_idx" ON "codigo_respaldo"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_refresh_hash_key" ON "sesion"("refresh_hash");

-- CreateIndex
CREATE INDEX "sesion_usuario_id_idx" ON "sesion"("usuario_id");

-- CreateIndex
CREATE INDEX "sesion_familia_id_idx" ON "sesion"("familia_id");

-- CreateIndex
CREATE UNIQUE INDEX "token_recuperacion_hash_key" ON "token_recuperacion"("hash");

-- CreateIndex
CREATE INDEX "token_recuperacion_usuario_id_idx" ON "token_recuperacion"("usuario_id");

-- CreateIndex
CREATE INDEX "permiso_condominio_id_membresia_id_idx" ON "permiso"("condominio_id", "membresia_id");

-- CreateIndex
CREATE INDEX "acceso_excepcional_condominio_id_usuario_id_idx" ON "acceso_excepcional"("condominio_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "codigo_respaldo" ADD CONSTRAINT "codigo_respaldo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_recuperacion" ADD CONSTRAINT "token_recuperacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permiso" ADD CONSTRAINT "permiso_condominio_id_fkey" FOREIGN KEY ("condominio_id") REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permiso" ADD CONSTRAINT "permiso_membresia_id_fkey" FOREIGN KEY ("membresia_id") REFERENCES "membresia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceso_excepcional" ADD CONSTRAINT "acceso_excepcional_condominio_id_fkey" FOREIGN KEY ("condominio_id") REFERENCES "condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceso_excepcional" ADD CONSTRAINT "acceso_excepcional_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================
-- Grants del rol de aplicación: sin DELETE (se revoca/desactiva con marcas de tiempo)
-- ============================================================
REVOKE DELETE ON "condominio", "usuario", "membresia" FROM zulu_app;
GRANT SELECT, INSERT, UPDATE ON "codigo_respaldo", "sesion", "token_recuperacion", "permiso", "acceso_excepcional" TO zulu_app;

-- RLS en tablas con condominio_id
ALTER TABLE "permiso" ENABLE ROW LEVEL SECURITY;
CREATE POLICY permiso_tenant ON "permiso"
  USING ("condominio_id" = app_condominio_id())
  WITH CHECK ("condominio_id" = app_condominio_id());

ALTER TABLE "acceso_excepcional" ENABLE ROW LEVEL SECURITY;
CREATE POLICY acceso_excepcional_tenant ON "acceso_excepcional"
  USING ("condominio_id" = app_condominio_id())
  WITH CHECK ("condominio_id" = app_condominio_id());
