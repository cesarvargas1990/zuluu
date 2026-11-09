import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO = 'zulu:publico';
export const PERMITIR_SIN_MFA = 'zulu:permitir-sin-mfa';

/** Ruta sin autenticación (login, refresh, recuperación, health). */
export const Publico = () => SetMetadata(ES_PUBLICO, true);

/** Ruta accesible con sesión pendiente de MFA (registrar/verificar MFA, logout, yo). */
export const PermitirSinMfa = () => SetMetadata(PERMITIR_SIN_MFA, true);
