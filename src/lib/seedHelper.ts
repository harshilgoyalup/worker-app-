import { db } from './firebase';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { WorkerProfile, PlatformSettings } from './types';

export const INITIAL_WORKERS: Partial<WorkerProfile>[] = [
  {
    uid: 'worker_john_doe',
    name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+91 98765 43210',
    photoURL: 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?auto=format&fit=crop&q=80&w=300',
    verificationStatus: 'VERIFIED',
    skills: ['Plumbing', 'Pipefitting'],
    experience: 6,
    location: 'Delhi NCR',
    languages: ['Hindi', 'English'],
    availability: true,
    pricing: 650,
    rating: 4.9,
    completedJobs: 142,
    documents: [{ name: 'Aadhaar Card', url: 'https://via.placeholder.com/150' }],
    createdAt: new Date().toISOString(),
  },
  {
    uid: 'worker_maria_smith',
    name: 'Maria Smith',
    email: 'maria.smith@example.com',
    phone: '+91 98765 43211',
    photoURL: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=300',
    verificationStatus: 'PENDING',
    skills: ['Electrical', 'Wiring'],
    experience: 4,
    location: 'Mumbai',
    languages: ['Hindi', 'English', 'Marathi'],
    availability: true,
    pricing: 700,
    rating: 4.7,
    completedJobs: 89,
    documents: [{ name: 'Electrician License', url: 'https://via.placeholder.com/150' }],
    createdAt: new Date().toISOString(),
  },
  {
    uid: 'worker_rajesh_kumar',
    name: 'Rajesh Kumar',
    email: 'rajesh.k@example.com',
    phone: '+91 98765 43212',
    photoURL: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=300',
    verificationStatus: 'VERIFIED',
    skills: ['Carpentry', 'Furniture Assembly'],
    experience: 8,
    location: 'Bangalore',
    languages: ['Hindi', 'Kannada'],
    availability: true,
    pricing: 800,
    rating: 4.8,
    completedJobs: 210,
    documents: [{ name: 'Skill Certificate', url: 'https://via.placeholder.com/150' }],
    createdAt: new Date().toISOString(),
  },
  {
    uid: 'worker_sunita_verma',
    name: 'Sunita Verma',
    email: 'sunita.v@example.com',
    phone: '+91 98765 43213',
    photoURL: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=300',
    verificationStatus: 'VERIFIED',
    skills: ['Painter', 'Wall Decor'],
    experience: 5,
    location: 'Delhi NCR',
    languages: ['Hindi', 'Punjabi'],
    availability: true,
    pricing: 600,
    rating: 4.6,
    completedJobs: 75,
    documents: [{ name: 'ID Proof', url: 'https://via.placeholder.com/150' }],
    createdAt: new Date().toISOString(),
  },
  {
    uid: 'worker_amit_sharma',
    name: 'Amit Sharma',
    email: 'amit.s@example.com',
    phone: '+91 98765 43214',
    photoURL: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=300',
    verificationStatus: 'PENDING',
    skills: ['Mason', 'Concrete Work'],
    experience: 10,
    location: 'Pune',
    languages: ['Hindi', 'Marathi'],
    availability: true,
    pricing: 750,
    rating: 4.9,
    completedJobs: 310,
    documents: [{ name: 'Trade Proof', url: 'https://via.placeholder.com/150' }],
    createdAt: new Date().toISOString(),
  }
];

export async function ensureSeedData() {
  try {
    const workersSnap = await getDocs(collection(db, 'workers'));
    if (workersSnap.empty) {
      for (const w of INITIAL_WORKERS) {
        if (w.uid) {
          await setDoc(doc(db, 'workers', w.uid), w, { merge: true });
        }
      }
    }

    const settingsDoc = doc(db, 'settings', 'platform');
    const settingsSnap = await getDocs(collection(db, 'settings'));
    if (settingsSnap.empty) {
      const defaultSettings: PlatformSettings = {
        commissionPercentage: 10,
        currency: '₹'
      };
      await setDoc(settingsDoc, defaultSettings, { merge: true });
    }
  } catch (e) {
    console.warn('Seed data check warning:', e);
  }
}
