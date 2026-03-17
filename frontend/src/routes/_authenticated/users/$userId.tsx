import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useState, useRef, useMemo, type ReactNode } from 'react';
import {
  ArrowLeft,
  // Link as LinkIcon,
  Trash2,
  Check,
  // Upload,
  Loader2,
  User,
  Dumbbell,
  Activity,
  Moon,
  Scale,
  Smartphone,
  Copy,
  type LucideIcon,
} from 'lucide-react';
import {
  useUser,
  useDeleteUser,
  // useAppleXmlUpload,
  useGenerateInvitationCode,
} from '@/hooks/api/use-users';
import { ROUTES } from '@/lib/constants/routes';
import { API_CONFIG } from '@/lib/api/config';
import { copyToClipboard } from '@/lib/utils/clipboard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ProfileSection } from '@/components/user/profile-section';
import { SleepSection } from '@/components/user/sleep-section';
import { ActivitySection } from '@/components/user/activity-section';
import { BodySection } from '@/components/user/body-section';
import { WorkoutSection } from '@/components/user/workout-section';
import type { DateRangeValue } from '@/components/ui/date-range-selector';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

export const Route = createFileRoute('/_authenticated/users/$userId')({
  component: UserDetailPage,
});

interface TabConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  content: ReactNode;
}

function UserDetailPage() {
  const { t } = useTranslation();
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const { data: user, isLoading: userLoading } = useUser(userId);

  // Tab state
  const [activeTab, setActiveTab] = useState('activity');

  // Date range states for different sections
  const [workoutDateRange, setWorkoutDateRange] = useState<DateRangeValue>(30);
  const [activityDateRange, setActivityDateRange] =
    useState<DateRangeValue>(30);
  const [sleepDateRange, setSleepDateRange] = useState<DateRangeValue>(30);

  const { mutate: deleteUser, isPending: isDeleting } = useDeleteUser();
  // const { handleUpload, isUploading: isUploadingFile } = useAppleXmlUpload();
  const {
    mutate: generateInvitationCode,
    data: invitationCodeData,
    isPending: isGeneratingCode,
  } = useGenerateInvitationCode();
  // const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [isCodeDialogOpen, setIsCodeDialogOpen] = useState(false);
  // const fileInputRef = useRef<HTMLInputElement>(null);

  // const isUploading = isUploadingFile(userId);

  // Tab configuration
  const tabs: TabConfig[] = useMemo(
    () => [
      {
        id: 'activity',
        label: t('tabs.activity'),
        icon: Activity,
        content: (
          <ActivitySection
            userId={userId}
            dateRange={activityDateRange}
            onDateRangeChange={setActivityDateRange}
          />
        ),
      },
      {
        id: 'sleep',
        label: t('tabs.sleep'),
        icon: Moon,
        content: (
          <SleepSection
            userId={userId}
            dateRange={sleepDateRange}
            onDateRangeChange={setSleepDateRange}
          />
        ),
      },
      {
        id: 'body',
        label: t('tabs.body'),
        icon: Scale,
        content: <BodySection userId={userId} />,
      },
      {
        id: 'profile',
        label: t('tabs.profile'),
        icon: User,
        content: <ProfileSection userId={userId} />,
      },
      {
        id: 'workouts',
        label: t('tabs.workouts'),
        icon: Dumbbell,
        content: (
          <WorkoutSection
            userId={userId}
            dateRange={workoutDateRange}
            onDateRangeChange={setWorkoutDateRange}
          />
        ),
      },
    ],
    [userId, workoutDateRange, activityDateRange, sleepDateRange, t]
  );

  // const handleCopyPairLink = async () => {
  //   const pairLink = `${window.location.origin}/users/${userId}/pair`;
  //   const success = await copyToClipboard(
  //     pairLink,
  //     'Pairing link copied to clipboard'
  //   );
  //   if (success) {
  //     setCopied(true);
  //     setTimeout(() => setCopied(false), 2000);
  //   }
  // };

  // const handleUploadClick = () => {
  //   fileInputRef.current?.click();
  // };

  const handleDelete = () => {
    navigate({ to: ROUTES.users });
    deleteUser(userId);
  };

  const handleGenerateInvitationCode = () => {
    generateInvitationCode(userId, {
      onSuccess: () => {
        setIsCodeDialogOpen(true);
      },
    });
  };

  const handleCopyCode = async () => {
    const success = await copyToClipboard(
      invitationCodeData?.code || '',
      'Invitation code copied to clipboard'
    );
    if (success) {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };
  if (!userLoading && !user) {
    return (
      <div className="p-8">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-zinc-400">{t('users.noUsersFound')}</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link to={ROUTES.users}>
              <ArrowLeft className="h-4 w-4" />
              {t('users.title')}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to={ROUTES.users}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {userLoading ? (
            <div className="space-y-2">
              <div className="h-7 w-48 bg-zinc-800 rounded animate-pulse" />
              <div className="h-4 w-32 bg-zinc-800/50 rounded animate-pulse" />
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-medium text-white">
                {user?.first_name || user?.last_name
                  ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
                  : t('users.noUsersFound')}
              </h1>
              <p className="text-sm text-zinc-500">
                {user?.email || t('userDetail.noEmail')}
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* <Button
            variant="secondary"
            onClick={handleUploadClick}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload Apple Health XML
              </>
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml"
            onChange={(e) => handleUpload(userId, e)}
            className="hidden"
          /> */}
          {/* <Button variant="secondary" onClick={handleCopyPairLink}>
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-600" />
                Copied!
              </>
            ) : (
              <>
                <LinkIcon className="h-4 w-4" />
                Copy Pairing Link
              </>
            )}
          </Button> */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                onClick={handleGenerateInvitationCode}
                disabled={isGeneratingCode}
              >
                {isGeneratingCode ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    <Smartphone className="h-4 w-4" />
                    {t('userDetail.connectMobileApp')}
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t('userDetail.connectMobileApp')}
            </TooltipContent>
          </Tooltip>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isDeleting}>
                <Trash2 className="h-4 w-4" />
                {isDeleting ? t('users.deleting') : t('userDetail.deleteUser')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('users.deleteTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('users.deleteDesc')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('users.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>
                  {t('users.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="space-y-6">
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>

      {/* Invitation Code Dialog */}
      <Dialog open={isCodeDialogOpen} onOpenChange={setIsCodeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('userDetail.connectMobileApp')}</DialogTitle>
            <DialogDescription>
              {t('userDetail.connectMobileApp')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-url" className="text-zinc-300">
                API URL
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="api-url"
                  readOnly
                  value={API_CONFIG.baseUrl}
                  className="bg-zinc-800 border-zinc-700 font-mono text-sm focus-visible:ring-0"
                />
                <Button
                  onClick={async () => {
                    const success = await copyToClipboard(
                      API_CONFIG.baseUrl,
                      'API URL copied to clipboard'
                    );
                    if (success) {
                      setUrlCopied(true);
                      setTimeout(() => setUrlCopied(false), 2000);
                    }
                  }}
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-label="Copy API URL"
                >
                  {urlCopied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invitation-code" className="text-zinc-300">
                Invitation Code
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="invitation-code"
                  readOnly
                  value={invitationCodeData?.code || ''}
                  className="bg-zinc-800 border-zinc-700 font-mono text-lg tracking-widest text-center focus-visible:ring-0"
                />
                <Button
                  onClick={handleCopyCode}
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-label="Copy invitation code"
                >
                  {codeCopied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {invitationCodeData?.expires_at && (
                <p className="text-xs text-zinc-500">
                  Expires:{' '}
                  {new Date(invitationCodeData.expires_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
