import { useState, useEffect } from 'react';

interface AuthGateProps {
  children: React.ReactNode;
  passwordHash: string;
}

export function AuthGate({ children, passwordHash }: AuthGateProps) {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  // 已驗證過 → 直接顯示內容
  useEffect(() => {
    const saved = localStorage.getItem('kty_auth');
    if (saved === 'ok') {
      setAuthed(true);
    }
  }, []);

  // SHA-256 雜湊比對 (Web Crypto API)
  const verifyPassword = async (input: string): Promise<boolean> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex === passwordHash;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    setLoading(true);

    const ok = await verifyPassword(password);
    setLoading(false);

    if (ok) {
      localStorage.setItem('kty_auth', 'ok');
      setAuthed(true);
    } else {
      setError(true);
      setPassword('');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('kty_auth');
    setAuthed(false);
    setPassword('');
  };

  if (authed) {
    return (
      <>
        {children}
        {/* 右下角登出按鈕 */}
        <button
          onClick={handleLogout}
          style={{
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            zIndex: 9999,
            padding: '6px 12px',
            fontSize: '12px',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}
          title="登出並清除驗證"
        >
          🔒 登出
        </button>
      </>
    );
  }

  // 密碼輸入畫面
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '360px',
          padding: '40px 32px',
          background: 'rgba(22, 22, 38, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🗝️</div>
          <h1 style={{ margin: 0, color: '#fff', fontSize: '24px', fontWeight: 600 }}>
            開拓軼事
          </h1>
          <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>
            私人部署 · 需驗證存取
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label
              htmlFor="pwd"
              style={{
                display: 'block',
                marginBottom: '8px',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '13px',
              }}
            >
              輸入存取密鑰
            </label>
            <input
              id="pwd"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit(e as unknown as React.FormEvent)}
              disabled={loading}
              autoFocus
              autoComplete="off"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '14px 16px',
                fontSize: '16px',
                color: '#fff',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '10px',
                outline: 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              placeholder="請輸入存取密鑰"
            />
          </div>

          {error && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 12px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#fca5a5',
                fontSize: '13px',
                textAlign: 'center',
              }}
            >
              ❌ 密鑰錯誤，請重試
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#0f0f1a',
              background: password.trim()
                ? 'linear-gradient(135deg, #f0d97a 0%, #d4a843 100%)'
                : 'rgba(255,255,255,0.12)',
              border: 'none',
              borderRadius: '10px',
              cursor: loading || !password.trim() ? 'not-allowed' : 'pointer',
              opacity: loading || !password.trim() ? 0.6 : 1,
              transition: 'transform 0.1s, box-shadow 0.2s',
            }}
          >
            {loading ? '驗證中...' : '解鎖進入'}
          </button>
        </form>

        <p style={{ marginTop: '24px', fontSize: '12px', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
          這是私人部署實例 · 僅供授權者存取
        </p>
      </div>
    </div>
  );
}