export function RecoveryCode({ code }: { code: string }) {
  return <div className="space-y-2 rounded-xl border border-forest/25 bg-forest-soft p-4" role="status">
    <p className="font-semibold">Save your recovery code</p>
    <p className="text-sm leading-relaxed">This code is only shown when generated and can be used once to reset your password. Store it in a password manager or a private place outside the app. Anyone with this code can access your account.</p>
    <code className="block select-all break-all rounded-lg border border-line bg-panel p-3 font-mono text-sm">{code}</code>
  </div>
}
