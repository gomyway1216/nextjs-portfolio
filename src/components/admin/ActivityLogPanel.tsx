'use client';

import { CSSProperties, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, ChevronDown, ChevronUp, Copy, Loader2, RefreshCw, Search } from 'lucide-react';
import {
  getActivityLogs,
  type ActivityCategory,
  type ActivityEnv,
  type ActivityLogEntry,
  type ActivityLogFilters,
  type ActivityResult,
  type ActivitySeverity,
  type ActivitySource,
} from '@/services/activityLogService';

const styles: Record<string, CSSProperties> = {
  card: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: '#94a3b8',
  },
  input: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
  },
  select: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
    width: '100%',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  primaryButton: {
    backgroundColor: '#7c3aed',
    color: '#ffffff',
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
    borderCollapse: 'collapse' as const,
  },
  th: {
    textAlign: 'left' as const,
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#94a3b8',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    color: '#e2e8f0',
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
        backgroundColor: isQuery ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
        color: isQuery ? '#3b82f6' : '#a855f7',
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
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}
      title="Copy"
    >
      {copied ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
    </button>
  );
}

export default function ActivityLogPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Filters — initialized from URL query string for shareable deep-links
  const [requestIdFilter, setRequestIdFilter] = useState(() => searchParams?.get('request_id') ?? '');
  const [actionFilter, setActionFilter] = useState(() => searchParams?.get('action') ?? '');
  const [agentUidFilter, setAgentUidFilter] = useState(() => searchParams?.get('agent_uid') ?? '');
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
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v === undefined || v === null || v === '') continue;
        usp.set(k, String(v));
      }
      const next = usp.toString();
      const current = searchParams?.toString() ?? '';
      if (next !== current) {
        router.replace(`?${next}`, { scroll: false });
      }
    },
    [router, searchParams]
  );

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const filters: ActivityLogFilters = {};
      if (requestIdFilter) filters.request_id = requestIdFilter;
      if (actionFilter) filters.action = actionFilter;
      if (agentUidFilter) filters.agent_uid = agentUidFilter;
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
    requestIdFilter, actionFilter, agentUidFilter, resultFilter, severityFilter,
    categoryFilter, sourceFilter, envFilter, anonFilter, startDate, endDate, limit,
    syncUrlParams,
  ]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalCount = logs.length;
  const successCount = logs.filter((l) => l.result === 'success').length;
  const errorCount = logs.filter((l) => l.result === 'error').length;
  const anonCount = logs.filter((l) => l.is_anonymous).length;

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#ffffff', marginBottom: '8px' }}>
        Activity Log
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: '32px' }}>
        Unified view of every Cloud Function call, Next.js API request, and client event. Errors are inline (filter by result=error).
      </p>

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
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
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
          <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
            <p>Loading activity logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
            <p>No activity logs found for the selected filters.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
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
                    <>
                      <tr key={log.id} style={{ cursor: 'pointer' }} onClick={() => setExpandedLogId(isExpanded ? null : log.id)}>
                        <td style={styles.td}>
                          <span style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>{formatDateTime(log.created_at)}</span>
                        </td>
                        <td style={styles.td}>
                          <code style={{ fontSize: '13px', color: '#e879f9', backgroundColor: 'rgba(168, 85, 247, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>{log.action}</code>
                        </td>
                        <td style={styles.td}><SourceBadge source={log.source} /></td>
                        <td style={styles.td}><CategoryBadge category={log.category} /></td>
                        <td style={styles.td}><ResultBadge result={log.result} severity={log.severity} /></td>
                        <td style={styles.td}>
                          <div style={{ fontSize: '12px', color: log.is_anonymous ? '#facc15' : '#cbd5e1' }}>
                            {log.is_anonymous ? 'anon' : (log.agent_email ?? log.agent_uid.slice(0, 8))}
                          </div>
                        </td>
                        <td style={styles.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <code style={{ fontSize: '12px', fontFamily: 'monospace', color: '#94a3b8' }}>{log.request_id}</code>
                            <CopyButton text={log.request_id} />
                          </div>
                        </td>
                        <td style={styles.td}>
                          {isExpanded ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${log.id}-detail`}>
                          <td colSpan={8} style={{ padding: 0, borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <div style={{ padding: '20px 24px', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                <div>
                                  <p style={styles.label}>Agent UID</p>
                                  <p style={{ color: '#e2e8f0', fontSize: '13px', fontFamily: 'monospace' }}>{log.agent_uid}</p>
                                </div>
                                <div>
                                  <p style={styles.label}>Env / Build</p>
                                  <p style={{ color: '#e2e8f0', fontSize: '13px' }}>
                                    {log.env}
                                    {log.app_version ? ` · v${log.app_version}` : ''}
                                    {log.app_build_sha ? ` · ${log.app_build_sha}` : ''}
                                  </p>
                                </div>
                                <div>
                                  <p style={styles.label}>IP</p>
                                  <p style={{ color: '#e2e8f0', fontSize: '13px' }}>{log.ip_address || 'N/A'}</p>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                  <p style={styles.label}>Parameters</p>
                                  <pre style={{ marginTop: '4px', padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(0, 0, 0, 0.3)', color: '#94a3b8', fontSize: '12px', fontFamily: 'monospace', overflow: 'auto', maxHeight: '200px' }}>
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
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
