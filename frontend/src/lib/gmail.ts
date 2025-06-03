export function connectGmail(userId: string) {
  if (!userId) throw new Error('User ID is required to connect Gmail.');
  // Optionally, send timezone to backend first if needed
  // Then redirect to backend OAuth endpoint
  window.location.href = `${import.meta.env.VITE_API_URL}/api/auth/google?user_id=${userId}`;
}

export async function disconnectGmail(userId: string) {
  await fetch(`${import.meta.env.VITE_API_URL}/api/gmail/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
} 