export const isSignalExpired = (expiresAt: Date): boolean => expiresAt.getTime() <= Date.now();
