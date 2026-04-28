import AuthGate from '@/game/ui/AuthGate';

export default function Home() {
  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <AuthGate />
    </div>
  );
}
