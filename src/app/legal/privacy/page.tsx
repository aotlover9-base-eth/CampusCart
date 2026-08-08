import type { Metadata } from 'next'
import { LegalDocument, List, Section } from '../legal-prose'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What CampusCart collects, why, and who can see it.',
}

/**
 * Privacy notice.
 *
 * Deliberately specific about the phone-number model and about admin access to
 * chats, because those are the two things students will actually want to know.
 */
export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy"
      updated="8 August 2026"
      summary="Your phone number is hidden until you choose to share it. Your chats are private between you and the other student, with one narrow exception for abuse investigations that is described below and logged every time it happens."
    >
      <Section heading="What we collect">
        <List
          items={[
            'Your name, phone number, and — if you add one — your VIT email address',
            'Your role, department, and year, so buyers know who they are dealing with',
            'A profile photo, if you upload one',
            'Your listings: text, photos, videos, price, and location details',
            'Your messages to other students',
            'Location you choose to attach to a listing — a hostel block, or coordinates if you share them',
            'Basic technical data needed to keep the service running and to rate-limit abuse',
          ]}
        />
      </Section>

      <Section heading="Your phone number">
        <p>
          Your number is never shown on your profile or on a listing. A buyer has
          to request it, and you decide each request individually. Rejecting a
          request reveals nothing.
        </p>
        <p>
          Once you approve a request, that specific buyer can see your number. You
          can revoke that at any time from the request, which hides it again.
        </p>
        <p>
          We use your number to send login codes. We do not sell it, and we do not
          use it for marketing.
        </p>
      </Section>

      <Section heading="Your chats">
        <p>
          Messages are stored so they are there when you come back, and they are
          visible to you and the person you are talking to. They are not
          end-to-end encrypted — we could technically read them, and the paragraph
          below sets out the only circumstances in which we do.
        </p>
        <p>
          A moderator can open a conversation only when it has been reported, and
          only to investigate that report. Every such access writes a permanent
          record of which moderator opened which conversation, when, and the
          reason. That record cannot be edited or deleted from the admin panel.
        </p>
        <p>
          If you would rather not have a conversation on record, move to a phone
          call once you have exchanged numbers.
        </p>
      </Section>

      <Section heading="Location">
        <p>
          Location is opt-in per listing. Hostellers usually give a block and a
          meeting window rather than exact coordinates. Day scholars can share a
          Maps link or precise coordinates.
        </p>
        <p>
          Coordinates you attach are shown to people viewing that listing, so only
          attach a location you are comfortable making public. We never track you
          in the background.
        </p>
      </Section>

      <Section heading="Who else sees your data">
        <p>
          Other students see your public profile, your listings, and whatever you
          send them in chat. Nobody else, with these exceptions:
        </p>
        <List
          items={[
            'Our infrastructure providers — database, file storage, and SMS or email delivery — strictly to run the service',
            'Moderators, in the limited and logged circumstances described above',
            'Law enforcement, where we are legally required to respond',
          ]}
        />
        <p>We do not sell your data and we do not run third-party ad trackers.</p>
      </Section>

      <Section heading="How long we keep it">
        <p>
          Your account data stays while your account is open. Deleting your account
          removes your profile and your listings. Messages you sent stay visible to
          the person who received them, shown as being from a deleted account —
          otherwise their side of the conversation would stop making sense.
        </p>
        <p>
          Login codes expire in minutes. Moderation records are kept for
          accountability.
        </p>
      </Section>

      <Section heading="Your choices">
        <List
          items={[
            'Edit or delete your profile and listings at any time',
            'Approve or reject every phone-number request individually, and revoke access later',
            'Block a user to stop them contacting you',
            'Delete your account from Settings',
            'Ask us what we hold about you',
          ]}
        />
      </Section>

      <Section heading="Security">
        <p>
          Sessions use signed, HTTP-only cookies. Login codes are hashed before
          storage, expire quickly, and are rate-limited. All state-changing
          requests carry a CSRF token. Uploads are validated by type and size.
        </p>
        <p>
          No system is perfect. If you find a security problem, please report it
          rather than exploiting it.
        </p>
      </Section>
    </LegalDocument>
  )
}
