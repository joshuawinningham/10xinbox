import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import PageHeading from '@/components/PageHeading';

export default function SettingsLayout() {
  const location = useLocation();

  return (
    <div className="space-y-6">
      <PageHeading>Settings</PageHeading>
      <div>
        <p className="text-muted-foreground mt-2">
          Manage your account settings and preferences.
        </p>
      </div>
      <div className="flex flex-col md:flex-row gap-8">
        <aside className="md:w-1/5">
          <nav className="space-y-2">
            <Link
              to="/settings/profile"
              className={cn(
                "block w-full px-3 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors",
                location.pathname === "/settings/profile" && "bg-accent text-accent-foreground"
              )}
            >
              Profile
            </Link>
          </nav>
        </aside>
        <div className="flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}