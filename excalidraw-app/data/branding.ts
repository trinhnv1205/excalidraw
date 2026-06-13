/**
 * White-label branding configuration.
 *
 * Every value is driven by a build-time `VITE_APP_BRAND_*` environment variable
 * so the same codebase can be shipped as a fully re-branded product without
 * touching source. Sensible Excalidraw defaults are used when unset.
 *
 * Consumed by `applyBranding()` (called from the app entry point) and available
 * to any component that wants brand-aware copy or links.
 */

const env = import.meta.env;

const str = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() !== "" ? value : fallback;

export interface Branding {
  /** Product name shown in the document title and UI copy. */
  name: string;
  /** Short tagline / document title suffix. */
  tagline: string;
  /** Absolute or root-relative URL to the brand logo (optional). */
  logoUrl: string | null;
  /** Favicon URL (optional – overrides the bundled favicons). */
  faviconUrl: string | null;
  /** Primary brand colour (used for the theme-color meta tag). */
  primaryColor: string;
  /** Marketing / support links. */
  websiteUrl: string | null;
  supportEmail: string | null;
  /** Base URL of the commerce backend (auth + billing API). */
  commerceApiUrl: string | null;
}

export const BRANDING: Branding = {
  name: str(env.VITE_APP_BRAND_NAME, "Excalidraw"),
  tagline: str(env.VITE_APP_BRAND_TAGLINE, "Whiteboard"),
  logoUrl: str(env.VITE_APP_BRAND_LOGO_URL, "") || null,
  faviconUrl: str(env.VITE_APP_BRAND_FAVICON_URL, "") || null,
  primaryColor: str(env.VITE_APP_BRAND_PRIMARY_COLOR, "#6965db"),
  websiteUrl: str(env.VITE_APP_BRAND_WEBSITE_URL, "") || null,
  supportEmail: str(env.VITE_APP_BRAND_SUPPORT_EMAIL, "") || null,
  commerceApiUrl: str(env.VITE_APP_COMMERCE_API_URL, "") || null,
};

/** Whether the deployment has been re-branded away from the defaults. */
export const isWhiteLabelled = (): boolean => BRANDING.name !== "Excalidraw";

/**
 * Apply branding to the live document (title, theme colour, favicon).
 * Safe to call once at startup; a no-op in non-browser environments.
 */
export const applyBranding = (): void => {
  if (typeof document === "undefined") {
    return;
  }

  document.title = BRANDING.tagline
    ? `${BRANDING.name} ${BRANDING.tagline}`
    : BRANDING.name;

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta instanceof HTMLMetaElement && isWhiteLabelled()) {
    themeMeta.content = BRANDING.primaryColor;
  }

  if (BRANDING.faviconUrl) {
    document
      .querySelectorAll<HTMLLinkElement>('link[rel="icon"]')
      .forEach((link) => {
        link.href = BRANDING.faviconUrl as string;
      });
  }
};
