export const fetchPendingSponsorshipCount = async (
  withAuth: (init?: RequestInit) => RequestInit,
  box: 'incoming' | 'outgoing' = 'incoming'
): Promise<number> => {
  const res = await fetch(`/api/sponsorship/requests/pending-count?box=${box}`, withAuth());
  if (!res.ok) return 0;
  const payload = await res.json();
  return Number(payload?.pending_count || 0);
};
