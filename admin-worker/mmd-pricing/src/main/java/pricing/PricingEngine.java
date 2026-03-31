package pricing;

import client.Client;
import model.Model;

import java.math.BigDecimal;
import java.math.RoundingMode;

public class PricingEngine {

    private static BigDecimal tierMultiplier(Model.Tier t) {
        switch (t) {
            case PREMIUM: return BigDecimal.valueOf(1.25);
            case VIP: return BigDecimal.valueOf(1.6);
            case GWS: return BigDecimal.valueOf(2.0);
            case EMS: return BigDecimal.valueOf(2.5);
            case STANDARD:
            default: return BigDecimal.ONE;
        }
    }

    private static BigDecimal extraPer30MinRate(BigDecimal base90m) {
        return base90m.multiply(BigDecimal.valueOf(0.5));
    }

    public PricingResult calculate(Model model, Client client,
                                   int durationMinutes,
                                   boolean acceptsTravel,
                                   boolean shortNotice,
                                   int relationshipScore
    ) {
        PricingResult r = new PricingResult();

        BigDecimal baseFloor = model.getMinimumRate90m();
        BigDecimal multiplier = tierMultiplier(model.getTier());

        if (client.isBlackCard()) {
            multiplier = multiplier.max(BigDecimal.valueOf(2.0));
        } else {
            if (client.getTierSignal() == Client.TierSignal.VIP) {
                multiplier = multiplier.max(BigDecimal.valueOf(1.6));
            }
        }

        BigDecimal basePrice = baseFloor.multiply(multiplier).setScale(0, RoundingMode.HALF_UP);
        r.setBasePrice(basePrice);

        int overMinutes = Math.max(0, durationMinutes - 90);
        int extraSlots = (overMinutes + 29) / 30;
        BigDecimal per30 = extraPer30MinRate(baseFloor);
        BigDecimal extraCharge = per30.multiply(BigDecimal.valueOf(extraSlots));
        r.setExtraTimeCharge(extraCharge);

        BigDecimal travel = BigDecimal.ZERO;
        if (acceptsTravel) {
            travel = basePrice.multiply(BigDecimal.valueOf(0.15)).setScale(0, RoundingMode.HALF_UP);
        }
        r.setTravelSurcharge(travel);

        BigDecimal shortSurcharge = BigDecimal.ZERO;
        if (shortNotice) {
            shortSurcharge = basePrice.multiply(BigDecimal.valueOf(0.25)).setScale(0, RoundingMode.HALF_UP);
        }
        r.setShortNoticeSurcharge(shortSurcharge);

        BigDecimal relationAdj = BigDecimal.ZERO;
        if (relationshipScore > 0) {
            BigDecimal pct = BigDecimal.valueOf(Math.min(20, relationshipScore) / 100.0);
            relationAdj = basePrice.multiply(pct).negate().setScale(0, RoundingMode.HALF_UP);
        } else if (relationshipScore < 0) {
            BigDecimal pct = BigDecimal.valueOf(Math.min(30, -relationshipScore) / 100.0);
            relationAdj = basePrice.multiply(pct).setScale(0, RoundingMode.HALF_UP);
        }
        r.setRelationshipAdjustment(relationAdj);

        BigDecimal finalPrice = basePrice.add(extraCharge).add(travel).add(shortSurcharge).add(relationAdj);

        if (finalPrice.compareTo(baseFloor) < 0) finalPrice = baseFloor;

        r.setFinalPrice(finalPrice.setScale(0, RoundingMode.HALF_UP));
        return r;
    }
}
