package pricing;

import java.math.BigDecimal;

public class PricingResult {
    private BigDecimal basePrice;
    private BigDecimal extraTimeCharge;
    private BigDecimal travelSurcharge;
    private BigDecimal shortNoticeSurcharge;
    private BigDecimal relationshipAdjustment; // negative for discount, positive for markup
    private BigDecimal finalPrice;

    public PricingResult() {}

    public BigDecimal getBasePrice() { return basePrice; }
    public void setBasePrice(BigDecimal basePrice) { this.basePrice = basePrice; }
    public BigDecimal getExtraTimeCharge() { return extraTimeCharge; }
    public void setExtraTimeCharge(BigDecimal extraTimeCharge) { this.extraTimeCharge = extraTimeCharge; }
    public BigDecimal getTravelSurcharge() { return travelSurcharge; }
    public void setTravelSurcharge(BigDecimal travelSurcharge) { this.travelSurcharge = travelSurcharge; }
    public BigDecimal getShortNoticeSurcharge() { return shortNoticeSurcharge; }
    public void setShortNoticeSurcharge(BigDecimal shortNoticeSurcharge) { this.shortNoticeSurcharge = shortNoticeSurcharge; }
    public BigDecimal getRelationshipAdjustment() { return relationshipAdjustment; }
    public void setRelationshipAdjustment(BigDecimal relationshipAdjustment) { this.relationshipAdjustment = relationshipAdjustment; }
    public BigDecimal getFinalPrice() { return finalPrice; }
    public void setFinalPrice(BigDecimal finalPrice) { this.finalPrice = finalPrice; }

    @Override
    public String toString() {
        return "PricingResult{" +
                "basePrice=" + basePrice +
                ", extraTimeCharge=" + extraTimeCharge +
                ", travelSurcharge=" + travelSurcharge +
                ", shortNoticeSurcharge=" + shortNoticeSurcharge +
                ", relationshipAdjustment=" + relationshipAdjustment +
                ", finalPrice=" + finalPrice +
                '}';
    }
}
