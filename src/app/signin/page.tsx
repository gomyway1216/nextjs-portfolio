import { Suspense } from 'react';
import SignInPage from '@/page/signIn/SignInPage';

export default function SignIn() {
  return (
    <Suspense fallback={null}>
      <SignInPage />
    </Suspense>
  );
}
