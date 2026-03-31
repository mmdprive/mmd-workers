package client;

import java.math.BigDecimal;

public class Client {
    public enum TierSignal { STANDARD, PREMIUM, VIP, GWS }
    private String id;
    private TierSignal tierSignal;
    private boolean blackCard;
    private BigDecimal budgetMax; // optional

    public Client(String id, TierSignal tierSignal, boolean blackCard, BigDecimal budgetMax) {
        this.id = id;
        this.tierSignal = tierSignal;
        this.blackCard = blackCard;
        this.budgetMax = budgetMax;
    }

    public String getId() { return id; }
    public TierSignal getTierSignal() { return tierSignal; }
    public boolean isBlackCard() { return blackCard; }
    public BigDecimal getBudgetMax() { return budgetMax; }
}