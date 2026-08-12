import { FeedSkeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto max-w-[var(--container-max)] px-4 py-5 sm:py-7">
      <FeedSkeleton count={8} />
    </div>
  )
}
