import { Link } from 'react-router-dom';
import Footer from '../components/layout/Footer';
import usePageTitle from '../hooks/usePageTitle';

export default function TermsOfUse() {
  usePageTitle('Terms of Use');
  return (
    <div className="legal-page">
      <main className="legal-content">
        <h1>Terms of Use</h1>
        <p className="legal-updated"><em>Last updated: June 24, 2026</em></p>

        <p>
          Welcome to MyMadrich, a private tool used by <strong>Chizuk Amuno Congregation
          &amp; Schools</strong> to coordinate b'nai mitzvah tutoring, built and maintained
          by <strong>Brook Creative LLC</strong>. By signing in and using the app, you agree
          to these terms.
        </p>

        <h2>Who may use MyMadrich</h2>
        <p>
          MyMadrich is for <strong>authorized members of the Chizuk Amuno b'nai mitzvah
          program</strong> — the coordinator and clergy, tutors, and the students and families
          enrolled in the program. Access is granted by the congregation and tied to your role.
        </p>

        <h2>Your account and access</h2>
        <p>
          You sign in with an email address provided to the congregation, using Google sign-in
          or an email "magic link." Keep your access to that email secure. Your access reflects
          your role (coordinator, tutor, or family). Don't attempt to reach information outside
          the role you've been given. Don't share your sign-in access with others or let others
          use your account.
        </p>

        <h2>Using the app responsibly</h2>
        <p>
          Information in MyMadrich — especially about <strong>students, who are often
          minors</strong> — is <strong>confidential</strong>. Use it only to support that
          student's b'nai mitzvah preparation, and don't copy, share, or distribute it outside
          that purpose. Don't attempt to disrupt, probe, or gain unauthorized access to the
          app or its data. Tutors and staff should keep notes professional and appropriate,
          recognizing families may see much of what's recorded.
        </p>

        <h2>About the readings and progress information</h2>
        <p>
          MyMadrich computes Torah and Haftarah readings from the Hebcal calendar (using the
          triennial cycle by default), and a coordinator may adjust a student's readings for a
          specific situation. The app is a <strong>planning and coordination tool</strong> and
          supports — but does not replace — the guidance of the congregation's clergy and
          tutors.
        </p>

        <h2>Privacy</h2>
        <p>
          Your use of MyMadrich is also covered by our{' '}
          <Link to="/privacy"><strong>Privacy Policy</strong></Link>, which explains what
          information the app holds and who can see it.
        </p>

        <h2>Ownership</h2>
        <p>
          The MyMadrich application, its design, and its software are owned by <strong>Brook
          Creative LLC</strong>. Congregation and family content (student records, notes, etc.)
          belongs to the congregation and the families, and is handled as described in the
          Privacy Policy.
        </p>

        <h2>Availability and disclaimers</h2>
        <p>
          MyMadrich is provided "as is," and we work to keep it accurate and available but
          can't guarantee it will always be error-free or uninterrupted. To the extent
          permitted by law, Brook Creative LLC and the congregation are not liable for indirect
          or incidental damages arising from use of the app.
        </p>

        <h2>Ending access</h2>
        <p>
          Access ends when you are no longer part of the b'nai mitzvah program, or if these
          terms are misused. The congregation may adjust or remove access at its discretion.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          We may update these terms; we'll change the date above and post the new version
          here. Material changes will be communicated through the congregation.
        </p>

        <h2>Governing law</h2>
        <p>
          These terms are governed by the laws of the <strong>State of Maryland</strong>,
          without regard to conflict-of-laws principles.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms can go to the b'nai mitzvah coordinator, or
          to <a href="mailto:hello@mymadrich.com"><strong>hello@mymadrich.com</strong></a>.
        </p>

        <hr className="legal-rule" />
        <p className="legal-colophon">
          MyMadrich · A program tool of Chizuk Amuno Congregation &amp; Schools · Built by
          Brook Creative LLC
        </p>

        <p className="legal-back">
          <Link to="/login">Back to sign in</Link>
        </p>
      </main>
      <Footer context="login" />
    </div>
  );
}
