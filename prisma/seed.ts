import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import 'dotenv/config'

/**
 * Seeds the category tree, feature flags, and default site settings.
 * Idempotent — safe to run repeatedly.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
const db = new PrismaClient({ adapter })

/** Top-level categories and their children, in display order. */
const CATEGORY_TREE: Array<{
  name: string
  icon: string
  children?: string[]
  allowsCustomLabel?: boolean
}> = [
  {
    name: 'Electronics',
    icon: 'electronics',
    children: ['Mobiles', 'Laptops', 'Tablets', 'Gaming', 'Audio', 'Accessories'],
  },
  {
    name: 'Study Material',
    icon: 'books',
    children: ['Books', 'Notes', 'Lab Equipment', 'Stationery', 'Calculators'],
  },
  {
    name: 'Furniture',
    icon: 'furniture',
    children: ['Chairs', 'Tables', 'Storage', 'Mattresses', 'Lamps'],
  },
  {
    name: 'Hostel Essentials',
    icon: 'furniture',
    children: ['Kitchen', 'Bedding', 'Appliances', 'Cleaning', 'Decor'],
  },
  {
    name: 'Vehicles',
    icon: 'cycle',
    children: ['Cycles', 'Scooters', 'Skateboards', 'Spare Parts'],
  },
  {
    name: 'Fashion',
    icon: 'fashion',
    children: ['Clothing', 'Shoes', 'Bags', 'Watches', 'Accessories'],
  },
  {
    name: 'Sports & Fitness',
    icon: 'sports',
    children: ['Gym Equipment', 'Cricket', 'Football', 'Badminton', 'Cycling Gear'],
  },
  {
    name: 'Musical Instruments',
    icon: 'music',
    children: ['Guitars', 'Keyboards', 'Percussion', 'Audio Gear'],
  },
  {
    name: 'Tickets & Events',
    icon: 'tickets',
    children: ['Concerts', 'Fests', 'Workshops', 'Travel'],
  },
  {
    name: 'Room Rentals',
    icon: 'furniture',
    children: ['PG', 'Flats', 'Roommate Wanted'],
  },
  {
    name: 'Services',
    icon: 'services',
    children: ['Tutoring', 'Freelancing', 'Design', 'Repairs', 'Photography'],
  },
  { name: 'Lost & Found', icon: 'lost_found' },
  // The catch-all: sellers pick this and type their own label.
  { name: 'Other', icon: 'other', allowsCustomLabel: true },
]

const FEATURE_FLAGS = [
  { key: 'listing_approval', isEnabled: false, description: 'Require admin approval before listings go live' },
  { key: 'subscriptions', isEnabled: false, description: 'CampusCart Plus subscriptions (₹29/month)' },
  { key: 'ratings', isEnabled: false, description: 'Buyer and seller ratings' },
  { key: 'maintenance_mode', isEnabled: false, description: 'Show a maintenance screen to all non-admins' },
  { key: 'promoted_listings', isEnabled: false, description: 'Paid listing placement' },
  { key: 'campus_delivery', isEnabled: false, description: 'Campus courier delivery option' },
]

const SITE_SETTINGS = [
  { key: 'site.name', value: 'CampusCart', description: 'Display name' },
  { key: 'site.tagline', value: 'The VIT Bhopal marketplace', description: 'Tagline' },
  { key: 'site.support_email', value: 'support@campuscart.app', description: 'Support contact' },
  { key: 'listing.max_images', value: 15, description: 'Images allowed per listing' },
  { key: 'listing.max_videos', value: 3, description: 'Videos allowed per listing' },
  { key: 'listing.auto_expire_days', value: 60, description: 'Days before a listing is auto-hidden' },
  { key: 'phone.request_expiry_days', value: 7, description: 'Days a phone request stays pending' },
  { key: 'moderation.chat_access_days', value: 30, description: 'Days an admin may read a reported chat' },
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
}

async function main(): Promise<void> {
  console.info('Seeding CampusCart…\n')

  let categoryCount = 0

  for (const [index, parent] of CATEGORY_TREE.entries()) {
    const parentSlug = slugify(parent.name)

    const parentRow = await db.category.upsert({
      where: { slug: parentSlug },
      update: {
        name: parent.name,
        icon: parent.icon,
        sortOrder: index,
        allowsCustomLabel: parent.allowsCustomLabel ?? false,
      },
      create: {
        name: parent.name,
        slug: parentSlug,
        icon: parent.icon,
        sortOrder: index,
        allowsCustomLabel: parent.allowsCustomLabel ?? false,
      },
    })
    categoryCount += 1

    for (const [childIndex, childName] of (parent.children ?? []).entries()) {
      // Child slugs are namespaced so "Accessories" can exist under more than
      // one parent without colliding.
      const childSlug = `${parentSlug}-${slugify(childName)}`

      await db.category.upsert({
        where: { slug: childSlug },
        update: { name: childName, parentId: parentRow.id, sortOrder: childIndex },
        create: {
          name: childName,
          slug: childSlug,
          parentId: parentRow.id,
          sortOrder: childIndex,
          icon: parent.icon,
        },
      })
      categoryCount += 1
    }
  }

  console.info(`  ✓ ${categoryCount} categories`)

  for (const flag of FEATURE_FLAGS) {
    await db.featureFlag.upsert({
      where: { key: flag.key },
      // Never clobber a flag an admin has already toggled.
      update: { description: flag.description },
      create: flag,
    })
  }
  console.info(`  ✓ ${FEATURE_FLAGS.length} feature flags`)

  for (const setting of SITE_SETTINGS) {
    await db.siteSetting.upsert({
      where: { key: setting.key },
      update: { description: setting.description },
      create: setting,
    })
  }
  console.info(`  ✓ ${SITE_SETTINGS.length} site settings`)

  console.info('\nSeed complete.\n')
}

main()
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
