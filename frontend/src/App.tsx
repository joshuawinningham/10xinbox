import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, MailIcon, PanelLeft, PanelLeftClose, SendIcon, Settings, User, LogOut, MoreVertical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';
import Dashboard from '@/pages/Dashboard';
import SettingsLayout from '@/pages/settings/Layout';
import SettingsProfile from '@/pages/settings/Profile';
import CreateAccount from '@/pages/CreateAccount';
import Login from '@/pages/Login';
import { useAuth } from '@/hooks/useAuth';
import { SidebarProfile } from '@/components/SidebarProfile';
import ConfirmEmail from '@/pages/ConfirmEmail';
import TopSenders from '@/pages/TopSenders';
import './App.css';

function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const { user, logout } = useAuth();

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
                "flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors",
                location.pathname === "/" && "bg-accent text-accent-foreground"
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
            <Link 
              to="/top-senders"
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors",
                location.pathname === "/top-senders" && "bg-accent text-accent-foreground"
              )}
            >
              <MailIcon className="h-4 w-4" />
              Top Senders
            </Link>
            <Link 
              to="/settings/profile"
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors",
                location.pathname.startsWith("/settings") && "bg-accent text-accent-foreground"
              )}
            >
              <Settings className="h-4 w-4" />
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
          <div className="mx-auto max-w-7xl">
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
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/top-senders" element={<PrivateRoute><TopSenders /></PrivateRoute>} />
          <Route path="/create-account" element={<CreateAccount />} />
          <Route path="/login" element={<Login />} />
          <Route path="/confirm-email" element={<ConfirmEmail />} />
          <Route path="/settings" element={<PrivateRoute><SettingsLayout /></PrivateRoute>}>
            <Route index element={<Navigate to="/settings/profile" replace />} />
            <Route path="profile" element={<SettingsProfile />} />
          </Route>
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;