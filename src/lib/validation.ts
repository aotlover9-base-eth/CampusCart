import { z } from 'zod'

/**
 * Shared zod schemas. Every route handler validates its input through one of
 * these — no handler reads an unparsed body.
 */

/**
 * Indian mobile numbers, normalised to E.164 (+91XXXXXXXXXX).
 * Accepts 10-digit input, a leading 0, 91-prefixed, or already-normalised.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((raw) => raw.replace(/[\s\-()]/g, ''))
  .refine(
    (v) => /^(?:\+?91|0)?[6-9]\d{9}$/.test(v),
    'Enter a valid 10-digit Indian mobile number',
  )
  .transform((v) => {
    const digits = v.replace(/^\+?91/, '').replace(/^0/, '')
    return `+91${digits}`
  })

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254)

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code')

export const userRoleSchema = z.enum(['HOSTELLER', 'DAY_SCHOLAR', 'OTHER'])

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Name is too short')
  .max(80, 'Name is too long')
  // Letters, spaces, apostrophes, hyphens, and dots only.
  .regex(/^[\p{L}][\p{L}\s'.-]*$/u, 'Name contains invalid characters')

export const departmentSchema = z.string().trim().min(2).max(80).optional()

export const yearSchema = z.coerce
  .number()
  .int()
  .min(1, 'Year must be between 1 and 5')
  .max(5, 'Year must be between 1 and 5')
  .optional()

// ── Auth flows ──

export const requestOtpSchema = z
  .object({
    channel: z.enum(['SMS', 'EMAIL']),
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    purpose: z.enum(['SIGNUP', 'LOGIN', 'PHONE_VERIFY', 'EMAIL_VERIFY']),
  })
  .refine(
    (v) => (v.channel === 'SMS' ? Boolean(v.phone) : Boolean(v.email)),
    'Provide the destination matching the selected channel',
  )

export const verifyOtpSchema = z
  .object({
    channel: z.enum(['SMS', 'EMAIL']),
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    purpose: z.enum(['SIGNUP', 'LOGIN', 'PHONE_VERIFY', 'EMAIL_VERIFY']),
    code: otpCodeSchema,
  })
  .refine(
    (v) => (v.channel === 'SMS' ? Boolean(v.phone) : Boolean(v.email)),
    'Provide the destination matching the selected channel',
  )

export const completeProfileSchema = z.object({
  fullName: fullNameSchema,
  role: userRoleSchema,
  department: departmentSchema,
  year: yearSchema,
  email: emailSchema.optional(),
  avatarUrl: z.string().max(500).optional(),
  bio: z.string().trim().max(280).optional(),
})

// ── Locations ──

export const hostelLocationSchema = z.object({
  block: z.string().trim().min(1, 'Block is required').max(40),
  building: z.string().trim().max(40).optional(),
  floor: z.string().trim().max(20).optional(),
  roomNumber: z.string().trim().max(20).optional(),
  availableFrom: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM')
    .optional(),
  availableTo: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM')
    .optional(),
  meetingSpot: z.string().trim().max(120).optional(),
  instructions: z.string().trim().max(500).optional(),
})

export const geoLocationSchema = z
  .object({
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    googleMapsUrl: z
      .string()
      .trim()
      .max(600)
      .refine(
        (v) => !v || /^https:\/\/(?:[\w-]+\.)*(?:google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl)\//i.test(v),
        'Paste a valid Google Maps link',
      )
      .optional(),
    address: z.string().trim().max(300).optional(),
    area: z.string().trim().max(120).optional(),
    city: z.string().trim().max(80).optional(),
    source: z.enum(['gps', 'maps_link', 'pin', 'manual']).optional(),
  })
  .refine(
    (v) => (v.latitude != null && v.longitude != null) || Boolean(v.googleMapsUrl) || Boolean(v.address),
    'Provide coordinates, a Maps link, or an address',
  )

// ── Listings ──

export const listingConditionSchema = z.enum([
  'NEW',
  'LIKE_NEW',
  'GOOD',
  'FAIR',
  'WELL_USED',
])

export const contactPreferenceSchema = z.enum([
  'CHAT_ONLY',
  'CHAT_THEN_PHONE',
  'PHONE_ON_REQUEST',
])

/**
 * Storage keys are minted by the upload route as `<16 hex>.<ext>`. Validating
 * the shape here means a client cannot submit a path-like key and have it reach
 * the filesystem or a URL.
 */
const storageKeySchema = z
  .string()
  .regex(/^[a-f0-9]{16}\.[a-z0-9]{2,5}$/i, 'Invalid media reference')

/** Media attached to a listing, as returned by /api/upload. */
export const listingMediaSchema = z.object({
  kind: z.enum(['IMAGE', 'VIDEO']),
  storageKey: storageKeySchema,
  thumbnailKey: storageKeySchema.optional(),
  mimeType: z
    .string()
    .regex(/^(?:image|video)\/[a-z0-9.+-]+$/i, 'Unsupported media type')
    .max(60),
  sizeBytes: z.coerce.number().int().nonnegative(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  durationMs: z.coerce.number().int().nonnegative().optional(),
  // Inline base64 placeholder, so restrict the shape as well as the length.
  blurDataUrl: z
    .string()
    .regex(/^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/, 'Invalid placeholder')
    .max(3_000)
    .optional(),
  altText: z.string().trim().max(200).optional(),
})

/**
 * Price is accepted in rupees from the client and stored as paise, so no float
 * ever reaches the database. Cap of ₹10,00,000 keeps out fat-finger entries.
 */
const priceRupeesSchema = z.coerce
  .number()
  .nonnegative('Price cannot be negative')
  .max(1_000_000, 'Price is too high')

export const createListingSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(4, 'Title is too short')
      .max(120, 'Keep the title under 120 characters'),
    // Unlimited by product spec; the cap only guards against abuse.
    description: z.string().trim().min(10, 'Add a few more details').max(20_000),

    priceRupees: priceRupeesSchema,
    isFree: z.boolean().default(false),
    isNegotiable: z.boolean().default(true),

    condition: listingConditionSchema,
    categoryId: z.string().min(1, 'Pick a category'),
    // Only meaningful when the chosen category allows a custom label.
    customCategoryLabel: z.string().trim().min(2).max(40).optional(),

    contactPreference: contactPreferenceSchema.default('CHAT_THEN_PHONE'),
    availabilityNote: z.string().trim().max(200).optional(),

    // Pickup location snapshot. Hostellers send a block; others send coords.
    locationLabel: z.string().trim().max(120).optional(),
    hostelBlock: z.string().trim().max(40).optional(),
    pickupArea: z.enum(['INSIDE_CAMPUS', 'OUTSIDE_CAMPUS']).default('INSIDE_CAMPUS'),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    googleMapsUrl: z.string().trim().max(600).optional(),

    media: z.array(listingMediaSchema).max(18).default([]),
    publish: z.boolean().default(true),
  })
  .refine((v) => v.isFree || v.priceRupees > 0, {
    message: 'Set a price, or mark the item as free',
    path: ['priceRupees'],
  })
  .refine(
    (v) => v.media.filter((m) => m.kind === 'IMAGE').length <= 15,
    { message: 'At most 15 photos', path: ['media'] },
  )
  .refine(
    (v) => v.media.filter((m) => m.kind === 'VIDEO').length <= 3,
    { message: 'At most 3 videos', path: ['media'] },
  )

/** Updates are partial; `media` replaces the whole set when present. */
export const updateListingSchema = z.object({
  title: z.string().trim().min(4).max(120).optional(),
  description: z.string().trim().min(10).max(20_000).optional(),
  priceRupees: priceRupeesSchema.optional(),
  isFree: z.boolean().optional(),
  isNegotiable: z.boolean().optional(),
  condition: listingConditionSchema.optional(),
  categoryId: z.string().min(1).optional(),
  customCategoryLabel: z.string().trim().min(2).max(40).nullable().optional(),
  contactPreference: contactPreferenceSchema.optional(),
  availabilityNote: z.string().trim().max(200).nullable().optional(),
  locationLabel: z.string().trim().max(120).nullable().optional(),
  hostelBlock: z.string().trim().max(40).nullable().optional(),
  pickupArea: z.enum(['INSIDE_CAMPUS', 'OUTSIDE_CAMPUS']).optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  googleMapsUrl: z.string().trim().max(600).nullable().optional(),
  media: z.array(listingMediaSchema).max(18).optional(),
})

export const listingStatusActionSchema = z.object({
  action: z.enum(['publish', 'unpublish', 'mark_sold', 'mark_available']),
  soldToId: z.string().min(1).optional(),
})

// ── Feed, search, filters ──

export const feedSortSchema = z.enum([
  'newest',
  'oldest',
  'price_low',
  'price_high',
  'distance',
  'popular',
])

export const feedQuerySchema = z.object({
  cursor: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(48).default(24),

  q: z.string().trim().max(120).optional(),
  category: z.string().max(60).optional(),
  condition: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim().toUpperCase())
            .filter((s) => ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'WELL_USED'].includes(s))
        : undefined,
    ),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  negotiable: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  freeOnly: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  sellerRole: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim().toUpperCase())
            .filter((s) => ['HOSTELLER', 'DAY_SCHOLAR', 'OTHER'].includes(s))
        : undefined,
    ),
  vitVerifiedOnly: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  sellerId: z.string().max(40).optional(),
  hostelBlock: z.string().max(40).optional(),
  pickupArea: z
    .string()
    .optional()
    .transform((v) => {
      const upper = v?.trim().toUpperCase()
      return upper === 'INSIDE_CAMPUS' || upper === 'OUTSIDE_CAMPUS' ? upper : undefined
    }),

  /**
   * Narrows the visible set to one lifecycle state — used by the "Sold" tab on
   * a profile. Only states that are already publicly visible are accepted, so
   * this can never widen what `visibilityWhere` allows.
   */
  status: z
    .string()
    .optional()
    .transform((v) => {
      const upper = v?.trim().toUpperCase()
      return upper && ['ACTIVE', 'RESERVED', 'SOLD'].includes(upper) ? upper : undefined
    }),

  // Distance filtering needs an origin; supplied by the client's own location.
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(500).optional(),

  sort: feedSortSchema.default('newest'),
})

export const searchSuggestQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(10).default(8),
})

// ── Pagination ──

export const cursorPaginationSchema = z.object({
  cursor: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

/** Format zod issues into a field-keyed map for form rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    if (!out[key]) out[key] = issue.message
  }
  return out
}
