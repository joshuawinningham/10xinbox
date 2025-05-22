import { User, LogOut, MoreVertical, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from 'react-router-dom';
import { useAuth, useLogout } from '@/hooks/useAuth';

export function SidebarProfile() {
  const { user } = useAuth();
  const logoutWithRedirect = useLogout();

  return (
    <div className="flex items-center justify-between px-2 overflow-hidden">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 flex-shrink-0 aspect-square rounded-full bg-muted flex items-center justify-center overflow-hidden">
          <User className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{user?.user_metadata?.name || user?.email?.split("@")[0] || "User"}</p>
          <p className="text-sm text-muted-foreground truncate">{user?.email || ""}</p>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <Link to="/settings/profile">
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
          </Link>
          <DropdownMenuItem onClick={logoutWithRedirect}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
} 