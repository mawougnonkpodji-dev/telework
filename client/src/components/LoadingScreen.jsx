export default function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div style={{ textAlign: 'center' }}>
        <div className="loader" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: '#6b7280', fontSize: '14px' }}>Chargement...</p>
      </div>
    </div>
  );
}