'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import type { SerializedConversation } from '@/lib/conversations'
import { api, ApiError } from '@/lib/client/fetcher'
import { cn } from '@/lib/utils'
import { REPORT_REASONS } from '@/lib/constants'
import { Sheet, ConfirmDialog } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { BanIcon, FlagIcon, TrashIcon } from '@/components/ui/icons'

/**
 * Per-thread actions: archive, block, report, clear.
 *
 * Blocking and clearing are destructive enough to warrant a confirmation step;
 * archiving is reversible from the list, so it applies straight away.
 */
export function ThreadMenu({
  open,
  onClose,
  conversation,
  blockedByMe,
}: {
  open: boolean
  onClose: () => void
  conversation: SerializedConversation
  blockedByMe: boolean
}) {
  const router = useRouter()
  const toast = useToast()

  const [reportOpen, setReportOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  async function archive() {
    onClose()
    try {
      await api(`/api/conversations/${conversation.id}`, {
        method: 'PATCH',
        body: { isArchived: !conversation.isArchived },
      })
      toast.success(conversation.isArchived ? 'Moved to inbox' : 'Archived')
      router.push('/chats')
      router.refresh()
    } catch {
      toast.error('Could not update that.')
    }
  }

  async function toggleBlock() {
    setBusy(true)
    try {
      if (blockedByMe) {
        await api(`/api/blocks?userId=${conversation.other.id}`, { method: 'DELETE' })
        toast.success('Unblocked')
      } else {
        await api('/api/blocks', { method: 'POST', body: { userId: conversation.other.id } })
        toast.success('Blocked. They can no longer message you.')
      }
      setBlockOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update that.')
    } finally {
      setBusy(false)
    }
  }

  async function clearHistory() {
    setBusy(true)
    try {
      await api(`/api/conversations/${conversation.id}`, { method: 'DELETE' })
      toast.success('Conversation cleared')
      router.push('/chats')
      router.refresh()
    } catch {
      toast.error('Could not clear that.')
      setBusy(false)
      setClearOpen(false)
    }
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Click-away layer. Sits under the menu but over everything else. */}
            <div className="fixed inset-0 z-[var(--z-nav)]" onClick={onClose} aria-hidden />

            <motion.div
              role="menu"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'absolute right-0 top-[calc(100%+6px)] z-[var(--z-modal)] w-52 overflow-hidden rounded-[var(--radius-md)] p-1',
                'border border-[var(--color-line)] bg-[var(--color-surface-raised)] shadow-[var(--shadow-lg)]',
              )}
            >
              <MenuItem onClick={() => void archive()}>
                {conversation.isArchived ? 'Move to inbox' : 'Archive chat'}
              </MenuItem>

              <MenuItem
                onClick={() => {
                  onClose()
                  setReportOpen(true)
                }}
                icon={<FlagIcon className="h-4 w-4" />}
              >
                Report
              </MenuItem>

              <MenuItem
                onClick={() => {
                  onClose()
                  setBlockOpen(true)
                }}
                icon={<BanIcon className="h-4 w-4" />}
                danger={!blockedByMe}
              >
                {blockedByMe ? 'Unblock' : 'Block'}
              </MenuItem>

              <MenuItem
                onClick={() => {
                  onClose()
                  setClearOpen(true)
                }}
                icon={<TrashIcon className="h-4 w-4" />}
                danger
              >
                Clear history
              </MenuItem>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        conversationId={conversation.id}
      />

      <ConfirmDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        onConfirm={() => void toggleBlock()}
        loading={busy}
        destructive={!blockedByMe}
        title={blockedByMe ? 'Unblock this person?' : `Block ${conversation.other.fullName}?`}
        description={
          blockedByMe
            ? 'You will be able to message each other again.'
            : 'Neither of you will be able to message the other. Your existing chats stay archived.'
        }
        confirmLabel={blockedByMe ? 'Unblock' : 'Block'}
      />

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => void clearHistory()}
        loading={busy}
        title="Clear this conversation?"
        description="It disappears from your list. The other person keeps their copy."
        confirmLabel="Clear"
      />
    </>
  )
}

function MenuItem({
  children,
  onClick,
  icon,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  icon?: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors',
        danger
          ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]'
          : 'text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function ReportSheet({
  open,
  onClose,
  conversationId,
}: {
  open: boolean
  onClose: () => void
  conversationId: string
}) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!reason) return
    setSubmitting(true)

    try {
      await api('/api/reports', {
        method: 'POST',
        body: {
          targetType: 'CONVERSATION',
          conversationId,
          reason,
          details: details.trim() || undefined,
        },
      })
      toast.success('Report sent. Our team will review it.')
      onClose()
      setReason('')
      setDetails('')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not send that report.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Report this conversation"
      description="Moderators can review the messages in a reported chat for 30 days."
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button fullWidth loading={submitting} disabled={!reason} onClick={() => void submit()}>
            Send report
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Select
          label="Reason"
          placeholder="Choose a reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        >
          {REPORT_REASONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>

        <Textarea
          label="Details (optional)"
          placeholder="What happened?"
          value={details}
          maxLength={1000}
          onChange={(event) => setDetails(event.target.value)}
        />
      </div>
    </Sheet>
  )
}
