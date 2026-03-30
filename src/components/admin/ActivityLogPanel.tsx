'use client';

import { useState, useCallback, useEffect, CSSProperties } from 'react';
import { Loader2, Search, RefreshCw, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { getActivityLogs, type ActivityLogEntry, type ActivityLogFilters } from '@/services/activityLogService';

// ---------------------------------------------------------------------------
// Styles (matching AdminPage patterns)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function ResultBadge({ result }: { result: string }) {
  const isSuccess = result === 'success';
  return (
    <span
      style={{
        ...styles.badge,
        backgroundColor: isSuccess ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
        color: isSuccess ? '#22c55e' : '#ef4444',
      }}
    >
      {result}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}
      title="Copy request ID"
    >
      {copied ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ActivityLogPanelProps {
  onNavigateToErrors?: () => void;
}

export default function ActivityLogPanel({ onNavigateToErrors }: ActivityLogPanelProps = {}) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [resultFilter, setResultFilter] = useState<'' | 'success' | 'error'>('');
  const [categoryFilter, setCategoryFilter] = useState<'' | 'query' | 'mutation'>('');
  const [requestIdFilter, setRequestIdFilter] = useState('');
  const [startDate, setStartDate] = useState(getTodayDateString);
  const [endDate, setEndDate] = useState('');
  const [limit, setLimit] = useState('100');

  // Listen for cross-section navigation (from Errors → Activity Log with request_id)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setRequestIdFilter(detail);
        setStartDate('');  // Clear date filter when searching by request_id
      }
    };
    window.addEventListener('set-activity-log-request-id', handler);
    return () => window.removeEventListener('set-activity-log-request-id', handler);
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const filters: ActivityLogFilters = {};
      if (actionFilter) filters.action = actionFilter;
      if (resultFilter) filters.result = resultFilter;
      if (categoryFilter) filters.category = categoryFilter;
      if (requestIdFilter) filters.request_id = requestIdFilter;
      if (startDate) filters.start_date = startDate;
      if (endDate) filters.end_date = endDate;
      filters.limit = Number(limit) || 100;

      const data = await getActivityLogs(filters);
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, resultFilter, categoryFilter, requestIdFilter, startDate, endDate, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Summary stats
  const totalCount = logs.length;
  const successCount = logs.filter((l) => l.result === 'success').length;
  const errorCount = logs.filter((l) => l.result === 'error').length;

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#ffffff', marginBottom: '8px' }}>
        Activity Log
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: '32px' }}>
        Monitor all API requests with request_id tracking
      </p>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total', value: totalCount, color: '#3b82f6' },
          { label: 'Success', value: successCount, color: '#22c55e' },
          { label: 'Errors', value: errorCount, color: '#ef4444' },
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
              <input
                type="text"
                placeholder="e.g. createTask"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                style={styles.input}
              />
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Result</label>
              <select
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value as '' | 'success' | 'error')}
                style={styles.select}
              >
                <option value="">All</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
              </select>
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as '' | 'query' | 'mutation')}
                style={styles.select}
              >
                <option value="">All</option>
                <option value="query">Query</option>
                <option value="mutation">Mutation</option>
              </select>
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={styles.input}
              />
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={styles.input}
              />
            </div>

            <div>
              <label style={{ ...styles.label, marginBottom: '4px' }}>Limit</label>
              <select
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                style={styles.select}
              >
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
              </select>
            </div>

            <button
              onClick={fetchLogs}
              disabled={loading}
              style={{
                ...styles.button,
                ...styles.primaryButton,
                opacity: loading ? 0.7 : 1,
                height: '38px',
              }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div
          style={{
            ...styles.card,
            marginBottom: '24px',
            borderColor: 'rgba(239, 68, 68, 0.3)',
          }}
        >
          <div style={{ padding: '16px 24px', color: '#ef4444' }}>{error}</div>
        </div>
      )}

      {/* Logs Table */}
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
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Result</th>
                  <th style={styles.th}>Request ID</th>
                  <th style={styles.th}>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <tr key={log.id} style={{ cursor: 'pointer' }} onClick={() => setExpandedLogId(isExpanded ? null : log.id)}>
                      <td style={styles.td}>
                        <span style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>
                          {formatDateTime(log.created_at)}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <code style={{ fontSize: '13px', color: '#e879f9', backgroundColor: 'rgba(168, 85, 247, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                          {log.action}
                        </code>
                      </td>
                      <td style={styles.td}>
                        <CategoryBadge category={log.category} />
                      </td>
                      <td style={styles.td}>
                        <ResultBadge result={log.result} />
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <code style={{ fontSize: '12px', fontFamily: 'monospace', color: '#94a3b8' }}>
                            {log.request_id}
                          </code>
                          <CopyButton text={log.request_id} />
                        </div>
                      </td>
                      <td style={styles.td}>
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Expanded detail */}
            {expandedLogId && (() => {
              const log = logs.find((l) => l.id === expandedLogId);
              if (!log) return null;
              return (
                <div
                  style={{
                    padding: '20px 24px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <p style={styles.label}>User</p>
                      <p style={{ color: '#e2e8f0', fontSize: '14px' }}>{log.user_email}</p>
                    </div>
                    <div>
                      <p style={styles.label}>IP Address</p>
                      <p style={{ color: '#e2e8f0', fontSize: '14px' }}>{log.ip_address || 'N/A'}</p>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <p style={styles.label}>Parameters</p>
                      <pre
                        style={{
                          marginTop: '4px',
                          padding: '12px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          color: '#94a3b8',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          overflow: 'auto',
                          maxHeight: '200px',
                        }}
                      >
                        {JSON.stringify(log.params, null, 2)}
                      </pre>
                    </div>
                    {log.error_message && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <p style={{ ...styles.label, color: '#ef4444' }}>Error Message</p>
                        <p style={{ color: '#fca5a5', fontSize: '14px', marginTop: '4px' }}>
                          {log.error_message}
                        </p>
                      </div>
                    )}
                    {log.error_details && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <p style={{ ...styles.label, color: '#ef4444' }}>Error Details</p>
                        <pre
                          style={{
                            marginTop: '4px',
                            padding: '12px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(239, 68, 68, 0.05)',
                            color: '#fca5a5',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            overflow: 'auto',
                            maxHeight: '200px',
                          }}
                        >
                          {JSON.stringify(log.error_details, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.result === 'error' && onNavigateToErrors && (
                      <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                        <button
                          onClick={() => onNavigateToErrors()}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            color: '#fca5a5',
                            fontSize: '13px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          View in Error Monitoring
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
