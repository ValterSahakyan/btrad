import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 p-5 lg:flex-row">
          <Sidebar />
          <main className="flex-1">
            <Header />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
