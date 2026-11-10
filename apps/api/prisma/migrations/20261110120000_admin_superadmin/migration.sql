-- Consola de superadmin: lectura acotada entre condominios.
-- Las funciones atraviesan RLS (SECURITY DEFINER) y por eso exigen que la transacción
-- se haya marcado como superadmin (app.superadmin = 'true'), lo que solo hace
-- PrismaService.comoSuperadmin() tras validar la bandera del usuario.

CREATE OR REPLACE FUNCTION app_exigir_superadmin() RETURNS void
LANGUAGE plpgsql STABLE AS
$$
BEGIN
  IF coalesce(current_setting('app.superadmin', true), '') <> 'true' THEN
    RAISE EXCEPTION 'Operación reservada al superadministrador' USING ERRCODE = '42501';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app_condominios()
RETURNS TABLE (id uuid, razon_social text, nit text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS
$$
BEGIN
  PERFORM app_exigir_superadmin();
  RETURN QUERY SELECT c.id, c.razon_social, c.nit, c.created_at::timestamptz FROM condominio c ORDER BY c.razon_social;
END
$$;

CREATE OR REPLACE FUNCTION app_membresias_todas()
RETURNS TABLE (membresia_id uuid, usuario_id uuid, condominio_id uuid, razon_social text, rol "Rol", activo boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS
$$
BEGIN
  PERFORM app_exigir_superadmin();
  RETURN QUERY
    SELECT m.id, m.usuario_id, m.condominio_id, c.razon_social, m.rol, m.activo
    FROM membresia m JOIN condominio c ON c.id = m.condominio_id
    ORDER BY c.razon_social, m.created_at;
END
$$;

REVOKE ALL ON FUNCTION app_condominios() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_membresias_todas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_exigir_superadmin() TO zulu_app;
GRANT EXECUTE ON FUNCTION app_condominios() TO zulu_app;
GRANT EXECUTE ON FUNCTION app_membresias_todas() TO zulu_app;
