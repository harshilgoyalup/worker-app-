'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  updateDoc, 
  setDoc,
  where,
  getDoc,
  addDoc
} from 'firebase/firestore';
import { Job, JobStatus, PaymentRecord, ReviewRecord, PlatformSettings, NotificationRecord, WorkerProfile } from '../lib/types';

function LiveWorkerTimer({ punchInTime, hourlyRate, currency = '₹' }: { punchInTime: string; hourlyRate: number; currency?: string }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const calc = () => {
      const start = new Date(punchInTime).getTime();
      const now = new Date().getTime();
      setElapsedSeconds(Math.max(0, Math.floor((now - start) / 1000)));
    };
    calc();
    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, [punchInTime]);

  const hrs = Math.floor(elapsedSeconds / 3600);
  const mins = Math.floor((elapsedSeconds % 3600) / 60);
  const secs = elapsedSeconds % 60;

  const totalMins = Math.floor(elapsedSeconds / 60);
  const stdMins = Math.min(totalMins, 480);
  const otMins = Math.max(0, totalMins - 480);

  const stdPay = Math.round((stdMins / 60) * hourlyRate);
  const otPay = Math.round((otMins / 60) * (hourlyRate * 1.5));
  const totalEarnings = stdPay + otPay;

  return (
    <div className="bg-emerald-950 text-emerald-100 border border-emerald-800/80 rounded-2xl p-4 shadow-md space-y-3 my-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400"></span>
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">On-Site Shift Active</span>
        </div>
        <span className="text-[11px] font-mono text-emerald-300">Started: {new Date(punchInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      <div className="flex items-baseline justify-between border-y border-emerald-900 py-2.5">
        <div>
          <span className="text-[11px] text-emerald-400 block mb-0.5">Shift Clock</span>
          <span className="text-3xl font-black font-mono tracking-tight text-white">
            {String(hrs).padStart(2, '0')}:{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[11px] text-emerald-400 block mb-0.5">Earned So Far</span>
          <span className="text-2xl font-black text-amber-400">{currency}{totalEarnings}</span>
        </div>
      </div>

      <div className="flex justify-between text-[11px] text-emerald-300">
        <span>Rate: {currency}{hourlyRate}/hr</span>
        {otMins > 0 ? (
          <span className="text-amber-400 font-bold">Overtime Active (1.5×): {otMins} mins</span>
        ) : (
          <span>Standard Shift (Max 8 hrs)</span>
        )}
      </div>
    </div>
  );
}

export default function WorkerPage() {
  const { user, userProfile, workerProfile, loading: authLoading, logout, loginAsDemoWorker, signIn, signUp, refreshWorkerProfile } = useAuth();

  const [activeTab, setActiveTab] = useState<'requests' | 'active' | 'earnings' | 'reviews' | 'profile'>('requests');
  
  // Real-time Firestore Job Collections
  const [assignedJobs, setAssignedJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  // QR Scanner Modal State
  const [qrScannerJob, setQrScannerJob] = useState<Job | null>(null);
  const [qrInputPin, setQrInputPin] = useState('');
  const [isProcessingPunch, setIsProcessingPunch] = useState(false);

  // Real-time Payment & Review History
  const [myPayments, setMyPayments] = useState<PaymentRecord[]>([]);
  const [myReviews, setMyReviews] = useState<ReviewRecord[]>([]);

  // Platform Settings
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({ commissionPercentage: 10, currency: '₹' });

  // Notifications
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Edit Profile State
  const [editSkills, setEditSkills] = useState('');
  const [editRate, setEditRate] = useState<number | ''>(600);
  const [editLocation, setEditLocation] = useState('Delhi NCR');
  const [editExp, setEditExp] = useState(5);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Auth Modal State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authAadhaar, setAuthAadhaar] = useState('');
  const [authSkill, setAuthSkill] = useState('');
  const [authPricing, setAuthPricing] = useState<number | ''>('');
  const [authLocation, setAuthLocation] = useState('');
  const [authExperience, setAuthExperience] = useState<number | ''>('');
  const [authError, setAuthError] = useState('');
  const [authSuccessMsg, setAuthSuccessMsg] = useState('');

  // Sync edit profile form
  useEffect(() => {
    if (workerProfile) {
      setEditSkills(workerProfile.skills?.join(', ') || 'Plumbing, Pipefitting');
      setEditRate(workerProfile.pricing || 650);
      setEditLocation(workerProfile.location || 'Delhi NCR');
      setEditExp(Number(workerProfile.experience) || 5);
    }
  }, [workerProfile]);

  // Listen to Jobs assigned to current Worker
  useEffect(() => {
    if (authLoading) return;

    const currentUid = user?.uid || workerProfile?.uid || 'worker_john_doe';

    const q = query(
      collection(db, 'jobs'),
      where('workerId', '==', currentUid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: Job[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ jobId: docSnap.id, ...docSnap.data() } as Job);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAssignedJobs(list);
      setLoadingJobs(false);
    }, (err) => {
      console.error('Worker jobs listener error:', err);
      setLoadingJobs(false);
    });

    return () => unsub();
  }, [authLoading, user, workerProfile]);

  // Listen to Payments and Reviews for current Worker
  useEffect(() => {
    if (authLoading) return;

    const currentUid = user?.uid || workerProfile?.uid || 'worker_john_doe';

    // Payments
    const payQ = query(collection(db, 'payments'), where('workerId', '==', currentUid));
    const payUnsub = onSnapshot(payQ, (snap) => {
      const plist: PaymentRecord[] = [];
      snap.forEach((d) => plist.push({ paymentId: d.id, ...d.data() } as PaymentRecord));
      setMyPayments(plist);
    }, (err) => console.warn('Worker payments listener notice:', err));

    // Reviews
    const revQ = query(collection(db, 'reviews'), where('workerId', '==', currentUid));
    const revUnsub = onSnapshot(revQ, (snap) => {
      const rlist: ReviewRecord[] = [];
      snap.forEach((d) => rlist.push({ reviewId: d.id, ...d.data() } as ReviewRecord));
      setMyReviews(rlist);
    }, (err) => console.warn('Worker reviews listener notice:', err));

    // Settings
    getDoc(doc(db, 'settings', 'platform')).then((d) => {
      if (d.exists()) setPlatformSettings(d.data() as PlatformSettings);
    }).catch((e) => console.warn('Worker settings fetch notice:', e));

    // Notifications
    const notifQ = query(collection(db, 'notifications'), where('recipientId', '==', currentUid));
    const notifUnsub = onSnapshot(notifQ, (snap) => {
      const nlist: NotificationRecord[] = [];
      snap.forEach((d) => nlist.push({ notificationId: d.id, ...d.data() } as NotificationRecord));
      nlist.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(nlist);
    }, (err) => console.warn('Worker notifications listener notice:', err));

    return () => {
      payUnsub();
      revUnsub();
      notifUnsub();
    };
  }, [authLoading, user, workerProfile]);

  // Job Status Transition Function
  const updateJobStatus = async (jobId: string, nextStatus: JobStatus, customerId?: string) => {
    try {
      await updateDoc(doc(db, 'jobs', jobId), {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      });

      // Notify customer of status change
      if (customerId) {
        let msg = `Your job #${jobId.slice(0, 6)} has been updated to ${nextStatus}.`;
        if (nextStatus === 'ACCEPTED') msg = `Worker ${workerProfile?.name || 'Assigned'} has ACCEPTED your job request!`;
        if (nextStatus === 'ON_THE_WAY') msg = `Worker is ON THE WAY to your location!`;
        if (nextStatus === 'STARTED') msg = `Worker has STARTED work on your site.`;
        if (nextStatus === 'COMPLETED') msg = `Job is COMPLETED! Please proceed to settle payment.`;

        await addDoc(collection(db, 'notifications'), {
          recipientId: customerId,
          title: `Job Status: ${nextStatus}`,
          message: msg,
          type: 'job_status',
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      console.error('Error updating job status:', err);
      alert(`Status update error: ${err.message}`);
    }
  };

  // Punch In via QR Scan / Security PIN
  const handlePunchIn = async (job: Job) => {
    setIsProcessingPunch(true);
    try {
      const now = new Date().toISOString();
      const nextToken = Math.floor(100000 + Math.random() * 900000).toString();

      await updateDoc(doc(db, 'jobs', job.jobId), {
        status: 'STARTED',
        punchInTime: now,
        qrToken: nextToken,
        updatedAt: now,
      });

      await addDoc(collection(db, 'notifications'), {
        recipientId: job.customerId,
        title: '📱 Shift Started (Punch-In Verified)',
        message: `${workerProfile?.name || 'Worker'} has checked in & STARTED work on site at ${new Date(now).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}.`,
        type: 'job_status',
        read: false,
        createdAt: now,
      });

      alert('Shift Punch-In Verified! Real-time work timer is now active.');
      setQrScannerJob(null);
      setQrInputPin('');
    } catch (err: any) {
      console.error('Punch-In Error:', err);
      alert(`Punch-In failed: ${err.message}`);
    } finally {
      setIsProcessingPunch(false);
    }
  };

  // Punch Out via QR Scan / Security PIN
  const handlePunchOut = async (job: Job) => {
    setIsProcessingPunch(true);
    try {
      const now = new Date().toISOString();
      const startMs = job.punchInTime ? new Date(job.punchInTime).getTime() : (new Date(now).getTime() - 60000);
      const endMs = new Date(now).getTime();

      const totalMinutesWorked = Math.max(1, Math.floor((endMs - startMs) / 1000 / 60));
      const standardMinutes = Math.min(totalMinutesWorked, 480);
      const overtimeMinutes = Math.max(0, totalMinutesWorked - 480);

      const hourlyRate = job.hourlyRate || Math.round((job.price || 600) / 8) || 120;
      const standardAmount = Math.round((standardMinutes / 60) * hourlyRate);
      const overtimeAmount = Math.round((overtimeMinutes / 60) * (hourlyRate * 1.5));
      const finalPrice = Math.max(hourlyRate, standardAmount + overtimeAmount);

      await updateDoc(doc(db, 'jobs', job.jobId), {
        status: 'COMPLETED',
        punchOutTime: now,
        totalMinutesWorked,
        standardAmount,
        overtimeMinutes,
        overtimeAmount,
        finalPrice,
        price: finalPrice,
        updatedAt: now,
      });

      await addDoc(collection(db, 'notifications'), {
        recipientId: job.customerId,
        title: '⏱️ Shift Finished (Punch-Out Verified)',
        message: `Shift completed! Total worked: ${Math.floor(totalMinutesWorked / 60)}h ${totalMinutesWorked % 60}m. Final bill: ${platformSettings.currency}${finalPrice} (Includes ${overtimeMinutes}m overtime). Please settle payment.`,
        type: 'job_status',
        read: false,
        createdAt: now,
      });

      alert(`Punch-Out Verified! Duration: ${Math.floor(totalMinutesWorked / 60)}h ${totalMinutesWorked % 60}m. Calculated bill: ${platformSettings.currency}${finalPrice}`);
      setQrScannerJob(null);
      setQrInputPin('');
    } catch (err: any) {
      console.error('Punch-Out Error:', err);
      alert(`Punch-Out failed: ${err.message}`);
    } finally {
      setIsProcessingPunch(false);
    }
  };

  // Save Worker Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);

    try {
      const targetUid = user?.uid || 'worker_john_doe';
      const skillsArray = editSkills.split(',').map((s) => s.trim()).filter(Boolean);
      await setDoc(doc(db, 'workers', targetUid), {
        pricing: Number(editRate),
        skills: skillsArray,
        location: editLocation,
        experience: Number(editExp),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      await refreshWorkerProfile();
      alert('Worker profile updated successfully!');
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Auth Submit
  const handleAuthSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError('');
    setAuthSuccessMsg('');
    try {
      if (authMode === 'signin') {
        if (!authEmail.trim()) {
          setAuthError('Please enter your email address');
          return;
        }
        await signIn(authEmail.trim(), authPass || 'pass123456');
        alert('Signed in successfully!');
        setShowAuthModal(false);
      } else {
        if (!authName.trim()) {
          setAuthError('Please enter your full name');
          return;
        }
        const phoneDigits = authPhone ? authPhone.replace(/\D/g, '') : '';
        const finalEmail = authEmail.trim() || `${phoneDigits || Date.now()}@dihadi.co`;
        const finalPass = authPass || 'pass123456';

        const skillsArr = authSkill ? authSkill.split(',').map((s) => s.trim()).filter(Boolean) : ['General Labor'];
        await signUp(
          finalEmail,
          finalPass,
          authName.trim(),
          authPhone || '',
          authAadhaar || '',
          skillsArr,
          Number(authExperience) || 1,
          authLocation || 'Delhi NCR',
          Number(authPricing) || 600
        );
        setAuthSuccessMsg('Worker registered successfully! Status is PENDING ADMIN APPROVAL.');
        alert(`Worker account for "${authName.trim()}" created successfully! Status: PENDING ADMIN APPROVAL.`);
        setShowAuthModal(false);
      }
    } catch (err: any) {
      console.error('Auth submit error:', err);
      setAuthError(err.message || 'Auth failed');
      alert(`Submission error: ${err.message || 'Registration failed'}`);
    }
  };

  // Filtered Job Lists
  const pendingRequests = assignedJobs.filter((j) => j.status === 'REQUESTED');
  const activeJobs = assignedJobs.filter((j) => ['ACCEPTED', 'ON_THE_WAY', 'STARTED'].includes(j.status));
  const completedJobsList = assignedJobs.filter((j) => ['COMPLETED', 'PAYMENT_PENDING', 'PAID', 'REVIEWED'].includes(j.status));

  // Calculations
  const totalEarningsGross = myPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
  const totalCommissionPaid = myPayments.reduce((acc, p) => acc + (p.commission || 0), 0);
  const totalNetEarnings = totalEarningsGross - totalCommissionPaid;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      {/* Header Bar */}
      <header className="sticky top-0 w-full z-50 flex justify-between items-center px-6 py-4 bg-slate-900 text-white shadow-md">
        <div className="flex items-center gap-6">
          <a href="#" className="text-xl font-bold tracking-tight flex items-center gap-2">
            <span className="bg-amber-500 text-slate-950 px-2 py-0.5 rounded-lg font-black text-base">W</span>
            Dihadi.Co <span className="text-amber-400 text-xs font-normal">Worker Portal</span>
          </a>

          <nav className="hidden md:flex gap-4 ml-4 text-xs font-semibold">
            <button 
              onClick={() => setActiveTab('requests')}
              className={`pb-1 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'requests' ? 'border-amber-400 text-amber-400 font-bold' : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              Job Requests
              {pendingRequests.length > 0 && (
                <span className="bg-amber-500 text-slate-950 px-2 py-0.2 rounded-full font-extrabold text-[10px]">
                  {pendingRequests.length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('active')}
              className={`pb-1 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'active' ? 'border-amber-400 text-amber-400 font-bold' : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              Active Jobs ({activeJobs.length})
            </button>

            <button 
              onClick={() => setActiveTab('earnings')}
              className={`pb-1 border-b-2 transition-colors ${
                activeTab === 'earnings' ? 'border-amber-400 text-amber-400 font-bold' : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              Earnings & History
            </button>

            <button 
              onClick={() => setActiveTab('reviews')}
              className={`pb-1 border-b-2 transition-colors ${
                activeTab === 'reviews' ? 'border-amber-400 text-amber-400 font-bold' : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              My Reviews
            </button>

            <button 
              onClick={() => setActiveTab('profile')}
              className={`pb-1 border-b-2 transition-colors ${
                activeTab === 'profile' ? 'border-amber-400 text-amber-400 font-bold' : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              Worker Profile
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* Notifications */}
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-full hover:bg-slate-800 transition-colors relative"
            >
              <span className="material-symbols-outlined text-sm">notifications</span>
              {notifications.some(n => !n.read) && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-amber-400 rounded-full"></span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white text-slate-900 border border-slate-200 rounded-xl shadow-xl z-50 p-3">
                <h4 className="font-bold text-xs border-b border-slate-100 pb-2 mb-2">Worker Notifications</h4>
                <div className="max-h-60 overflow-y-auto space-y-2 text-xs">
                  {notifications.length === 0 ? (
                    <p className="text-slate-400 text-center py-4">No notifications</p>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.notificationId} className="p-2 bg-slate-50 rounded border border-slate-100">
                        <p className="font-bold text-slate-900">{n.title}</p>
                        <p className="text-slate-600 mt-0.5">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Auth Switcher */}
          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block text-xs">
                <p className="font-bold text-white">{workerProfile?.name || user.displayName || 'John Doe'}</p>
                <span className="text-[10px] text-amber-400">
                  {workerProfile?.verificationStatus === 'VERIFIED' ? '✓ Verified Worker' : '⏳ Pending Verification'}
                </span>
              </div>
              <button 
                onClick={() => logout()}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-lg shadow-sm"
              >
                + Register Worker Account
              </button>
              <button 
                onClick={() => { setAuthMode('signin'); setShowAuthModal(true); }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg"
              >
                Sign In
              </button>
              <button 
                onClick={() => loginAsDemoWorker('worker_john_doe', 'John Doe')}
                className="text-slate-400 hover:text-white text-xs px-2 py-1.5 underline"
              >
                Demo Login
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Real-time Verification Status Banner */}
      {user && (
        <div className="w-full">
          {workerProfile?.verificationStatus === 'VERIFIED' ? (
            <div className="bg-emerald-600 text-white px-6 py-2 text-xs font-semibold flex items-center justify-between shadow-inner">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base">verified</span>
                <span>Your profile is <strong>VERIFIED by Dihadi Admin</strong>! Customers see your verified trust badge.</span>
              </div>
              <span className="bg-emerald-800 text-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Active</span>
            </div>
          ) : (
            <div className="bg-amber-500 text-slate-950 px-6 py-2.5 text-xs font-semibold flex items-center justify-between shadow-inner">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base">pending_actions</span>
                <span>Verification Status: <strong>PENDING ADMIN APPROVAL</strong>. Switch to Admin App to click VERIFY.</span>
              </div>
              <button 
                onClick={() => refreshWorkerProfile()}
                className="bg-slate-950 text-white px-3 py-1 rounded text-[10px] font-bold"
              >
                Refresh Status
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Body Canvas */}
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {!user ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-2xl mx-auto my-12 text-center space-y-5 shadow-md">
            <div className="w-16 h-16 bg-amber-500/10 text-amber-600 rounded-full flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">engineering</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900">Join Dihadi.Co Workforce</h2>
            <p className="text-slate-600 text-xs sm:text-sm max-w-md mx-auto">
              Create your worker profile with your trade skills, location, and daily rate to start receiving job requests from local customers.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <button 
                onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-6 py-3 rounded-xl shadow-md transition-colors"
              >
                + Create New Worker Account
              </button>
              <button 
                onClick={() => { setAuthMode('signin'); setShowAuthModal(true); }}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-6 py-3 rounded-xl transition-colors"
              >
                Sign In Existing Account
              </button>
              <button 
                onClick={() => loginAsDemoWorker('worker_john_doe', 'John Doe')}
                className="border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs px-4 py-3 rounded-xl transition-colors"
              >
                Try Sample Worker Login
              </button>
            </div>
          </div>
        ) : (
          <>
        {activeTab === 'requests' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Incoming Job Requests</h2>
                <p className="text-xs text-slate-500">Real-time requests submitted by customers looking for your trade.</p>
              </div>
              <span className="bg-amber-100 text-amber-900 font-bold text-xs px-3 py-1 rounded-full border border-amber-200">
                {pendingRequests.length} Pending Requests
              </span>
            </div>

            {loadingJobs ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="text-xs text-slate-500">Listening for real-time customer requests...</p>
              </div>
            ) : pendingRequests.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 space-y-3">
                <span className="material-symbols-outlined text-5xl text-slate-300">notifications_paused</span>
                <h3 className="font-bold text-slate-800 text-base">No New Requests Right Now</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  When a customer books you from Customer App, the request will appear here instantly with sound/notification!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingRequests.map((job) => (
                  <div key={job.jobId} className="bg-white border-2 border-amber-400 rounded-2xl p-5 shadow-sm space-y-4 relative overflow-hidden">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                          NEW REQUEST
                        </span>
                        <h4 className="font-bold text-slate-900 text-lg mt-1">{job.serviceName}</h4>
                        <p className="text-xs text-slate-500">Customer: <strong>{job.customerName}</strong></p>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black text-slate-900">{platformSettings.currency}{job.price}</span>
                        <span className="text-[10px] text-slate-400 block">Offer Daily Rate</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs space-y-1.5">
                      <p className="flex items-center gap-1.5 text-slate-700">
                        <span className="material-symbols-outlined text-xs text-slate-400">calendar_today</span>
                        Scheduled: <strong>{job.scheduledDate} at {job.scheduledTime}</strong>
                      </p>
                      <p className="flex items-center gap-1.5 text-slate-700">
                        <span className="material-symbols-outlined text-xs text-slate-400">location_on</span>
                        Location: <strong>{job.location}</strong>
                      </p>
                      <p className="text-slate-600 pt-1 border-t border-slate-200">
                        "{job.description}"
                      </p>
                    </div>

                    {/* Accept / Reject Buttons */}
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => updateJobStatus(job.jobId, 'CANCELLED', job.customerId)}
                        className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-xl transition-colors"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => updateJobStatus(job.jobId, 'ACCEPTED', job.customerId)}
                        className="w-2/3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs py-2.5 rounded-xl shadow-md transition-colors flex items-center justify-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        ACCEPT JOB REQUEST
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ACTIVE JOBS & STATUS CONTROLLER */}
        {activeTab === 'active' && (
          <div className="space-y-6">
            <div className="pb-3 border-b border-slate-200">
              <h2 className="text-2xl font-bold text-slate-900">Active Jobs & Status Transitions</h2>
              <p className="text-xs text-slate-500">Update status in real time to inform customer of your arrival, work start, and completion.</p>
            </div>

            {activeJobs.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 space-y-3">
                <span className="material-symbols-outlined text-5xl text-slate-300">handyman</span>
                <h3 className="font-bold text-slate-800 text-base">No Active Jobs Currently</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Accept an incoming request from the Requests tab to start job tracking.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeJobs.map((job) => (
                  <div key={job.jobId} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-lg">{job.serviceName}</h4>
                          <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                            Current Status: {job.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Customer: <strong>{job.customerName}</strong> • {job.location}</p>
                      </div>
                      <span className="text-2xl font-black text-slate-900">{platformSettings.currency}{job.price}</span>
                    </div>

                    {/* Live Worker Shift Timer widget for STARTED jobs */}
                    {job.status === 'STARTED' && job.punchInTime && (
                      <LiveWorkerTimer
                        punchInTime={job.punchInTime}
                        hourlyRate={job.hourlyRate || Math.round(job.price / 8) || 120}
                        currency={platformSettings.currency}
                      />
                    )}

                    {/* Interactive Worker Status Transition Controls */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                      <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
                        <span className="material-symbols-outlined text-amber-500 text-base">touch_app</span>
                        Worker Actions & Shift Check-In
                      </p>

                      <div className="flex flex-wrap gap-3">
                        {job.status === 'ACCEPTED' && (
                          <button
                            onClick={() => updateJobStatus(job.jobId, 'ON_THE_WAY', job.customerId)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-colors flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-sm">directions_run</span>
                            I Am ON THE WAY
                          </button>
                        )}

                        {(job.status === 'ACCEPTED' || job.status === 'ON_THE_WAY') && (
                          <button
                            onClick={() => { setQrScannerJob(job); setQrInputPin(job.qrToken || ''); }}
                            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs px-5 py-2.5 rounded-xl shadow-md transition-colors flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-sm">qr_code_scanner</span>
                            📷 SCAN QR CODE TO PUNCH-IN
                          </button>
                        )}

                        {job.status === 'STARTED' && (
                          <button
                            onClick={() => { setQrScannerJob(job); setQrInputPin(job.qrToken || ''); }}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-black text-xs px-6 py-3 rounded-xl shadow-lg transition-colors flex items-center gap-1.5 text-sm animate-pulse"
                          >
                            <span className="material-symbols-outlined text-base">task_alt</span>
                            🏁 SCAN QR CODE TO PUNCH-OUT & COMPLETE
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: EARNINGS & HISTORY */}
        {activeTab === 'earnings' && (
          <div className="space-y-6">
            <div className="pb-3 border-b border-slate-200">
              <h2 className="text-2xl font-bold text-slate-900">Earnings & Payment Settlement History</h2>
              <p className="text-xs text-slate-500">Transparent breakdown of gross pay, central platform commission ({platformSettings.commissionPercentage}%), and net payout.</p>
            </div>

            {/* Metric Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                <span className="text-xs font-bold text-slate-500 block">Total Net Worker Earnings</span>
                <span className="text-3xl font-black text-emerald-600">{platformSettings.currency}{totalNetEarnings}</span>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                <span className="text-xs font-bold text-slate-500 block">Platform Commission Paid</span>
                <span className="text-3xl font-black text-slate-700">{platformSettings.currency}{totalCommissionPaid}</span>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                <span className="text-xs font-bold text-slate-500 block">Jobs Settled</span>
                <span className="text-3xl font-black text-amber-600">{myPayments.length}</span>
              </div>
            </div>

            {/* Payment History Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-900 text-sm">
                Settled Payment Records
              </div>
              {myPayments.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No payment records logged yet. Payments recorded by customer appear here.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <th className="p-3 font-bold">Transaction ID</th>
                        <th className="p-3 font-bold">Job ID</th>
                        <th className="p-3 font-bold">Gross Amount</th>
                        <th className="p-3 font-bold">Commission ({platformSettings.commissionPercentage}%)</th>
                        <th className="p-3 font-bold">Net Payout</th>
                        <th className="p-3 font-bold">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myPayments.map((p) => (
                        <tr key={p.paymentId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3 font-mono text-slate-800">{p.transactionId}</td>
                          <td className="p-3 font-mono text-slate-600">{p.jobId.slice(0, 8)}</td>
                          <td className="p-3 font-bold text-slate-900">{platformSettings.currency}{p.amount}</td>
                          <td className="p-3 text-red-600">-{platformSettings.currency}{p.commission}</td>
                          <td className="p-3 font-bold text-emerald-600">{platformSettings.currency}{p.workerAmount}</td>
                          <td className="p-3 text-slate-400">{new Date(p.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: REVIEWS */}
        {activeTab === 'reviews' && (
          <div className="space-y-6">
            <div className="pb-3 border-b border-slate-200">
              <h2 className="text-2xl font-bold text-slate-900">Customer Feedback & Reviews</h2>
              <p className="text-xs text-slate-500">Real ratings submitted by customers after job completion.</p>
            </div>

            {myReviews.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 space-y-2">
                <span className="material-symbols-outlined text-4xl text-slate-300">star_half</span>
                <p className="text-xs text-slate-500">No reviews submitted yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myReviews.map((r) => (
                  <div key={r.reviewId} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900 text-sm">{r.customerName}</span>
                      <div className="flex text-amber-500">
                        {Array.from({ length: r.rating || 5 }).map((_, i) => (
                          <span key={i} className="material-symbols-outlined text-sm">star</span>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 italic">"{r.comment}"</p>
                    <span className="text-[10px] text-slate-400 block">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: PROFILE EDIT */}
        {activeTab === 'profile' && (
          <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="pb-3 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900">Worker Profile & Verification Settings</h2>
              <p className="text-xs text-slate-500">Update your trade skills, daily pricing, and location.</p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Trade Skills (Comma separated)</label>
                <input 
                  type="text"
                  required
                  value={editSkills}
                  onChange={(e) => setEditSkills(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Daily Wage Rate ({platformSettings.currency})</label>
                  <input 
                    type="number"
                    required
                    value={editRate}
                    onChange={(e) => setEditRate(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Experience (Years)</label>
                  <input 
                    type="number"
                    required
                    value={editExp}
                    onChange={(e) => setEditExp(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Base City / Location</label>
                <input 
                  type="text"
                  required
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingProfile}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl shadow-md transition-colors"
              >
                {isSavingProfile ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>
        )}
        </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto py-4 px-6 bg-slate-900 text-slate-400 text-xs border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span>Dihadi.Co Worker Portal - Dignity in Daily Labor</span>
          <span>Status: Verified Firebase Engine</span>
        </div>
      </footer>

      {/* Auth / Registration Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl relative space-y-4 my-8">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg">
                {authMode === 'signup' ? 'Worker Account Registration' : 'Worker Sign In'}
              </h3>
              <button 
                onClick={() => setShowAuthModal(false)}
                className="text-slate-400 hover:text-slate-700 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            {authError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 font-semibold">
                {authError}
              </div>
            )}

            {authSuccessMsg && (
              <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl border border-emerald-200 font-semibold">
                ✓ {authSuccessMsg}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3 text-xs">
              {authMode === 'signup' && (
                <>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Full Name *</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. Ramesh Kumar"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Phone Number *</label>
                      <input 
                        type="tel" 
                        required 
                        placeholder="+91 9876543210"
                        value={authPhone}
                        onChange={(e) => setAuthPhone(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Aadhaar Card No. *</label>
                      <input 
                        type="text" 
                        required 
                        placeholder="12-digit Aadhaar ID"
                        maxLength={14}
                        value={authAadhaar}
                        onChange={(e) => setAuthAadhaar(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Trade Skills (Comma-separated) *</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. Electrician, Plumber, Mason"
                      value={authSkill}
                      onChange={(e) => setAuthSkill(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Daily Wage Rate (₹) *</label>
                      <input 
                        type="number" 
                        required 
                        placeholder="650"
                        value={authPricing}
                        onChange={(e) => setAuthPricing(e.target.value ? Number(e.target.value) : '')}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Experience (Years) *</label>
                      <input 
                        type="number" 
                        required 
                        value={authExperience}
                        onChange={(e) => setAuthExperience(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">City / Base Location *</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. Delhi NCR, Mumbai, Bengaluru"
                      value={authLocation}
                      onChange={(e) => setAuthLocation(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="font-bold text-slate-700 block mb-1">Email Address *</label>
                <input 
                  type="email" 
                  required 
                  placeholder="worker@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Password *</label>
                <input 
                  type="password" 
                  required 
                  placeholder="••••••••"
                  value={authPass}
                  onChange={(e) => setAuthPass(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => handleAuthSubmit()}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold py-3 rounded-xl shadow-md transition-colors text-xs uppercase tracking-wider mt-2 cursor-pointer"
              >
                {authMode === 'signup' ? 'Submit Worker Registration' : 'Sign In'}
              </button>
            </form>

            <div className="pt-2 text-center text-xs text-slate-500 border-t border-slate-100">
              {authMode === 'signup' ? (
                <p>
                  Already have an account?{' '}
                  <button 
                    onClick={() => setAuthMode('signin')} 
                    className="text-amber-600 font-bold hover:underline"
                  >
                    Sign In
                  </button>
                </p>
              ) : (
                <p>
                  New worker?{' '}
                  <button 
                    onClick={() => setAuthMode('signup')} 
                    className="text-amber-600 font-bold hover:underline"
                  >
                    Register Account
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR SCANNER / SECURITY PIN MODAL FOR WORKER */}
      {qrScannerJob && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {qrScannerJob.status === 'STARTED' ? '⏱️ Shift Punch-Out' : '📷 Shift Punch-In'}
                </h3>
                <p className="text-xs text-slate-500">Scan customer's phone QR or enter PIN</p>
              </div>
              <button 
                onClick={() => setQrScannerJob(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Camera Scanner Viewfinder simulation */}
            <div className="bg-slate-900 text-white rounded-2xl p-5 text-center relative overflow-hidden border-2 border-dashed border-amber-400 shadow-inner space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-400/40 animate-pulse">
                <span className="material-symbols-outlined text-3xl">qr_code_scanner</span>
              </div>
              <p className="text-xs font-bold text-amber-300">Camera Viewfinder Active</p>
              <p className="text-[10px] text-slate-400">Position camera over QR code displayed on customer's phone.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Security PIN Code</label>
              <input 
                type="text"
                placeholder="e.g. 849201"
                value={qrInputPin}
                onChange={(e) => setQrInputPin(e.target.value)}
                className="w-full text-center font-mono text-xl font-bold tracking-widest bg-slate-50 border border-slate-200 rounded-xl py-2 text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-400 text-center">PIN is shown below QR code on customer's phone screen</p>
            </div>

            <div className="pt-1 flex flex-col gap-2">
              {qrScannerJob.status === 'STARTED' ? (
                <button
                  disabled={isProcessingPunch}
                  onClick={() => handlePunchOut(qrScannerJob)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 uppercase tracking-wider"
                >
                  <span className="material-symbols-outlined text-base">task_alt</span>
                  {isProcessingPunch ? 'Calculating & Punching Out...' : 'CONFIRM PUNCH-OUT'}
                </button>
              ) : (
                <button
                  disabled={isProcessingPunch}
                  onClick={() => handlePunchIn(qrScannerJob)}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs py-3 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 uppercase tracking-wider"
                >
                  <span className="material-symbols-outlined text-base">play_arrow</span>
                  {isProcessingPunch ? 'Verifying & Punching In...' : 'CONFIRM PUNCH-IN'}
                </button>
              )}
              <button
                onClick={() => setQrScannerJob(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
