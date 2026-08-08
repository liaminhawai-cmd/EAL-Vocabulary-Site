// Privacy-first local-only adapter.
// Word Builder does not use accounts or cloud sync in the public build.
export function isConfigured() { return false; }
export async function initSupabase() { return null; }
export function getClient() { return null; }
export async function getUser() { return null; }
export async function signInWithEmail() { throw new Error('Accounts are not enabled.'); }
export async function signInWithPassword() { throw new Error('Accounts are not enabled.'); }
export async function signUpWithPassword() { throw new Error('Accounts are not enabled.'); }
export async function signOut() {}
export function onAuthChange() { return () => {}; }
export async function pullCollection() { return []; }
export async function pushCollectionItem() {}
export async function logEvent() {}
