import FloatingHeader from '../FloatingHeader';

export default function FloatingHeaderExample() {
  return (
    <div className="h-screen bg-background">
      <FloatingHeader />
      <div className="pt-24 px-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Floating Header Demo</h2>
          <p className="text-muted-foreground">Glassmorphism header with backdrop blur</p>
        </div>
      </div>
    </div>
  );
}