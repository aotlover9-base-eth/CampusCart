'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import type { CategoryNode } from '@/lib/categories'
import { api, ApiError } from '@/lib/client/fetcher'
import { cn } from '@/lib/utils'
import {
  CONDITION_OPTIONS,
  CONTACT_PREFERENCE_OPTIONS,
  HOSTEL_BLOCKS,
  hostelBlockLabel,
  PICKUP_AREA_OPTIONS,
  type PickupAreaValue,
} from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { MediaUploader, type UploadedMedia } from './media-uploader'
import { CategoryIcon } from '@/components/brand/icons'
import { MapPinIcon } from '@/components/ui/icons'

/**
 * Listing composer, used for both create and edit.
 *
 * One long scrolling form rather than a wizard: sellers already know what they
 * are listing, and a multi-step flow mostly adds taps. Validation mirrors
 * createListingSchema so the server rarely has to reject anything.
 */

export interface ComposerDefaults {
  role: string
  hostelBlock: string | null
  latitude: number | null
  longitude: number | null
  locationLabel: string | null
}

export interface ExistingListing {
  id: string
  title: string
  description: string
  priceInPaise: number
  isFree: boolean
  isNegotiable: boolean
  condition: string
  categoryId: string
  customCategoryLabel: string | null
  contactPreference: string
  availabilityNote: string | null
  locationLabel: string | null
  hostelBlock: string | null
  pickupArea: string
  media: UploadedMedia[]
}

export function ListingComposer({
  categories,
  defaultLocation,
  existing,
}: {
  categories: CategoryNode[]
  defaultLocation: ComposerDefaults
  /** Present when editing; the form then PATCHes instead of POSTing. */
  existing?: ExistingListing
}) {
  const router = useRouter()
  const toast = useToast()


  const [media, setMedia] = useState<UploadedMedia[]>(existing?.media ?? [])
  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [price, setPrice] = useState(
    existing && !existing.isFree ? String(existing.priceInPaise / 100) : '',
  )
  const [isFree, setIsFree] = useState(existing?.isFree ?? false)
  const [isNegotiable, setIsNegotiable] = useState(existing?.isNegotiable ?? true)
  const [condition, setCondition] = useState(existing?.condition ?? '')
  const [parentId, setParentId] = useState(() => {
    if (!existing) return ''
    // An existing listing stores a leaf id; find whichever branch owns it.
    const owner = categories.find(
      (node) =>
        node.id === existing.categoryId ||
        node.children.some((child) => child.id === existing.categoryId),
    )
    return owner?.id ?? ''
  })
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? '')
  const [customLabel, setCustomLabel] = useState(existing?.customCategoryLabel ?? '')
  const [contactPreference, setContactPreference] = useState(
    existing?.contactPreference ?? 'CHAT_THEN_PHONE',
  )
  const [availabilityNote, setAvailabilityNote] = useState(existing?.availabilityNote ?? '')
  const [hostelBlock, setHostelBlock] = useState(
    existing?.hostelBlock ?? defaultLocation.hostelBlock ?? '',
  )
  const [pickupArea, setPickupArea] = useState<PickupAreaValue>(
    (existing?.pickupArea as PickupAreaValue | undefined) ??
      (defaultLocation.role === 'HOSTELLER' ? 'INSIDE_CAMPUS' : 'OUTSIDE_CAMPUS'),
  )
  const [locationLabel, setLocationLabel] = useState(
    existing?.locationLabel ?? defaultLocation.locationLabel ?? '',
  )

  const [submitting, setSubmitting] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const activeParent = categories.find((node) => node.id === parentId)
  const allowsCustomLabel = Boolean(activeParent?.allowsCustomLabel)

  const priceNumber = Number(price)
  const canSubmit = useMemo(() => {
    if (title.trim().length < 4 || description.trim().length < 10) return false
    if (!condition || !categoryId) return false
    if (allowsCustomLabel && customLabel.trim().length < 2) return false
    if (!isFree && (!Number.isFinite(priceNumber) || priceNumber <= 0)) return false
    return true
  }, [
    title,
    description,
    condition,
    categoryId,
    allowsCustomLabel,
    customLabel,
    isFree,
    priceNumber,
  ])

  function selectParent(id: string) {
    setParentId(id)
    const node = categories.find((item) => item.id === id)
    // Parents with no children are selectable in their own right.
    setCategoryId(node && node.children.length === 0 ? id : '')
    setCustomLabel('')
  }

  async function submit(publish: boolean) {
    if (submitting) return

    setSubmitting(true)
    setError(null)
    setFields({})

    const payload = {
      title: title.trim(),
      description: description.trim(),
      priceRupees: isFree ? 0 : priceNumber,
      isFree,
      isNegotiable: isFree ? false : isNegotiable,
      condition,
      categoryId,
      ...(allowsCustomLabel ? { customCategoryLabel: customLabel.trim() } : {}),
      contactPreference,
      ...(availabilityNote.trim() ? { availabilityNote: availabilityNote.trim() } : {}),
      pickupArea,
      ...(pickupArea === 'INSIDE_CAMPUS'
        ? { hostelBlock: hostelBlock.trim() || undefined }
        : {
            locationLabel: locationLabel.trim() || undefined,
            ...(defaultLocation.latitude != null && defaultLocation.longitude != null
              ? { latitude: defaultLocation.latitude, longitude: defaultLocation.longitude }
              : {}),
          }),
      media: media.map((item) => ({
        kind: item.kind,
        storageKey: item.storageKey,
        ...(item.thumbnailKey ? { thumbnailKey: item.thumbnailKey } : {}),
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        ...(item.width ? { width: item.width } : {}),
        ...(item.height ? { height: item.height } : {}),
        ...(item.blurDataUrl ? { blurDataUrl: item.blurDataUrl } : {}),
      })),
      publish,
    }

    try {
      if (existing) {
        await api(`/api/listings/${existing.id}`, { method: 'PATCH', body: payload })
        toast.success('Listing updated')
        router.push(`/listing/${existing.id}`)
      } else {
        const result = await api<{ listing: { id: string }; pendingApproval: boolean }>(
          '/api/listings',
          { method: 'POST', body: payload },
        )
        toast.success(
          result.pendingApproval
            ? 'Submitted - it goes live once reviewed'
            : publish
              ? 'Your listing is live'
              : 'Saved as a draft',
        )
        router.push(`/listing/${result.listing.id}`)
      }
      router.refresh()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        if (caught.fields) setFields(caught.fields)
      } else {
        setError('Could not save the listing. Check your connection.')
      }
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit(true)
      }}
      className="space-y-8 pb-24"
    >
      <Section title="Photos and video" hint="Up to 15 photos and 3 videos.">
        <MediaUploader media={media} onChange={setMedia} disabled={submitting} />
        {fields.media && (
          <p className="text-[13px] text-[var(--color-danger)]">{fields.media}</p>
        )}
      </Section>

      <Section title="What are you selling?">
        <Input
          label="Title"
          placeholder="Casio FX-991EX scientific calculator"
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          error={fields.title}
          hint={!fields.title ? `${title.length}/120` : undefined}
        />

        <Textarea
          label="Description"
          placeholder="Condition, age, what's included, why you're selling. Be specific - it saves both of you a chat."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={fields.description}
          className="min-h-[140px]"
        />
      </Section>

      <Section title="Category">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categories.map((node) => (
            <motion.button
              key={node.id}
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => selectParent(node.id)}
              aria-pressed={parentId === node.id}
              className={cn(
                'flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors',
                parentId === node.id
                  ? 'border-[var(--color-ink)] bg-[var(--color-surface-hover)]'
                  : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)]',
              )}
            >
              <CategoryIcon
                name={node.icon}
                className="h-4 w-4 shrink-0 text-[var(--color-ink-muted)]"
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-ink)]">
                {node.name}
              </span>
            </motion.button>
          ))}
        </div>

        {activeParent && activeParent.children.length > 0 && (
          <Select
            label="Subcategory"
            placeholder="Choose one"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            error={fields.categoryId}
          >
            {activeParent.children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </Select>
        )}

        {allowsCustomLabel && (
          <Input
            label="Describe the category"
            placeholder="Lab coat, cycle pump, event pass…"
            value={customLabel}
            maxLength={40}
            onChange={(event) => setCustomLabel(event.target.value)}
            error={fields.customCategoryLabel}
            hint={!fields.customCategoryLabel ? 'Shown instead of "Other".' : undefined}
          />
        )}
      </Section>

      <Section title="Condition">
        <div className="space-y-2">
          {CONDITION_OPTIONS.map((option) => (
            <RadioRow
              key={option.value}
              name="condition"
              checked={condition === option.value}
              onChange={() => setCondition(option.value)}
              label={option.label}
              description={option.description}
            />
          ))}
        </div>
        {fields.condition && (
          <p className="text-[13px] text-[var(--color-danger)]">{fields.condition}</p>
        )}
      </Section>

      <Section title="Price">
        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={isFree}
            onChange={(event) => setIsFree(event.target.checked)}
            className="h-4 w-4 rounded border-[var(--color-line-strong)] accent-[var(--color-ink)]"
          />
          <span className="text-[14px] text-[var(--color-ink)]">
            Giving this away for free
          </span>
        </label>

        {!isFree && (
          <>
            <Input
              type="number"
              inputMode="decimal"
              label="Asking price"
              prefix="₹"
              placeholder="1200"
              min={1}
              step={1}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              error={fields.priceRupees}
            />

            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={isNegotiable}
                onChange={(event) => setIsNegotiable(event.target.checked)}
                className="h-4 w-4 rounded border-[var(--color-line-strong)] accent-[var(--color-ink)]"
              />
              <span className="text-[14px] text-[var(--color-ink)]">
                Price is negotiable
              </span>
            </label>
          </>
        )}
      </Section>

      <Section
        title="Pickup"
        hint={
          pickupArea === 'INSIDE_CAMPUS'
            ? 'Only your block is shown publicly. Your room stays private until you share it in chat.'
            : 'Buyers see the area and rough distance, never your exact address.'
        }
      >
        <div className="space-y-2">
          {PICKUP_AREA_OPTIONS.map((option) => (
            <RadioRow
              key={option.value}
              name="pickupArea"
              checked={pickupArea === option.value}
              onChange={() => setPickupArea(option.value)}
              label={option.label}
              description={option.description}
            />
          ))}
        </div>

        {pickupArea === 'INSIDE_CAMPUS' ? (
          <Select
            label="Block"
            placeholder="Choose your block"
            value={hostelBlock}
            onChange={(event) => setHostelBlock(event.target.value)}
            error={fields.hostelBlock}
          >
            {HOSTEL_BLOCKS.map((item) => (
              <option key={item} value={item}>
                {hostelBlockLabel(item)}
              </option>
            ))}
          </Select>
        ) : (
          <>
            <Input
              label="Area or landmark"
              placeholder="Kolar Road, near the ISBT stop"
              value={locationLabel}
              maxLength={120}
              onChange={(event) => setLocationLabel(event.target.value)}
              error={fields.locationLabel}
            />
            {defaultLocation.latitude != null && (
              <p className="flex items-center gap-1.5 text-[12.5px] text-[var(--color-ink-subtle)]">
                <MapPinIcon className="h-3.5 w-3.5" />
                Using the coordinates saved on your profile for distance sorting.
              </p>
            )}
          </>
        )}

        <Input
          label="When are you available? (optional)"
          placeholder="Weekdays after 6pm"
          value={availabilityNote}
          maxLength={200}
          onChange={(event) => setAvailabilityNote(event.target.value)}
        />
      </Section>

      <Section title="How should buyers reach you?">
        <div className="space-y-2">
          {CONTACT_PREFERENCE_OPTIONS.map((option) => (
            <RadioRow
              key={option.value}
              name="contactPreference"
              checked={contactPreference === option.value}
              onChange={() => setContactPreference(option.value)}
              label={option.label}
              description={option.description}
            />
          ))}
        </div>
        <p className="text-[12.5px] text-[var(--color-ink-subtle)]">
          Your number is never shown on the listing. Buyers have to ask, and you
          decide each time.
        </p>
      </Section>

      {error && (
        <p
          role="alert"
          className="rounded-[10px] border border-[var(--color-danger)]/25 bg-[var(--color-danger-soft)] px-3 py-2.5 text-[13px] text-[var(--color-danger)]"
        >
          {error}
        </p>
      )}

      {/* Sticky action bar so the primary action is always reachable. */}
      <div className="glass fixed inset-x-0 bottom-[var(--nav-height-mobile)] z-[var(--z-nav)] border-t border-[var(--color-line)] px-4 py-3 md:bottom-0">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {!existing && (
            <Button
              type="button"
              variant="secondary"
              disabled={submitting || !canSubmit}
              onClick={() => void submit(false)}
            >
              Save draft
            </Button>
          )}
          <Button
            type="submit"
            className="flex-1"
            loading={submitting}
            disabled={!canSubmit}
          >
            {existing ? 'Save changes' : 'Publish listing'}
          </Button>
        </div>
      </div>
    </form>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">{title}</h2>
        {hint && (
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

function RadioRow({
  name,
  checked,
  onChange,
  label,
  description,
}: {
  name: string
  checked: boolean
  onChange: () => void
  label: string
  description: string
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3.5 transition-colors',
        checked
          ? 'border-[var(--color-ink)] bg-[var(--color-surface-hover)]'
          : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)]',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-ink)]"
      />
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-[var(--color-ink)]">{label}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--color-ink-muted)]">
          {description}
        </span>
      </span>
    </label>
  )
}
