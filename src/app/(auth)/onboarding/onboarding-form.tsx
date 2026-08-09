'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api, ApiError } from '@/lib/client/fetcher'
import { cn } from '@/lib/utils'
import {
  DEPARTMENTS,
  HOSTEL_BLOCKS,
  hostelBlockLabel,
  ROLE_OPTIONS,
  YEAR_OPTIONS,
  type RoleValue,
} from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ArrowLeftIcon, CheckIcon, MapPinIcon } from '@/components/ui/icons'

/**
 * Signup completion, in three steps.
 *
 * Split because the location fields are role-dependent and asking everything at
 * once produces a form nobody finishes. Each step validates locally before
 * advancing, so the single API call at the end rarely fails.
 *
 * The avatar is uploaded *after* the account exists — /api/upload requires an
 * authenticated user, and complete-profile is what signs the user in.
 */

type Step = 'identity' | 'role' | 'location'

interface CompleteProfileResult {
  created: boolean
  user: { id: string; fullName: string; role: string }
  emailNeedsVerification: boolean
}

export function OnboardingForm({
  phone,
  nextPath,
}: {
  phone: string
  nextPath: string | null
}) {
  const [step, setStep] = useState<Step>('identity')

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [year, setYear] = useState('')
  const [bio, setBio] = useState('')
  const [role, setRole] = useState<RoleValue | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  // Hosteller location
  const [block, setBlock] = useState('')
  const [roomNumber, setRoomNumber] = useState('')
  const [availableFrom, setAvailableFrom] = useState('18:00')
  const [availableTo, setAvailableTo] = useState('22:00')
  const [meetingSpot, setMeetingSpot] = useState('')

  // Day scholar / other location
  const [mapsUrl, setMapsUrl] = useState('')
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locatingState, setLocatingState] = useState<'idle' | 'locating' | 'done' | 'failed'>('idle')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})

  const identityValid = fullName.trim().length >= 2
  const canSubmit = useMemo(() => {
    if (!role) return false
    if (role === 'HOSTELLER') return block.trim().length > 0
    // Day scholars and others need at least one usable locator.
    return Boolean(coords) || mapsUrl.trim().length > 0 || address.trim().length > 0
  }, [role, block, coords, mapsUrl, address])

  function pickAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Choose an image file for your photo.')
      return
    }

    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setError(null)
  }

  function detectLocation() {
    if (!navigator.geolocation) {
      setLocatingState('failed')
      return
    }

    setLocatingState('locating')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        })
        setLocatingState('done')
      },
      () => setLocatingState('failed'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  async function submit() {
    if (!role || submitting) return

    setSubmitting(true)
    setError(null)
    setFields({})

    try {
      await api<CompleteProfileResult>('/api/auth/complete-profile', {
        method: 'POST',
        body: {
          phone,
          fullName: fullName.trim(),
          role,
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(department ? { department } : {}),
          ...(year ? { year: Number(year) } : {}),
          ...(bio.trim() ? { bio: bio.trim() } : {}),
          ...(role === 'HOSTELLER'
            ? {
                hostelLocation: {
                  block: block.trim(),
                  ...(roomNumber.trim() ? { roomNumber: roomNumber.trim() } : {}),
                  ...(availableFrom ? { availableFrom } : {}),
                  ...(availableTo ? { availableTo } : {}),
                  ...(meetingSpot.trim() ? { meetingSpot: meetingSpot.trim() } : {}),
                },
              }
            : {
                geoLocation: {
                  ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
                  ...(mapsUrl.trim() ? { googleMapsUrl: mapsUrl.trim() } : {}),
                  ...(address.trim() ? { address: address.trim() } : {}),
                  source: coords ? 'gps' : mapsUrl.trim() ? 'maps_link' : 'manual',
                },
              }),
        },
      })

      // The account now exists and the session cookie is set, so the avatar can
      // be uploaded. A failure here is not worth blocking signup over.
      if (avatarFile) {
        try {
          const form = new FormData()
          form.append('kind', 'image')
          form.append('files', avatarFile)

          const uploaded = await api<{ files: Array<{ url: string }> }>('/api/upload', {
            method: 'POST',
            body: form,
          })

          const url = uploaded.files[0]?.url
          if (url) {
            await api('/api/user/me', { method: 'PATCH', body: { avatarUrl: url } })
          }
        } catch {
          // Photo can be added later from settings.
        }
      }

      window.location.href = nextPath ?? '/home'
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        if (caught.fields) setFields(caught.fields)
        // Send the user back to whichever step owns the invalid field.
        const bad = Object.keys(caught.fields ?? {})
        if (bad.some((key) => key.startsWith('hostelLocation') || key.startsWith('geoLocation'))) {
          setStep('location')
        } else if (bad.some((key) => ['fullName', 'email', 'department', 'year'].includes(key))) {
          setStep('identity')
        }
      } else {
        setError('Could not create your account. Check your connection.')
      }
      setSubmitting(false)
    }
  }

  const stepIndex = step === 'identity' ? 0 : step === 'role' ? 1 : 2

  return (
    <div>
      <ProgressDots current={stepIndex} total={3} />

      <AnimatePresence mode="wait" initial={false}>
        {step === 'identity' && (
          <StepShell key="identity">
            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-[var(--color-ink)]">
              Tell us who you are
            </h1>
            <p className="mt-1.5 text-[14px] text-[var(--color-ink-muted)]">
              This is what other students see next to your listings.
            </p>

            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-4">
                <label
                  className={cn(
                    'relative grid h-16 w-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full',
                    'border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface-sunken)]',
                    'text-[var(--color-ink-subtle)] transition-colors hover:border-[var(--color-ink-subtle)]',
                  )}
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[11px] font-medium">Photo</span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={pickAvatar}
                    className="sr-only"
                    aria-label="Profile photo"
                  />
                </label>

                <div className="min-w-0 flex-1">
                  <Input
                    label="Full name"
                    autoFocus
                    autoComplete="name"
                    placeholder="Aarav Sharma"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    error={fields.fullName}
                  />
                </div>
              </div>

              <Input
                type="email"
                label="VIT email (optional)"
                autoComplete="email"
                placeholder="you@vitbhopal.ac.in"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={fields.email}
                hint={
                  !fields.email
                    ? 'Verify it later to get the VIT badge on your profile.'
                    : undefined
                }
              />

              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Department"
                  placeholder="Select"
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                  error={fields.department}
                >
                  {DEPARTMENTS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>

                <Select
                  label="Year"
                  placeholder="Select"
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                  error={fields.year}
                >
                  {YEAR_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>

              {error && <ErrorBanner message={error} />}

              <Button
                size="lg"
                fullWidth
                disabled={!identityValid}
                onClick={() => setStep('role')}
              >
                Continue
              </Button>
            </div>
          </StepShell>
        )}

        {step === 'role' && (
          <StepShell key="role">
            <BackLink onClick={() => setStep('identity')} label="Back" />

            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-[var(--color-ink)]">
              Where do you stay?
            </h1>
            <p className="mt-1.5 text-[14px] text-[var(--color-ink-muted)]">
              This decides how buyers arrange a pickup with you.
            </p>

            <div className="mt-6 space-y-2.5">
              {ROLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setRole(option.value)
                    setStep('location')
                  }}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-[var(--radius-md)] border p-4 text-left transition-colors',
                    role === option.value
                      ? 'border-[var(--color-ink)] bg-[var(--color-surface-hover)]'
                      : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)]',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-[var(--color-ink)]">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-[var(--color-ink-muted)]">
                      {option.description}
                    </span>
                  </span>
                  {role === option.value && (
                    <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-[var(--color-ink)]" />
                  )}
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {step === 'location' && (
          <StepShell key="location">
            <BackLink onClick={() => setStep('role')} label="Change role" />

            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-[var(--color-ink)]">
              {role === 'HOSTELLER' ? 'Your block' : 'Your pickup area'}
            </h1>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
              {role === 'HOSTELLER'
                ? 'Only shared once you start a chat. Never shown on your listings.'
                : 'Used to show buyers roughly how far you are. Your exact address stays private.'}
            </p>

            <div className="mt-6 space-y-4">
              {role === 'HOSTELLER' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="Block"
                      placeholder="Select"
                      value={block}
                      onChange={(event) => setBlock(event.target.value)}
                      error={fields['hostelLocation.block']}
                    >
                      {HOSTEL_BLOCKS.map((item) => (
                        <option key={item} value={item}>
                          {hostelBlockLabel(item)}
                        </option>
                      ))}
                    </Select>

                    <Input
                      label="Room (optional)"
                      placeholder="405"
                      value={roomNumber}
                      onChange={(event) => setRoomNumber(event.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="time"
                      label="Available from"
                      value={availableFrom}
                      onChange={(event) => setAvailableFrom(event.target.value)}
                    />
                    <Input
                      type="time"
                      label="Available to"
                      value={availableTo}
                      onChange={(event) => setAvailableTo(event.target.value)}
                    />
                  </div>

                  <Input
                    label="Preferred meeting spot (optional)"
                    placeholder="Block D reception"
                    value={meetingSpot}
                    onChange={(event) => setMeetingSpot(event.target.value)}
                  />
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={detectLocation}
                    disabled={locatingState === 'locating'}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[var(--radius-md)] border p-4 text-left transition-colors',
                      coords
                        ? 'border-[var(--color-success)] bg-[var(--color-success-soft)]'
                        : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)]',
                    )}
                  >
                    <MapPinIcon
                      className={cn(
                        'h-5 w-5 shrink-0',
                        coords ? 'text-[var(--color-success)]' : 'text-[var(--color-ink-muted)]',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium text-[var(--color-ink)]">
                        {coords ? 'Location captured' : 'Use my current location'}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-[var(--color-ink-muted)]">
                        {locatingState === 'locating' && 'Finding you…'}
                        {locatingState === 'failed' &&
                          'Could not get a fix. Paste a Maps link instead.'}
                        {coords && `${coords.lat}, ${coords.lng}`}
                        {locatingState === 'idle' && !coords && 'Fastest and most accurate'}
                      </span>
                    </span>
                  </button>

                  <Divider label="or" />

                  <Input
                    label="Google Maps link"
                    placeholder="https://maps.app.goo.gl/…"
                    value={mapsUrl}
                    onChange={(event) => setMapsUrl(event.target.value)}
                    error={fields['geoLocation.googleMapsUrl']}
                  />

                  <Input
                    label="Area or landmark"
                    placeholder="Kolar Road, Bhopal"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    error={fields['geoLocation.address']}
                  />
                </>
              )}

              <Textarea
                label="Short bio (optional)"
                placeholder="Third-year CSE. Selling my old lab gear."
                value={bio}
                maxLength={280}
                onChange={(event) => setBio(event.target.value)}
                className="min-h-[80px]"
              />

              {error && <ErrorBanner message={error} />}

              <Button
                size="lg"
                fullWidth
                loading={submitting}
                disabled={!canSubmit}
                onClick={() => void submit()}
              >
                Create my account
              </Button>
            </div>
          </StepShell>
        )}
      </AnimatePresence>
    </div>
  )
}

function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="mb-7 flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-1 flex-1 rounded-full transition-colors duration-300',
            index <= current ? 'bg-[var(--color-ink)]' : 'bg-[var(--color-line)]',
          )}
        />
      ))}
    </div>
  )
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
    >
      <ArrowLeftIcon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-[var(--color-line)]" />
      <span className="text-[12px] text-[var(--color-ink-subtle)]">{label}</span>
      <span className="h-px flex-1 bg-[var(--color-line)]" />
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-[10px] border border-[var(--color-danger)]/25 bg-[var(--color-danger-soft)] px-3 py-2.5 text-[13px] leading-snug text-[var(--color-danger)]"
    >
      {message}
    </p>
  )
}
