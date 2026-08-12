<div align="center">

# 🛒 CampusCart

**The Peer-to-Peer Student Marketplace for College Campuses**

[![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-campuscart.co.in-00E5FF?style=for-the-badge&logo=vercel&logoColor=white)](https://www.campuscart.co.in)
[![Vercel Deployment](https://img.shields.io/badge/⚡%20Vercel-campuscart--nine--zeta.vercel.app-7C4DFF?style=for-the-badge&logo=vercel&logoColor=white)](https://campuscart-nine-zeta.vercel.app/)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/Neon_DB-PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

<br />

<p align="center">
  <b>CampusCart</b> is a high-performance, privacy-focused marketplace designed for college campus communities (VIT Bhopal & beyond). Buy and sell textbooks, electronics, cycles, lab gear, and dorm essentials with instant email OTP authentication, real-time offer bargaining, and verified campus badges.
</p>

</div>

---

## 🌟 Live Demo & Deployments

* 🌐 **Primary Custom Domain**: [https://www.campuscart.co.in](https://www.campuscart.co.in)
* ⚡ **Vercel Production Endpoint**: [https://campuscart-nine-zeta.vercel.app/](https://campuscart-nine-zeta.vercel.app/)

---

## 🔥 Key Features

### 🔐 1. Seamless Email & Password Auth + OTP Verification
* **Campus Email Authentication**: Fast 6-digit OTP verification powered by Nodemailer & Gmail SMTP (`campuscartco.in@gmail.com`).
* **VIT Bhopal Student Verification**: Automatic verified student badge for `@vitbhopal.ac.in` domain users.
* **Streamlined Onboarding**: First-time users select their Department (e.g., SCOPE - CSE), Academic Year (1st, 2nd, 3rd...), Role (Hosteller vs. Day Scholar), and Hostel Block/Room location.

### ⚡ 2. Ultra-Fast Performance & Instant Loading
* **Neon PostgreSQL Connection Pooling**: Uses Neon PgBouncer (`-pooler`) for sub-30ms database queries.
* **App Router Suspense Skeletons (`loading.tsx`)**: 0ms instant visual feedback on button clicks and page transitions.
* **Sharp Image Processing**: Automatic EXIF metadata stripping, WebP re-encoding, and 400px thumbnail generation.
* **Serverless Storage Pipeline**: Dual-fallback local/serverless `/tmp` storage driver with streaming `/api/uploads/[key]` endpoints.

### 🤝 3. Smart Buying, Selling & Bargaining
* **Double-Sided Offer System**: Buyers make structured cash offers; sellers can Accept, Reject, or Counter-offer.
* **Phone Privacy Controls**: Phone numbers are private by default. Buyers request phone approval; sellers control per-listing visibility.
* **Category Search & Trigram Matching**: Postgres trigram fuzzy search finds items even with typos (e.g., "labtop" matches "laptop").

### 🛡️ 4. Restricted Admin & Moderation Panel
* **Unlisted Dynamic Route**: Mounted on a secret environment-configured path (`/admin-...`) that returns 404 to unauthorized scans.
* **Role-Based Moderation**: Ban/suspend accounts, feature listings, approve pending posts, and audit log tracking.
* **Comprehensive Error Boundaries**: Built-in `error.tsx` and `ToastProvider` for zero-crash administrative moderation.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | **Next.js 16 (App Router + Turbopack)** | Fullstack React framework with edge proxy routing |
| **Language** | **TypeScript (Strict)** | End-to-end type safety |
| **Styling** | **Vanilla CSS + Glassmorphism** | Premium dark mode theme tokens & micro-animations |
| **Animations** | **Framer Motion** | Fluid layout morphing & modal transitions |
| **Database** | **Neon PostgreSQL + Prisma 7** | Serverless relational database with PgBouncer connection pooling |
| **Auth & Security** | **JWT (jose) + Nodemailer SMTP** | HTTP-only cookies, 6-digit email OTP delivery |
| **Media Pipeline** | **Sharp + Serverless `/tmp` Storage** | EXIF stripping, WebP compression, video uploads |
| **Deployment** | **Vercel Serverless Platform** | Global edge network & production environment |

---

## 🏗️ System Architecture

```mermaid
graph TD
    User([Campus User]) -->|HTTPS / Edge| Proxy[Next.js 16 Proxy / Middleware]
    Proxy --> Auth{Authenticated?}
    
    Auth -->|Yes| AppRouter[Next.js App Router]
    Auth -->|No| Login[Email & Password / OTP Verify]
    
    Login -->|SMTP OTP| Email[Nodemailer / Gmail SMTP]
    
    AppRouter --> |PgBouncer Pool| NeonDB[(Neon Serverless PostgreSQL)]
    AppRouter --> |Image Processing| Sharp[Sharp WebP Pipeline]
    Sharp --> |Storage Driver| TempDir[Serverless /tmp & /api/uploads]
    
    AdminUser([Admin / Moderator]) -->|Secret Path| AdminPanel[Hidden Moderation Panel]
    AdminPanel -->|Audit Log| NeonDB
```

---

## 🚀 Quick Start (Local Setup)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/aotlover9-base-eth/CampusCart.git
cd CampusCart
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Ensure your `.env` contains:
```env
NODE_ENV="development"
DATABASE_URL="postgresql://neondb_owner:YOUR_KEY@ep-shy-cherry-azbpb07g-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

JWT_ACCESS_SECRET="YOUR_JWT_ACCESS_SECRET"
JWT_REFRESH_SECRET="YOUR_JWT_REFRESH_SECRET"
ADMIN_JWT_SECRET="YOUR_ADMIN_JWT_SECRET"

NEXT_PUBLIC_APP_NAME="CampusCart"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
ADMIN_PANEL_PATH="admin-aotlover9-9415"

OTP_EMAIL_PROVIDER="smtp"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=465
SMTP_USER="campuscartco.in@gmail.com"
SMTP_PASSWORD="YOUR_16_CHAR_APP_PASSWORD"
EMAIL_FROM="CampusCart <campuscartco.in@gmail.com>"
VIT_EMAIL_DOMAIN="vitbhopal.ac.in"
```

### 3. Initialize Database & Run Server
```bash
npm run db:setup      # Apply migrations, search indexes, and seed categories
npm run dev           # Start Next.js development server
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Administrative Account Setup

Create a new administrator account for the hidden admin panel (`/admin-aotlover9-9415`):
```bash
npm run admin:create
```
*You will be interactively prompted for a username, role (SUPER_ADMIN / MODERATOR), and password.*

---

## 📜 Available NPM Scripts

| Script | Action |
| :--- | :--- |
| `npm run dev` | Start development server |
| `npm run build` | Build production bundle (runs `prisma generate` first) |
| `npm run check` | Run strict TypeScript checks & ESLint |
| `npm run db:setup` | Run database migrations, search indexes, and seed |
| `npm run admin:create` | Interactively create an admin user |
| `npm run env:check` | Validate production environment variables |

---

## 🔒 Security & Privacy

* **CSRF Protection**: Double-submit CSRF tokens verified on every mutation.
* **Content Security Policy (CSP)**: Strict headers closing XSS, frame-ancestors, and clickjacking gaps.
* **Private Phone Visibility**: Buyer phone request approval system — phone numbers are never publicly scraped.
* **Audit Logging**: Every administrative action (ban, unfeature, remove, restore) is recorded in an immutable audit trail.

---

<div align="center">

Made with ❤️ for the campus community.

**[CampusCart](https://campuscart-nine-zeta.vercel.app/)** © 2026

</div>
