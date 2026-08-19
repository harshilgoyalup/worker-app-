export type UserRole = 'customer' | 'worker' | 'admin';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  photoURL?: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'suspended';
}

export interface CustomerProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  photoURL?: string;
  createdAt: string;
}

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface WorkerProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  photoURL?: string;
  verificationStatus: VerificationStatus;
  skills: string[];
  experience: number | string;
  location: string;
  languages: string[];
  availability: boolean;
  pricing: number; // daily rate
  rating: number;
  completedJobs: number;
  documents?: { name: string; url: string }[];
  createdAt: string;
  updatedAt?: string;
}

export type JobStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'ON_THE_WAY'
  | 'STARTED'
  | 'COMPLETED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'REVIEWED'
  | 'CANCELLED'
  | 'DISPUTED';

export interface Job {
  jobId: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  workerId: string;
  workerName: string;
  workerPhone?: string;
  serviceId: string;
  serviceName: string;
  location: string;
  scheduledDate: string;
  scheduledTime: string;
  description: string;
  price: number;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface PaymentRecord {
  paymentId: string;
  jobId: string;
  customerId: string;
  workerId: string;
  amount: number;
  commission: number;
  workerAmount: number;
  status: 'COMPLETED';
  transactionId: string;
  createdAt: string;
}

export interface ReviewRecord {
  reviewId: string;
  jobId: string;
  customerId: string;
  workerId: string;
  customerName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface NotificationRecord {
  notificationId: string;
  recipientId: string;
  title: string;
  message: string;
  type: 'job_request' | 'job_status' | 'verification' | 'payment' | 'system';
  read: boolean;
  createdAt: string;
}

export interface DisputeRecord {
  disputeId: string;
  jobId: string;
  reporterId: string;
  reason: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
}

export interface PlatformSettings {
  commissionPercentage: number;
  currency: string;
}
