import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { LayoutDashboard, MailIcon, PanelLeft, PanelLeftClose, Settings, Calendar, Eye, BarChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SidebarProfile } from '@/components/SidebarProfile';
import ConfirmEmail from '@/pages/ConfirmEmail';
import TopSenders from '@/pages/TopSenders';
import InboxZero from '@/pages/InboxZero';
import Mail from '@/pages/Mail';
import EmailTracking from '@/pages/EmailTracking';
import './App.css';
import { applyTheme } from '@/lib/theme-utils';
import { useAuth } from '@/hooks/useAuth';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const CreateAccount = lazy(() => import('./pages/CreateAccount'));
const Login = lazy(() => import('./pages/Login'));
const SettingsLayout = lazy(() => import('./pages/settings/Layout'));
const SettingsProfile = lazy(() => import('./pages/settings/Profile'));

function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();

  // Don't show the layout on the create account and login pages
  if (location.pathname === '/create-account' || location.pathname === '/login') {
    return children;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} border-r bg-card flex flex-col transition-all duration-300 overflow-hidden`}>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <LayoutDashboard className="h-8 w-8" />
            <span className="font-bold text-xl">MailDash</span>
          </div>
          
          <nav className="space-y-2">
            <Link 
              to="/"
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-accent",
                location.pathname === "/" && "bg-accent text-primary"
              )}
            >
              <LayoutDashboard className="h-5 w-5" />
              Dashboard
            </Link>
            <Link 
              to="/mail"
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-accent",
                location.pathname === "/mail" && "bg-accent text-primary"
              )}
            >
              <MailIcon className="h-5 w-5" />
              Mail
            </Link>
            <Link 
              to="/top-senders"
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-accent",
                location.pathname === "/top-senders" && "bg-accent text-primary"
              )}
            >
              <BarChart className="h-5 w-5" />
              Top Senders
            </Link>
            <Link
              to="/inbox-zero"
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-accent",
                location.pathname === "/inbox-zero" && "bg-accent text-primary"
              )}
            >
              <Calendar className="h-5 w-5" />
              Inbox Zero
            </Link>
            <Link
              to="/email-tracking"
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-accent",
                location.pathname === "/email-tracking" && "bg-accent text-primary"
              )}
            >
              <Eye className="h-5 w-5" />
              Email Tracking
            </Link>
            <Link
              to="/settings"
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-accent",
                location.pathname === "/settings" && "bg-accent text-primary"
              )}
            >
              <Settings className="h-5 w-5" />
              Settings
            </Link>
          </nav>
        </div>

        {/* Profile Section - Pushed to bottom */}
        <div className="mt-auto p-4 border-t">
          <SidebarProfile />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="border-b">
          <div className="flex h-16 items-center px-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="mr-2"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-6 w-6" />
              ) : (
                <PanelLeft className="h-6 w-6" />
              )}
            </Button>
            <h2 className="text-lg font-semibold">MailDash</h2>
          </div>
        </div>

        <div className="p-8">
          <div className="mx-auto max-w-screen-2xl">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// PrivateRoute component for protecting routes
function PrivateRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  console.log('PrivateRoute user:', user, 'loading:', loading);
  if (loading) return null; // or a loading spinner
  return user ? children : <Navigate to="/login" replace />;
}

function App() {
  useEffect(() => {
    const theme = localStorage.getItem('theme') || 'blue';
    applyTheme(theme);
  }, []);

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<PrivateRoute><Suspense fallback={<div>Loading...</div>}><Dashboard /></Suspense></PrivateRoute>} />
          <Route path="/mail" element={<PrivateRoute><Mail /></PrivateRoute>} />
          <Route path="/top-senders" element={<PrivateRoute><TopSenders /></PrivateRoute>} />
          <Route path="/inbox-zero" element={<PrivateRoute><InboxZero /></PrivateRoute>} />
          <Route path="/create-account" element={<Suspense fallback={<div>Loading...</div>}><CreateAccount /></Suspense>} />
          <Route path="/login" element={<Suspense fallback={<div>Loading...</div>}><Login /></Suspense>} />
          <Route path="/confirm-email" element={<ConfirmEmail />} />
          <Route path="/settings" element={<PrivateRoute><Suspense fallback={<div>Loading...</div>}><SettingsLayout /></Suspense></PrivateRoute>}>
            <Route index element={<Navigate to="/settings/profile" replace />} />
            <Route path="profile" element={<Suspense fallback={<div>Loading...</div>}><SettingsProfile /></Suspense>} />
          </Route>
          <Route path="/email-tracking" element={<PrivateRoute><EmailTracking /></PrivateRoute>} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;