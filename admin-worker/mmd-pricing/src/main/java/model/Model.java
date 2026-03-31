package model;

import java.math.BigDecimal;

public class Model {
    public enum Tier { STANDARD, PREMIUM, VIP, GWS, EMS }

    private String id;
    private String workingName;
    private Tier tier;
    private BigDecimal minimumRate90m; // in THB
    private boolean requiresPerApproval;

    public Model(String id, String workingName, Tier tier, BigDecimal minimumRate90m, boolean requiresPerApproval) {
        this.id = id;
        this.workingName = workingName;
        this.tier = tier;
        this.minimumRate90m = minimumRate90m;
        this.requiresPerApproval = requiresPerApproval;
    }

    public String getId() { return id; }
    public String getWorkingName() { return workingName; }
    public Tier getTier() { return tier; }
    public BigDecimal getMinimumRate90m() { return minimumRate90m; }
    public boolean isRequiresPerApproval() { return requiresPerApproval; }
}
