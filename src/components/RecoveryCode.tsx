export function RecoveryCode({ code }: { code: string }) {
  return <div className="space-y-2 rounded-lg border border-line bg-forest-soft p-4" role="status">
    <p className="font-semibold">Simpan kode pemulihan ini</p>
    <p className="text-sm">Kode hanya ditampilkan saat dibuat dan bisa dipakai satu kali untuk reset password. Simpan di password manager atau tempat pribadi di luar aplikasi. Kode ini memberikan akses ke akun Anda.</p>
    <code className="block select-all break-all rounded bg-panel p-3 font-mono text-sm">{code}</code>
  </div>
}
