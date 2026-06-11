'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Skip guard on the login page itself
    if (pathname === '/login') {
      setReady(true);
      return;
    }

    if (!isAuthenticated) {
      router.replace('/login');
    } else {
      setReady(true);
    }
  }, [isAuthenticated, pathname, router]);

  // On login page, always render
  if (pathname === '/login') {
    return <>{children}</>;
  }

  // While checking auth or redirecting, show nothing (avoid flash of protected content)
  if (!ready) {
    return null;
  }

  return <>{children}</>;
}