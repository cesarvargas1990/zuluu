-- Los saldos iniciales pueden corresponder a periodos vencidos antes de la fecha de corte.
ALTER TABLE "obligacion" DROP CONSTRAINT "obligacion_fechas_check";
ALTER TABLE "obligacion" ADD CONSTRAINT "obligacion_fechas_check"
  CHECK ("fecha_vencimiento" >= "fecha_emision" OR "origen" = 'IMPORTACION');
