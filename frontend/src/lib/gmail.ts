export function connectGmail(userId: string) {
  if (!userId) throw new Error('User ID is required to connect Gmail.');
  // Optionally, send timezone to backend first if needed
  // Then redirect to backend OAuth endpoint
  window.location.href = `http://localhost:3001/api/auth/google?user_id=${userId}`;
}

export async function disconnectGmail(userId: string) {
  await fetch('http://localhost:3001/api/gmail/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
} 