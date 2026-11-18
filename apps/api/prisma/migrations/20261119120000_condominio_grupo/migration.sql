-- Multiempresa: un "condominio" (agrupador) reúne varias "copropiedades" (la tabla `condominio`
-- de siempre, que conserva su RLS y todo su aislamiento). Migración aditiva.

-- Tabla global (no pertenece a una copropiedad, por eso sin RLS). Solo guarda nombres.
CREATE TABLE "condominio_grupo" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "condominio_grupo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "condominio_grupo_nombre_key" ON "condominio_grupo"("nombre");

-- Sin grupo = copropiedad aún no agrupada (todo lo existente queda así).
ALTER TABLE "condominio" ADD COLUMN "grupo_id" UUID;
ALTER TABLE "condominio"
  ADD CONSTRAINT "condominio_grupo_id_fkey" FOREIGN KEY ("grupo_id")
  REFERENCES "condominio_grupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "condominio_grupo_id_idx" ON "condominio"("grupo_id");

-- El rol de aplicación crea y edita; nunca borra.
GRANT SELECT, INSERT, UPDATE ON "condominio_grupo" TO zulu_app;

-- Las funciones que devuelven copropiedades ahora informan también su condominio.
DROP FUNCTION IF EXISTS app_membresias_de_usuario(uuid);
CREATE FUNCTION app_membresias_de_usuario(p_usuario uuid)
RETURNS TABLE (membresia_id uuid, condominio_id uuid, razon_social text, rol "Rol", grupo_id uuid, grupo_nombre text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT m.id, m.condominio_id, c.razon_social, m.rol, c.grupo_id, g.nombre::text
  FROM membresia m
  JOIN condominio c ON c.id = m.condominio_id
  LEFT JOIN condominio_grupo g ON g.id = c.grupo_id
  WHERE m.usuario_id = p_usuario AND m.activo
$$;
REVOKE ALL ON FUNCTION app_membresias_de_usuario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_membresias_de_usuario(uuid) TO zulu_app;

DROP FUNCTION IF EXISTS app_condominios();
CREATE FUNCTION app_condominios()
RETURNS TABLE (id uuid, razon_social text, nit text, created_at timestamptz, grupo_id uuid, grupo_nombre text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS
$$
BEGIN
  PERFORM app_exigir_superadmin();
  RETURN QUERY
    SELECT c.id, c.razon_social, c.nit, c.created_at::timestamptz, c.grupo_id, g.nombre::text
    FROM condominio c LEFT JOIN condominio_grupo g ON g.id = c.grupo_id
    ORDER BY c.razon_social;
END
$$;
REVOKE ALL ON FUNCTION app_condominios() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_condominios() TO zulu_app;

-- Conteo de copropiedades por condominio (superadmin): ninguna otra consulta puede verlas todas.
CREATE FUNCTION app_grupos_conteo()
RETURNS TABLE (grupo_id uuid, copropiedades bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS
$$
BEGIN
  PERFORM app_exigir_superadmin();
  RETURN QUERY SELECT c.grupo_id, count(*) FROM condominio c WHERE c.grupo_id IS NOT NULL GROUP BY c.grupo_id;
END
$$;
REVOKE ALL ON FUNCTION app_grupos_conteo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_grupos_conteo() TO zulu_app;
