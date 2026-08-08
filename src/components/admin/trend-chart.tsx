'use client'

import { useMemo, useState } from 'react'
import type { DailyPoint } from '@/lib/admin/stats'
import { cn } from '@/lib/utils'

/**
 * 30-day trend: new signups and new listings.
 *
 * Two series over time → multi-line, categorical colour. The palette is the
 * project accent plus a validated orange; both slots clear the lightness band,
 * chroma floor, CVD separation, normal-vision floor, and 3:1 contrast against
 * the light and dark surfaces. Identity is never colour-alone — each line is
 * direct-labelled and there is a table view.
 *
 * Hand-rolled SVG rather than a charting library: two polylines and a crosshair
 * do not justify shipping a dependency to every admin page load.
 */

const WIDTH = 720
const HEIGHT = 200
const PAD = { top: 12, right: 16, bottom: 22, left: 30 }

const SERIES = [
  { key: 'users' as const, label: 'Signups', color: 'var(--viz-1)' },
  { key: 'listings' as const, label: 'Listings', color: 'var(--viz-2)' },
]

export function TrendChart({ points }: { points: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const { max, plot } = useMemo(() => {
    const peak = Math.max(1, ...points.flatMap((p) => [p.users, p.listings]))
    // Round the ceiling up so the axis label is a clean number.
    const ceiling = Math.ceil(peak / 5) * 5 || 5

    const innerW = WIDTH - PAD.left - PAD.right
    const innerH = HEIGHT - PAD.top - PAD.bottom
    const step = points.length > 1 ? innerW / (points.length - 1) : 0

    const x = (index: number) => PAD.left + index * step
    const y = (value: number) => PAD.top + innerH - (value / ceiling) * innerH

    return { max: ceiling, plot: { x, y, innerH, step } }
  }, [points])

  const active = hover != null ? points[hover] : null

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    // Map the pointer into the SVG's own coordinate space, which is scaled by
    // the responsive viewBox.
    const svgX = ((event.clientX - rect.left) / rect.width) * WIDTH
    const index = Math.round((svgX - PAD.left) / (plot.step || 1))
    setHover(Math.min(points.length - 1, Math.max(0, index)))
  }

  return (
    <figure className="viz-root m-0">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {SERIES.map((series) => (
          <span key={series.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-0.5 w-3.5 rounded-full"
              style={{ background: series.color }}
            />
            <span className="text-[12px] text-[var(--color-ink-muted)]">{series.label}</span>
          </span>
        ))}

        <button
          type="button"
          onClick={() => setShowTable((value) => !value)}
          className="ml-auto text-[12px] text-[var(--color-ink-muted)] underline underline-offset-2 hover:text-[var(--color-ink)]"
        >
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-[220px] overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-line)]">
          <table className="w-full text-[12.5px]">
            <caption className="sr-only">
              New signups and new listings per day over the last 30 days
            </caption>
            <thead className="sticky top-0 bg-[var(--color-surface-sunken)]">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-left font-medium">Day</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Signups</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Listings</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.day} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-1.5 text-[var(--color-ink-muted)]">{point.day}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{point.users}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{point.listings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="w-full"
            role="img"
            aria-label={`New signups and listings per day over the last ${points.length} days. Peak ${max} per day.`}
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
          >
            {/* Recessive gridlines — three is enough to read a value against. */}
            {[0, 0.5, 1].map((fraction) => {
              const y = PAD.top + plot.innerH * fraction
              return (
                <g key={fraction}>
                  <line
                    x1={PAD.left}
                    x2={WIDTH - PAD.right}
                    y1={y}
                    y2={y}
                    stroke="var(--color-line)"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 6}
                    y={y + 3.5}
                    textAnchor="end"
                    className="fill-[var(--color-ink-subtle)] text-[9px] tabular-nums"
                  >
                    {Math.round(max * (1 - fraction))}
                  </text>
                </g>
              )
            })}

            {SERIES.map((series) => (
              <polyline
                key={series.key}
                fill="none"
                stroke={series.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points
                  .map((point, index) => `${plot.x(index)},${plot.y(point[series.key])}`)
                  .join(' ')}
              />
            ))}

            {active && hover != null && (
              <g>
                <line
                  x1={plot.x(hover)}
                  x2={plot.x(hover)}
                  y1={PAD.top}
                  y2={PAD.top + plot.innerH}
                  stroke="var(--color-line-strong)"
                  strokeWidth={1}
                />
                {SERIES.map((series) => (
                  <circle
                    key={series.key}
                    cx={plot.x(hover)}
                    cy={plot.y(active[series.key])}
                    r={4}
                    fill={series.color}
                    // A 2px surface ring keeps overlapping markers separable.
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            )}

            {/* First and last date, so the window is unambiguous. */}
            <text
              x={PAD.left}
              y={HEIGHT - 6}
              className="fill-[var(--color-ink-subtle)] text-[9px]"
            >
              {points[0]?.day.slice(5)}
            </text>
            <text
              x={WIDTH - PAD.right}
              y={HEIGHT - 6}
              textAnchor="end"
              className="fill-[var(--color-ink-subtle)] text-[9px]"
            >
              {points.at(-1)?.day.slice(5)}
            </text>
          </svg>

          {active && hover != null && (
            <div
              role="status"
              className={cn(
                'pointer-events-none absolute top-1 rounded-[var(--radius-sm)] border px-2.5 py-1.5',
                'border-[var(--color-line)] bg-[var(--color-surface-raised)] shadow-[var(--shadow-md)]',
              )}
              style={{
                // Flip the tooltip to the left of the crosshair past halfway so
                // it never runs off the right edge.
                left: `${(plot.x(hover) / WIDTH) * 100}%`,
                transform:
                  hover > points.length / 2 ? 'translateX(-105%)' : 'translateX(5%)',
              }}
            >
              <p className="text-[11px] text-[var(--color-ink-subtle)]">{active.day}</p>
              {SERIES.map((series) => (
                <p key={series.key} className="flex items-center gap-1.5 text-[12px]">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: series.color }}
                  />
                  <span className="text-[var(--color-ink-muted)]">{series.label}</span>
                  <span className="ml-auto font-medium tabular-nums text-[var(--color-ink)]">
                    {active[series.key]}
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  )
}
