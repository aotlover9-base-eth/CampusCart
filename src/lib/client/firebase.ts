import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type Auth,
} from 'firebase/auth'

let app: FirebaseApp | null = null
let auth: Auth | null = null

function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID

  if (!apiKey || !projectId) {
    return null
  }

  if (!getApps().length) {
    app = initializeApp({
      apiKey,
      authDomain,
      projectId,
      appId,
    })
  } else {
    app = getApps()[0] ?? null
  }

  return app
}

export function getFirebaseAuth(): Auth | null {
  if (auth) return auth
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return null
  auth = getAuth(firebaseApp)
  return auth
}

let confirmationResultStore: ConfirmationResult | null = null

export async function sendFirebasePhoneOtp(
  phoneNumber: string,
  containerId = 'recaptcha-container',
): Promise<{ ok: boolean; error?: string }> {
  const firebaseAuth = getFirebaseAuth()
  if (!firebaseAuth) {
    return { ok: false, error: 'Firebase is not configured in client environment' }
  }

  try {
    const recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, containerId, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      },
    })

    const confirmationResult = await signInWithPhoneNumber(
      firebaseAuth,
      phoneNumber,
      recaptchaVerifier,
    )

    confirmationResultStore = confirmationResult
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Firebase Phone Auth request failed',
    }
  }
}

export async function verifyFirebasePhoneOtp(
  code: string,
): Promise<{ ok: boolean; idToken?: string; error?: string }> {
  if (!confirmationResultStore) {
    return { ok: false, error: 'No active OTP session found. Please request code again.' }
  }

  try {
    const credential = await confirmationResultStore.confirm(code)
    const idToken = await credential.user.getIdToken()
    return { ok: true, idToken }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid code entered.',
    }
  }
}
