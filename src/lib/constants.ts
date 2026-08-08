/**
 * Campus reference data.
 *
 * Kept in code rather than the database: these change once a year at most, and
 * a wrong value here is a typo rather than a data-integrity problem. Both lists
 * allow free text at the point of entry, so an unlisted block or programme is
 * never a dead end.
 */

/**
 * VIT Bhopal hostel blocks.
 *
 * Eight numbered blocks, each split into an A and a B wing — 1A through 8B,
 * sixteen in total. Generated rather than hand-listed so the pattern is stated
 * once and a wing can never be missed from the middle of the list.
 */
export const HOSTEL_BLOCKS: readonly string[] = Array.from({ length: 8 }, (_, index) =>
  ['A', 'B'].map((wing) => `${index + 1}${wing}`),
).flat()

/**
 * "1A" → "Block 1A", for places where the surrounding field label is absent —
 * a listing card or a profile line, where a bare "1A" reads as noise.
 *
 * Values that already begin with a letter are passed through untouched, so a
 * block stored before the 1A–8B scheme does not become "Block Block A".
 */
export function hostelBlockLabel(block: string): string {
  return /^\d/.test(block) ? `Block ${block}` : block
}

/** Schools and common programmes. */
export const DEPARTMENTS = [
  'SCOPE — Computer Science & Engineering',
  'SCOPE — CSE (AI & ML)',
  'SCOPE — CSE (Cyber Security)',
  'SCOPE — CSE (Data Science)',
  'SCOPE — CSE (Health Informatics)',
  'SCOPE — CSE (Gaming Technology)',
  'SENSE — Electronics & Communication',
  'SENSE — ECE (VLSI)',
  'SMEC — Mechanical Engineering',
  'SMEC — Mechatronics & Automation',
  'SCE — Civil Engineering',
  'SEEE — Electrical & Electronics',
  'SBST — Biotechnology',
  'SAS — Physics',
  'SAS — Chemistry',
  'SAS — Mathematics',
  'VSB — Business Administration',
  'VSL — Law',
  'SADA — Architecture & Design',
  'Other',
] as const

/** Undergraduate and postgraduate years. Matches `yearSchema` (1–5). */
export const YEAR_OPTIONS = [
  { value: 1, label: '1st year' },
  { value: 2, label: '2nd year' },
  { value: 3, label: '3rd year' },
  { value: 4, label: '4th year' },
  { value: 5, label: '5th year / other' },
] as const

/** Copy for the three account types, shown on the role picker. */
export const ROLE_OPTIONS = [
  {
    value: 'HOSTELLER',
    label: 'Hosteller',
    description: 'You live on campus. Buyers meet you at your block.',
  },
  {
    value: 'DAY_SCHOLAR',
    label: 'Day scholar',
    description: 'You commute. Share a pickup point off campus.',
  },
  {
    value: 'OTHER',
    label: 'Other',
    description: 'Faculty, staff, or alumni.',
  },
] as const

export type RoleValue = (typeof ROLE_OPTIONS)[number]['value']

/** Contact preferences, in the order they appear on the compose form. */
export const CONTACT_PREFERENCE_OPTIONS = [
  {
    value: 'CHAT_ONLY',
    label: 'Chat only',
    description: 'Buyers can only message you in the app.',
  },
  {
    value: 'CHAT_THEN_PHONE',
    label: 'Chat, then phone',
    description: 'Buyers chat first and can request your number.',
  },
  {
    value: 'PHONE_ON_REQUEST',
    label: 'Phone on request',
    description: 'Buyers can request your number straight away.',
  },
] as const

/** Condition options with the phrasing used in the picker. */
export const CONDITION_OPTIONS = [
  { value: 'NEW', label: 'New', description: 'Unopened or never used' },
  { value: 'LIKE_NEW', label: 'Like new', description: 'Barely used, no marks' },
  { value: 'GOOD', label: 'Good', description: 'Used, works perfectly' },
  { value: 'FAIR', label: 'Fair', description: 'Visible wear, fully functional' },
  { value: 'WELL_USED', label: 'Well used', description: 'Heavy wear or minor faults' },
] as const

/** Media caps per listing. Mirrors MAX_IMAGES_PER_LISTING / MAX_VIDEOS_PER_LISTING in env, and the refinements on createListingSchema. */
export const MAX_IMAGES = 15
export const MAX_VIDEOS = 3

/** Reasons offered when reporting a listing, user, or message. */
export const REPORT_REASONS = [
  'Scam or fraud',
  'Prohibited item',
  'Misleading listing',
  'Harassment or abuse',
  'Spam',
  'Someone else\'s item',
  'Other',
] as const

/**
 * Where a handover happens.
 *
 * Previously inferred from the seller's role, which was wrong in both
 * directions: a hosteller can hand something over at a café off campus, and a
 * day scholar can meet at the main gate. Sellers now say explicitly, and buyers
 * can filter on it — which is what lets a day scholar find other day scholars
 * rather than only campus listings.
 */
export const PICKUP_AREA_OPTIONS = [
  {
    value: 'INSIDE_CAMPUS',
    label: 'Inside campus',
    description: 'Meet at a hostel block or somewhere on campus.',
  },
  {
    value: 'OUTSIDE_CAMPUS',
    label: 'Outside campus',
    description: 'Meet off campus — useful for day scholars.',
  },
] as const

export type PickupAreaValue = (typeof PICKUP_AREA_OPTIONS)[number]['value']

export const PICKUP_AREA_LABELS: Record<string, string> = {
  INSIDE_CAMPUS: 'Inside campus',
  OUTSIDE_CAMPUS: 'Outside campus',
}
