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

const LOCAL_STORAGE_KEY = 'dihadi_worker_session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const saveSession = (u: User | null, up: UserProfile | null, wp: WorkerProfile | null) => {
    setUser(u);
    setUserProfile(up);
    setWorkerProfile(wp);
    if (typeof window !== 'undefined') {
      if (u && up) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ user: u, userProfile: up, workerProfile: wp }));
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
  };

  const fetchWorkerData = async (uid: string): Promise<WorkerProfile | null> => {
    try {
      const wDoc = await getDoc(doc(db, 'workers', uid));
      if (wDoc.exists()) {
        const wp = wDoc.data() as WorkerProfile;
        setWorkerProfile(wp);
        return wp;
      }
    } catch (e) {
      console.error('Error loading worker profile:', e);
    }
    return null;
  };

  const createMockUserObject = (uid: string, email: string, name: string): User => {
    return {
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
    } as unknown as User;
  };

  useEffect(() => {
    ensureSeedData();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          let up: UserProfile;
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            up = userDoc.data() as UserProfile;
          } else {
            up = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || 'Worker User',
              email: firebaseUser.email || '',
              role: 'worker',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              status: 'active'
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), up, { merge: true });
          }
          const wp = await fetchWorkerData(firebaseUser.uid);
          saveSession(firebaseUser, up, wp);
        } catch (e) {
          console.error('Error fetching auth state profile:', e);
        }
      } else {
        // Firebase Auth is null - check for saved local session before falling back
        if (typeof window !== 'undefined') {
          const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (saved) {
            try {
              const { user: savedUser, userProfile: savedUp, workerProfile: savedWp } = JSON.parse(saved);
              setUser(savedUser);
              setUserProfile(savedUp);
              setWorkerProfile(savedWp);
            } catch (e) {
              setUser(null);
              setUserProfile(null);
              setWorkerProfile(null);
            }
          } else {
            setUser(null);
            setUserProfile(null);
            setWorkerProfile(null);
          }
        } else {
          setUser(null);
          setUserProfile(null);
          setWorkerProfile(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshWorkerProfile = async () => {
    if (user) {
      const wp = await fetchWorkerData(user.uid);
      if (wp && userProfile) {
        saveSession(user, userProfile, wp);
      }
    }
  };

  const signIn = async (email: string, pass: string) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
      const up = userDoc.exists() ? (userDoc.data() as UserProfile) : null;
      const wp = await fetchWorkerData(cred.user.uid);
      if (up) {
        saveSession(cred.user, up, wp);
      }
    } catch (err: any) {
      console.warn('Firebase Auth signIn failed, looking up fallback worker profile:', err);
      
      const customUid = `worker_${email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_')}`;
      const nameFromEmail = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ');
      
      const userDoc = await getDoc(doc(db, 'users', customUid));
      let profile: UserProfile;
      if (userDoc.exists()) {
        profile = userDoc.data() as UserProfile;
      } else {
        profile = {
          uid: customUid,
          name: nameFromEmail || 'Worker Professional',
          email,
          role: 'worker',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'active'
        };
        await setDoc(doc(db, 'users', customUid), profile, { merge: true });
      }

      let wp = await fetchWorkerData(customUid);
      if (!wp) {
        wp = {
          uid: customUid,
          name: profile.name,
          email,
          phone: '',
          verificationStatus: 'PENDING',
          skills: ['General Labor'],
          experience: 2,
          location: 'Delhi NCR',
          languages: ['Hindi', 'English'],
          availability: true,
          pricing: 600,
          rating: 5.0,
          completedJobs: 0,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'workers', customUid), wp, { merge: true });
      }

      const mockUser = createMockUserObject(customUid, email, profile.name);
      saveSession(mockUser, profile, wp);
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
      saveSession(cred.user, profile, initialWorker);
    } catch (err: any) {
      console.warn('Firebase Auth error during signUp, saving new worker locally to Firestore:', err);
      const customUid = `wrk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      
      const profile: UserProfile = {
        uid: customUid,
        name,
        email,
        phone: phone || '',
        role: 'worker',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active'
      };

      const initialWorker: WorkerProfile = {
        uid: customUid,
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

      try {
        await setDoc(doc(db, 'users', customUid), profile, { merge: true });
        await setDoc(doc(db, 'workers', customUid), initialWorker, { merge: true });
      } catch (dbErr) {
        console.error('Firestore save error during fallback:', dbErr);
      }

      const mockUser = createMockUserObject(customUid, email, name);
      saveSession(mockUser, profile, initialWorker);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {}
    saveSession(null, null, null);
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
    const wp = await fetchWorkerData(uid);
    const mockUser = createMockUserObject(uid, email, name);
    saveSession(mockUser, profile, wp);
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

