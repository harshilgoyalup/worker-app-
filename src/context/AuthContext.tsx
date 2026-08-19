'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole, WorkerProfile } from '../lib/types';
import { ensureSeedData } from '../lib/seedHelper';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  workerProfile: WorkerProfile | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (
    email: string, 
    pass: string, 
    name: string, 
    phone?: string, 
    aadhaarNumber?: string,
    skills?: string[],
    experience?: number,
    location?: string,
    pricing?: number
  ) => Promise<void>;
  logout: () => Promise<void>;
  loginAsDemoWorker: (workerUid?: string, name?: string) => Promise<void>;
  refreshWorkerProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWorkerData = async (uid: string) => {
    try {
      const wDoc = await getDoc(doc(db, 'workers', uid));
      if (wDoc.exists()) {
        setWorkerProfile(wDoc.data() as WorkerProfile);
      }
    } catch (e) {
      console.error('Error loading worker profile:', e);
    }
  };

  useEffect(() => {
    ensureSeedData();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setUserProfile(userDoc.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || 'Worker User',
              email: firebaseUser.email || '',
              role: 'worker',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              status: 'active'
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile, { merge: true });
            setUserProfile(newProfile);
          }
          await fetchWorkerData(firebaseUser.uid);
        } catch (e) {
          console.error('Error fetching auth state profile:', e);
        }
      } else {
        setUserProfile(null);
        setWorkerProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshWorkerProfile = async () => {
    if (user) {
      await fetchWorkerData(user.uid);
    }
  };

  const signIn = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      if (err?.code === 'auth/api-key-not-valid' || err?.message?.includes('api-key-not-valid')) {
        await loginAsDemoWorker(`worker_${email.split('@')[0]}`, email.split('@')[0]);
        return;
      }
      throw err;
    }
  };

  const signUp = async (
    email: string, 
    pass: string, 
    name: string, 
    phone?: string, 
    aadhaarNumber?: string,
    skills?: string[],
    experience?: number,
    location?: string,
    pricing?: number
  ) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
      const uid = cred.user.uid;
      
      const profile: UserProfile = {
        uid,
        name,
        email,
        phone: phone || '',
        role: 'worker',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active'
      };

      await setDoc(doc(db, 'users', uid), profile);

      const initialWorker: WorkerProfile = {
        uid,
        name,
        email,
        phone: phone || '',
        aadhaarNumber: aadhaarNumber || '',
        verificationStatus: 'PENDING',
        skills: skills && skills.length > 0 ? skills : ['General Labor'],
        experience: experience || 1,
        location: location || 'Delhi NCR',
        languages: ['Hindi', 'English'],
        availability: true,
        pricing: pricing || 600,
        rating: 5.0,
        completedJobs: 0,
        documents: aadhaarNumber ? [{ name: 'Aadhaar ID', url: `aadhaar:${aadhaarNumber}` }] : [],
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'workers', uid), initialWorker);
      setWorkerProfile(initialWorker);
    } catch (err: any) {
      if (err?.code === 'auth/api-key-not-valid' || err?.message?.includes('api-key-not-valid')) {
        const demoUid = `worker_${Date.now()}`;
        const profile: UserProfile = {
          uid: demoUid,
          name,
          email,
          phone: phone || '',
          role: 'worker',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'active'
        };

        const initialWorker: WorkerProfile = {
          uid: demoUid,
          name,
          email,
          phone: phone || '',
          aadhaarNumber: aadhaarNumber || '',
          verificationStatus: 'PENDING',
          skills: skills && skills.length > 0 ? skills : ['General Labor'],
          experience: experience || 1,
          location: location || 'Delhi NCR',
          languages: ['Hindi', 'English'],
          availability: true,
          pricing: pricing || 600,
          rating: 5.0,
          completedJobs: 0,
          documents: aadhaarNumber ? [{ name: 'Aadhaar ID', url: `aadhaar:${aadhaarNumber}` }] : [],
          createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'users', demoUid), profile, { merge: true });
        await setDoc(doc(db, 'workers', demoUid), initialWorker, { merge: true });

        setUser({
          uid: demoUid,
          email,
          displayName: name,
          emailVerified: true,
          isAnonymous: false,
          metadata: {},
          providerData: [],
          refreshToken: '',
          tenantId: null,
          delete: async () => {},
          getIdToken: async () => 'demo-token',
          getIdTokenResult: async () => ({} as any),
          reload: async () => {},
          toJSON: () => ({})
        } as unknown as User);

        setUserProfile(profile);
        setWorkerProfile(initialWorker);
        return;
      }
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {}
    setUser(null);
    setUserProfile(null);
    setWorkerProfile(null);
  };

  const loginAsDemoWorker = async (customUid?: string, customName?: string) => {
    const uid = customUid || 'worker_john_doe';
    const name = customName || 'John Doe';
    const email = `${uid}@dihadi.co`;

    const profile: UserProfile = {
      uid,
      name,
      email,
      role: 'worker',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active'
    };

    await setDoc(doc(db, 'users', uid), profile, { merge: true });

    setUser({
      uid,
      email,
      displayName: name,
      emailVerified: true,
      isAnonymous: false,
      metadata: {},
      providerData: [],
      refreshToken: '',
      tenantId: null,
      delete: async () => {},
      getIdToken: async () => 'demo-token',
      getIdTokenResult: async () => ({} as any),
      reload: async () => {},
      toJSON: () => ({})
    } as unknown as User);

    setUserProfile(profile);
    await fetchWorkerData(uid);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      userProfile, 
      workerProfile, 
      loading, 
      signIn, 
      signUp, 
      logout, 
      loginAsDemoWorker,
      refreshWorkerProfile 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
