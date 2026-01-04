import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to dashboard - auth will handle redirecting to login if needed
  redirect('/dashboard');
}
