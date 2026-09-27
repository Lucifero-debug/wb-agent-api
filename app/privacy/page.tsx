// app/privacy/page.tsx
//
// Public privacy policy — required by Meta to publish the app, and owed
// to every customer whose messages pass through the agent.
//
// It describes what the code ACTUALLY does. If you change what is stored,
// where, or who processes it (a new AI provider, a new email service,
// automatic deletion), update this page in the same change.
//
// Not legal advice. Fine for a pilot; have a lawyer look at it before
// you sign paying clients.

// ---------------------------------------------------------------
// FILL THESE IN before publishing.
// ---------------------------------------------------------------
const OPERATOR_NAME = "Prashant Kumar"; // who runs the service
const CONTACT_EMAIL = "shishupal78008@gmail.com"; // where privacy requests go
const LAST_UPDATED = "27 September 2026";

export const metadata = {
  title: "Privacy Policy",
  description: "How the WhatsApp assistant handles your messages and data.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-2 flex flex-col gap-3 text-sm leading-relaxed text-black/75 dark:text-white/75">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  const mail = (
    <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">
      {CONTACT_EMAIL}
    </a>
  );

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-black/50 dark:text-white/50">
        Last updated {LAST_UPDATED}
      </p>

      <Section title="Who we are">
        <p>
          {OPERATOR_NAME} provides an AI assistant that answers WhatsApp
          messages on behalf of businesses. When you message a business that
          uses this service, the assistant replies to you and passes your
          request to that business&apos;s staff.
        </p>
        <p>
          The business you are messaging decides how it uses your request —
          for example, calling you back to confirm a booking. We process your
          data on its behalf and only to provide this service.
        </p>
      </Section>

      <Section title="What we collect">
        <p>When you message a business that uses this service, we store:</p>
        <p>
          Your WhatsApp phone number. The messages you send, and the replies
          sent to you by the assistant or the business&apos;s staff. Details you
          choose to share in the conversation, such as your name, what you
          are asking for, and a preferred day or time. The date and time of
          each message.
        </p>
        <p>
          We do not collect your contacts, location, photos or anything else
          on your phone. If you send a voice note or image, we record only
          that one was sent; we do not store its content.
        </p>
      </Section>

      <Section title="How we use it">
        <p>
          To reply to your messages; to remember the conversation so you do
          not have to repeat yourself; to give the business a summary of your
          request so its staff can follow up; and to alert the business when
          you make a request or raise a complaint.
        </p>
        <p>
          We do not sell your data, use it for advertising, or share it with
          anyone other than the business you messaged and the service
          providers listed below.
        </p>
      </Section>

      <Section title="Service providers">
        <p>
          To run the service, your data passes through these providers, each
          under its own terms and privacy policy:
        </p>
        <p>
          Meta (WhatsApp Business Platform), which delivers messages. Google
          (Gemini), an AI model that reads the conversation to write replies
          and summarise requests. Neon, which hosts our database. Vercel,
          which hosts the application. Resend, which delivers email alerts to
          the business.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep conversations and request details for as long as the
          business uses this service, so its staff can see past requests. You
          can ask us to delete your data at any time (see below). When a
          business stops using the service, its customers&apos; data is deleted.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can ask us to show you the data we hold about you, to correct
          it, or to delete it. You can also stop at any time simply by no
          longer messaging the business. We handle personal data in line with
          India&apos;s Digital Personal Data Protection Act, 2023.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          Email {mail} from any address, with the subject &ldquo;Delete my
          data&rdquo;, and include the WhatsApp number you messaged from and the
          name of the business. We will delete your messages and request
          details within 30 days and confirm by email. Messages already
          delivered to your own WhatsApp stay on your phone; delete those in
          the WhatsApp app.
        </p>
      </Section>

      <Section title="Children">
        <p>
          This service is meant for customers of businesses and is not
          directed at children. If you believe a child has shared personal
          data with us, contact us and we will delete it.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If we change this policy, we will update the date at the top of
          this page. For any question about your data, contact {mail}.
        </p>
      </Section>
    </main>
  );
}
