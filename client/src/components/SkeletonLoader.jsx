export function SkeletonCard() {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      padding: '16px',
      border: '1px solid #e5e7eb'
    }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }
        .skeleton-line {
          background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
          background-size: 400px 100%;
          animation: shimmer 1.5s infinite;
        }
      `}</style>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
        <div className="skeleton-line" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton-line" style={{ height: '16px', borderRadius: '4px', width: '70%', marginBottom: '8px' }} />
          <div className="skeleton-line" style={{ height: '12px', borderRadius: '4px', width: '40%' }} />
        </div>
      </div>
      <div className="skeleton-line" style={{ height: '12px', borderRadius: '4px', width: '100%', marginBottom: '8px' }} />
      <div className="skeleton-line" style={{ height: '12px', borderRadius: '4px', width: '60%' }} />
    </div>
  );
}

export function SkeletonKanban() {
  return (
    <div style={{ display: 'flex', gap: '16px', height: '100%' }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{
          flex: 1,
          background: '#f3f4f6',
          borderRadius: '16px',
          padding: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div className="skeleton-line" style={{ height: '14px', borderRadius: '4px', width: '80px' }} />
            <div className="skeleton-line" style={{ height: '20px', borderRadius: '10px', width: '24px' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '16px',
      overflow: 'hidden',
      border: '1px solid #e5e7eb'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        gap: '16px',
        padding: '16px 20px',
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb'
      }}>
        {[140, 80, 80, 100, 100].map((w, i) => (
          <div key={i} className="skeleton-line" style={{ height: '12px', width: w, borderRadius: '4px' }} />
        ))}
      </div>
      {/* Rows */}
      {Array(rows).fill(0).map((_, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '16px 20px',
          borderBottom: '1px solid #f3f4f6'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 2 }}>
            <div className="skeleton-line" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
            <div className="skeleton-line" style={{ height: '14px', width: '120px', borderRadius: '4px' }} />
          </div>
          <div className="skeleton-line" style={{ flex: 1, height: '10px', borderRadius: '4px' }} />
          <div className="skeleton-line" style={{ flex: 1, height: '10px', borderRadius: '4px' }} />
          <div className="skeleton-line" style={{ flex: 1, height: '10px', borderRadius: '4px' }} />
          <div style={{ width: '80px' }}>
            <div className="skeleton-line" style={{ height: '32px', borderRadius: '8px' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SkeletonLoader({ type = 'card' }) {
  if (type === 'kanban') return <SkeletonKanban />;
  if (type === 'table') return <SkeletonTable />;
  return <SkeletonCard />;
}