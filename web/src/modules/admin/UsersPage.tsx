import { Lock, Pencil, Plus, Search, Trash2, Unlock, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ROLE_KEYS, type PublicUser, type RoleKey, type UserInput } from '@contracts/admin';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, KpiTile, MenuItem, MenuSeparator, Modal, Pagination, Select, StatusPill, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../samples/ui/errors';
import { useSearchParam, useUrlState } from '../samples/ui/list-state';
import { PageHeader } from '../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../samples/ui/RowMenu';
import { sortMapping } from '../samples/ui/table-sort';
import { useDeleteUser, useSaveUser, useToggleUserStatus, useUsers, useUserStats } from './api';

export const ROLE_LABEL: Record<RoleKey, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  dispatch: 'Dispatch Dept',
  marketing: 'Marketing',
  management: 'Management',
};
const ROLE_NOTE: Record<RoleKey, string> = {
  superadmin: 'Everything, including role permissions',
  admin: 'Manage all records and users',
  dispatch: 'Dispatches, tracking and couriers',
  marketing: 'Requests, parties and products',
  management: 'Dashboard and reports, read-only',
};
const PAGE_SIZE = 10;
const SORT = sortMapping({ name: 'name', username: 'username', role: 'role', status: 'status', created: 'createdAt' });

type Form = { name: string; username: string; email: string; phone: string; department: string; role: RoleKey; status: 'Active' | 'Inactive'; password: string };
const EMPTY: Form = { name: '', username: '', email: '', phone: '', department: '', role: 'dispatch', status: 'Active', password: '' };

function UserForm({ open, user, onClose }: { open: boolean; user: PublicUser | null; onClose: () => void }) {
  const toast = useToast();
  const { user: me } = useSession();
  const save = useSaveUser();
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(user ? { name: user.name, username: user.username, email: user.email ?? '', phone: user.phone ?? '', department: user.department ?? '', role: user.role, status: user.status, password: '' } : EMPTY);
  }, [open, user]);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  // Only a Super Admin can give out the Super Admin role.
  const roles = ROLE_KEYS.filter((r) => r !== 'superadmin' || me.isSuperadmin || user?.role === 'superadmin');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.name.trim()) local.name = 'Full name is required';
    if (!f.username.trim()) local.username = 'Username is required';
    if (!user && f.password.length < 8) local.password = 'At least 8 characters';
    if (user && f.password && f.password.length < 8) local.password = 'At least 8 characters, or leave blank to keep it';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    const input: UserInput = {
      name: f.name.trim(),
      username: f.username.trim(),
      email: f.email.trim() || null,
      phone: f.phone.trim() || null,
      department: f.department.trim() || null,
      role: f.role,
      status: f.status,
      ...(f.password ? { password: f.password } : {}),
    };
    try {
      const saved = await save.mutateAsync({ id: user?.id, input });
      toast({ tone: 'success', title: user ? `${saved.name} updated` : `${saved.name} added` });
      onClose();
    } catch (err) {
      const fe = fieldErrors(err);
      if ((err as { code?: string }).code === 'username_taken') fe.username = 'That username is already taken';
      setErrors(fe);
      toast({ tone: 'error', title: 'Couldn’t save the user', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      title={user ? `Edit ${user.name}` : 'Add user'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="user-form" loading={save.isPending}>
            {user ? 'Save changes' : 'Add user'}
          </Button>
        </>
      }
    >
      <form id="user-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Input label="Full name" value={f.name} onChange={(e) => set('name')(e.target.value)} error={errors.name} />
        <Input label="Username" autoCapitalize="none" spellCheck={false} placeholder="Used to sign in" value={f.username} onChange={(e) => set('username')(e.target.value)} error={errors.username} />
        <Input label="Email" type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} error={errors.email} />
        <Input label="Phone" value={f.phone} onChange={(e) => set('phone')(e.target.value)} />
        <Input label="Department" placeholder="Sales, Operations…" value={f.department} onChange={(e) => set('department')(e.target.value)} />
        <Select label="Status" options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} value={f.status} onChange={(e) => set('status')(e.target.value as Form['status'])} disabled={user?.id === me.id} hint={user?.id === me.id ? 'You can’t deactivate yourself.' : undefined} />
        <Select label="Role" options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} value={f.role} onChange={(e) => set('role')(e.target.value as RoleKey)} hint={ROLE_NOTE[f.role]} />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder={user ? 'Leave blank to keep the current one' : 'At least 8 characters'}
          value={f.password}
          onChange={(e) => set('password')(e.target.value)}
          error={errors.password}
          hint={user ? 'Changing it signs the user out everywhere.' : undefined}
        />
      </form>
    </Modal>
  );
}

/** User management (legacy renderUserTable / saveUser / toggleUserStatus / delUser / renderUserStats). */
export function UsersPage() {
  const toast = useToast();
  const { user: me, canDo } = useSession();
  const url = useUrlState(['role', 'status'] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useUsers({
    q: url.q || undefined,
    sort: url.sort || undefined,
    page: url.page,
    pageSize: PAGE_SIZE,
    filters: { role: (url.values.role || undefined) as RoleKey | undefined, status: (url.values.status || undefined) as 'Active' | 'Inactive' | undefined },
  });
  const stats = useUserStats().data;
  const toggle = useToggleUserStatus();
  const remove = useDeleteUser();
  const [form, setForm] = useState<PublicUser | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<PublicUser | null>(null);
  const canEdit = canDo('edit');
  const canManage = (u: PublicUser) => u.role !== 'superadmin' || !!me.isSuperadmin;

  async function onToggle(u: PublicUser) {
    try {
      const r = await toggle.mutateAsync(u.id);
      toast({ tone: 'success', title: `${r.name} is now ${r.status}` });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t change the status', description: errorMessage(err) });
    }
  }
  async function onDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast({ tone: 'success', title: `${toDelete.name} deleted` });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t delete', description: errorMessage(err) });
    }
    setToDelete(null);
  }

  const columns: Column<PublicUser>[] = [
    {
      id: 'name',
      header: 'Name',
      sortValue: (u) => u.name,
      cell: (u) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">
            {u.name}
            {u.id === me.id && <span className="ml-1.5 text-caption font-normal text-faint">(you)</span>}
          </span>
          {u.department && <span className="text-caption text-faint">{u.department}</span>}
        </span>
      ),
    },
    { id: 'username', header: 'Username', width: '130px', sortValue: (u) => u.username, className: 'font-mono text-sm', cell: (u) => u.username },
    { id: 'contact', header: 'Contact', width: '210px', className: 'text-muted', cell: (u) => [u.email, u.phone].filter(Boolean).join(' · ') || '—' },
    { id: 'role', header: 'Role', width: '130px', sortValue: (u) => u.role, cell: (u) => u.roleLabel },
    { id: 'status', header: 'Status', width: '92px', sortValue: (u) => u.status, cell: (u) => <StatusPill status={u.status} /> },
    { id: 'created', header: 'Added', width: '110px', sortValue: (u) => u.createdAt, className: 'text-muted', cell: (u) => formatDate(u.createdAt.slice(0, 10)) },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (u) =>
        canManage(u) &&
        (canEdit || canDo('delete')) && (
          <RowMenu label={`Actions for ${u.name}`}>
            {(close) => (
              <>
                {canEdit && (
                  <>
                    <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(u))}>
                      Edit
                    </MenuItem>
                    {u.id !== me.id && (
                      <MenuItem icon={u.status === 'Active' ? Lock : Unlock} onClick={runAndClose(close, () => void onToggle(u))}>
                        {u.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </MenuItem>
                    )}
                  </>
                )}
                {canDo('delete') && u.id !== me.id && (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(u))}>
                      Delete
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </RowMenu>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Users"
        description="Who can sign in, and with which role."
        actions={
          canEdit && (
            <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
              Add user
            </Button>
          )
        }
      />
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <KpiTile variant="compact" label="Users" value={stats.total} meta={`${stats.active} active · ${stats.inactive} inactive`} />
          {ROLE_KEYS.map((r) => (
            <button key={r} type="button" className="flex text-left [&>*]:flex-1" onClick={() => url.set({ role: url.values.role === r ? null : r })} aria-pressed={url.values.role === r}>
              <KpiTile variant="compact" label={ROLE_LABEL[r]} value={stats.byRole[r]} className={url.values.role === r ? 'border-primary-border' : undefined} />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search users" icon={Search} placeholder="Name, username, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[300px]" />
        <Select aria-label="Role" placeholder="All roles" options={ROLE_KEYS.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} value={url.values.role} onChange={(e) => url.set({ role: e.target.value })} containerClassName="w-[180px]" />
        <Select aria-label="Status" placeholder="Any status" options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} value={url.values.status} onChange={(e) => url.set({ status: e.target.value })} containerClassName="w-[150px]" />
      </div>
      <DataTable
        label="Users"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(u) => u.id}
        minWidth={980}
        loading={list.isLoading}
        sort={SORT.fromApi(url.sort)}
        onSortChange={(s) => url.set({ sort: SORT.toApi(s) ?? null })}
        manualSort
        onRowClick={canEdit ? (u) => canManage(u) && setForm(u) : undefined}
        empty={<EmptyState icon={Users} title="No users match" />}
        footer={(list.data?.total ?? 0) > 0 && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <UserForm open={form !== null} user={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <ConfirmDialog open={!!toDelete} title={`Delete ${toDelete?.name ?? ''}?`} confirmLabel="Delete" danger busy={remove.isPending} onConfirm={onDelete} onClose={() => setToDelete(null)}>
        They’re signed out at once and can’t sign in again. Their past activity stays in the log.
      </ConfirmDialog>
    </div>
  );
}
