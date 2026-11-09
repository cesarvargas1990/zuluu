-- Membresías activas de un usuario en todos los condominios (para login/MFA y "mis condominios").
-- SECURITY DEFINER: atraviesa RLS de forma acotada; solo devuelve datos del usuario indicado.
CREATE OR REPLACE FUNCTION app_membresias_de_usuario(p_usuario uuid)
RETURNS TABLE (membresia_id uuid, condominio_id uuid, razon_social text, rol "Rol")
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT m.id, m.condominio_id, c.razon_social, m.rol
  FROM membresia m JOIN condominio c ON c.id = m.condominio_id
  WHERE m.usuario_id = p_usuario AND m.activo
$$;

REVOKE ALL ON FUNCTION app_membresias_de_usuario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_membresias_de_usuario(uuid) TO zulu_app;
