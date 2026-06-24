import { Link } from 'react-router-dom';
import Footer from '../components/layout/Footer';
import usePageTitle from '../hooks/usePageTitle';
import emblemGold from '../assets/chizuk-emblem-gold.png';

export default function About() {
  usePageTitle('About');
  return (
    <div className="about-page">

      {/* ---- HERO ---- */}
      <header className="about-hero">
        <span className="about-corner-bl" aria-hidden="true" />
        <span className="about-corner-tr" aria-hidden="true" />
        <div className="about-hero-inner">
          <img
            className="about-hero-emblem"
            src={emblemGold}
            alt="Chizuk Amuno emblem"
            draggable="false"
          />
          <p className="about-eyebrow">Tracking the journey to the bimah</p>
          <h1>Welcome to MyMadrich</h1>
          <p className="about-hero-copy">
            A warm, simple window into your child{'\u2019'}s b{'\u2019'}nai mitzvah
            preparation {'\u2014'} what they{'\u2019'}re learning, how it{'\u2019'}s going,
            and what comes next.
          </p>
          <p className="about-hero-sub">
            A program tool of Chizuk Amuno Congregation &amp; Schools
          </p>
        </div>
      </header>

      {/* ---- WHAT IS MYMADRICH ---- */}
      <section className="about-section">
        <div className="about-wrap about-lede">
          <p className="about-kicker">What is MyMadrich?</p>
          <h2>Your family{'\u2019'}s view into the journey</h2>
          <p>
            <em>Madrich</em> means guide. MyMadrich is the tool your child{'\u2019'}s tutor
            and our clergy use to guide them toward the bimah {'\u2014'} and it gives{' '}
            <strong>you</strong> a window into that journey.
          </p>
          <p>
            You don{'\u2019'}t need to do anything to make it work. As your child practices
            their Torah and Haftarah, MyMadrich quietly keeps the picture up to date, so you
            can follow along whenever you{'\u2019'}d like.
          </p>
        </div>
      </section>

      {/* ---- WHAT YOU'LL SEE ---- */}
      <section className="about-section" style={{ paddingTop: 8 }}>
        <div className="about-wrap">
          <div className="about-lede">
            <p className="about-kicker">What you{'\u2019'}ll see</p>
            <h2>Everything in one calm place</h2>
          </div>
          <div className="about-cards">
            <div className="about-card">
              <div className="about-card-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 3 6-7" /><path d="M3 21h18" /></svg>
              </div>
              <h3>The road to the bimah</h3>
              <p>
                A gentle timeline of your child{'\u2019'}s progress {'\u2014'} how much of
                their reading they{'\u2019'}ve learned, and the milestones still ahead.
              </p>
            </div>
            <div className="about-card">
              <div className="about-card-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M19 19v2" /></svg>
              </div>
              <h3>Their readings</h3>
              <p>
                The exact Torah and Haftarah portions assigned for your child{'\u2019'}s date,
                verse by verse, as they work through them.
              </p>
            </div>
            <div className="about-card">
              <div className="about-card-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg>
              </div>
              <h3>Sessions &amp; what{'\u2019'}s next</h3>
              <p>
                A simple note after each tutoring session {'\u2014'} what they practiced, any
                home practice, and when they{'\u2019'}ll meet next.
              </p>
            </div>
            <div className="about-card">
              <div className="about-card-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              </div>
              <h3>Meetings with clergy</h3>
              <p>
                The check-ins and planning meetings along the way {'\u2014'} including the
                family service-planning meeting {'\u2014'} so you know what{'\u2019'}s coming.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- HOW IT WORKS ---- */}
      <section className="about-section about-steps-band">
        <div className="about-wrap">
          <div className="about-lede">
            <p className="about-kicker">Getting started</p>
            <h2>Three steps, no passwords</h2>
          </div>
          <div className="about-steps">
            <div className="about-step">
              <div className="about-step-n">1</div>
              <h3>You{'\u2019'}ll get an invitation</h3>
              <p>An email invites you in, sent by the b{'\u2019'}nai mitzvah coordinator.</p>
            </div>
            <div className="about-step">
              <div className="about-step-n">2</div>
              <h3>Sign in with your email</h3>
              <p>
                We email you a secure sign-in link {'\u2014'} nothing to remember, no password
                to create.
              </p>
            </div>
            <div className="about-step">
              <div className="about-step-n">3</div>
              <h3>Follow along, anytime</h3>
              <p>Open MyMadrich whenever you like to see how your child is doing.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- WHAT TO EXPECT ---- */}
      <section className="about-section">
        <div className="about-wrap">
          <div className="about-expect">
            <div>
              <p className="about-kicker">What to expect</p>
              <h2>A window, not a worry</h2>
              <ul className="about-expect-list">
                <li>
                  <strong>It{'\u2019'}s updated for you.</strong> Your child{'\u2019'}s tutor
                  keeps things current after their sessions {'\u2014'} there{'\u2019'}s nothing
                  you need to fill in.
                </li>
                <li>
                  <strong>Every journey moves at its own pace.</strong> MyMadrich shows steady
                  progress toward the date, not a grade or a ranking.
                </li>
                <li>
                  <strong>If you have more than one child preparing,</strong> you can switch
                  between them in one place.
                </li>
                <li>
                  <strong>Questions are welcome.</strong> The tutor and coordinator are a
                  message away, and you{'\u2019'}ll always know who that is.
                </li>
              </ul>
            </div>
            <div className="about-reassure">
              <h3>Your family{'\u2019'}s privacy</h3>
              <p>
                You see only your own child{'\u2019'}s information {'\u2014'} never another
                family{'\u2019'}s. Access is limited to you, your child{'\u2019'}s tutor, and
                our clergy and coordinator. Nothing is sold or shared, and there are no ads.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className="about-section about-cta">
        <div className="about-wrap">
          <p className="about-kicker">Mazel tov on this milestone</p>
          <h2>We{'\u2019'}re honored to walk it with you</h2>
          <p className="about-cta-copy">
            When your invitation arrives, signing in takes a moment. Until then, any
            questions are always welcome.
          </p>
          <a className="about-btn" href="mailto:hello@mymadrich.com">
            Email us at hello@mymadrich.com
          </a>
          <span className="about-cta-secondary">
            Already invited? <Link to="/login">Sign in to MyMadrich</Link>
          </span>
        </div>
      </section>

      <Footer context="login" />
    </div>
  );
}
