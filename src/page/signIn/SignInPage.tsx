'use client';

import React, { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { AlertCircle } from 'lucide-react';
import styles from './signin-page.module.scss';

const defaultInput = {
  email: '',
  password: ''
};

const SignInPage = () => {
  const [itemInput, setItemInput] = useState(defaultInput);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorText, setErrorText] = useState(defaultInput);
  const [error, setError] = useState<string>('');
  const router = useRouter();
  const { signIn } = useAuth();
  
  const onSignIn = async () => {
    const { email, password } = itemInput;
    let validated = true;
    const newErrorText = { ...errorText };

    const emailValid = email.match(/^([\w.%+-]+)@([\w-]+\.)+([\w]{2,})$/i);
    if(!emailValid) {
      validated = false;
      newErrorText.email = 'email is invalid!';
    } else {
      newErrorText.email = '';
    }

    if(!password || password.length < 8) {
      validated = false;
      newErrorText.password = 'password should be at least 8 characters';
    } else {
      newErrorText.password = '';
    }

    if(!validated) {
      setErrorText(newErrorText);
      return;
    }

    setErrorText(defaultInput);

    try {
      setError('');
      setLoading(true);
      await signIn(email, password);
      router.push('/');
    } catch (e: any) {
      setError(e.message);
    }
    
    setLoading(false);
  };

  const onItemInputChange = (e: any) => {
    setItemInput({
      ...itemInput,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className={styles.signInPageRoot}>
      <div className={styles.signInWrapper}>
        <div className={styles.titleWrapper}>
          <div className={styles.title}>Sign In</div>
        </div>
        {error &&
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        }
        <div className={styles.inputField}>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={itemInput.email}
            onChange={onItemInputChange}
            className={errorText.email ? 'border-destructive' : ''}
          />
          {errorText.email && <p className="text-sm text-destructive mt-1">{errorText.email}</p>}
        </div>
        <div className={styles.inputField}>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            value={itemInput.password}
            onChange={onItemInputChange}
            className={errorText.password ? 'border-destructive' : ''}
          />
          {errorText.password && <p className="text-sm text-destructive mt-1">{errorText.password}</p>}
        </div>
        <Button onClick={onSignIn}>Sign In</Button>
      </div>
    </div>
  );
};

export default SignInPage;