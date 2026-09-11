export function authErrorMessage(error: {message?: string} | null): string {
  const message = error?.message?.trim() ?? '';
  const normalized = message.toLowerCase();

  if (!message) {
    return 'Something went wrong. Try again.';
  }
  if (normalized.includes('invalid login credentials')) {
    return 'That email and password did not match.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Confirm your email, then try signing in again.';
  }
  if (normalized.includes('user already registered')) {
    return 'An account with that email already exists. Sign in instead.';
  }
  if (normalized.includes('password should be at least')) {
    return 'Use a password with at least 6 characters.';
  }
  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return 'Too many attempts. Wait a moment, then try again.';
  }
  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Could not reach the server. Check your connection.';
  }
  return message;
}

export function dataErrorMessage(error: {message?: string} | null): string {
  const message = error?.message?.trim() ?? '';
  const normalized = message.toLowerCase();

  if (!message) {
    return 'Could not load your data. Try again.';
  }
  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Could not reach the server. Check your connection.';
  }
  if (normalized.includes('jwt') || normalized.includes('not authenticated')) {
    return 'Your session expired. Sign in again.';
  }
  return message;
}
