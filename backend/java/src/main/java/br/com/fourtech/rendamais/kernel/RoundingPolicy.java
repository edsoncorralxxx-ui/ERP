package br.com.fourtech.rendamais.kernel;

import java.math.RoundingMode;

/**
 * Política explícita de arredondamento para centavos (INV-MON-3).
 * A premissa vigente é {@link #PREMISSA_VIGENTE}; a regra final depende da pendência PD-002.
 */
public enum RoundingPolicy {
    HALF_EVEN(RoundingMode.HALF_EVEN),
    HALF_UP(RoundingMode.HALF_UP),
    DOWN(RoundingMode.DOWN);

    /** Premissa B01 (PD-002): arredondamento meio-par. */
    public static final RoundingPolicy PREMISSA_VIGENTE = HALF_EVEN;

    private final RoundingMode mode;

    RoundingPolicy(RoundingMode mode) {
        this.mode = mode;
    }

    public RoundingMode mode() {
        return mode;
    }
}
