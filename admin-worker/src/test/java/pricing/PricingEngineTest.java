package pricing;

import client.Client;
import model.Model;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

public class PricingEngineTest {

    private static final BigDecimal ZERO = BigDecimal.ZERO;

    private Model model(String id, String name, Model.Tier tier, double min90m) {
        return new Model(id, name, tier, BigDecimal.valueOf(min90m), false);
    }

    private Client client(String id, Client.TierSignal signal, boolean blackCard, Double budget) {
        return new Client(id, signal, blackCard, budget == null ? null : BigDecimal.valueOf(budget));
    }

    private void assertBDEquals(BigDecimal expected, BigDecimal actual) {
        assertNotNull(actual, "actual should not be null");
        assertEquals(0, expected.compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }

    @Test
    public void testBasePriceStandard90m() {
        Model m = model("m1", "A", Model.Tier.STANDARD, 1000);
        Client c = client("c1", Client.TierSignal.STANDARD, false, null);

        PricingEngine engine = new PricingEngine();
        PricingResult r = engine.calculate(m, c, 90, false, false, 0);

        // base price = floor * 1
        assertBDEquals(BigDecimal.valueOf(1000), r.getBasePrice());
        assertBDEquals(ZERO, r.getExtraTimeCharge());
        assertBDEquals(ZERO, r.getTravelSurcharge());
        assertBDEquals(ZERO, r.getShortNoticeSurcharge());
        assertBDEquals(ZERO, r.getRelationshipAdjustment());
        assertBDEquals(BigDecimal.valueOf(1000), r.getFinalPrice());
    }

    @Test
    public void testExtraTimeCharge() {
        Model m = model("m2", "B", Model.Tier.STANDARD, 1000);
        Client c = client("c2", Client.TierSignal.STANDARD, false, null);

        PricingEngine engine = new PricingEngine();
        // duration 150 -> 60m over -> 2 slots of 30m -> per30 = baseFloor*0.5 = 500 -> extra = 500*2 = 1000
        PricingResult r = engine.calculate(m, c, 150, false, false, 0);

        assertBDEquals(BigDecimal.valueOf(1000), r.getBasePrice());
        assertBDEquals(BigDecimal.valueOf(1000), r.getExtraTimeCharge());
        assertBDEquals(BigDecimal.valueOf(2000), r.getFinalPrice());
    }

    @Test
    public void testBlackCardMultiplier() {
        // Premium model but black card client forces multiplier at least 2.0
        Model m = model("m3", "C", Model.Tier.PREMIUM, 1000);
        Client c = client("c3", Client.TierSignal.STANDARD, true, null);

        PricingEngine engine = new PricingEngine();
        PricingResult r = engine.calculate(m, c, 90, false, false, 0);

        // basePrice = 1000 * 2.0 = 2000
        assertBDEquals(BigDecimal.valueOf(2000), r.getBasePrice());
        assertBDEquals(BigDecimal.valueOf(2000), r.getFinalPrice());
    }

    @Test
    public void testShortNoticeAndTravel() {
        Model m = model("m4", "D", Model.Tier.STANDARD, 1000);
        Client c = client("c4", Client.TierSignal.STANDARD, false, null);

        PricingEngine engine = new PricingEngine();
        PricingResult r = engine.calculate(m, c, 90, true, true, 0);

        // travel = 15% of basePrice = 150, short = 25% = 250
        assertBDEquals(BigDecimal.valueOf(1000), r.getBasePrice());
        assertBDEquals(BigDecimal.valueOf(150), r.getTravelSurcharge());
        assertBDEquals(BigDecimal.valueOf(250), r.getShortNoticeSurcharge());
        // final = 1000 + 150 + 250 = 1400
        assertBDEquals(BigDecimal.valueOf(1400), r.getFinalPrice());
    }

    @Test
    public void testRelationshipDiscountPositive() {
        Model m = model("m5", "E", Model.Tier.STANDARD, 1000);
        Client c = client("c5", Client.TierSignal.STANDARD, false, null);

        PricingEngine engine = new PricingEngine();
        // relationshipScore 30 => discount capped at 20% of basePrice (1000 * 0.2 = 200)
        PricingResult r = engine.calculate(m, c, 90, false, false, 30);

        assertBDEquals(BigDecimal.valueOf(1000), r.getBasePrice());
        assertBDEquals(BigDecimal.valueOf(-200), r.getRelationshipAdjustment());
        assertBDEquals(BigDecimal.valueOf(800), r.getFinalPrice());
    }

    @Test
    public void testRelationshipMarkupNegative() {
        Model m = model("m6", "F", Model.Tier.STANDARD, 1000);
        Client c = client("c6", Client.TierSignal.STANDARD, false, null);

        PricingEngine engine = new PricingEngine();
        // relationshipScore -50 => markup 30% (capped at 30) => 1000 * 0.3 = 300
        PricingResult r = engine.calculate(m, c, 90, false, false, -50);

        assertBDEquals(BigDecimal.valueOf(1000), r.getBasePrice());
        assertBDEquals(BigDecimal.valueOf(300), r.getRelationshipAdjustment());
        assertBDEquals(BigDecimal.valueOf(1300), r.getFinalPrice());
    }

    @Test
    public void testVipClientSignal() {
        // Standard model but client has VIP signal -> multiplier at least 1.6
        Model m = model("m7", "G", Model.Tier.STANDARD, 1000);
        Client c = client("c7", Client.TierSignal.VIP, false, null);

        PricingEngine engine = new PricingEngine();
        PricingResult r = engine.calculate(m, c, 90, false, false, 0);

        assertBDEquals(BigDecimal.valueOf(1600), r.getBasePrice());
        assertBDEquals(BigDecimal.valueOf(1600), r.getFinalPrice());
    }

    @Test
    public void testBudgetMaxCheck() {
        Model m = model("m8", "H", Model.Tier.STANDARD, 1000);
        // budget max 1200 but final estimated price will be > 1200 due to surcharges
        Client c = client("c8", Client.TierSignal.STANDARD, false, 1200.0);

        PricingEngine engine = new PricingEngine();
        PricingResult r = engine.calculate(m, c, 90, true, true, 0);

        assertBDEquals(BigDecimal.valueOf(1000), r.getBasePrice());
        // final should be > budget (1000 + travel 150 + short 250 = 1400)
        assertTrue(r.getFinalPrice().compareTo(BigDecimal.valueOf(1200)) > 0);
    }
}