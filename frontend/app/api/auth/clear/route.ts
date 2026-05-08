import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function GET() {
  const store = await cookies();
  store.delete('perpscout_session');
  redirect('/login');
}
