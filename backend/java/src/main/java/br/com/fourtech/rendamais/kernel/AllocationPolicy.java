package br.com.fourtech.rendamais.kernel;

/**
 * Como distribuir os centavos que sobram ao dividir um valor (INV-MON-2).
 * Qualquer política garante que a soma das partes é exatamente o total.
 */
public enum AllocationPolicy {
    /** Um centavo por vez a partir da primeira parte. */
    RESIDUAL_FROM_FIRST,
    /** Um centavo por vez a partir da última parte. */
    RESIDUAL_FROM_LAST,
    /** Centavos para as partes com maior fração descartada (desempate pela ordem). */
    LARGEST_REMAINDER;

    /** Premissa B01 (PD-002): resíduo a partir da primeira parcela. */
    public static final AllocationPolicy PREMISSA_VIGENTE = RESIDUAL_FROM_FIRST;
}
