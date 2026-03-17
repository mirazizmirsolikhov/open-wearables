import { createFileRoute, Link } from '@tanstack/react-router';
import { useDashboardStats, useUsersMetrics } from '@/hooks/api/use-dashboard';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import {
  StatsGrid,
  DashboardLoadingState,
  DashboardErrorState,
} from '@/components/pages/dashboard';
import type { UserMetricsSummary } from '@/lib/api/types';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
});

function MetricCard({
  label,
  value,
  unit,
  subtitle,
  color,
  icon,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  subtitle?: string;
  color: string;
  icon: string;
}) {
  const colorMap: Record<string, string> = {
    red: 'from-red-500/20 to-red-500/5 border-red-500/30 text-red-400',
    green: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-400',
    blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-400',
    purple: 'from-purple-500/20 to-purple-500/5 border-purple-500/30 text-purple-400',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-400',
    cyan: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/30 text-cyan-400',
    pink: 'from-pink-500/20 to-pink-500/5 border-pink-500/30 text-pink-400',
    orange: 'from-orange-500/20 to-orange-500/5 border-orange-500/30 text-orange-400',
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`bg-gradient-to-br ${c} border rounded-lg p-3 flex flex-col gap-1`}>
      <div className="flex items-center gap-1.5">
        <span className="text-lg">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-white">
          {value != null ? value : '--'}
        </span>
        {unit && value != null && (
          <span className="text-xs opacity-60">{unit}</span>
        )}
      </div>
      {subtitle && (
        <span className="text-[10px] opacity-50">{subtitle}</span>
      )}
    </div>
  );
}

function UserCard({ u, t }: { u: UserMetricsSummary; t: (key: string) => string }) {
  const name = u.first_name
    ? `${u.first_name}${u.last_name ? ` ${u.last_name}` : ''}`
    : u.external_user_id || u.id.slice(0, 8);

  const hasData = u.total_data_points > 0;
  const syncAgo = u.last_sync
    ? formatDistanceToNow(new Date(u.last_sync), { addSuffix: true })
    : null;

  return (
    <Link
      to="/users/$userId"
      params={{ userId: u.id }}
      className="block bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 transition-all hover:shadow-lg hover:shadow-emerald-500/5"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-800/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm">
            {(u.first_name || u.external_user_id || '?')[0].toUpperCase()}
          </div>
          <div>
            <div className="text-white font-semibold text-sm">{name}</div>
            {u.position && <div className="text-zinc-400 text-xs">{u.position}</div>}
            {u.email && <div className="text-zinc-500 text-xs">{u.email}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {u.provider && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              {u.provider}
            </span>
          )}
          {syncAgo && (
            <span className="text-[10px] text-zinc-500">
              {syncAgo}
            </span>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      {hasData ? (
        <div className="p-4 grid grid-cols-4 gap-2">
          <MetricCard
            icon="👟"
            label={t('metrics.steps')}
            value={u.today_steps?.toLocaleString() ?? null}
            color="green"
            subtitle={t('metrics.today')}
          />
          <MetricCard
            icon="🔥"
            label={t('metrics.calories')}
            value={u.today_calories != null ? Math.round(u.today_calories) : null}
            unit={t('metrics.kcal')}
            color="orange"
            subtitle={t('metrics.today')}
          />
          <MetricCard
            icon="❤️"
            label={t('metrics.heartRate')}
            value={u.last_heart_rate != null ? Math.round(u.last_heart_rate) : null}
            unit={t('metrics.bpm')}
            color="red"
            subtitle={u.today_hr_min != null && u.today_hr_max != null
              ? `${Math.round(u.today_hr_min)}-${Math.round(u.today_hr_max)} ${t('metrics.range')}`
              : u.last_heart_rate_at
                ? formatDistanceToNow(new Date(u.last_heart_rate_at), { addSuffix: true })
                : undefined}
          />
          <MetricCard
            icon="💨"
            label={t('metrics.spo2')}
            value={u.last_spo2 != null ? Math.round(u.last_spo2) : null}
            unit="%"
            color="cyan"
            subtitle={u.last_spo2_at
              ? formatDistanceToNow(new Date(u.last_spo2_at), { addSuffix: true })
              : undefined}
          />
          <MetricCard
            icon="😴"
            label={t('metrics.sleep')}
            value={u.last_sleep_hours ?? null}
            unit={t('metrics.hrs')}
            color="purple"
            subtitle={`${u.sleep_sessions_total} ${t('metrics.sessionsTotal')}`}
          />
          <MetricCard
            icon="💪"
            label={t('metrics.workouts')}
            value={u.total_workouts}
            color="amber"
            subtitle={t('metrics.total')}
          />
          <MetricCard
            icon="📊"
            label={t('metrics.avgHr')}
            value={u.today_hr_avg != null ? Math.round(u.today_hr_avg) : null}
            unit={t('metrics.bpm')}
            color="pink"
            subtitle={t('metrics.today')}
          />
          <MetricCard
            icon="📈"
            label={t('metrics.dataPoints')}
            value={u.total_data_points > 1000
              ? `${(u.total_data_points / 1000).toFixed(1)}k`
              : u.total_data_points}
            color="blue"
            subtitle={t('metrics.total')}
          />
        </div>
      ) : (
        <div className="p-6 text-center text-zinc-600 text-sm">
          {t('dashboard.noHealthData')}
        </div>
      )}
    </Link>
  );
}

function DashboardPage() {
  const { t } = useTranslation();
  const { data: stats, isLoading, error, refetch } = useDashboardStats();
  const { data: usersMetrics, isLoading: isLoadingMetrics } = useUsersMetrics();

  if (isLoading) {
    return <DashboardLoadingState />;
  }

  if (error || !stats) {
    return <DashboardErrorState onRetry={refetch} />;
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-medium text-white">{t('dashboard.title')}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {t('dashboard.subtitle')}
        </p>
      </div>

      {/* Stats Grid */}
      <StatsGrid stats={stats} />

      {/* Users with Metrics */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium text-white">{t('dashboard.usersMetrics')}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {t('dashboard.usersMetricsSubtitle')}
            </p>
          </div>
          <span className="text-[10px] text-zinc-600 bg-zinc-800/50 px-2 py-1 rounded-full">
            {t('dashboard.autoRefresh')}
          </span>
        </div>
        {isLoadingMetrics ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-48 bg-zinc-900/50 border border-zinc-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : usersMetrics && usersMetrics.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {usersMetrics.map((u) => (
              <UserCard key={u.id} u={u} t={t} />
            ))}
          </div>
        ) : (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
            {t('dashboard.noUsers')}
          </div>
        )}
      </div>
    </div>
  );
}
