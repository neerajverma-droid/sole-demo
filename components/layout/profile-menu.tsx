"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogoutDialog } from "@/components/layout/logout-dialog";
import { useAccountIdentity } from "@/hooks/use-account-identity";
import { useSalesSettings } from "@/lib/use-sales-settings";
import { PROFILE_HREF } from "@/lib/nav";

export function ProfileMenu() {
  const router = useRouter();
  const user = useAccountIdentity();
  const { settings } = useSalesSettings();
  const [confirmingLogout, setConfirmingLogout] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Account menu for ${user.name}`}
            className="relative shrink-0 rounded-full outline-none transition-opacity hover:opacity-90 ring-1 ring-offset-2"
          >
            <Avatar className="size-8">
              {settings.logo && (
                <AvatarImage
                  src={settings.logo}
                  alt=""
                  className="object-cover"
                />
              )}
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                {user.initials || <User className="size-4" aria-hidden />}
              </AvatarFallback>
            </Avatar>
             <span className='ring-card absolute right-0 bottom-0 block size-2 rounded-full bg-green-600 ring-2' />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal flex  gap-1">
            <button
            type="button"
            aria-label={`Account menu for ${user.name}`}
            className="relative shrink-0 rounded-full outline-none transition-opacity hover:opacity-90"
          >
            <Avatar className="size-8">
              {settings.logo && (
                <AvatarImage
                  src={settings.logo}
                  alt=""
                  className="object-cover"
                />
              )}
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                {user.initials || <User className="size-4" aria-hidden />}
              </AvatarFallback>
            </Avatar>
          </button>
          <div className="ml-2 flex flex-col "> 
            <span className="block truncate text-sm font-semibold">
              {user.name}
            </span>
            {user.email && (
              <span className="block truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            )}
          </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push(PROFILE_HREF)}>
            <User className="text-muted-foreground" />
            My profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setConfirmingLogout(true)}
          >
            <LogOut className="text-destructive" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LogoutDialog
        open={confirmingLogout}
        onOpenChange={setConfirmingLogout}
      />
    </>
  );
}
