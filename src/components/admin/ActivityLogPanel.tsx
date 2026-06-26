'use client';

import { CSSProperties, Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, Check, ChevronDown, ChevronUp, Copy, List, Loader2, RefreshCw, Search } from 'lucide-react';
import {
  getActivityLogs,
  getActivityLogTraffic,
  type ActivityCategory,
  type ActivityEnv,
  type ActivityLogEntry,
  type ActivityLogFilters,
  type ActivityLogTraffic,
  type ActivityResult,
  type ActivitySeverity,
  type ActivitySource,
} from '@/services/activityLogService';
import TrafficLineChart from './TrafficLineChart';

type TabKey = 'logs' | 'overview';

const activityColors = {
  surface: '#14171c',
  surfaceRaised: '#181c22',
  surfaceMuted: '#111419',
  border: 'rgba(226, 232, 240, 0.12)',
  borderStrong: 'rgba(226, 232, 240, 0.18)',
  text: '#f5f7fb',
  textMuted: '#a6b0bf',
  textSubtle: '#6f7a8a',
  accent: '#5aa2ff',
  accentSoft: 'rgba(90, 162, 255, 0.14)',
  accentBorder: 'rgba(90, 162, 255, 0.34)',
  accentSecondary: '#7dd3c7',
  accentSecondarySoft: 'rgba(85, 214, 190, 0.12)',
  success: '#34d399',
  danger: '#ef4444',
  warning: '#facc15',
} as const;

const activityTransition = 'background-color 160ms ease, border-color 160ms ease, color 160ms ease';

const styles: Record<string, CSSProperties> = {
  card: {
    backgroundColor: activityColors.surface,
    borderRadius: '8px',
    border: `1px solid ${activityColors.border}`,
    overflow: 'hidden',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: activityColors.textMuted,
  },
  input: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: `1px solid ${activityColors.borderStrong}`,
    backgroundColor: activityColors.surfaceRaised,
    color: activityColors.text,
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    accentColor: activityColors.accent,
  },
  select: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: `1px solid ${activityColors.borderStrong}`,
    backgroundColor: activityColors.surfaceRaised,
    color: activityColors.text,
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
    width: '100%',
    accentColor: activityColors.accent,
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid transparent',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: activityTransition,
  },
  primaryButton: {
    backgroundColor: activityColors.accent,
    borderColor: activityColors.accent,
    color: '#06121f',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: '600',
  },
  table: {
    width: '100%',
    borderCollapse: 'separate' as const,
    borderSpacing: 0,
  },
  th: {
    textAlign: 'left' as const,
    padding: '12px 16px',
    borderBottom: `1px solid ${activityColors.border}`,
    color: activityColors.textSubtle,
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    letterSpacing: 0,
    backgroundColor: activityColors.surfaceMuted,
  },
  td: {
    padding: '12px 16px',
    borderBottom: `1px solid ${activityColors.border}`,
    color: '#d7dde7',
    fontSize: '14px',
  },
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function ResultBadge({ result, severity }: { result: ActivityResult; severity?: ActivitySeverity }) {
  if (result === 'success') {
    return (
      <span style={{ ...styles.badge, backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>
        success
      </span>
    );
  }
  const sev = severity ?? 'error';
  const palette = sev === 'critical'
    ? { bg: 'rgba(220, 38, 38, 0.2)', fg: '#fca5a5' }
    : sev === 'warning'
      ? { bg: 'rgba(234, 179, 8, 0.15)', fg: '#fde68a' }
      : { bg: 'rgba(239, 68, 68, 0.15)', fg: '#ef4444' };
  return (
    <span style={{ ...styles.badge, backgroundColor: palette.bg, color: palette.fg }}>
      {sev}
    </span>
  );
}

function CategoryBadge({ category }: { category: ActivityCategory }) {
  const isQuery = category === 'query';
  return (
    <span
      style={{
        ...styles.badge,
        backgroundColor: isQuery ? activityColors.accentSoft : activityColors.accentSecondarySoft,
        color: isQuery ? activityColors.accent : activityColors.accentSecondary,
      }}
    >
      {category}
    </span>
  );
}

function SourceBadge({ source }: { source: ActivitySource }) {
  const palette = source === 'cloud_function'
    ? { bg: 'rgba(56, 189, 248, 0.15)', fg: '#38bdf8' }
    : source === 'next_api'
      ? { bg: 'rgba(45, 212, 191, 0.15)', fg: '#2dd4bf' }
      : { bg: 'rgba(250, 204, 21, 0.15)', fg: '#facc15' };
  return (
    <span style={{ ...styles.badge, backgroundColor: palette.bg, color: palette.fg }}>
      {source}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: activityColors.textMuted, padding: '2px' }}
      title="Copy"
    >
      {copied ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
    </button>
  );
}

export default function ActivityLogPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabKey>(() => (searchParams?.get('tab') as TabKey | null) ?? 'logs');
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const [traffic, setTraffic] = useState<ActivityLogTraffic | null>(null);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficError, setTrafficError] = useState('');

  // Filters — initialized from URL query string for shareable deep-links
  const [requestIdFilter, setRequestIdFilter] = useState(() => searchParams?.get('request_id') ?? '');
  const [actionFilter, setActionFilter] = useState(() => searchParams?.get('action') ?? '');
  const [agentUidFilter, setAgentUidFilter] = useState(() => searchParams?.get('agent_uid') ?? '');
  const [sessionIdFilter, setSessionIdFilter] = useState(() => searchParams?.get('session_id') ?? '');
  const [resultFilter, setResultFilter] = useState<'' | ActivityResult>(() => (searchParams?.get('result') as ActivityResult | null) ?? '');
  const [severityFilter, setSeverityFilter] = useState<'' | ActivitySeverity>(() => (searchParams?.get('severity') as ActivitySeverity | null) ?? '');
  const [categoryFilter, setCategoryFilter] = useState<'' | ActivityCategory>(() => (searchParams?.get('category') as ActivityCategory | null) ?? '');
  const [sourceFilter, setSourceFilter] = useState<'' | ActivitySource>(() => (searchParams?.get('source') as ActivitySource | null) ?? '');
  const [envFilter, setEnvFilter] = useState<'' | ActivityEnv>(() => (searchParams?.get('env') as ActivityEnv | null) ?? 'prod');
  const [anonFilter, setAnonFilter] = useState<'' | 'true' | 'false'>(() => (searchParams?.get('is_anonymous') as 'true' | 'false' | null) ?? '');
  const [startDate, setStartDate] = useState(() => searchParams?.get('start_date') ?? getTodayDateString());
  const [endDate, setEndDate] = useState(() => searchParams?.get('end_date') ?? '');
  const [limit, setLimit] = useState(() => searchParams?.get('limit') ?? '100');

  const syncUrlParams = useCallback(
    (filters: ActivityLogFilters) => {
      if (typeof window === 'undefined') return;
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v === undefined || v === null || v === '') continue;
        usp.set(k, String(v));
      }
      const next = usp.toString();
      const current = window.location.search.replace(/^\?/, '');
      if (next === current) return;
      // Preserve the URL hash — AdminPage uses it to pick the active section
      // (e.g. `#activity-logs`). router.replace with just `?...` would drop it.
      const hash = window.location.hash;
      const path = window.location.pathname;
      router.replace(`${path}${next ? `?${next}` : ''}${hash}`, { scroll: false });
    },
    [router]
  );

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const filters: ActivityLogFilters = {};
      if (requestIdFilter) filters.request_id = requestIdFilter;
      if (actionFilter) filters.action = actionFilter;
      if (agentUidFilter) filters.agent_uid = agentUidFilter;
      if (sessionIdFilter) filters.session_id = sessionIdFilter;
      if (resultFilter) filters.result = resultFilter;
      if (severityFilter) filters.severity = severityFilter;
      if (categoryFilter) filters.category = categoryFilter;
      if (sourceFilter) filters.source = sourceFilter;
      if (envFilter) filters.env = envFilter;
      if (anonFilter) filters.is_anonymous = anonFilter === 'true';
      if (startDate) filters.start_date = startDate;
      if (endDate) filters.end_date = endDate;
      filters.limit = Number(limit) || 100;

      syncUrlParams(filters);

      const data = await getActivityLogs(filters);
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [
    requestIdFilter, actionFilter, agentUidFilter, sessionIdFilter, resultFilter, severityFilter,
    categoryFilter, sourceFilter, envFilter, anonFilter, startDate, endDate, limit,
    syncUrlParams,
  ]);

  useEffect(() => {
    if (activeTab === 'logs') fetchLogs();
  }, [activeTab, fetchLogs]);

  const fetchTraffic = useCallback(async () => {
    setTrafficLoading(true);
    setTrafficError('');
    try {
      const data = await getActivityLogTraffic({
        env: envFilter || undefined,
        source: sourceFilter || undefined,
        action: actionFilter || undefined,
        agent_uid: agentUidFilter || undefined,
        is_anonymous: anonFilter ? anonFilter === 'true' : undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      setTraffic(data);
    } catch (err) {
      setTrafficError(err instanceof Error ? err.message : 'Failed to fetch traffic');
    } finally {
      setTrafficLoading(false);
    }
  }, [envFilter, sourceFilter, actionFilter, agentUidFilter, anonFilter, startDate, endDate]);

  useEffect(() => {
    if (activeTab === 'overview') fetchTraffic();
  }, [activeTab, fetchTraffic]);

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const usp = new URLSearchParams(window.location.search);
      if (tab === 'logs') usp.delete('tab');
      else usp.set('tab', tab);
      const search = usp.toString();
      router.replace(`${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`, { scroll: false });
    }
  };

  const totalCount = logs.length;
  const successCount = logs.filter((l) => l.result === 'success').length;
  const errorCount = logs.filter((l) => l.result === 'error').length;
  const anonCount = logs.filter((l) => l.is_anonymous).length;

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: '650', color: activityColors.text, marginBottom: '8px', letterSpacing: 0 }}>
        Activity Log
      </h1>
      <p style={{ color: activityColors.textMuted, marginBottom: '20px' }}>
        Unified view of every Cloud Function call, Next.js API request, and client event. Errors are inline (filter by result=error).
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: `1px solid ${activityColors.border}` }}>
        {([
          { key: 'logs' as TabKey, label: 'Logs', icon: List },
          { key: 'overview' as TabKey, label: 'Overview', icon: BarChart3 },
        ]).map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => switchTab(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 18px',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? `2px solid ${activityColors.accent}` : '2px solid transparent',
                color: isActive ? activityColors.text : activityColors.textMuted,
                fontSize: '14px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                marginBottom: '-1px',
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' ? (
        <OverviewView
          traffic={traffic}
          loading={trafficLoading}
          error={trafficError}
          onRefresh={fetchTraffic}
        />
      ) : null}

      {activeTab === 'logs' ? (
        <>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total', value: totalCount, color: '#3b82f6' },
          { label: 'Success', value: successCount, color: '#22c55e' },
          { label: 'Errors', value: errorCount, color: '#ef4444' },
          { label: 'Anonymous', value: anonCount, color: '#facc15' },
        ].map((card) => (
          <div key={card.label} style={styles.card}>
            <div style={{ padding: '20px 24px' }}>
              <p style={{ ...styles.label, marginBottom: '8px' }}>{card.label}</p>
              <p style={{ fontSize: '32px', fontWeight: '700', color: card.color }}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ ...styles.card, marginBottom: '24px' }}>
        <div style={{ padding: '16px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', alignItems: 'end' }}>
            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Request ID</label>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: activityColors.textSubtle }} />
                <input
                  type="text"
                  placeholder="e.g. a1b2c3d4e5f6"
                  value={requestIdFilter}
                  onChange={(e) => setRequestIdFilter(e.target.value)}
                  style={{ ...styles.input, paddingLeft: '32px', fontFamily: 'monospace' }}
                />
              </div>
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Action</label>
              <input type="text" placeholder="e.g. createTask" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={styles.input} />
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Agent UID</label>
              <input type="text" placeholder="firebase uid" value={agentUidFilter} onChange={(e) => setAgentUidFilter(e.target.value)} style={{ ...styles.input, fontFamily: 'monospace' }} />
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Session ID</label>
              <input type="text" placeholder="browser session uuid" value={sessionIdFilter} onChange={(e) => setSessionIdFilter(e.target.value)} style={{ ...styles.input, fontFamily: 'monospace' }} />
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Result</label>
              <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value as '' | ActivityResult)} style={styles.select}>
                <option value="">All</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
              </select>
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Severity</label>
              <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as '' | ActivitySeverity)} style={styles.select}>
                <option value="">All</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Source</label>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as '' | ActivitySource)} style={styles.select}>
                <option value="">All</option>
                <option value="cloud_function">Cloud Function</option>
                <option value="next_api">Next.js API</option>
                <option value="client">Client</option>
              </select>
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Category</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as '' | ActivityCategory)} style={styles.select}>
                <option value="">All</option>
                <option value="query">Query</option>
                <option value="mutation">Mutation</option>
              </select>
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Env</label>
              <select value={envFilter} onChange={(e) => setEnvFilter(e.target.value as '' | ActivityEnv)} style={styles.select}>
                <option value="">All</option>
                <option value="prod">Prod</option>
                <option value="dev">Dev</option>
              </select>
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Anonymous</label>
              <select value={anonFilter} onChange={(e) => setAnonFilter(e.target.value as '' | 'true' | 'false')} style={styles.select}>
                <option value="">All</option>
                <option value="false">Logged-in</option>
                <option value="true">Anonymous</option>
              </select>
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.input} />
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.input} />
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Limit</label>
              <select value={limit} onChange={(e) => setLimit(e.target.value)} style={styles.select}>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
              </select>
            </div>

            <button onClick={fetchLogs} disabled={loading} style={{ ...styles.button, ...styles.primaryButton, opacity: loading ? 0.7 : 1, height: '38px' }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ ...styles.card, marginBottom: '24px', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <div style={{ padding: '16px 24px', color: '#ef4444' }}>{error}</div>
        </div>
      )}

      <div style={styles.card}>
        {loading && logs.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: activityColors.textMuted }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
            <p>Loading activity logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: activityColors.textMuted }}>
            <p>No activity logs found for the selected filters.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={{ backgroundColor: activityColors.surfaceMuted }}>
                  <th style={styles.th}>Time</th>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>Source</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Result</th>
                  <th style={styles.th}>Agent</th>
                  <th style={styles.th}>Request ID</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <Fragment key={log.id}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedLogId(isExpanded ? null : log.id)}>
                        <td style={styles.td}>
                          <span style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>{formatDateTime(log.created_at)}</span>
                        </td>
                        <td style={styles.td}>
                          <code style={{ fontSize: '13px', color: activityColors.accent, backgroundColor: activityColors.accentSoft, padding: '2px 6px', borderRadius: '4px' }}>{log.action}</code>
                        </td>
                        <td style={styles.td}><SourceBadge source={log.source} /></td>
                        <td style={styles.td}><CategoryBadge category={log.category} /></td>
                        <td style={styles.td}><ResultBadge result={log.result} severity={log.severity} /></td>
                        <td style={styles.td}>
                          <div style={{ fontSize: '12px', color: log.is_anonymous ? activityColors.warning : '#d7dde7' }}>
                            {log.is_anonymous ? 'anon' : (log.agent_email ?? log.agent_uid?.slice(0, 8) ?? '')}
                          </div>
                        </td>
                        <td style={styles.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <code style={{ fontSize: '12px', fontFamily: 'monospace', color: activityColors.textMuted }}>{log.request_id}</code>
                            <CopyButton text={log.request_id} />
                          </div>
                        </td>
                        <td style={styles.td}>
                          {isExpanded ? <ChevronUp size={16} color={activityColors.textMuted} /> : <ChevronDown size={16} color={activityColors.textMuted} />}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0, borderBottom: `1px solid ${activityColors.border}` }}>
                            <div style={{ padding: '20px 24px', backgroundColor: activityColors.surfaceMuted }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                <div>
                                  <p style={styles.label}>Agent UID</p>
                                  <p style={{ color: '#d7dde7', fontSize: '13px', fontFamily: 'monospace' }}>{log.agent_uid}</p>
                                </div>
                                <div>
                                  <p style={styles.label}>Session ID</p>
                                  <p style={{ color: '#d7dde7', fontSize: '13px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{log.session_id || 'N/A'}</p>
                                </div>
                                <div>
                                  <p style={styles.label}>Env / Build</p>
                                  <p style={{ color: '#d7dde7', fontSize: '13px' }}>
                                    {log.env}
                                    {log.app_version ? ` · v${log.app_version}` : ''}
                                    {log.app_build_sha ? ` · ${log.app_build_sha}` : ''}
                                  </p>
                                </div>
                                <div>
                                  <p style={styles.label}>IP</p>
                                  <p style={{ color: '#d7dde7', fontSize: '13px' }}>{log.ip_address || 'N/A'}</p>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                  <p style={styles.label}>Parameters</p>
                                  <pre style={{ marginTop: '4px', padding: '12px', borderRadius: '8px', backgroundColor: '#0b0d10', color: activityColors.textMuted, fontSize: '12px', fontFamily: 'monospace', overflow: 'auto', maxHeight: '200px' }}>
                                    {JSON.stringify(log.params, null, 2)}
                                  </pre>
                                </div>
                                {log.error_message && (
                                  <div style={{ gridColumn: '1 / -1' }}>
                                    <p style={{ ...styles.label, color: '#ef4444' }}>Error Message</p>
                                    <p style={{ color: '#fca5a5', fontSize: '14px', marginTop: '4px' }}>{log.error_message}</p>
                                  </div>
                                )}
                                {log.error_details && (
                                  <div style={{ gridColumn: '1 / -1' }}>
                                    <p style={{ ...styles.label, color: '#ef4444' }}>Error Details</p>
                                    <pre style={{ marginTop: '4px', padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.05)', color: '#fca5a5', fontSize: '12px', fontFamily: 'monospace', overflow: 'auto', maxHeight: '200px' }}>
                                      {JSON.stringify(log.error_details, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewView({
  traffic,
  loading,
  error,
  onRefresh,
}: {
  traffic: ActivityLogTraffic | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const cardStyle: CSSProperties = {
    backgroundColor: activityColors.surface,
    borderRadius: '8px',
    border: `1px solid ${activityColors.border}`,
    padding: '20px 24px',
    marginBottom: '20px',
  };

  const sectionTitle: CSSProperties = {
    color: activityColors.text,
    fontSize: '14px',
    fontWeight: 600,
    margin: 0,
  };
  const sectionSub: CSSProperties = {
    color: activityColors.textMuted,
    fontSize: '12px',
    marginTop: '2px',
    marginBottom: '12px',
  };

  if (loading && !traffic) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: '48px', color: activityColors.textMuted }}>
        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
        <p>Loading traffic…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ ...cardStyle, borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }}>{error}</div>
    );
  }
  if (!traffic) return null;

  const { buckets, granularity, total, by_result, by_severity, by_source } = traffic;
  const totalCount = total.total;

  // Volume + cost estimates. Firestore: $0.18 / 100K writes, $0.18/GB/month
  // storage. Avg row size ~1KB → 1M rows ≈ 1GB. These are rough numbers, but
  // good enough to know "is this getting expensive" at a glance.
  const dailyAvg = buckets.length > 0 ? Math.round(totalCount / buckets.length) : 0;
  const costForRange = (totalCount / 100_000) * 0.18; // USD
  const projected30Day = dailyAvg * 30;
  const projected30DayCost = (projected30Day / 100_000) * 0.18;
  const storage30DayGB = (projected30Day * 1) / (1024 * 1024); // 1KB avg
  const storageMonthlyCost = storage30DayGB * 0.18;
  const errorCount = by_result.find((s) => s.key === 'error')?.total ?? 0;
  const errorRate = totalCount > 0 ? (errorCount / totalCount) * 100 : 0;

  const formatUsd = (n: number) => (n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`);

  const volumeCard: CSSProperties = {
    backgroundColor: activityColors.surface,
    borderRadius: '8px',
    border: `1px solid ${activityColors.border}`,
    padding: '20px 24px',
    marginBottom: '20px',
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ color: activityColors.textMuted, fontSize: '13px' }}>
          {buckets.length} buckets · granularity={granularity}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '8px', border: 'none',
            background: activityColors.accent, color: '#06121f', fontSize: '13px',
            fontWeight: 500, cursor: 'pointer', opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {/* Volume summary — answers "are we logging too much?" at a glance */}
      <div style={volumeCard}>
        <p style={{ color: activityColors.text, fontSize: '14px', fontWeight: 600, margin: 0, marginBottom: '4px' }}>
          Volume & Cost
        </p>
        <p style={{ color: activityColors.textMuted, fontSize: '12px', margin: 0, marginBottom: '16px' }}>
          Estimates based on Firestore pricing ($0.18/100K writes, $0.18/GB/month storage, ~1KB avg row).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
          {[
            { label: 'In selected range', value: totalCount.toLocaleString(), sub: formatUsd(costForRange), color: '#3b82f6' },
            { label: 'Daily avg', value: dailyAvg.toLocaleString(), sub: '/ day', color: activityColors.accent },
            { label: 'Projected 30-day writes', value: projected30Day.toLocaleString(), sub: formatUsd(projected30DayCost) + ' write cost', color: activityColors.success },
            { label: 'Projected 30-day storage', value: storage30DayGB < 0.01 ? '<0.01 GB' : `${storage30DayGB.toFixed(2)} GB`, sub: formatUsd(storageMonthlyCost) + '/mo', color: activityColors.warning },
            { label: 'Error rate', value: `${errorRate.toFixed(1)}%`, sub: `${errorCount.toLocaleString()} errors`, color: errorRate > 5 ? activityColors.danger : activityColors.textMuted },
          ].map((m) => (
            <div key={m.label}>
              <p style={{ color: activityColors.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: 0, margin: 0, marginBottom: '4px' }}>{m.label}</p>
              <p style={{ color: m.color, fontSize: '22px', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{m.value}</p>
              <p style={{ color: activityColors.textSubtle, fontSize: '11px', margin: 0, marginTop: '2px' }}>{m.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <p style={sectionTitle}>All Traffic</p>
        <p style={sectionSub}>Total requests across every source.</p>
        <TrafficLineChart buckets={buckets} granularity={granularity} series={[total]} />
      </div>

      <div style={cardStyle}>
        <p style={sectionTitle}>By Result</p>
        <p style={sectionSub}>Success vs error over time.</p>
        <TrafficLineChart buckets={buckets} granularity={granularity} series={by_result} />
      </div>

      <div style={cardStyle}>
        <p style={sectionTitle}>By Severity</p>
        <p style={sectionSub}>Error severity breakdown — flat lines = no errors.</p>
        <TrafficLineChart buckets={buckets} granularity={granularity} series={by_severity} />
      </div>

      <div style={cardStyle}>
        <p style={sectionTitle}>By Source</p>
        <p style={sectionSub}>Cloud Function vs Next.js API vs client events.</p>
        <TrafficLineChart buckets={buckets} granularity={granularity} series={by_source} />
      </div>
    </div>
  );
}
