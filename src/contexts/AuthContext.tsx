import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
} from '../lib/firebase';
import { clampStr } from '../lib/opportunity';
import type { UserProfile } from '../types';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfileSettings: (updates: {
    displayName?: string;
    companyName?: string;
    defaultCity?: string;
    defaultState?: string;
    whatsappTemplate?: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_WHATSAPP_TEMPLATE =
  'Olá, tudo bem? Estava analisando o perfil de {empresa} no Google Maps ({nota}★ · {avaliacoes} avaliações) e vi um potencial enorme para vocês multiplicarem essas notas rapidamente.\n\nTrabalho com Placas NFC de Avaliação Google para balcão: o cliente só encosta o celular na hora de pagar e já abre a tela de avaliação em 2 segundos — sem QR Code difícil e sem pedir favor.\n\nPosso te mostrar em 30s como ficaria a placa com a logo de {empresa} para ajudar vocês a ganharem destaque em {cidade}?';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    void testConnection();

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    let bootstrapping = false;

    const unsubProfile = onSnapshot(
      userRef,
      async (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
          setLoading(false);
        } else if (!bootstrapping) {
          bootstrapping = true;
          try {
            const payload = {
              uid: user.uid,
              displayName: clampStr(user.displayName || user.email?.split('@')[0] || 'Usuário', 120),
              email: clampStr(user.email || '', 200),
              photoURL: clampStr(user.photoURL || '', 500),
              companyName: 'Minha Operação NFC',
              defaultCity: 'Indaiatuba',
              defaultState: 'SP',
              whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(userRef, payload);
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
          } finally {
            setLoading(false);
          }
        }
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      }
    );

    return () => unsubProfile();
  }, [user]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao autenticar com o Google.';
      setAuthError(msg);
      throw err;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const updateProfileSettings = async (updates: {
    displayName?: string;
    companyName?: string;
    defaultCity?: string;
    defaultState?: string;
    whatsappTemplate?: string;
  }) => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    const cleanUpdates: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.displayName !== undefined) {
      cleanUpdates.displayName = clampStr(updates.displayName || 'Usuário', 120);
    }
    if (updates.companyName !== undefined) {
      cleanUpdates.companyName = clampStr(updates.companyName, 120);
    }
    if (updates.defaultCity !== undefined) {
      cleanUpdates.defaultCity = clampStr(updates.defaultCity, 100);
    }
    if (updates.defaultState !== undefined) {
      cleanUpdates.defaultState = clampStr(updates.defaultState, 40);
    }
    if (updates.whatsappTemplate !== undefined) {
      cleanUpdates.whatsappTemplate = clampStr(updates.whatsappTemplate, 1000);
    }

    try {
      await updateDoc(userRef, cleanUpdates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        authError,
        signInWithGoogle,
        logout,
        updateProfileSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
