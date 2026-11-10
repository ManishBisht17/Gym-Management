import type { ReactNode } from 'react';

type AlertProps = {
  tone?: 'error' | 'success';
  children: ReactNode;
};

export function Alert({ tone = 'error', children }: AlertProps) {
  return (
    <p className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
