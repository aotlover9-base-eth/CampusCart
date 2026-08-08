'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'

const SESSION_KEY = 'campuscart-splash-shown'

export function SplashScreen() {
  const reduceMotion = useReducedMotion()
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  const dismiss = () => {
    setExiting(true)
    setTimeout(() => {
      setVisible(false)
    }, 450)
  }

  useEffect(() => {
    if (reduceMotion) return

    let alreadyShown = false
    try {
      alreadyShown = sessionStorage.getItem(SESSION_KEY) === '1'
    } catch {
      // Private browsing protection
    }
    if (alreadyShown) return

    setVisible(true)
    try {
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      // Storage unavailable
    }

    // Auto dismiss after 2.1s
    const timer = setTimeout(() => {
      dismiss()
    }, 2100)

    return () => clearTimeout(timer)
  }, [reduceMotion])

  if (!visible) return null

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="splash-overlay"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.03, filter: 'blur(8px)' }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          onClick={dismiss}
          className="fixed inset-0 z-[var(--z-splash)] grid cursor-pointer select-none place-items-center bg-[#070a12] text-slate-100 overflow-hidden"
          role="status"
          aria-label="CampusCart is starting. Click to skip."
        >
          {/* Ambient Glow Background */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.18)_0%,transparent_65%)] pointer-events-none" />

          {/* Subtle Grid Lines Overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center px-6">
            {/* Animated Logo Mark with Pulsing Glow */}
            <div className="relative">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: [0.6, 1.2, 1], opacity: [0, 0.4, 0.2] }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                className="absolute inset-0 -m-4 rounded-full bg-emerald-500/20 blur-xl pointer-events-none"
              />
              <CartMark />
            </div>

            {/* Title with Gradient Text */}
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 text-[30px] font-bold tracking-tight text-white sm:text-[36px]"
            >
              Campus<span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">Cart</span>
            </motion.h1>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="mt-2 text-center text-[13.5px] font-medium tracking-wide text-emerald-400/90 uppercase sm:text-[14.5px]"
            >
              The VIT Bhopal Student Marketplace
            </motion.p>

            {/* Sleek Animated Progress Hairline */}
            <div className="mt-7 h-1 w-36 overflow-hidden rounded-full bg-slate-800/80 p-0.5 backdrop-blur">
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.8, ease: 'easeInOut' }}
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 shadow-[0_0_12px_rgba(16,185,129,0.8)]"
              />
            </div>

            {/* Click to skip hint */}
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              transition={{ delay: 1.4, duration: 0.4 }}
              className="mt-4 text-[11.5px] text-slate-400 tracking-wider font-mono uppercase"
            >
              Click anywhere to skip
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function CartMark() {
  const draw: Variants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: (index: number) => ({
      pathLength: 1,
      opacity: 1,
      transition: {
        pathLength: { delay: index * 0.22, duration: 0.7, ease: [0.4, 0, 0.2, 1] },
        opacity: { delay: index * 0.22, duration: 0.05 },
      },
    }),
  }

  return (
    <motion.svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="h-20 w-20 text-emerald-400 sm:h-24 sm:w-24 drop-shadow-[0_0_16px_rgba(16,185,129,0.4)]"
      initial="hidden"
      animate="visible"
    >
      {/* Handle */}
      <motion.path
        d="M4 6h3.2a2 2 0 0 1 1.94 1.51L9.6 9.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={draw}
        custom={0}
      />
      {/* Basket */}
      <motion.path
        d="M9.6 9.5h16.2a1.6 1.6 0 0 1 1.56 1.96l-1.72 7.4a3.2 3.2 0 0 1-3.12 2.48H13.3a3.2 3.2 0 0 1-3.13-2.55L8.1 8.9"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={draw}
        custom={1}
      />

      {/* Wheels with pop animation and glow */}
      {[13.4, 23.4].map((cx, index) => (
        <motion.circle
          key={cx}
          cx={cx}
          cy="26"
          r="2.2"
          fill="currentColor"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            delay: 0.75 + index * 0.1,
            type: 'spring',
            stiffness: 500,
            damping: 16,
          }}
          style={{ originX: `${cx}px`, originY: '26px' }}
        />
      ))}
    </motion.svg>
  )
}
