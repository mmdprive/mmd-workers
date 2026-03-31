const pillars = [
  {
    title: "Curated Access",
    body: "A private gateway to premium male wellness experiences, hand-selected profiles, and discreet service standards.",
  },
  {
    title: "Concierge Journey",
    body: "From inquiry to confirmation, each step is guided with personal support, fast clarity, and polished communication.",
  },
  {
    title: "Trusted Privacy",
    body: "MMDPrive is designed around confidentiality, verified expectations, and a refined member experience from start to finish.",
  },
];

const highlights = [
  "Private member-style experience with elevated screening",
  "Premium model and therapist selection with distinct profiles",
  "Smooth booking, payment, and confirmation flow",
  "Designed for discretion, confidence, and repeat comfort",
];

const journey = [
  {
    step: "01",
    title: "Discover The Fit",
    body: "Browse the MMDPrive world, explore featured profiles, and understand the tone of service before making your move.",
  },
  {
    step: "02",
    title: "Connect With Concierge",
    body: "Share your interest, preferred style, and timing so the team can guide you toward the right experience.",
  },
  {
    step: "03",
    title: "Confirm With Confidence",
    body: "Receive clear pricing, booking details, and a discreet confirmation path that respects your time and privacy.",
  },
];

export default function HomePage() {
  return (
    <main className="landing-shell">
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">MMDPrive</p>
          <h1>Private access to a more refined MMD experience.</h1>
          <p className="hero-text">
            A premium website structure for presenting the MMDPrive brand,
            membership feel, and concierge booking journey with clarity,
            privacy, and strong visual presence.
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="#journey">
              Explore The Journey
            </a>
            <a className="secondary-link" href="/admin">
              Open Admin Console
            </a>
          </div>
        </div>

        <div className="hero-card">
          <span className="card-label">Brand Focus</span>
          <h2>Luxury, discretion, and confident conversion.</h2>
          <p>
            This page is structured to hold the landing-page messaging system:
            strong promise up top, trust-building sections in the middle, and a
            direct call to action at the end.
          </p>
          <ul className="hero-list">
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-grid">
        {pillars.map((pillar) => (
          <article className="info-card" key={pillar.title}>
            <p className="card-kicker">{pillar.title}</p>
            <p>{pillar.body}</p>
          </article>
        ))}
      </section>

      <section className="story-section">
        <div>
          <p className="section-label">Positioning</p>
          <h2>Built to feel like a private invitation, not a public directory.</h2>
        </div>
        <p className="section-text">
          The homepage should immediately communicate that MMDPrive is not just
          a list of services. It is a curated, members-first environment for
          people who value atmosphere, quality control, and discreet support.
          This structure gives you a clean base for the final copy from the PDF
          to be dropped in section by section.
        </p>
      </section>

      <section className="journey-section" id="journey">
        <div className="journey-heading">
          <p className="section-label">How It Works</p>
          <h2>A simple journey that turns curiosity into a premium booking flow.</h2>
        </div>
        <div className="journey-grid">
          {journey.map((item) => (
            <article className="journey-card" key={item.step}>
              <span className="journey-step">{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="value-section">
        <div className="value-panel">
          <p className="section-label">Why This Structure Works</p>
          <h2>It gives MMDPrive a homepage that can sell with calm authority.</h2>
          <p>
            The layout balances aspiration and trust. It creates space for a
            hero promise, credibility cues, service explanation, and final
            conversion without feeling crowded or overly aggressive.
          </p>
        </div>
        <div className="quote-panel">
          <p className="quote-mark">"</p>
          <p className="quote-text">
            Use this as the foundation, then replace each section with the exact
            approved copy blocks from the PDF when you want a tighter 1:1 brand
            match.
          </p>
        </div>
      </section>

      <section className="cta-section">
        <p className="section-label">Next Step</p>
        <h2>Ready to shape this into the full MMDPrive homepage.</h2>
        <p>
          The visual skeleton is now in place for brand copy, offers, profile
          previews, membership tiers, testimonials, or booking CTAs.
        </p>
        <a className="primary-link" href="/admin">
          Continue In Admin
        </a>
      </section>
    </main>
  );
}
