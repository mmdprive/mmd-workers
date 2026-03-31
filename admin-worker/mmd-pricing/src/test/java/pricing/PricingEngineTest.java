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
        PricingResult r = engine.calculate(m, c, 150, false, false, 0);

        assertBDEquals(BigDecimal.valueOf(1000), r.getBasePrice());
        assertBDEquals(BigDecimal.valueOf(1000), r.getExtraTimeCharge());
        assertBDEquals(BigDecimal.valueOf(2000), r.getFinalPrice());
    }

    @Test
    public void testBlackCardMultiplier() {
        Model m = model("m3", "C", Model.Tier.PREMIUM, 1000);
        Client c = client("c3", Client.TierSignal.STANDARD, true, null);

        PricingEngine engine = new PricingEngine();
        PricingResult r = engine.calculate(m, c, 90, false, false, 0);

        assertBDEquals(BigDecimal.valueOf(2000), r.getBasePrice());
        assertBDEquals(BigDecimal.valueOf(2000), r.getFinalPrice());
    }

    @Test
    public void testShortNoticeAndTravel() {
        Model m = model("m4", "D", Model.Tier.STANDARD, 1000);
        Client c = client("c4", Client.TierSignal.STANDARD, false, null);

        PricingEngine engine = new PricingEngine();
        PricingResult r = engine.calculate(m, c, 90, true, true, 0);

        assertBDEquals(BigDecimal.valueOf(1000), r.getBasePrice());
        assertBDEquals(BigDecimal.valueOf(150), r.getTravelSurcharge());
        assertBDEquals(BigDecimal.valueOf(250), r.getShortNoticeSurcharge());
        assertBDEquals(BigDecimal.valueOf(1400), r.getFinalPrice());
    }

    @Test
    public void testRelationshipDiscountPositive() {
        Model m = model("m5", "E", Model.Tier.STANDARD, 1000);
        Client c = client("c5", Client.TierSignal.STANDARD, false, null);

        PricingEngine engine = new PricingEngine();
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
        PricingResult r = engine.calculate(m, c, 90, false, false, -50);

        assertBDEquals(BigDecimal.valueOf(1000), r.getBasePrice());
        assertBDEquals(BigDecimal.valueOf(300), r.getRelationshipAdjustment());
        assertBDEquals(BigDecimal.valueOf(1300), r.getFinalPrice());
    }

    @Test
    public void testVipClientSignal() {
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
        Client c = client("c8", Client.TierSignal.STANDARD, false, 1200.0);

        PricingEngine engine = new PricingEngine();
        PricingResult r = engine.calculate(m, c, 90, true, true, 0);

        assertBDEquals(BigDecimal.valueOf(1000), r.getBasePrice());
        assertTrue(r.getFinalPrice().compareTo(BigDecimal.valueOf(1200)) > 0);
    }
}
