import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from './api';
import { Alert } from './components/common/Alert';
import { EmptyState } from './components/common/EmptyState';
import { StatusPill } from './components/common/StatusPill';
import { mediaUrl } from './media';

type User = { name: string };
type Gym = { name: string; logoUrl?: string };
type Tab = 'Overview' | 'Members' | 'Plans' | 'Memberships' | 'Payments' | 'Reports' | 'Settings';

const tabs: Tab[] = ['Overview', 'Members', 'Plans', 'Memberships', 'Payments', 'Reports', 'Settings'];

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function person(value: any) {
  if (value && typeof value === 'object') return value.fullName || value.memberId || '—';
  return value || '—';
}

function planName(value: any) {
  if (value && typeof value === 'object') return value.name || '—';
  return value || '—';
}

export default function Workspace({ user, gym, onLogout }: { user: User; gym: Gym; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('Overview');
  const [data, setData] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [gymProfile, setGymProfile] = useState<Gym>(gym);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payMemberId, setPayMemberId] = useState('');
  const [payMembershipId, setPayMembershipId] = useState('');

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(q.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [q]);

  async function load() {
    setError('');
    setLoading(true);
    try {
      if (tab === 'Overview') setData((await api.get('/dashboard')).data);
      if (tab === 'Members') {
        setItems((await api.get('/members', { params: { q: search, status: showArchived ? 'archived' : 'all', limit: 100 } })).data.items);
      }
      if (tab === 'Plans') setItems((await api.get('/plans', { params: { archived: showArchived } })).data.items);
      if (tab === 'Memberships') {
        const [list, memberList, planList] = await Promise.all([
          api.get('/memberships'),
          api.get('/members', { params: { limit: 100 } }),
          api.get('/plans'),
        ]);
        setItems(list.data.items);
        setMembers(memberList.data.items);
        setPlans(planList.data.items);
      }
      if (tab === 'Payments') {
        const [list, memberList, membershipList] = await Promise.all([
          api.get('/payments'),
          api.get('/members', { params: { limit: 100 } }),
          api.get('/memberships'),
        ]);
        setItems(list.data.items);
        setMembers(memberList.data.items);
        setMemberships(membershipList.data.items);
      }
      if (tab === 'Reports') setData((await api.get('/reports/summary')).data);
      if (tab === 'Settings') {
        const nextSettings = (await api.get('/settings')).data.settings;
        setSettings(nextSettings);
        if (nextSettings?.name) {
          setGymProfile((prev) => ({ ...prev, name: nextSettings.name, logoUrl: nextSettings.logoUrl }));
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not load data. Check the API and MongoDB connection.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tab, search, showArchived]);

  const memberMemberships = useMemo(() => {
    if (!payMemberId) return [];
    return memberships.filter((m) => {
      const memberKey = typeof m.memberId === 'object' ? m.memberId?._id : m.memberId;
      return String(memberKey) === String(payMemberId);
    });
  }, [memberships, payMemberId]);

  const payableMemberships = useMemo(() => {
    return memberMemberships.filter((m) => Number(m.finalAmount) - Number(m.paidAmount || 0) > 0);
  }, [memberMemberships]);

  const selectedPayable = payableMemberships.find((m) => String(m._id) === String(payMembershipId));

  async function create(e: FormEvent<HTMLFormElement>, endpoint: string) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setError('');
    setNotice('');
    const body = Object.fromEntries(new FormData(formEl).entries());
    try {
      const { data } = await api.post(endpoint, body);
      if (endpoint === '/members') {
                  if (data?.email?.sent) setNotice(`Member saved. Welcome email sent from ${gymProfile.name}.`);
        else if (data?.email?.error) setNotice('Member saved, but the welcome email could not be sent. Check Brevo settings.');
        else setNotice('Member saved successfully.');
      } else if (endpoint === '/payments') {
        if (data?.email?.sent) setNotice('Payment saved. Receipt emailed to the member.');
        else if (data?.email?.error) setNotice(`Payment saved, but receipt email failed: ${data.email.error}`);
        else setNotice('Payment saved successfully.');
      } else {
        setNotice('Saved successfully.');
      }
      formEl.reset();
      if (endpoint === '/payments') {
        setPayMemberId('');
        setPayMembershipId('');
      }
      await load();
    } catch (x: any) {
      setError(x?.response?.data?.error || 'Could not save. Please check the fields.');
    }
  }

  async function saveSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setNotice('');
    const d = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const { data: saved } = await api.patch('/settings', {
        name: d.name,
        email: d.email || undefined,
        phone: d.phone,
        address: d.address,
        timezone: d.timezone,
      });
      setSettings(saved.settings);
      setGymProfile((prev) => ({ ...prev, name: saved.settings.name, logoUrl: saved.settings.logoUrl }));
      setNotice('Gym settings saved.');
      await load();
    } catch (x: any) {
      setError(x?.response?.data?.error || 'Could not save settings.');
    }
  }

  async function uploadLogo(file?: File | null) {
    if (!file) return;
    setError('');
    setNotice('');
    setLogoBusy(true);
    try {
      const body = new FormData();
      body.append('logo', file);
      const { data } = await api.post('/settings/logo', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
        transformRequest: [(payload) => payload],
      });
      setSettings(data.settings);
      setGymProfile((prev) => ({ ...prev, logoUrl: data.settings.logoUrl }));
      setNotice('Gym logo updated. It will appear in the profile and member emails.');
    } catch (x: any) {
      setError(x?.response?.data?.error || 'Could not upload logo. Use PNG or JPG under 2MB.');
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    setError('');
    setNotice('');
    setLogoBusy(true);
    try {
      const { data } = await api.delete('/settings/logo');
      setSettings(data.settings);
      setGymProfile((prev) => ({ ...prev, logoUrl: undefined }));
      setNotice('Gym logo removed.');
    } catch (x: any) {
      setError(x?.response?.data?.error || 'Could not remove logo.');
    } finally {
      setLogoBusy(false);
    }
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setError('');
    setNotice('');
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      await api.patch(`/${editing.kind === 'member' ? 'members' : 'plans'}/${editing._id}`, body);
      setEditing(null);
      setNotice('Changes saved.');
      await load();
    } catch (x: any) {
      setError(x?.response?.data?.error || 'Could not save changes.');
    }
  }

  async function archiveAction(url: string) {
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(url);
      if (url.includes('/remind')) {
        setNotice(data?.message || 'Renewal reminder email sent.');
        return;
      }
      setNotice(url.endsWith('/restore') ? 'Restored to the active list.' : url.includes('/cancel') ? 'Membership cancelled.' : url.includes('/renew') ? 'Membership renewed.' : 'Archived.');
      await load();
    } catch (x: any) {
      setError(x?.response?.data?.error || 'That action failed. Refresh the page and try again.');
    }
  }

  function switchTab(next: Tab) {
    setData(null);
    setItems([]);
    setEditing(null);
    setError('');
    setNotice('');
    setShowArchived(false);
    setQ('');
    setSearch('');
    setPayMemberId('');
    setPayMembershipId('');
    setTab(next);
  }

  return (
    <main className="owner-shell">
      <aside className="owner-side">
        <div className="brand">
          <span className="mark">G</span> gymflow
        </div>
        <div className="side-gym-block">
          {gymProfile.logoUrl ? (
            <img className="side-logo" src={mediaUrl(gymProfile.logoUrl)} alt={`${gymProfile.name} logo`} />
          ) : (
            <div className="side-logo fallback">{gymProfile.name.slice(0, 1).toUpperCase()}</div>
          )}
          <p className="side-gym">{gymProfile.name}</p>
        </div>
        <nav>
          {tabs.map((t) => (
            <button className={tab === t ? 'selected' : ''} key={t} type="button" onClick={() => switchTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <button className="logout" type="button" onClick={onLogout}>
          Log out
        </button>
      </aside>

      <section className="owner-main">
        <header className="owner-top">
          <div>
            <span className="eyebrow">GYMFLOW WORKSPACE</span>
            <h1>{tab}</h1>
          </div>
          <div className="owner-top-meta">
            <span className="owner-name">{user.name}</span>
            <button className="text-btn mobile-logout" type="button" onClick={onLogout}>
              Log out
            </button>
          </div>
        </header>

        {error && <Alert>{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        {loading && <p className="loading-line">Refreshing…</p>}

        {tab === 'Overview' && data && (
          <>
            <p className="muted section-lead">Your gym activity at a glance.</p>
            <div className="stat-grid">
              {Object.entries({
                'Total members': data.stats.totalMembers,
                'Active members': data.stats.activeMembers,
                'Expired members': data.stats.expiredMembers,
                'Expiring in 7 days': data.stats.expiringIn7Days,
                'Expiring in 30 days': data.stats.expiringIn30Days,
                'Pending balance': money(data.stats.pendingPayments),
                'Revenue this month': money(data.stats.revenueThisMonth),
                'New this month': data.stats.newMembersThisMonth,
              }).map(([k, v]) => (
                <article className="stat-card" key={k}>
                  <span>{k}</span>
                  <strong>{v as any}</strong>
                </article>
              ))}
            </div>
            <div className="dashboard-columns">
              <article className="panel-block">
                <h2>Upcoming renewals</h2>
                {data.upcomingRenewals?.length ? (
                  data.upcomingRenewals.map((x: any) => (
                    <p key={x._id}>
                      {person(x.memberId)} · {new Date(x.endDate).toLocaleDateString()}
                    </p>
                  ))
                ) : (
                  <EmptyState title="No renewals soon" detail="Members expiring in the next 30 days will show up here." />
                )}
              </article>
              <article className="panel-block">
                <h2>Recent payments</h2>
                {data.recentPayments?.length ? (
                  data.recentPayments.map((x: any) => (
                    <p key={x._id}>
                      {person(x.memberId)} · {money(x.amount)}
                    </p>
                  ))
                ) : (
                  <EmptyState title="No payments yet" detail="Record a payment to see it on the overview." />
                )}
              </article>
            </div>
          </>
        )}

        {tab === 'Members' && (
          <>
            <div className="owner-card member-create-card">
              <div className="card-intro">
                <div>
                  <h2>Add member</h2>
                  <p className="muted">Create their profile and send a welcome email from {gym.name}.</p>
                </div>
                <span className="soft-badge">Welcome email on save</span>
              </div>
              <form className="owner-form" onSubmit={(e) => create(e, '/members')}>
                <label>
                  Full name
                  <input name="fullName" placeholder="e.g. Riya Sharma" required />
                </label>
                <label>
                  Email
                  <input name="email" type="email" placeholder="member@email.com" required />
                </label>
                <label>
                  Phone
                  <input name="phone" placeholder="10-digit mobile" required />
                </label>
                <label>
                  Member ID
                  <input name="memberId" placeholder="e.g. GF-1042" required />
                </label>
                <button className="primary" type="submit">
                  Save &amp; email welcome
                </button>
              </form>
            </div>

            {editing?.kind === 'member' && (
              <form className="owner-card owner-form" onSubmit={saveEdit}>
                <h2>Edit member</h2>
                <label>
                  Full name
                  <input name="fullName" defaultValue={editing.fullName} required />
                </label>
                <label>
                  Email
                  <input name="email" type="email" defaultValue={editing.email} />
                </label>
                <label>
                  Phone
                  <input name="phone" defaultValue={editing.phone} required />
                </label>
                <label>
                  Member ID
                  <input name="memberId" defaultValue={editing.memberId} required />
                </label>
                <div className="form-actions">
                  <button className="primary" type="submit">
                    Save changes
                  </button>
                  <button type="button" className="text-btn" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="owner-card">
              <div className="toolbar">
                <button className="text-btn" type="button" onClick={() => setShowArchived((v) => !v)}>
                  {showArchived ? 'Show active members' : 'Show archived members'}
                </button>
                <input
                  className="search-input"
                  placeholder="Search name, phone, email, member ID"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="table-wrap">
                {items.length === 0 ? (
                  <EmptyState title={showArchived ? 'No archived members' : 'No members yet'} detail="Add your first member to start tracking memberships." />
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Member ID</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Joined</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((m) => (
                        <tr key={m._id}>
                          <td>{m.fullName}</td>
                          <td>{m.memberId}</td>
                          <td>{m.phone}</td>
                          <td>{m.email || '—'}</td>
                          <td>{new Date(m.joiningDate).toLocaleDateString()}</td>
                          <td className="row-actions">
                            {showArchived ? (
                              <button className="text-btn" type="button" onClick={() => archiveAction(`/members/${m._id}/restore`)}>
                                Restore
                              </button>
                            ) : (
                              <>
                                <button className="text-btn" type="button" onClick={() => setEditing({ ...m, kind: 'member' })}>
                                  Edit
                                </button>
                                <button className="text-btn archive-btn" type="button" onClick={() => archiveAction(`/members/${m._id}/archive`)}>
                                  Archive
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {tab === 'Plans' && (
          <>
            <div className="owner-card">
              <h2>Create plan</h2>
              <form className="owner-form" onSubmit={(e) => create(e, '/plans')}>
                <label>
                  Plan name
                  <input name="name" required />
                </label>
                <label>
                  Duration amount
                  <input name="duration" type="number" min="1" step="1" required />
                </label>
                <label>
                  Duration unit
                  <select name="durationUnit" defaultValue="months">
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                </label>
                <label>
                  Price (₹)
                  <input name="price" type="number" min="0" step="0.01" required />
                </label>
                <label>
                  Description
                  <input name="description" />
                </label>
                <button className="primary" type="submit">
                  Create plan
                </button>
              </form>
            </div>

            {editing?.kind === 'plan' && (
              <form className="owner-card owner-form" onSubmit={saveEdit}>
                <h2>Edit plan</h2>
                <label>
                  Plan name
                  <input name="name" defaultValue={editing.name} required />
                </label>
                <label>
                  Duration amount
                  <input name="duration" type="number" min="1" defaultValue={editing.duration} required />
                </label>
                <label>
                  Duration unit
                  <select name="durationUnit" defaultValue={editing.durationUnit || 'months'}>
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                </label>
                <label>
                  Price ₹
                  <input name="price" type="number" min="0" step="0.01" defaultValue={editing.price} required />
                </label>
                <label>
                  Description
                  <input name="description" defaultValue={editing.description} />
                </label>
                <div className="form-actions">
                  <button className="primary" type="submit">
                    Save changes
                  </button>
                  <button type="button" className="text-btn" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="owner-card">
              <div className="toolbar">
                <button className="text-btn" type="button" onClick={() => setShowArchived((v) => !v)}>
                  {showArchived ? 'Show active plans' : 'Show archived plans'}
                </button>
              </div>
              <div className="table-wrap">
                {items.length === 0 ? (
                  <EmptyState title={showArchived ? 'No archived plans' : 'No plans yet'} detail="Create a membership plan before assigning members." />
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Duration</th>
                        <th>Price</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((p) => (
                        <tr key={p._id}>
                          <td>{p.name}</td>
                          <td>
                            {p.duration ?? '—'} {String(p.durationUnit || 'months').replace(/s$/, '')}
                            {p.duration === 1 ? '' : 's'}
                          </td>
                          <td>{money(p.price)}</td>
                          <td className="row-actions">
                            {showArchived ? (
                              <button className="text-btn" type="button" onClick={() => archiveAction(`/plans/${p._id}/restore`)}>
                                Restore
                              </button>
                            ) : (
                              <>
                                <button className="text-btn" type="button" onClick={() => setEditing({ ...p, kind: 'plan' })}>
                                  Edit
                                </button>
                                <button className="text-btn archive-btn" type="button" onClick={() => archiveAction(`/plans/${p._id}/archive`)}>
                                  Archive
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {tab === 'Memberships' && (
          <>
            <div className="owner-card">
              <h2>Assign a membership</h2>
              <form className="owner-form" onSubmit={(e) => create(e, '/memberships')}>
                <label>
                  Member
                  <select name="memberId" required defaultValue="">
                    <option value="" disabled>
                      Select member
                    </option>
                    {members.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.fullName} · {m.memberId}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Plan
                  <select name="planId" required defaultValue="">
                    <option value="" disabled>
                      Select plan
                    </option>
                    {plans.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} · {money(p.price)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start date
                  <input name="startDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                </label>
                <label>
                  Discount ₹
                  <input name="discount" type="number" min="0" defaultValue="0" />
                </label>
                <button className="primary" type="submit">
                  Create membership
                </button>
              </form>
            </div>
            <div className="owner-card table-wrap">
              {items.length === 0 ? (
                <EmptyState title="No memberships yet" detail="Assign a plan to a member to start tracking renewals and balances." />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Plan</th>
                      <th>Period</th>
                      <th>Status</th>
                      <th>Balance</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((x) => (
                      <tr key={x._id}>
                        <td>{person(x.memberId)}</td>
                        <td>{planName(x.planId)}</td>
                        <td>
                          {new Date(x.startDate).toLocaleDateString()} – {new Date(x.endDate).toLocaleDateString()}
                        </td>
                        <td>
                          <StatusPill value={x.status} />
                        </td>
                        <td>{money(x.finalAmount - x.paidAmount)}</td>
                        <td className="row-actions">
                          {['active', 'scheduled', 'expired'].includes(x.status) && (
                            <button
                              className="text-btn"
                              type="button"
                              title={x.memberId?.email ? `Email ${x.memberId.email}` : 'Member has no email'}
                              onClick={() => {
                                if (!x.memberId?.email) {
                                  setError('This member has no email on file. Add an email in Members first.');
                                  return;
                                }
                                void archiveAction(`/memberships/${x._id}/remind`);
                              }}
                            >
                              Reminder
                            </button>
                          )}
                          {['active', 'scheduled', 'expired'].includes(x.status) && (
                            <button className="text-btn" type="button" onClick={() => archiveAction(`/memberships/${x._id}/renew`)}>
                              Renew
                            </button>
                          )}
                          {['active', 'scheduled'].includes(x.status) && (
                            <button
                              className="text-btn archive-btn"
                              type="button"
                              onClick={() => {
                                if (window.confirm('Cancel this membership? Its history and payments will be kept.')) {
                                  void archiveAction(`/memberships/${x._id}/cancel`);
                                }
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {tab === 'Payments' && (
          <>
            <div className="owner-card">
              <div className="card-intro">
                <div>
                  <h2>Record payment</h2>
                  <p className="muted">Pick a member, then a membership that still has an unpaid balance.</p>
                </div>
              </div>
              <form className="owner-form" onSubmit={(e) => create(e, '/payments')}>
                <label>
                  Member
                  <select
                    name="memberId"
                    required
                    value={payMemberId}
                    onChange={(e) => {
                      setPayMemberId(e.target.value);
                      setPayMembershipId('');
                    }}
                  >
                    <option value="" disabled>
                      Select member
                    </option>
                    {members.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.fullName} · {m.memberId}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Membership
                  <select
                    name="membershipId"
                    required
                    value={payMembershipId}
                    disabled={!payMemberId || payableMemberships.length === 0}
                    onChange={(e) => setPayMembershipId(e.target.value)}
                  >
                    <option value="" disabled>
                      {!payMemberId
                        ? 'Choose a member first'
                        : payableMemberships.length
                          ? 'Select membership with balance'
                          : 'No unpaid membership'}
                    </option>
                    {payableMemberships.map((m) => (
                      <option key={m._id} value={m._id}>
                        {planName(m.planId)} · due {money(m.finalAmount - m.paidAmount)} · {m.status}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount ₹
                  {selectedPayable && (
                    <span className="field-meta">Max due {money(Number(selectedPayable.finalAmount) - Number(selectedPayable.paidAmount || 0))}</span>
                  )}
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={
                      selectedPayable
                        ? Number(selectedPayable.finalAmount) - Number(selectedPayable.paidAmount || 0)
                        : undefined
                    }
                    required
                    key={selectedPayable?._id || 'amount'}
                    defaultValue={
                      selectedPayable ? Number(selectedPayable.finalAmount) - Number(selectedPayable.paidAmount || 0) : undefined
                    }
                  />
                </label>
                <label>
                  Payment method
                  <select name="method" defaultValue="cash">
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank transfer</option>
                  </select>
                </label>
                <label>
                  Reference
                  <input name="transactionReference" />
                </label>
                <button className="primary" type="submit" disabled={!payMemberId || !payMembershipId}>
                  Record payment
                </button>
              </form>
              {payMemberId && payableMemberships.length === 0 && (
                <p className="field-hint">
                  {memberMemberships.length === 0
                    ? 'This member has no membership yet. Go to Memberships and assign a plan first.'
                    : 'This member’s memberships are fully paid. Nothing left to collect.'}
                </p>
              )}
            </div>
            <div className="owner-card table-wrap">
              {items.length === 0 ? (
                <EmptyState title="No payments recorded" detail="Payments will appear here with receipt numbers." />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Member</th>
                      <th>Date</th>
                      <th>Method</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={p._id}>
                        <td>{p.receiptNumber}</td>
                        <td>{person(p.memberId)}</td>
                        <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                        <td>{p.method}</td>
                        <td>{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {tab === 'Reports' && data && (
          <div className="owner-card">
            <h2>Monthly collections</h2>
            <p className="muted section-lead">
              New members: {data.newMembers} · Renewals: {data.renewals}
            </p>
            <div className="table-wrap">
              {(data.payments ?? []).length === 0 ? (
                <EmptyState title="No collections yet" detail="Successful payments will roll up here by month." />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Collections</th>
                      <th>Payments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.payments ?? []).map((x: any) => (
                      <tr key={x._id}>
                        <td>{x._id}</td>
                        <td>{money(x.revenue)}</td>
                        <td>{x.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === 'Settings' && settings && (
          <>
            <div className="owner-card logo-card">
              <div className="card-intro">
                <div>
                  <h2>Gym logo</h2>
                  <p className="muted">Upload a PNG or JPG. It shows in your workspace profile and member emails. PDF is not supported for logos.</p>
                </div>
              </div>
              <div className="logo-row">
                {settings.logoUrl ? (
                  <img className="logo-preview" src={mediaUrl(settings.logoUrl)} alt="Gym logo preview" />
                ) : (
                  <div className="logo-preview fallback">{settings.name?.slice(0, 1)?.toUpperCase() || 'G'}</div>
                )}
                <div className="logo-actions">
                  <label className="text-btn upload-btn">
                    {logoBusy ? 'Uploading…' : 'Upload logo'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      hidden
                      disabled={logoBusy}
                      onChange={(e) => {
                        void uploadLogo(e.target.files?.[0]);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                  {settings.logoUrl && (
                    <button className="text-btn archive-btn" type="button" disabled={logoBusy} onClick={() => void removeLogo()}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
            <form className="owner-card owner-form" onSubmit={saveSettings}>
              <div className="card-intro" style={{ gridColumn: '1 / -1' }}>
                <div>
                  <h2>Gym profile</h2>
                  <p className="muted">Member emails use your gym name, logo, and this email as reply-to.</p>
                </div>
              </div>
              <label>
                Gym name
                <input name="name" defaultValue={settings.name} required />
              </label>
              <label>
                Gym email
                <input name="email" type="email" defaultValue={settings.email} placeholder="hello@yourgym.com" />
              </label>
              <label>
                Phone
                <input name="phone" defaultValue={settings.phone} />
              </label>
              <label>
                Address
                <input name="address" defaultValue={settings.address} />
              </label>
              <label>
                Timezone
                <input name="timezone" defaultValue={settings.timezone} />
              </label>
              <button className="primary" type="submit">
                Save settings
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
