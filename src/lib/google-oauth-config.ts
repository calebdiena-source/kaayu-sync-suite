const PROJECT_ID = "3479a160-96fa-4b26-ae79-16c6abaa3b14";

export const GOOGLE_OAUTH_ORIGINS = {
  production: `https://project--${PROJECT_ID}.lovable.app`,
  preview: `https://project--${PROJECT_ID}-dev.lovable.app`,
} as const;

export const GOOGLE_REDIRECT_URIS = {
  production: `${GOOGLE_OAUTH_ORIGINS.production}/api/public/google/callback`,
  preview: `${GOOGLE_OAUTH_ORIGINS.preview}/api/public/google/callback`,
} as const;
