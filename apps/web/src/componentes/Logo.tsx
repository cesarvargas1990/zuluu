/**
 * Logotipo ZULU Servicios Integrales (vector aproximado a partir de la imagen de marca).
 * Reemplazar por el archivo original cuando ZULU lo entregue.
 */
export function Logo({
  className,
  conSubtitulo = true,
}: {
  className?: string;
  conSubtitulo?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 240 92"
      role="img"
      aria-label="ZULU Servicios Integrales S.A.S."
      className={className}
    >
      {/* Techo sobre la última U: verde lima y naranja */}
      <path d="M178 22 L199 8 L206 13 L186 26 Z" fill="var(--color-lima)" />
      <path d="M199 8 L226 22 L218 26 L199 14 Z" fill="var(--color-naranja)" />
      <text
        x="120"
        y="64"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="54"
        letterSpacing="1"
      >
        ZULU
      </text>
      {conSubtitulo && (
        <>
          <text
            x="120"
            y="82"
            textAnchor="middle"
            fill="currentColor"
            fontFamily="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
            fontWeight="600"
            fontSize="11.5"
            letterSpacing="0.6"
          >
            SERVICIOS INTEGRALES S.A.S.
          </text>
          <line x1="34" y1="88" x2="206" y2="88" stroke="currentColor" strokeWidth="1.2" />
        </>
      )}
    </svg>
  );
}
