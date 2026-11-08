// Password rules (same spirit as Django's default validators):
//   minimum length 8, not a common password, not entirely numeric,
//   not too similar to the email / first name / last name.
// Returns the first problem as a message, or null when the password is fine.

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234",
  "qwerty123", "qwertyui", "qwertyuiop", "asdfghjk", "asdfghjkl", "zxcvbnm1", "1q2w3e4r",
  "1qaz2wsx", "iloveyou", "sunshine", "princess", "football", "baseball", "superman",
  "trustno1", "welcome1", "welcome123", "letmein1", "abc12345", "abcd1234", "admin123",
  "administrator", "changeme", "monkey123", "dragon123", "master123", "computer", "internet",
  "whatever", "starwars", "michael1", "jennifer", "shadow12", "football1", "charlie1",
  "qwerty12", "aa123456", "india123", "pakistan", "password!", "secret123", "test1234",
]);

export const MIN_PASSWORD_LENGTH = 8;

/** Length of the longest common subsequence (strings here are short, O(n*m) is fine) */
function lcsLength(a: string, b: string): number {
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1]);
      diag = temp;
    }
  }
  return prev[b.length];
}

/** 0..1, similar to Python's difflib.SequenceMatcher ratio */
export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  return (2 * lcsLength(a, b)) / (a.length + b.length);
}

export function passwordProblem(
  password: string,
  user: { email: string; first_name?: string; last_name?: string },
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `This password is too short. It must contain at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return "This password is too common.";
  if (/^\d+$/.test(password)) return "This password is entirely numeric.";

  const attributes: [string, string | undefined][] = [
    ["email address", user.email],
    ["email address", user.email.split("@")[0]],
    ["first name", user.first_name],
    ["last name", user.last_name],
  ];
  for (const [label, raw] of attributes) {
    const value = (raw ?? "").toLowerCase().trim();
    if (value.length < 3) continue;
    if (lower.includes(value) || value.includes(lower) || similarity(lower, value) >= 0.7) {
      return `The password is too similar to the ${label}.`;
    }
  }
  return null;
}
