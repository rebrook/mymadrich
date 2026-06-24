import { Link } from 'react-router-dom';
import Footer from '../components/layout/Footer';
import usePageTitle from '../hooks/usePageTitle';

export default function PrivacyPolicy() {
  usePageTitle('Privacy Policy');
  return (
    <div className="legal-page">
      <main className="legal-content">
        <h1>Privacy Policy</h1>
        <p className="legal-updated"><em>Last updated: June 24, 2026</em></p>

        <p>
          MyMadrich ("the app," "we," "us") is a private tool used by <strong>Chizuk Amuno
          Congregation &amp; Schools</strong> to coordinate and track b'nai mitzvah tutoring.
          It is built and maintained by <strong>Brook Creative LLC</strong>. This policy
          explains what information the app holds, how it is used, and who can see it.
        </p>
        <p>
          We designed MyMadrich to hold only what's needed to help a student prepare, and to
          show each person only the information their role requires.
        </p>

        <h2>Who this involves</h2>
        <p>
          MyMadrich is used by the congregation's b'nai mitzvah <strong>coordinator and
          clergy</strong>, by <strong>tutors</strong>, and by <strong>students and their
          families</strong>. Many students are <strong>minors</strong>. Student and family
          information is entered and managed by the congregation and the families themselves;
          the app is the place that information lives and is shared among the people helping
          that student prepare.
        </p>

        <h2>What we collect</h2>
        <p>
          <strong>Student information:</strong> name, b-mitzvah date, school, the
          Torah/Haftarah and service readings assigned, learning progress, session notes, and
          d'var Torah stage.
        </p>
        <p>
          <strong>Family / guardian information:</strong> guardian names and email addresses,
          and which students each guardian is connected to.
        </p>
        <p>
          <strong>Tutor information:</strong> name, email, phone (optional), assigned
          students, session logs, and hours.
        </p>
        <p>
          <strong>Account / sign-in information:</strong> the email address used to sign in
          (via Google sign-in or an email "magic link"). We do not store passwords ourselves.
        </p>
        <p>
          <strong>Basic usage needed to run the app</strong> (e.g. which student or view you
          last looked at, kept in your browser).
        </p>
        <p>
          We do <strong>not</strong> collect payment information, advertising identifiers, or
          location data, and we do not use tracking for advertising.
        </p>

        <h2>How we use it</h2>
        <p>
          To plan, track, and coordinate a student's tutoring and readiness for the bimah. To
          let coordinators, the assigned tutor(s), and the student's own family see relevant
          progress. To send invitations and coordinate scheduling (invitations are sent from a
          coordinator's own email).
        </p>
        <p>
          We do not sell information, and we do not share it for advertising or with any party
          outside what's needed to operate the service.
        </p>

        <h2>Who can see what</h2>
        <p>
          Access is restricted by role, and enforced in the database itself (row-level
          security), not just hidden in the interface:
        </p>
        <p>
          <strong>Coordinators / admins</strong> see the families and students in the program.
          {' '}<strong>Tutors</strong> see only the students assigned to them.
          {' '}<strong>Students and families</strong> see only their own student(s) — never
          another family's data. Some staff notes are visible to staff only and are not shown
          to families.
        </p>

        <h2>Where data is stored and how it's protected</h2>
        <p>
          MyMadrich runs on <strong>Supabase</strong> (a managed database service) and is
          hosted on <strong>Vercel</strong>. Information is transmitted over an encrypted
          connection (HTTPS) and access requires signing in. Day-to-day access between roles
          is limited by the row-level security described above.
        </p>

        <h3>Service providers</h3>
        <p>
          We rely on a small number of providers to run the app: <strong>Supabase</strong>
          {' '}(database and authentication), <strong>Vercel</strong> (hosting), and
          {' '}<strong>Google</strong> (only if you choose Google sign-in). These providers
          process information on our behalf to keep the service running and do not use it for
          their own purposes.
        </p>

        <h2>Keeping and removing information</h2>
        <p>
          Information is kept while a student is active in the b'nai mitzvah program. Families
          may ask the coordinator to review, correct, or remove their information, and
          information is removed or archived after the program per the congregation's practice.
        </p>

        <h2>Your choices</h2>
        <p>
          If you'd like to see, correct, or remove information about your student, contact the
          {' '}<strong>b'nai mitzvah coordinator</strong> or email
          {' '}<a href="mailto:hello@mymadrich.com"><strong>hello@mymadrich.com</strong></a>.
          We'll work with the congregation to address the request.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          If this policy changes, we'll update the date above and post the new version here.
          Material changes will be communicated through the congregation.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy can go to the b'nai mitzvah coordinator, or
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
