const tones: Record<string, string> = {
  active: 'ok',
  scheduled: 'info',
  expired: 'warn',
  cancelled: 'muted',
  paid: 'ok',
  pending: 'warn',
  partial: 'info',
  successful: 'ok',
};

export function StatusPill({ value }: { value: string }) {
  return <span className={`status-pill tone-${tones[value] || 'muted'}`}>{value}</span>;
}
