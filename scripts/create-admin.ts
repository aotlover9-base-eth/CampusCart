import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { hashPassword } from '../src/lib/crypto'
import 'dotenv/config'

/**
 * Creates an admin account for the hidden panel.
 *
 * Credentials are prompted interactively and stored as scrypt hashes — they are
 * never written to .env, never hardcoded, and never printed back. Run with:
 *
 *   npm run admin:create
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const db = new PrismaClient({ adapter })

const ROLES = ['SUPER_ADMIN', 'MODERATOR', 'SUPPORT', 'ANALYST'] as const
type Role = (typeof ROLES)[number]

/** Rejects the passwords that actually get compromised. */
function validatePassword(password: string): string | null {
  if (password.length < 12) return 'Password must be at least 12 characters'
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter'
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter'
  if (!/\d/.test(password)) return 'Password must contain a digit'
  if (!/[^\w\s]/.test(password)) return 'Password must contain a symbol'
  if (/^(?:password|admin|campuscart)/i.test(password)) return 'Password is too predictable'
  return null
}

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout })

  try {
    console.info('\n── Create a CampusCart admin ──\n')

    const username = (await rl.question('Username: ')).trim().toLowerCase()
    if (username.length < 3) throw new Error('Username must be at least 3 characters')

    const existing = await db.adminUser.findUnique({
      where: { username },
      select: { id: true },
    })
    if (existing) throw new Error(`An admin named "${username}" already exists`)

    const email = (await rl.question('Email (optional): ')).trim().toLowerCase() || null

    console.info(`\nRoles: ${ROLES.join(', ')}`)
    const roleInput = (await rl.question('Role [MODERATOR]: ')).trim().toUpperCase()
    const role: Role = ROLES.includes(roleInput as Role) ? (roleInput as Role) : 'MODERATOR'

    // Node's readline cannot mask input, so warn rather than pretend otherwise.
    console.info('\nNote: the password will be visible as you type.')
    const password = await rl.question('Password (12+ chars, mixed case, digit, symbol): ')

    const problem = validatePassword(password)
    if (problem) throw new Error(problem)

    const confirm = await rl.question('Confirm password: ')
    if (password !== confirm) throw new Error('Passwords do not match')

    const admin = await db.adminUser.create({
      data: {
        username,
        email,
        role,
        passwordHash: await hashPassword(password),
      },
      select: { id: true, username: true, role: true },
    })

    const panelPath = process.env.ADMIN_PANEL_PATH ?? 'control-a7f3c9'

    console.info('\n  ✓ Admin created')
    console.info(`    username  ${admin.username}`)
    console.info(`    role      ${admin.role}`)
    console.info(`\n  Sign in at: /${panelPath}`)
    console.info('  This route is unlisted — it appears nowhere in the UI.\n')
  } finally {
    rl.close()
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
