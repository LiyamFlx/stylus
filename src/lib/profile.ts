/**
 * Local user profile (no account, no backend). Just a display name kept in
 * localStorage so the sidebar can greet the user and show an avatar.
 */

export interface Profile {
  name: string;
  /** Warm, dimmed low-light view to reduce late-night eye strain. */
  nightMode: boolean;
  /** Damp jitter on the live stroke for steadier handwriting. */
  stabilizer: boolean;
}

const KEY = 'stylus.profile.v1';
const DEFAULT: Profile = { name: 'You', nightMode: false, stabilizer: false };

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      name:
        typeof parsed.name === 'string' && parsed.name.trim()
          ? parsed.name
          : DEFAULT.name,
      nightMode: parsed.nightMode === true,
      stabilizer: parsed.stabilizer === true,
    };
  } catch {
    return DEFAULT;
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // ignore (private mode / quota)
  }
}

/** Up-to-two-letter avatar initials derived from the name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
