import type { Metadata } from 'next'
import { LegalDocument, List, Section } from '../legal-prose'

export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'The rules for buying and selling on CampusCart.',
}

/**
 * Terms of use.
 *
 * Written as a starting point that accurately describes what the software
 * actually does. It is not legal advice - have someone qualified review it
 * before the platform handles real transactions at scale.
 */
export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of use"
      updated="8 August 2026"
      summary="CampusCart connects VIT Bhopal students who want to buy and sell things. We host the listings and the chat. We are not a party to any sale, we never handle your money, and we do not deliver anything."
    >
      <Section heading="Who can use CampusCart">
        <p>
          Accounts are for current VIT Bhopal students, faculty, staff, and alumni.
          You need a working Indian mobile number, which we verify by SMS. One
          account per person.
        </p>
        <p>
          You must be old enough to enter a contract in India. If you are under 18,
          use CampusCart with a parent or guardian's involvement.
        </p>
      </Section>

      <Section heading="What we are and are not">
        <p>
          We are a noticeboard with a chat attached. When you agree a sale, that
          agreement is between you and the other student. CampusCart is not the
          seller, not the buyer, and not an escrow service.
        </p>
        <p>
          Money changes hands directly between you and the other person, in
          whatever way you both agree. We never see it, hold it, or refund it.
        </p>
      </Section>

      <Section heading="What you may not list">
        <List
          items={[
            'Anything illegal to own or sell in India',
            'Alcohol, tobacco, drugs, or prescription medication',
            'Weapons, ammunition, or explosives',
            'Live animals',
            'Academic dishonesty services - assignments, proxy attendance, exam help',
            'Counterfeit goods or pirated media',
            'Anything you do not own or are not authorised to sell',
            'Hostel or university property',
          ]}
        />
        <p>
          We remove listings that break these rules and may suspend or ban the
          account behind them.
        </p>
      </Section>

      <Section heading="Meeting people">
        <p>
          Meet in daylight, in a public part of campus, and tell a friend where you
          are going. Inspect an item before you pay for it. If a deal feels wrong,
          walk away - no listing is worth your safety.
        </p>
        <p>
          We verify phone numbers and show a badge for verified VIT email
          addresses. That confirms an account is reachable, not that a person is
          trustworthy. Use your judgement.
        </p>
      </Section>

      <Section heading="Your content">
        <p>
          Your listings and photos stay yours. By posting them you let us display
          and distribute them inside CampusCart so the platform can function.
          Deleting a listing withdraws that permission going forward.
        </p>
        <p>
          Do not post photos you did not take or do not have the right to use.
        </p>
      </Section>

      <Section heading="Behaviour">
        <p>
          Harassment, threats, hate speech, spam, scams, and impersonation get an
          account removed. Repeatedly agreeing to meet and not turning up counts as
          wasting other students' time and may also cost you your account.
        </p>
      </Section>

      <Section heading="Suspension and removal">
        <p>
          We can remove a listing or restrict an account when these terms are
          broken, when we are required to by law, or when we reasonably believe
          someone is being put at risk. Where it is practical and appropriate, we
          say why.
        </p>
      </Section>

      <Section heading="Liability">
        <p>
          CampusCart is provided as-is. We do not guarantee that an item is as
          described, that a buyer will pay, or that a seller will turn up. To the
          extent the law allows, we are not liable for losses arising from a
          transaction between users.
        </p>
        <p>
          Nothing here limits liability that cannot legally be limited.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          When these terms change materially, we will say so in the app. Continuing
          to use CampusCart after that means you accept the updated terms.
        </p>
      </Section>
    </LegalDocument>
  )
}
