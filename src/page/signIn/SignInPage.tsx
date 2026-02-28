'use client';

import React, { useState, useEffect, useRef } from 'react';
import { RecaptchaVerifier } from 'firebase/auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { AlertCircle, Shield, ArrowLeft, Mail, Phone, MessageSquare, Loader2, Lock, UserPlus } from 'lucide-react';
import { resetPassword } from '@/lib/firebaseConnect';
import * as twoFactorService from '@/services/twoFactorService';

type AuthMode = 'signin' | 'signup';

const SignInPage = () => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/';

  const {
    signIn,
    signUp,
    signInWithTwoFactor,
    sendMfaCode,
    verifyTwoFactorAndComplete,
    twoFactorRequired,
    mfaPhoneHint,
    cancelTwoFactor,
    currentUser,
  } = useAuth();

  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (currentUser) {
      router.push(redirectPath);
    }
  }, [currentUser, router, redirectPath]);

  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!email.match(/^([\w.%+-]+)@([\w-]+\.)+([\w]{2,})$/i)) {
      errors.email = 'メールアドレスが正しくありません';
    }
    if (!password || password.length < 8) {
      errors.password = 'パスワードは8文字以上にしてください';
    }
    if (mode === 'signup') {
      if (!displayName.trim()) {
        errors.displayName = '表示名を入力してください';
      }
      if (password !== confirmPassword) {
        errors.confirmPassword = 'パスワードが一致しません';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignIn = async () => {
    if (!validate()) return;
    setError('');
    setLoading(true);

    try {
      const result = await signInWithTwoFactor(email, password);
      if (!result.requiresTwoFactor) {
        // Redirect handled by useEffect
      }
    } catch (e: any) {
      const code = e.code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('メールアドレスまたはパスワードが正しくありません');
      } else if (code === 'auth/user-not-found') {
        setError('このメールアドレスのアカウントが見つかりません');
      } else if (code === 'auth/too-many-requests') {
        setError('ログイン試行回数が多すぎます。しばらく待ってから再試行してください');
      } else if (code === 'auth/user-disabled') {
        setError('このアカウントは無効化されています');
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!validate()) return;
    setError('');
    setLoading(true);

    try {
      await signUp(email, password, displayName.trim());
    } catch (e: any) {
      const code = e.code;
      if (code === 'auth/email-already-in-use') {
        setError('このメールアドレスは既に使用されています');
      } else if (code === 'auth/weak-password') {
        setError('パスワードが弱すぎます。より強いパスワードを設定してください');
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (mode === 'signin') handleSignIn();
    else handleSignUp();
  };

  const onSendCode = async () => {
    setSendingCode(true);
    setError('');
    try {
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      recaptchaVerifierRef.current = twoFactorService.initRecaptchaVerifier('recaptcha-signin-container');
      await sendMfaCode(recaptchaVerifierRef.current);
      setCodeSent(true);
    } catch (e: any) {
      if (e.code === 'auth/too-many-requests') {
        setError('試行回数が多すぎます。しばらく待ってください');
      } else {
        setError(e.message || '認証コードの送信に失敗しました');
      }
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    }
    setSendingCode(false);
  };

  const onVerifyTwoFactor = async () => {
    if (!twoFactorCode || twoFactorCode.length < 6) {
      setError('6桁の認証コードを入力してください');
      return;
    }
    setError('');
    setVerifying(true);
    try {
      await verifyTwoFactorAndComplete(twoFactorCode);
      router.push(redirectPath);
    } catch (e: any) {
      setError(e.message);
      setVerifying(false);
    }
  };

  const onCancelTwoFactor = () => {
    cancelTwoFactor();
    setTwoFactorCode('');
    setCodeSent(false);
    setSendingCode(false);
    setVerifying(false);
    setError('');
    setLoading(false);
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear();
      recaptchaVerifierRef.current = null;
    }
  };

  const onResetPassword = async () => {
    if (!email.match(/^([\w.%+-]+)@([\w-]+\.)+([\w]{2,})$/i)) {
      setError('まずメールアドレスを入力してください');
      return;
    }
    setResetLoading(true);
    setError('');
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        setError('このメールアドレスのアカウントが見つかりません');
      } else {
        setError(e.message);
      }
    }
    setResetLoading(false);
  };

  // 2FA screen
  if (twoFactorRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md bg-card rounded-2xl shadow-lg border p-8 space-y-6">
          <div id="recaptcha-signin-container" ref={recaptchaContainerRef} />

          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto">
              <Shield className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-xl font-semibold">二段階認証</h1>
            <p className="text-sm text-muted-foreground">本人確認をしてください</p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>エラー</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!codeSent ? (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4 flex items-center gap-3">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{mfaPhoneHint || 'お使いの電話番号'}</p>
                  <p className="text-xs text-muted-foreground">SMSで認証コードを送信します</p>
                </div>
              </div>
              <Button onClick={onSendCode} disabled={sendingCode} className="w-full" style={{ borderRadius: '9999px' }}>
                {sendingCode ? <><Loader2 className="animate-spin mr-2 h-4 w-4" />送信中...</> : <><MessageSquare className="h-4 w-4 mr-2" />認証コードを送信</>}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2">
                <Phone className="h-4 w-4 text-green-600" />
                <p className="text-sm text-green-700 dark:text-green-300">コードを {mfaPhoneHint || 'お使いの電話番号'} に送信しました</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="twoFactorCode">認証コード</Label>
                <Input
                  id="twoFactorCode"
                  type="text"
                  placeholder="000000"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoComplete="one-time-code"
                  autoFocus
                  className="font-mono text-2xl tracking-[8px] text-center"
                />
              </div>
              <Button onClick={onVerifyTwoFactor} disabled={verifying} className="w-full" style={{ borderRadius: '9999px' }}>
                {verifying ? <><Loader2 className="animate-spin mr-2 h-4 w-4" />確認中...</> : '確認してログイン'}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setCodeSent(false); setTwoFactorCode(''); setError(''); }}
                disabled={sendingCode || verifying}
                className="w-full"
                style={{ borderRadius: '9999px' }}
              >
                コードを再送信
              </Button>
            </div>
          )}

          <div className="text-center">
            <button type="button" onClick={onCancelTwoFactor} disabled={sendingCode || verifying} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" />
              ログインに戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sign in / Sign up form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-lg border p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto">
            {mode === 'signin' ? (
              <Lock className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            ) : (
              <UserPlus className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            )}
          </div>
          <h1 className="text-xl font-semibold">
            {mode === 'signin' ? 'ログイン' : 'アカウント作成'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'signin' ? 'meetyudai.com にログイン' : '新しいアカウントを作成'}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-muted p-1 gap-1" style={{ borderRadius: '9999px' }}>
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(''); setFieldErrors({}); }}
            className={`flex-1 text-sm font-medium py-2 transition-all ${mode === 'signin' ? 'bg-background text-foreground shadow' : 'text-muted-foreground'}`}
            style={{ borderRadius: '9999px' }}
          >
            ログイン
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(''); setFieldErrors({}); }}
            className={`flex-1 text-sm font-medium py-2 transition-all ${mode === 'signup' ? 'bg-background text-foreground shadow' : 'text-muted-foreground'}`}
            style={{ borderRadius: '9999px' }}
          >
            新規登録
          </button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>エラー</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <Label htmlFor="displayName">表示名</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="田中太郎"
                className={fieldErrors.displayName ? 'border-destructive' : ''}
              />
              {fieldErrors.displayName && <p className="text-xs text-destructive">{fieldErrors.displayName}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setResetSent(false); }}
              placeholder="you@example.com"
              className={fieldErrors.email ? 'border-destructive' : ''}
            />
            {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">パスワード</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={fieldErrors.password ? 'border-destructive' : ''}
            />
            {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
          </div>

          {mode === 'signup' && (
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">パスワード確認</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className={fieldErrors.confirmPassword ? 'border-destructive' : ''}
              />
              {fieldErrors.confirmPassword && <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>}
            </div>
          )}
        </div>

        <Button onClick={handleSubmit} disabled={loading} className="w-full" style={{ borderRadius: '9999px' }}>
          {loading ? (
            <><Loader2 className="animate-spin mr-2 h-4 w-4" />{mode === 'signin' ? 'ログイン中...' : 'アカウント作成中...'}</>
          ) : (
            mode === 'signin' ? 'ログイン' : 'アカウントを作成'
          )}
        </Button>

        {mode === 'signin' && (
          <div className="text-center">
            {resetSent ? (
              <p className="text-sm text-green-600 bg-green-50 dark:bg-green-900/20 p-2 rounded-lg flex items-center justify-center gap-1">
                <Mail className="h-4 w-4" />
                パスワードリセットメールを送信しました
              </p>
            ) : (
              <button
                type="button"
                onClick={onResetPassword}
                disabled={resetLoading}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {resetLoading ? '送信中...' : 'パスワードを忘れた場合'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SignInPage;
