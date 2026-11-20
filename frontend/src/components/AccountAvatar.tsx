import { useEffect, useRef, useState } from 'react';
import { Alert, Button, message, Space } from 'antd';
import { Modal } from './overlays';
import type { useAccountAvatar } from '../hooks/useAccountAvatar';

type AvatarUser = { id: string; role: string; jobRole?: string | null; managementLevel?: string; isPlatformAdmin?: boolean } | null;
export function defaultAvatarFor(user: AvatarUser) {
  const manager = user?.isPlatformAdmin || ['super', 'manager'].includes(user?.managementLevel || '') || ['admin', 'manager'].includes(user?.role || '');
  const kind = manager ? 'manager' : (user?.jobRole || user?.role) === 'sales' ? 'sales' : 'teacher';
  return `/avatars/${kind}.webp`;
}
export function AccountAvatar({ user, imageData, className = 'bz-account-avatar' }: { user: AvatarUser; imageData: string | null; className?: string }) {
  const fallback = defaultAvatarFor(user);
  return <img className={className} src={imageData || fallback} alt="个人头像" onError={event => { if (event.currentTarget.getAttribute('src') !== fallback) event.currentTarget.src = fallback; }} />;
}

export function AccountAvatarEditor({ user, avatar, open, onClose }: { user: AvatarUser; avatar: ReturnType<typeof useAccountAvatar>; open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<string | null>(null), [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setFile(null); setError(''); if (input.current) input.current.value = ''; }, [open, user?.id]);
  useEffect(() => { if (!file) { setPreview(null); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  const save = async () => { if (file && await avatar.save(file)) { message.success('头像已保存'); onClose(); } };
  const reset = async () => { if (await avatar.reset()) { setFile(null); setError(''); if (input.current) input.current.value = ''; message.success('已恢复默认头像'); } };
  return <Modal title="修改头像" open={open} onCancel={onClose} onOk={() => void save()} okText="保存头像" confirmLoading={avatar.busy} okButtonProps={{ disabled: !file }} cancelButtonProps={{ disabled: avatar.busy }} width={460}>
    <div className="bz-avatar-editor">
      <AccountAvatar user={user} imageData={preview || avatar.imageData} className="bz-avatar-preview" />
      <p>选择一张图片作为个人头像</p>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择头像图片" hidden disabled={avatar.busy} onChange={event => {
        const chosen = event.target.files?.[0]; setError('');
        if (!chosen) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(chosen.type) || chosen.size > 2 * 1024 * 1024) { setFile(null); event.target.value = ''; setError('请选择2MB以内的JPG、PNG或WebP图片'); return; }
        setFile(chosen);
      }} />
      <Space wrap><Button onClick={() => input.current?.click()} disabled={avatar.busy}>选择图片</Button><Button onClick={() => void reset()} disabled={avatar.busy || (!avatar.imageData && !file)}>恢复默认头像</Button></Space>
      <p className="bz-avatar-hint">支持 JPG、PNG、WebP，最大 2MB，保存时自动居中裁剪。</p>
    </div>
    {(error || avatar.error) && <Alert type="error" showIcon message={error || avatar.error} action={!file && avatar.error ? <Button size="small" onClick={() => void avatar.reload()}>重试</Button> : undefined} />}
  </Modal>;
}
