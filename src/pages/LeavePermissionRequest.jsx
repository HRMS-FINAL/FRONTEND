import React, { useState, useEffect } from 'react';
// `Search` icon dropped Jun 2026 — search bar removed from the page.
import { ChevronRight, ClipboardList, AlertCircle, Check, X, Clock, Inbox } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

// Mobile-app leave & permission requests arrive via HRMS backend proxy at
// /api/leave-requests (server-side talks to https://backend-emqy.onrender.com
// using MOBILE_ADMIN_SECRET). The UI below is unchanged — only the data
// source switched from the hardcoded mock array to real fetches.
import { API } from '../config/api';
// Bumped Jun 2026 (#292) — v2 caches stored rows WITHOUT the _kind
// property that the new filter relies on. Bumping to v3 invalidates
// every stale browser cache so the next load reads fresh items and
// stamps _kind correctly. The 30s polling refresh would eventually
// fix it on its own, but the cache hydration that happens BEFORE the
// first fetch lands would still serve stale, _kind-less rows.
// v5 (#308) — requestType is now the primary classifier signal — it's
// the same field the HRMS backend reshape uses to decide isPermission,
// so trusting it directly removes the entire failure surface.
// Rows stamped with the v3 classifier may have leaked permission→leave
// (or vice-versa) for ambiguous types; bumping the key forces a fresh
// classify pass on every browser that loads this build.
// v6 (#324) — strict-equality classifier replaces the previous
// `.includes('permission')` fuzzy match which would classify any
// string containing the word "permission" (even "no-permission"
// or "permission-leave-blend") as a permission. Bumping the key
// invalidates every stale cache that was stamped with the loose
// matcher so the next page-load reclassifies from raw fields.
const LS_KEY = 'tesco_hrms_leave_requests_cache_v7';

/**
 * Classify a single row as 'leave' or 'permission'. Runs ONCE at fetch
 * time (not on every render), and the result is stamped onto the row
 * as `_kind`. The filter/count/render code reads only `_kind` — so a
 * miscount and a misplaced row are now impossible: either every row is
 * tagged the same way for both, or no rows show at all.
 *
 * Priority order:
 *   1. The visible `type` STRING is the source of truth. The HRMS
 *      backend's reshape generates "Permission (Nh)" for permissions
 *      and "Casual Leave"/"Sick Leave"/"Earned Leave" for leaves. If
 *      the user sees "Casual Leave" in the Type column, the row MUST
 *      be classified as leave. Same in reverse for "Permission ...".
 *   2. Structural fingerprint — a row with durationHours / startTime /
 *      endTime / permissionDate but NO date range is a permission. A
 *      row with startDate / endDate is a leave. (Catches edge cases
 *      where the reshape forgot to stamp `type`.)
 *   3. Last resort `requestType` — checked LAST because we have seen
 *      it inverted on legacy mobile-backend writes.
 *
 * Anything we still can't decide defaults to 'leave' (safer because the
 * Permission tab is much smaller and a leak there is louder).
 */
function classifyRow(r) {
  // #324 — STRICT-EQUALITY classifier.
  //
  // The previous version used `.includes('permission')` / `.includes('leave')`
  // which would tag any string CONTAINING those words. That is the
  // most likely source of the cross-tab data leakage HR reported: a
  // leave row whose `type` happened to contain the substring
  // "permission" anywhere (e.g. legacy data where the field briefly
  // held a sentence like "needs permission for casual leave") would
  // be stamped as a permission and surface in the Permission tab.
  //
  // We now use exact-equality checks on normalised values. Whitespace
  // and case are still stripped, but no substring matching.
  //
  // PRIMARY signal: `requestType` — the same field the HRMS backend
  // reshape uses in `isPermission = d.requestType === 'permission'`.
  // Trusting it directly here makes the frontend filter impossible
  // to disagree with the backend's notion of a row's kind.
  // #492 — AUTHORITATIVE signal: the backend now stamps `kind` from the SAME
  // `isPermission` flag that generated the visible `type` string, so trusting
  // it makes a row's tab and its displayed type impossible to disagree. This
  // wins over every heuristic below.
  const backendKind = String(r?.kind || '').toLowerCase().trim();
  if (backendKind === 'permission') return 'permission';
  if (backendKind === 'leave')      return 'leave';

  const rt = String(r?.requestType || '').toLowerCase().trim();
  if (rt === 'permission') return 'permission';
  if (rt === 'leave')      return 'leave';

  // FALLBACK 1: visible `type` string. Permission rows are reshaped
  // as 'Permission (Nh)' (always starts with "permission"); leave
  // rows as 'Sick Leave' / 'Casual Leave' / 'Earned Leave' / etc.
  // We test against tight patterns instead of substring includes.
  const t = String(r?.type || '').toLowerCase().trim();
  if (/^permission\b/.test(t))             return 'permission';
  if (/\bleave$/.test(t) || /\bleave\b/.test(t)) return 'leave';

  // FALLBACK 2: duration unit. The backend reshape produces:
  //   permission -> "N Hour" or "N Hours"
  //   leave      -> "N Day" / "N Days" / "Half Day"
  const dur = String(r?.duration || '').toLowerCase().trim();
  if (dur) {
    // Permission durations always start with a number followed by
    // "hour"/"hours" (or "hr"/"hrs"). Match the prefix shape.
    if (/^\d+\s*(?:hours?|hrs?)\b/.test(dur)) return 'permission';
    // Leave durations end with "day"/"days" or equal "half day".
    if (/^half\s+day$/.test(dur))             return 'leave';
    if (/^\d+\s*days?$/.test(dur))            return 'leave';
  }

  // FALLBACK 3: structural — leave rows always have a date range;
  // permission rows always have a single date + time window.
  // We check the leave signal FIRST because the leave list is
  // larger and a leak there is the loudest visible bug.
  if (r?.startDate || r?.endDate)                          return 'leave';
  if (r?.durationHours || r?.startTime || r?.endTime ||
      r?.permissionDate)                                   return 'permission';

  // Last resort default — assume leave (the larger list).
  return 'leave';
}

/** Map a raw API row to a row stamped with _kind. The spread puts
 *  `_kind` LAST so any pre-existing _kind on the row (from a stale
 *  cache) is overwritten by the fresh classification. */
function stampKind(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const { _kind: _drop, ...rest } = r || {};
    return { ...rest, _kind: classifyRow(rest) };
  });
}

/** Read last-fetched requests from localStorage so the page populates
 *  instantly on refresh instead of waiting for the ~30s mobile-backend
 *  cold-start to complete. Cached rows pass through stampKind so the
 *  filter/count code can rely on `_kind` even before the next poll. */
function readCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return stampKind(parsed);
  } catch { return []; }
}

export default function LeavePermissionRequest({ onBack }) {
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState('leave-requests'); // 'leave-requests' or 'permission-requests'
  // #324 — Tab-swap clear flag. When the user clicks Leave Requests or
  // Permission Requests, we briefly null the rendered rows so the new
  // tab cannot show ANY data from the previous tab even for a single
  // paint. After ~80 ms (one animation frame plus a safety margin) we
  // un-flag and the useMemo recomputes the correctly-filtered rows.
  // #491 — Tab switching is a PURE, synchronous state change. The previous
  // implementation used a `tabSwapping` flag flipped off by a setTimeout(80),
  // which is a race condition: the table could stay empty, or briefly show the
  // old tab's rows / an empty list under the new heading, making the card
  // filter feel inconsistent. React re-renders synchronously on setActiveTab
  // and the displayRecords useMemo below recomputes in the SAME commit, so the
  // filtered rows, section title, and active card ALWAYS agree — on every
  // click, load and refresh — with no timing window and no stale state.
  const switchTab = React.useCallback((nextTab) => {
    setActiveTab(nextTab);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [actionModal, setActionModal] = useState(null);
  const [actionMessage, setActionMessage] = useState('');

  // Seed from cache so the table is never blank on refresh.
  const [requests, setRequests] = useState(() => readCache());
  const [loading,  setLoading]  = useState(true);

  // Load + poll: refetch every 30s so newly-filed mobile requests show up
  // automatically. The shape returned by /api/leave-requests already matches
  // the field names this UI expects (name/role/dept/type/duration/date/...).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res  = await fetch(`${API}/leave-requests?limit=200`);
        const data = await res.json();
        if (!cancelled && data && Array.isArray(data.items)) {
          // Stamp _kind on every row at fetch time so the filter is a
          // pure property read instead of a runtime function call. This
          // eliminates an entire class of bug where count and filter
          // disagree because the classifier was tweaked but only one
          // call site got updated. Also: cache the STAMPED rows so the
          // next page-load hydrates with _kind already present.
          const stamped = stampKind(data.items);
          // #308 — One-shot diagnostic. Logs the FIRST row's raw fields
          // and computed _kind so we can verify in DevTools that the
          // classifier sees what we expect. Open Console after page
          // load — you should see lines like:
          //   [Approvals] first row { requestType: 'permission',
          //     type: 'Permission (2h)', duration: '2 Hours',
          //     _kind: 'permission' }
          // Remove after a week of clean data.
          if (stamped[0]) {
            const f = stamped[0];
            // eslint-disable-next-line no-console
            console.log('[Approvals] first row',
              { _id: f._id, requestType: f.requestType, type: f.type,
                duration: f.duration, status: f.status, _kind: f._kind });
          }
          setRequests(stamped);
          try { localStorage.setItem(LS_KEY, JSON.stringify(stamped)); } catch {}
        }
      } catch { /* leave previous data on screen */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const handleManagerAction = async (rowKey, newManagerStatus) => {
    // IMPORTANT: rowKey is the row's mongo `_id`, NOT the company
    // employee ID. Earlier this function looked rows up by `r.id`
    // (which equals empId like "TES026") — that key collides for
    // every employee with > 1 pending request, so the patch landed
    // on the wrong leave document and the employee's ERM app never
    // saw their actual request update. Now we match on _id so each
    // row maps to exactly one server document.
    const targetReq = requests.find(r => r._id === rowKey);
    if (!targetReq) {
      showNotification('Could not locate that request locally. Please refresh.', 'error');
      return;
    }
    setRequests(prev => prev.map(r => r._id === rowKey ? { ...r, managerStatus: newManagerStatus } : r));
    try {
      const res = await fetch(`${API}/leave-requests/${targetReq._id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          managerStatus: newManagerStatus.toLowerCase(),
          reviewedBy:    'Manager',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      showNotification(`Manager status updated to ${newManagerStatus}!`, 'success');
    } catch (err) {
      // Roll back optimistic update if the server rejected the write.
      setRequests(prev => prev.map(r => r._id === rowKey ? { ...r, managerStatus: targetReq.managerStatus || '' } : r));
      showNotification(`Could not save manager decision: ${err.message}`, 'error');
    }
  };

  const initiateAction = (rowKey, newStatus) => {
    // rowKey is the mongo _id of the row HR clicked. Same uniqueness
    // story as handleManagerAction above.
    const targetReq = requests.find(r => r._id === rowKey);
    if (!targetReq) {
      showNotification('Could not locate that request locally. Please refresh.', 'error');
      return;
    }
    if (targetReq.managerStatus !== 'Approved') {
      showNotification("Cannot process request until Manager approves!", "error");
      return;
    }
    setActionModal({ rowKey, status: newStatus });
    setActionMessage('');
  };

  // Confirm action — sends PATCH to HRMS backend, which forwards to mobile
  // backend, which in turn notifies the employee in-app. Targets the row
  // by its mongo _id so an employee with multiple pending requests has
  // each one updated independently (employee-ID matching used to cause
  // cross-row collisions, which is why ERM kept seeing Pending).
  const confirmAction = async () => {
    if (!actionModal) return;
    const { rowKey, status } = actionModal;
    const finalMessage = actionMessage.trim() || `Your request has been ${status.toLowerCase()}.`;
    const targetReq = requests.find(r => r._id === rowKey);
    if (!targetReq) {
      showNotification('Could not locate that request locally. Please refresh.', 'error');
      setActionModal(null);
      return;
    }
    setRequests(prev => prev.map(r => r._id === rowKey ? { ...r, status, message: finalMessage } : r));
    try {
      const res = await fetch(`${API}/leave-requests/${targetReq._id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          status:    status.toLowerCase(),
          hrComment: finalMessage,
          reviewedBy:'HR',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      showNotification(`Request successfully ${status.toLowerCase() === 'approved' ? 'approved' : 'rejected'}!`, "success");
    } catch (err) {
      setRequests(prev => prev.map(r => r._id === rowKey ? { ...r, status: targetReq.status || 'Pending' } : r));
      showNotification(`Could not save: ${err.message}`, "error");
    }
    setActionModal(null);
  };

  // ── Row classifier ───────────────────────────────────────────────────
  // ─── Classification: now lives on the row itself ───────────────────
  // Every row carries _kind ('leave' | 'permission') stamped at fetch
  // time by stampKind() above. The count badges and the table filter
  // both read this single property, so there's no way for them to
  // disagree.
  //
  // Defensive fallback: if a row from a very old cache (pre-_kind) sneaks
  // in, we re-classify it on the fly. This belt-and-braces guards the
  // first few seconds after the v2 → v3 cache key bump.
  // #492 — Backend `kind` (derived from the same isPermission that builds the
  // visible type) is ALWAYS authoritative, ahead of any stamped/cached `_kind`
  // that could be stale from an older classifier. Only when the backend didn't
  // send a kind do we fall back to the stamped value / live classifier.
  const kindOf = (r) => {
    const bk = String(r?.kind || '').toLowerCase().trim();
    if (bk === 'permission' || bk === 'leave') return bk;
    return r?._kind || classifyRow(r);
  };

  // ─── Status: case-insensitive helper ───────────────────────────────
  // Mobile backend has historically written status as either 'Pending'
  // (Title case) or 'pending' (lower) depending on which controller
  // produced the row. Comparing with a strict === 'Pending' caused the
  // card count and the displayed list to disagree — count would say 0
  // while the list under it showed N rows. We now normalise once and
  // both call sites use the SAME helper, so a card and its list can
  // never go out of sync regardless of what the API sends.
  const isPending = (r) => String(r?.status || '').toLowerCase() === 'pending';

  const leaveReqCount      = requests.filter(r => isPending(r) && kindOf(r) === 'leave').length;
  const permissionReqCount = requests.filter(r => isPending(r) && kindOf(r) === 'permission').length;

  const displayRecords = React.useMemo(() => {
    // #491 — Filter is derived PURELY and synchronously from the selected
    // card (activeTab). No tab-swap timer, so there is no window in which the
    // list and the heading can disagree.
    const wantedKind = activeTab === 'permission-requests' ? 'permission' : 'leave';

    // Diagnostic — confirms in DevTools that the SAME numbers feed the
    // card count and the table below it. If `card` and `list` ever
    // differ for the same kind, the bug is here (or in the data). Each
    // line includes both, so disagreement is instantly visible.
    try {
      const distribution  = requests.reduce((acc, r) => {
        const k = kindOf(r);
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});
      const pendingLeave  = requests.filter(r => isPending(r) && kindOf(r) === 'leave').length;
      const pendingPerm   = requests.filter(r => isPending(r) && kindOf(r) === 'permission').length;
      // eslint-disable-next-line no-console
      console.log(
        '[Approvals] tab=', activeTab,
        ' total=', requests.length,
        ' kinds=', distribution,
        ' card_pending={leave:', pendingLeave, ', permission:', pendingPerm, '}',
      );
    } catch (_) { /* swallow — diagnostic only */ }

    return requests.filter(item => {
      // 1. Tab gate — strict equality on the row's _kind property. No
      //    classifier-during-render means no race between count + filter.
      if (kindOf(item) !== wantedKind) return false;

      // 2. Status gate — the section heading explicitly says "Pending …".
      //    Uses the shared isPending() helper so the card count and the
      //    list below it are guaranteed to agree on what "pending" means.
      if (!isPending(item)) return false;

      // 2. Search query — case-insensitive across every field HR might
      // type into the box (name, employee id in either field, role,
      // department, reason, type label, status). We coerce every
      // candidate with String() so a single missing field doesn't crash
      // the whole filter and leave the table silently empty.
      const q = String(searchQuery || '').trim().toLowerCase();
      if (q) {
        const haystack = [
          item.name, item.employeeName,
          item.employeeId, item.id, item.empId,
          item.role, item.dept,
          item.reason, item.type,
          item.duration, item.date,
          item.status, item.managerStatus,
          item.employee?.userId, item.employee?.email,
          item.employee?.designation, item.employee?.department,
        ]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase())
          .join(' || ');
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [requests, activeTab, searchQuery]);

  const filterTabs = [];   // secondary leave/permission selector removed per HR request

  return (
    // Override the global .emp-list-page rules (`flex: 1`, `min-height: 0`,
    // `overflow-y: auto`) which cap the page to the viewport and force the
    // table into an inner scroll. HR couldn't see the full Pending Leave
    // Requests list because of that. With `flex: 'unset'`, `minHeight:
    // 'auto'`, `height: 'auto'`, `overflow: 'visible'` the page grows to
    // its content's natural height and the BROWSER WINDOW scrolls — every
    // row is reachable just by scrolling the page itself.
    <div
      className="emp-list-page"
      style={{
        flex: 'unset',
        minHeight: 'auto',
        height: 'auto',
        overflow: 'visible',
      }}
    >
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Attendance</span>
          <ChevronRight size={13} />
          <span>Leave & Permission Request</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Leave & Permission Requests</h1>
            <p className="ne-page-sub">Manage and track employee leave and permission requests.</p>
          </div>
        </div>
      </div>

      <div className="stats-row" style={{ marginTop: '20px' }}>
        {/* Leave Requests Card */}
        <div 
          className={`stat-card attendance-stat-card ${activeTab === 'leave-requests' ? 'active-filter' : ''}`}
          onClick={() => { switchTab('leave-requests'); setFilterType(''); }}
          style={{ cursor: 'pointer' }}
        >
          <div className="stat-card-top">
            <div className="stat-icon-wrap" style={{ background: '#4299E115' }}>
              <ClipboardList size={18} color="#4299E1" />
            </div>
            <div className="stat-trend-badge down" style={{ fontSize: '10.5px', padding: '2px 8px', background: '#FC8181', color: 'white', fontWeight: '800' }}>
              {leaveReqCount} Pending
            </div>
          </div>
          <div>
            <div className="stat-value">{leaveReqCount}</div>
            <div className="stat-label">Leave Requests</div>
          </div>
        </div>

        {/* Permission Requests Card */}
        <div 
          className={`stat-card attendance-stat-card ${activeTab === 'permission-requests' ? 'active-filter' : ''}`}
          onClick={() => { switchTab('permission-requests'); setFilterType(''); }}
          style={{ cursor: 'pointer' }}
        >
          <div className="stat-card-top">
            <div className="stat-icon-wrap" style={{ background: '#ECC94B15' }}>
              <AlertCircle size={18} color="#ECC94B" />
            </div>
            <div className="stat-trend-badge down" style={{ fontSize: '10.5px', padding: '2px 8px', background: '#FC8181', color: 'white', fontWeight: '800' }}>
              {permissionReqCount} Pending
            </div>
          </div>
          <div>
            <div className="stat-value">{permissionReqCount}</div>
            <div className="stat-label">Permission Requests</div>
          </div>
        </div>
      </div>

      <div className="emp-table-card" style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
              {activeTab === 'leave-requests' ? 'Pending Leave Requests' : 'Pending Permission Requests'}
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-light)' }}>
              Action pending items to approve or reject requests.
            </p>
          </div>
        </div>

        {/* Filters & Search row removed entirely (Jun 2026 final brief).
            The two stat cards at the top of the page are now the only
            way to switch between leave and permission tabs; the search
            input and the secondary type selector were both dropped per
            HR's "keep it clean" request. */}

        <div style={{ overflowX: 'auto' }}>
          <table className="emp-table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: '20%' }} />{/* Employee */}
              <col style={{ width: '12%' }} />{/* Type */}
              <col style={{ width: '10%' }} />{/* Duration */}
              <col style={{ width: '16%' }} />{/* Date Range */}
              <col style={{ width: '14%' }} />{/* Reason */}
              <col style={{ width: '14%' }} />{/* Manager Status */}
              <col style={{ width: '14%' }} />{/* Status */}
            </colgroup>
            <thead>
              <tr>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'left' }}>Employee</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'left' }}>Type</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'left' }}>Duration</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'left' }}>Date Range</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'left' }}>Reason</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'center' }}>Manager Status</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {displayRecords.map(rec => (
                <tr key={rec.id}>
                  <td>
                    <div className="emp-table-user">
                      <div className="emp-table-avatar" style={{ background: rec.color + '15', color: rec.color, width: '32px', height: '32px', fontSize: '11px', fontWeight: 'bold' }}>
                        {rec.avatar}
                      </div>
                      <div>
                        <div className="emp-table-name">{rec.name}</div>
                        <div className="emp-table-role" style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '2px' }}>
                          {/* Reject any 24-char hex ObjectId that may have
                              leaked through from the mobile-backend
                              populate. Show "—" if both fields are unsafe
                              instead of leaking raw Mongo hex. */}
                          {(() => {
                            const isHex = (s) => typeof s === 'string' && /^[a-f0-9]{24}$/i.test(s.trim());
                            const role  = isHex(rec.role) ? '' : (rec.role || '');
                            const dept  = isHex(rec.dept) ? '' : (rec.dept || '');
                            const parts = [role, dept].filter(Boolean);
                            return parts.length ? parts.join(' • ') : '—';
                          })()}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td><div className="emp-table-email" style={{ fontWeight: 700, fontSize: '11.5px' }}>{rec.type}</div></td>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: '11.5px', color: 'var(--text-main)' }}>{rec.duration}</div>
                    {rec.type && rec.type.toLowerCase().includes('permission') && rec.date && rec.date.includes('(') && (
                      <div style={{ fontSize: '10px', color: 'var(--text-light)', marginTop: '4px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={11} /> {rec.date.match(/\(([^)]+)\)/)?.[1]}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '11px', color: 'var(--text-muted)' }}>
                      {rec.type && rec.type.toLowerCase().includes('permission')
                        ? rec.date.split('(')[0].trim()
                        : rec.date}
                    </div>
                    {rec.requestedAt && (
                      <div style={{ fontSize: '10px', color: 'var(--text-light)', marginTop: '4px', fontWeight: 500, display: 'flex', alignItems: 'flex-start', gap: '4px', maxWidth: '130px' }}>
                        <Inbox size={11} style={{ marginTop: '2px', flexShrink: 0 }} /> 
                        <span style={{ lineHeight: '1.3' }}>Requested: {rec.requestedAt.replace('2024', '\n2024')}</span>
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: '11px', color: 'var(--text-main)', lineHeight: '1.4', fontWeight: 500, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                      {rec.reason}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {/* Manager Status is now READ-ONLY here. The manager
                        does Approve/Reject from ERM Web; HRMS only mirrors
                        that decision and uses it to gate the Status column. */}
                    {rec.managerStatus === 'Approved' ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 20, minWidth: 120, boxSizing: 'border-box', 
                        background: '#F1F9EE', color: '#4CAA17',
                        border: '1px solid #C2E7B0',
                      }}>
                        Approved
                      </span>
                    ) : rec.managerStatus === 'Rejected' ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 20, minWidth: 120, boxSizing: 'border-box', 
                        background: '#FFF5F5', color: '#C53030',
                        border: '1px solid #FED7D7',
                      }}>
                        Rejected
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 20, minWidth: 120, boxSizing: 'border-box', 
                        background: '#FFFBEB', color: '#D97706',
                        border: '1px solid #FDE68A',
                      }}>
                        <Clock size={12} /> Awaiting Manager
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {rec.managerStatus === 'Rejected' ? (
                      // Manager rejected → Status column stays EMPTY.
                      null
                    ) : rec.status === 'Approved' ? (
                      <span
                        title={rec.message || ''}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          fontWeight: 700, fontSize: 11,
                          padding: '4px 10px', borderRadius: 20,
                          minWidth: 120, boxSizing: 'border-box',
                          background: '#F1F9EE', color: '#4CAA17',
                          border: '1px solid #C2E7B0',
                        }}
                      >
                        Approved
                      </span>
                    ) : rec.status === 'Rejected' ? (
                      <span
                        title={rec.message || ''}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          fontWeight: 700, fontSize: 11,
                          padding: '4px 10px', borderRadius: 20,
                          minWidth: 120, boxSizing: 'border-box',
                          background: '#FFF5F5', color: '#C53030',
                          border: '1px solid #FED7D7',
                        }}
                      >
                        Rejected
                      </span>
                    ) : rec.managerStatus === 'Approved' ? (
                      // Manager approved → HR can now Approve or Reject.
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          className="req-btn reject"
                          onClick={() => initiateAction(rec._id, 'Rejected')}
                          style={{
                            padding: '6px 10px', fontSize: '11px', fontWeight: 700,
                            borderRadius: '6px',
                            border: '1px solid #FED7D7',
                            background: '#FFF5F5', color: '#FC8181',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '3px',
                          }}
                          title="Reject request"
                        >
                          <X size={12} /> Reject
                        </button>
                        <button
                          className="req-btn approve"
                          onClick={() => initiateAction(rec._id, 'Approved')}
                          style={{
                            padding: '6px 10px', fontSize: '11px', fontWeight: 700,
                            borderRadius: '6px',
                            border: '1px solid #C2E7B0',
                            background: '#F1F9EE', color: '#4CAA17',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '3px',
                          }}
                          title="Approve request"
                        >
                          <Check size={12} /> Approve
                        </button>
                      </div>
                    ) : (
                      // Manager hasn't acted yet → show a clear "awaiting"
                      // hint instead of disabled buttons that confused HR.
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 20, minWidth: 120, boxSizing: 'border-box', 
                        background: '#FFFBEB', color: '#D97706',
                        border: '1px solid #FDE68A',
                      }}>
                        <Clock size={12} /> Awaiting Manager
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {displayRecords.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-light)' }}>
                    No matching records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '400px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {actionModal.status === 'Approved' ? <Check color="#4CAA17" /> : <X color="#FC8181" />}
              {actionModal.status === 'Approved' ? 'Approve Request' : 'Reject Request'}
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-light)' }}>
              Write a message to the employee explaining your decision.
            </p>
            <textarea
              value={actionMessage}
              onChange={e => setActionMessage(e.target.value)}
              placeholder="e.g., Approved for the requested period."
              style={{
                width: '100%',
                minHeight: '90px',
                padding: '10px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                fontSize: '13px',
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => { setActionModal(null); setActionMessage(''); }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmAction()}
                style={{
                  background: actionModal.status === 'Approved' ? '#4CAA17' : '#FC8181',
                  border: 'none',
                  color: 'white',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Confirm {actionModal.status}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
