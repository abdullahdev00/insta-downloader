import ParticleBackground from '../ParticleBackground';

export default function ParticleBackgroundExample() {
  return (
    <div className="h-screen bg-background relative">
      <ParticleBackground />
      <div className="relative z-10 flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Particle Background Demo</h2>
          <p className="text-muted-foreground">Floating Instagram icons animation</p>
        </div>
      </div>
    </div>
  );
}