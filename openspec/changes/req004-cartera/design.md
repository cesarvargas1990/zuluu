# Diseño REQ-004

Las obligaciones y movimientos componen un libro aditivo; los saldos se calculan desde el valor de la obligación y los movimientos, sin editar ni borrar cargos contabilizados. Los recaudos solo generan movimiento al verificar y si su imputación coincide con una obligación vigente por unidad, concepto y periodo. Los excedentes quedan como saldo a favor del recaudo.

Todas las operaciones se ejecutan en `withTenant`, bajo RLS. Los ajustes se solicitan con motivo y se resuelven por otro usuario; la aprobación crea un movimiento inmutable. Las gestiones y compromisos no reducen saldos.
